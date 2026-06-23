const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// cmake-js는 환경/생성기에 따라 .node 파일을 build/Release, build/Debug,
// 혹은 build/ 바로 아래에 만든다. 여러 후보 경로를 차례로 시도한다.
function loadPhysics() {
    const candidates = [
        path.join(__dirname, 'build', 'Release', 'physics.node'),
        path.join(__dirname, 'build', 'Debug', 'physics.node'),
        path.join(__dirname, 'build', 'physics.node'),
    ];
    if (process.resourcesPath) {
        candidates.push(path.join(process.resourcesPath, 'physics.node'));
    }
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            return require(p);
        }
    }
    throw new Error(
        'physics.node 네이티브 모듈을 찾을 수 없습니다.\n' +
        '"npm run build-addon" 을 먼저 실행하세요.\n\n' +
        '확인한 경로:\n' + candidates.join('\n')
    );
}

let physics;
try {
    physics = loadPhysics();
} catch (err) {
    const { dialog } = require('electron');
    app.whenReady().then(() => {
        dialog.showErrorBox('네이티브 모듈 로드 실패', err.message);
        app.quit();
    });
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 860,
        minWidth: 1000,
        minHeight: 650,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        title: 'Physics Simulator',
        backgroundColor: '#0d1117',
    });
    win.loadFile('index.html');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('get-falling-objects', () => physics.getFallingObjects());
ipcMain.handle('get-target-objects',  () => physics.getTargetObjects());

ipcMain.handle('simulate', (_e, input) => {
    try { return { ok: true, data: physics.simulate(input) }; }
    catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('compute-fracture', (_e, impact, target, radius) => {
    try { return { ok: true, data: physics.computeFracture(impact, target, radius) }; }
    catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('step-fragments', (_e, dt, gravity) => {
    try { return physics.stepFragments(dt, gravity); }
    catch (e) { return []; }
});
