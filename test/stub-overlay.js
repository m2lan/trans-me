const { contextBridge, ipcRenderer } = require('electron')
let shot = ''
for (const arg of process.argv) {
  if (arg.startsWith('--shot=')) shot = arg.slice('--shot='.length)
}
contextBridge.exposeInMainWorld('api', {
  onOverlayInit: (cb) => setTimeout(() => cb({ image: shot, width: 900, height: 560 }), 40),
  overlayImage: () => {},
  overlayReady: () => {},
  selectRegion: (r) => ipcRenderer.send('noop', r),
  cancelOverlay: () => {}
})