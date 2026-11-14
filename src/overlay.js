const api = window.api
const shotEl = document.getElementById('shot')
const selEl = document.getElementById('sel')
const sizeLabel = document.getElementById('sizeLabel')
const hintEl = document.getElementById('hint')
const crossH = document.getElementById('crossH')
const crossV = document.getElementById('crossV')

let start = null
let dragging = false
let rect = null

function setRect(x, y) {
  const left = Math.min(start.x, x)
  const top = Math.min(start.y, y)
  const width = Math.abs(x - start.x)
  const height = Math.abs(y - start.y)
  rect = { x: left, y: top, width, height }
  selEl.style.left = `${left}px`
  selEl.style.top = `${top}px`
  selEl.style.width = `${width}px`
  selEl.style.height = `${height}px`
  sizeLabel.textContent = `${Math.round(width)} × ${Math.round(height)}`
  sizeLabel.classList.toggle('below', top < 34)
}

function positionCross(e) {
  crossH.style.top = `${e.clientY}px`
  crossV.style.left = `${e.clientX}px`
  crossH.classList.add('on')
  crossV.classList.add('on')
}

function cancel() {
  api.cancelOverlay()
}

window.addEventListener('mousemove', (e) => {
  if (dragging) {
    setRect(e.clientX, e.clientY)
  } else {
    positionCross(e)
  }
})

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return
  e.preventDefault()
  start = { x: e.clientX, y: e.clientY }
  dragging = true
  selEl.classList.add('on')
  hintEl.classList.add('hide')
  crossH.classList.remove('on')
  crossV.classList.remove('on')
  setRect(start.x, start.y)
})

window.addEventListener('mouseup', (e) => {
  if (!dragging) return
  dragging = false
  setRect(e.clientX, e.clientY)
  if (!rect || rect.width < 5 || rect.height < 5) {
    cancel()
    return
  }
  selEl.classList.remove('on')
  api.selectRegion(rect)
})

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cancel()
})

window.addEventListener('contextmenu', (e) => {
  e.preventDefault()
  cancel()
})

if (api?.onOverlayInit) {
  api.onOverlayInit(async (payload) => {
    shotEl.style.backgroundImage = `url("${payload.image}")`
    const img = new Image()
    img.src = payload.image
    try {
      await img.decode()
    } catch {
      /* 解码失败也继续，避免卡住 */
    }
    api.overlayReady()
  })
  api.overlayImage()
}
