# Windows 系统 OCR（Windows.Media.Ocr / WinRT），尽量少依赖、失败即退出
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File ocr-windows.ps1 -Path <图片路径>
param(
    [Parameter(Mandatory = $true)][string]$Path
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null

    $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
            $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
            $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
        })[0]

    function Await($operation, $resultType) {
        $asTask = $asTaskGeneric.MakeGenericMethod($resultType)
        $netTask = $asTask.Invoke($null, @($operation))
        $netTask.Wait(-1) | Out-Null
        $netTask.Result
    }

    [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
    [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
    [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime] | Out-Null

    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])

    # 优先用系统已安装的 OCR 语言包，覆盖中英日韩泰
    $engine = $null
    foreach ($tag in @('zh-Hans-CN', 'en-US', 'ja-JP', 'ko-KR', 'th-TH')) {
        try {
            $lang = [Windows.Globalization.Language]::new($tag)
            if ([Windows.Media.Ocr.OcrEngine]::IsLanguageSupported($lang)) {
                if ($null -eq $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang) }
            }
        } catch { }
    }
    if ($null -eq $engine) {
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    }
    if ($null -eq $engine) { throw '系统未安装任何 OCR 语言包，请在“设置 → 时间和语言 → 语言”中添加语言功能' }

    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    $imgW = [double]$decoder.PixelWidth
    $imgH = [double]$decoder.PixelHeight
    if ($imgW -le 0) { $imgW = 1 }
    if ($imgH -le 0) { $imgH = 1 }

    $lines = @()
    foreach ($line in $result.Lines) {
        # 行框 = 该行所有词框的并集，再归一化到 0~1（左上角原点），供译文叠加使用
        $x1 = [double]::MaxValue; $y1 = [double]::MaxValue
        $x2 = -1.0; $y2 = -1.0
        foreach ($word in $line.Words) {
            $r = $word.BoundingRect
            if ($r.X -lt $x1) { $x1 = $r.X }
            if ($r.Y -lt $y1) { $y1 = $r.Y }
            if (($r.X + $r.Width) -gt $x2) { $x2 = $r.X + $r.Width }
            if (($r.Y + $r.Height) -gt $y2) { $y2 = $r.Y + $r.Height }
        }
        $box = $null
        if ($x2 -gt 0 -and $y2 -gt 0) {
            $box = @{
                x = [Math]::Round($x1 / $imgW, 5)
                y = [Math]::Round($y1 / $imgH, 5)
                w = [Math]::Round(($x2 - $x1) / $imgW, 5)
                h = [Math]::Round(($y2 - $y1) / $imgH, 5)
            }
        }
        $lines += @{ text = $line.Text; box = $box; confidence = 1.0 }
    }

    $payload = @{
        lines  = $lines
        text   = (($lines | ForEach-Object { $_.text }) -join "`n")
        width  = $imgW
        height = $imgH
    }
    $payload | ConvertTo-Json -Depth 5 -Compress
}
catch {
    $err = @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
    Write-Output $err
    exit 1
}
