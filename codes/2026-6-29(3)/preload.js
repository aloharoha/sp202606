const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('physics', {
    getFallingObjects: ()                      => ipcRenderer.invoke('get-falling-objects'),
    getTargetObjects:  ()                      => ipcRenderer.invoke('get-target-objects'),
    simulate:          (input)                 => ipcRenderer.invoke('simulate', input),
    computeFracture:   (impact, target, r)     => ipcRenderer.invoke('compute-fracture', impact, target, r),
    stepFragments:     (dt, gravity)           => ipcRenderer.invoke('step-fragments', dt, gravity),
    copyToAssets:      (name, bytes)           => ipcRenderer.invoke('copy-to-assets', name, bytes),
});

// ── 메뉴/별도 설정창과의 브릿지 ──
contextBridge.exposeInMainWorld('appBridge', {
    sendSnapshot:    (snap) => ipcRenderer.send('settings:snapshot', snap),   // 설정 스냅샷 push
    showResults:     (data) => ipcRenderer.send('results:show', data),        // 결과창 표시 요청
    openWindow:      (panel)=> ipcRenderer.send('open-window', { panel }),     // 별도 설정/결과 창 열기
    onMenuUpload:    (cb)   => ipcRenderer.on('menu:upload', (_e, p) => cb(p)),
    onSettingsApply: (cb)   => ipcRenderer.on('settings:apply', (_e, c) => cb(c)),
    onResultsAction: (cb)   => ipcRenderer.on('results:action', (_e, a) => cb(a)),
    onResultsRequest:(cb)   => ipcRenderer.on('results:request', () => cb()),
});
