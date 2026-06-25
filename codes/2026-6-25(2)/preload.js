const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('physics', {
    getFallingObjects: ()                      => ipcRenderer.invoke('get-falling-objects'),
    getTargetObjects:  ()                      => ipcRenderer.invoke('get-target-objects'),
    simulate:          (input)                 => ipcRenderer.invoke('simulate', input),
    computeFracture:   (impact, target, r)     => ipcRenderer.invoke('compute-fracture', impact, target, r),
    stepFragments:     (dt, gravity)           => ipcRenderer.invoke('step-fragments', dt, gravity),
});
