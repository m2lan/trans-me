// macOS 原生 OCR（Vision 框架）— 通过 JXA ObjC 桥接调用，无需编译
// 用法: osascript -l JavaScript ocr-mac.js <图片路径>
// 输出: {"lines":[{"text":"...","box":{x,y,w,h}}],"text":"...","width":..,"height":..}
//       box 为归一化坐标（0~1），原点在左上角，用于把译文叠回原图位置

ObjC.import('Vision')
ObjC.import('AppKit')
ObjC.import('Foundation')

function supportedLanguages(request) {
  var wanted = ['zh-Hans', 'zh-Hant', 'en-US', 'ja-JP', 'ko-KR', 'th-TH']
  var revisions = [0, 2, 1]
  for (var i = 0; i < revisions.length; i++) {
    try {
      var list = $.VNRecognizeTextRequest.supportedRecognitionLanguagesForTextRecognitionLevelRevisionError(
        0,
        revisions[i],
        $()
      )
      if (list && list.count > 0) {
        var arr = ObjC.deepUnwrap(list)
        var usable = wanted.filter(function (l) {
          return arr.indexOf(l) >= 0
        })
        if (usable.length) return usable
        return arr.slice(0, 3)
      }
    } catch (e) {
      /* 尝试下一个 revision */
    }
  }
  return ['zh-Hans', 'en-US']
}

function recognize(path) {
  var url = $.NSURL.fileURLWithPath(path)
  var image = $.NSImage.alloc.initWithContentsOfURL(url)
  if (!image || image.isNil()) return { error: '无法读取图片' }

  var tiff = image.TIFFRepresentation
  var rep = $.NSBitmapImageRep.imageRepWithData(tiff)
  if (!rep || rep.isNil()) return { error: '图片解码失败' }
  var cgImage = rep.CGImage
  if (!cgImage) return { error: '图片格式不受支持' }

  var width = rep.pixelsWide
  var height = rep.pixelsHigh

  var handler = $.VNImageRequestHandler.alloc.initWithCGImageOptions(cgImage, $())
  var request = $.VNRecognizeTextRequest.alloc.init
  request.recognitionLevel = 0 // VNRequestTextRecognitionLevelAccurate
  request.usesLanguageCorrection = true

  var langs = supportedLanguages(request)
  try {
    request.recognitionLanguages = $(langs)
  } catch (e) {
    /* 保留系统默认语种 */
  }

  var ok = handler.performRequestsError($([request]), $())
  if (!ok) return { error: '文字识别失败' }

  var results = request.results
  var lines = []
  if (results) {
    var count = results.count
    for (var i = 0; i < count; i++) {
      var obs = results.objectAtIndex(i)
      var candidates = obs.topCandidates(1)
      if (!candidates || candidates.count === 0) continue
      var text = ObjC.unwrap(candidates.firstObject.string)
      if (!text || !text.trim().length) continue

      // Vision 的 boundingBox 是归一化坐标，原点在左下角；转成左上角原点
      var bb = obs.boundingBox
      var box = null
      try {
        box = {
          x: bb.origin.x,
          y: 1 - (bb.origin.y + bb.size.height),
          w: bb.size.width,
          h: bb.size.height
        }
      } catch (e) {
        box = null
      }
      lines.push({ text: text, box: box })
    }
  }
  return { lines: lines, text: lines.map(function (l) { return l.text }).join('\n'), width: width, height: height }
}

function run(argv) {
  var out
  try {
    if (!argv || !argv.length) out = { error: '缺少图片路径参数' }
    else out = recognize(argv[0])
  } catch (e) {
    out = { error: String(e) }
  }
  return JSON.stringify(out)
}
