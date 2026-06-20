const { contextBridge, ipcRenderer } = require('electron');

// renderer.js에서 window.physics.xxx() 로 사용 가능
contextBridge.exposeInMainWorld('physics', {
    getFallingObjects: () => ipcRenderer.invoke('get-falling-objects'),
    getTargetObjects:  () => ipcRenderer.invoke('get-target-objects'),
    simulate:          (input) => ipcRenderer.invoke('simulate', input),
});
