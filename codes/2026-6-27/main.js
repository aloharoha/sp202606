const { app, BrowserWindow, ipcMain } = require('electron');
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

async function createWindow() {
    const port = await startDevServer();
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
    win.loadURL(`http://127.0.0.1:${port}/index.html`);
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
