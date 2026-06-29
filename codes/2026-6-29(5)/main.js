const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// ── 로컬 HTTP 서버 ──
// packaged 앱에서 file:// / 커스텀 프로토콜로 로드하면 중첩 import 가 있는 ES 모듈
// (GLTFLoader.js 내부에서 'three' 및 상대 경로 파일을 재 import)을 Chromium 이
// 동적으로 fetch 하지 못해 "Failed to fetch dynamically imported module" 가 난다.
// 표준 http://127.0.0.1 로 로드하면 ESM 모듈 그래프 전체가 정상 처리된다.
const MIME = {
    '.html': 'text/html',
    '.js':   'text/javascript',
    '.mjs':  'text/javascript',
    '.json': 'application/json',
    '.css':  'text/css',
    '.glb':  'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.stl':  'model/stl',
    '.wasm': 'application/wasm',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
};

let serverPort = null;

function startDevServer() {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const url = new URL(req.url, 'http://localhost');
            let rel = decodeURIComponent(url.pathname);
            if (!rel || rel === '/') rel = '/index.html';
            const filePath = path.normalize(path.join(__dirname, rel));
            // 경로 탈출 방지
            if (filePath !== __dirname && !filePath.startsWith(__dirname + path.sep)) {
                res.writeHead(403); res.end('Forbidden'); return;
            }
            fs.readFile(filePath, (err, buf) => {
                if (err) { res.writeHead(404); res.end('Not Found: ' + err.message); return; }
                const mime = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
                res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
                res.end(buf);
            });
        });
        // port 0 → OS가 비어있는 포트를 자동 배정
        server.listen(0, '127.0.0.1', () => {
            serverPort = server.address().port;
            resolve(serverPort);
        });
        server.on('error', reject);
    });
}

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

let mainWin = null;
// 설정 팝업 창들(별도 BrowserWindow, 창 밖으로 자유 이동 가능). panel 이름 → 창.
const settingWins = new Map();
let resultsWin = null;
// 메인 렌더러가 보내주는 최신 설정 스냅샷 (메뉴 체크상태/팝업 동기화용)
let lastSnapshot = { values: {}, checks: {}, options: {}, view: {} };

// ── 설정 팝업 창 열기 (이미 열려 있으면 포커스) ──
function openSettingWindow(panel, title) {
    if (settingWins.has(panel)) {
        const w = settingWins.get(panel);
        if (!w.isDestroyed()) { w.focus(); return; }
        settingWins.delete(panel);
    }
    const w = new BrowserWindow({
        width: 360, height: 520, minWidth: 280, minHeight: 200,
        parent: mainWin || undefined, // 부모만 지정(모달 아님) → 창 밖으로 자유 이동 가능
        title: title || panel,
        backgroundColor: '#0d1117',
        webPreferences: {
            preload: path.join(__dirname, 'windows', 'settings-preload.js'),
            contextIsolation: true, nodeIntegration: false,
        },
    });
    w.setMenuBarVisibility(false);
    w.loadURL(`http://127.0.0.1:${serverPort}/windows/settings.html?panel=${encodeURIComponent(panel)}`);
    w.on('closed', () => settingWins.delete(panel));
    settingWins.set(panel, w);
}

function openResultsWindow() {
    if (resultsWin && !resultsWin.isDestroyed()) { resultsWin.focus(); return resultsWin; }
    resultsWin = new BrowserWindow({
        width: 420, height: 560, minWidth: 320, minHeight: 320,
        parent: mainWin || undefined,
        title: 'Simulation Result',
        backgroundColor: '#0d1117',
        webPreferences: {
            preload: path.join(__dirname, 'windows', 'results-preload.js'),
            contextIsolation: true, nodeIntegration: false,
        },
    });
    resultsWin.setMenuBarVisibility(false);
    resultsWin.loadURL(`http://127.0.0.1:${serverPort}/windows/results.html`);
    resultsWin.on('closed', () => { resultsWin = null; });
    return resultsWin;
}

// ── 네이티브 메뉴바 ──
function buildMenu() {
    const v = lastSnapshot.view || {};
    const tmpl = [
        {
            label: 'File',
            submenu: [
                { label: 'Upload GLB file…', click: () => pickAndSendModel('glb') },
                { label: 'Upload STL file…', click: () => pickAndSendModel('stl') },
                { type: 'separator' },
                { role: 'quit' },
            ],
        },
        {
            label: 'Edit',
            submenu: [
                { label: 'Preset…',               click: () => openSettingWindow('preset', 'Preset') },
                { label: 'Falling object…',        click: () => openSettingWindow('falling', 'Falling Object') },
                { label: 'Target object…',         click: () => openSettingWindow('target', 'Target Object') },
                { label: 'Initial conditions…',    click: () => openSettingWindow('initial', 'Initial Conditions') },
                { label: 'Others…',                click: () => openSettingWindow('others', 'Other Settings') },
            ],
        },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Always show graph', type: 'checkbox', checked: !!v.alwaysGraph,
                    click: (mi) => sendToMain('settings:set', { kind: 'view', id: 'alwaysGraph', value: mi.checked }),
                },
                {
                    label: 'Graph…', enabled: !v.alwaysGraph,
                    click: () => openSettingWindow('graph', 'Graph'),
                },
                { type: 'separator' },
                {
                    label: 'Always show trajectory data', type: 'checkbox', checked: !!v.alwaysTraj,
                    click: (mi) => sendToMain('settings:set', { kind: 'view', id: 'alwaysTraj', value: mi.checked }),
                },
                {
                    label: 'Trajectory data…', enabled: !v.alwaysTraj,
                    click: () => openSettingWindow('trajectory', 'Trajectory Data'),
                },
                { type: 'separator' },
                {
                    label: 'Always show settings panel', type: 'checkbox', checked: v.alwaysSettings !== false,
                    click: (mi) => sendToMain('settings:set', { kind: 'view', id: 'alwaysSettings', value: mi.checked }),
                },
                { type: 'separator' },
                {
                    label: 'Simulator-only mode', type: 'checkbox', checked: !!v.simOnly,
                    click: (mi) => sendToMain('settings:set', { kind: 'view', id: 'simOnly', value: mi.checked }),
                },
                { label: 'Show result window now', click: () => { openResultsWindow(); sendToMain('results:request', {}); } },
            ],
        },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(tmpl));
}

function sendToMain(channel, payload) {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(channel, payload);
}

// ── 네이티브 파일 열기 대화상자 ──
// 네이티브 메뉴 클릭 → 메인 프로세스에서 직접 dialog 를 띄운다. 렌더러의 숨김
// <input type=file> 을 거치지 않으므로 "사용자 제스처 아님" 으로 대화상자가 차단되는
// 문제가 원천적으로 없다. 선택한 파일 바이트를 렌더러로 보내 기존 로드 경로를 재사용한다.
async function pickAndSendModel(kind) {
    if (!mainWin || mainWin.isDestroyed()) return;
    const filters = kind === 'glb'
        ? [{ name: '3D 모델 (GLB/STL)', extensions: ['glb', 'stl'] }]
        : [{ name: 'STL/GLB 모델', extensions: ['stl', 'glb'] }];
    let res;
    try {
        res = await dialog.showOpenDialog(mainWin, { properties: ['openFile'], filters });
    } catch (e) {
        dialog.showErrorBox('파일 대화상자 오류', e.message);
        return;
    }
    if (res.canceled || !res.filePaths || !res.filePaths.length) return;
    const fp = res.filePaths[0];
    try {
        const bytes = fs.readFileSync(fp);
        sendToMain('menu:file-picked', { kind, name: path.basename(fp), bytes });
    } catch (e) {
        dialog.showErrorBox('파일 읽기 실패', e.message);
    }
}
function broadcastToSettings(channel, payload) {
    settingWins.forEach(w => { if (!w.isDestroyed()) w.webContents.send(channel, payload); });
}

async function createWindow() {
    const port = await startDevServer();
    mainWin = new BrowserWindow({
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
    mainWin.loadURL(`http://127.0.0.1:${port}/index.html`);
    mainWin.on('closed', () => { mainWin = null; });
    buildMenu();
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ── 설정 동기화 IPC (메인 렌더러 = 단일 출처) ──
// 메인 렌더러가 값이 바뀔 때마다 스냅샷을 보낸다 → 메뉴 체크상태 갱신 + 팝업에 전파.
let lastMenuViewKey = null;
ipcMain.on('settings:snapshot', (_e, snap) => {
    lastSnapshot = snap || lastSnapshot;
    // 네이티브 메뉴는 View 체크상태에만 의존한다. 슬라이더 드래그 등으로 스냅샷이
    // 쏟아져도 View 상태가 그대로면 메뉴를 재생성하지 않아 깜빡임/불안정을 막는다.
    const viewKey = JSON.stringify(lastSnapshot.view || {});
    if (viewKey !== lastMenuViewKey) {
        lastMenuViewKey = viewKey;
        buildMenu();
    }
    broadcastToSettings('settings:update', lastSnapshot);
});
// 팝업/메뉴가 현재 스냅샷을 요청.
ipcMain.handle('settings:current', () => lastSnapshot);
// 팝업/메뉴에서 설정 변경 → 메인 렌더러에 적용 요청.
ipcMain.on('settings:set', (_e, change) => sendToMain('settings:apply', change));
// 결과창 동작(내보내기 등) → 메인 렌더러로 전달.
ipcMain.on('results:action', (_e, action) => sendToMain('results:action', action));
// 메인 렌더러가 결과 데이터를 보냄 → 결과창 자동 표시(설정에 따라).
ipcMain.on('results:show', (_e, data) => {
    const w = openResultsWindow();
    const send = () => w.webContents.send('results:data', data);
    if (w.webContents.isLoading()) w.webContents.once('did-finish-load', send); else send();
});
// 결과창이 로드된 뒤 마지막 데이터를 요청할 수 있게.
ipcMain.handle('results:get', () => lastSnapshot.lastResult || null);

// 창 안 메뉴바에서 별도 창 열기 요청 (사용자 제스처 기반 → 확실히 동작).
const PANEL_TITLES = {
    preset: 'Preset', falling: 'Falling Object', target: 'Target Object',
    initial: 'Initial Conditions', others: 'Other Settings', graph: 'Graph', trajectory: 'Trajectory Data',
};
ipcMain.on('open-window', (_e, { panel } = {}) => {
    if (panel === 'results') openResultsWindow();
    else if (panel) openSettingWindow(panel, PANEL_TITLES[panel] || panel);
});

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

// 업로드한 GLB/STL 파일을 앱의 assets 폴더로 복사한다.
// 이렇게 하면 blob URL 대신 로컬 HTTP 서버에서 바로 서빙되어 로드 지연이 사라지고,
// 다음 실행 때 프리셋처럼 재사용할 수도 있다. 반환값의 path 는 'assets/<파일명>'.
ipcMain.handle('copy-to-assets', (_e, name, bytes) => {
    try {
        const assetsDir = path.join(__dirname, 'assets');
        if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
        // 파일명만 추출하고 안전하지 않은 문자는 '_' 로 치환 (경로 탈출 방지)
        const safe = path.basename(String(name || 'model')).replace(/[^\w.\-]/g, '_');
        const dest = path.join(assetsDir, safe);
        fs.writeFileSync(dest, Buffer.from(bytes));
        return { ok: true, path: 'assets/' + safe, name: safe };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});
