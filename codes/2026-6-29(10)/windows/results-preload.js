const { contextBridge, ipcRenderer } = require('electron');

// 시뮬레이션 결과창 ↔ 메인 프로세스 브릿지.
contextBridge.exposeInMainWorld('resultsBridge', {
    get:     ()        => ipcRenderer.invoke('results:get'),               // 마지막 결과 데이터
    onData:  (cb)      => ipcRenderer.on('results:data', (_e, d) => cb(d)),
    action:  (a)       => ipcRenderer.send('results:action', a),           // {action:'png'|'csv'|...}
});
