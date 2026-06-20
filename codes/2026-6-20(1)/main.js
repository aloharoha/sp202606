const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// C++ 네이티브 모듈 로드
// 개발 중: build/Release/physics.node
// 배포 후: resources/physics.node
let physics;
try {
    physics = require('./build/Release/physics.node');
} catch {
    // electron-builder로 패키징된 경우
    physics = require(path.join(process.resourcesPath, 'physics.node'));
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        title: '낙하 물리 시뮬레이터',
        backgroundColor: '#0a0e1a',
    });

    win.loadFile('index.html');
    // 개발 중 DevTools 열기 (배포 시 주석 처리)
    // win.webContents.openDevTools();
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ─── IPC 핸들러 ───────────────────────────────

// 프리셋 목록 요청
ipcMain.handle('get-falling-objects', () => physics.getFallingObjects());
ipcMain.handle('get-target-objects',  () => physics.getTargetObjects());

// 시뮬레이션 실행
ipcMain.handle('simulate', (_event, input) => {
    try {
        return { ok: true, data: physics.simulate(input) };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});
