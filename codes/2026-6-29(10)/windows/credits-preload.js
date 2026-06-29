const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('creditsBridge', {
  getCredits: () => ipcRenderer.invoke('get-credits'),
});
