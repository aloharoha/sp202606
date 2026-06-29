const { contextBridge, ipcRenderer } = require('electron');

// 별도 설정 팝업 창 ↔ 메인 프로세스 브릿지.
// 단일 출처는 메인 렌더러이므로, 이 창은 값을 읽고(set 요청) 변경 알림을 받는 원격 컨트롤러다.
contextBridge.exposeInMainWorld('settingsBridge', {
    current: ()        => ipcRenderer.invoke('settings:current'),          // 현재 스냅샷
    set:     (change)  => ipcRenderer.send('settings:set', change),        // {kind,id,value}
    onUpdate:(cb)      => ipcRenderer.on('settings:update', (_e, s) => cb(s)),
});
