const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('api', {
  onOverlayInit: (cb) => setTimeout(() => cb({ image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', width: 900, height: 560 }), 30),
  overlayImage: () => {},
  overlayReady: () => {},
  selectRegion: (r) => ipcRenderer.send('noop', r),
  cancelOverlay: () => {}
})