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
let creditsWin = null;
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

function openCreditsWindow() {
    if (creditsWin && !creditsWin.isDestroyed()) { creditsWin.focus(); return; }
    creditsWin = new BrowserWindow({
        width: 480, height: 560, minWidth: 340, minHeight: 300,
        parent: mainWin || undefined,
        title: 'Credits',
        backgroundColor: '#0d1117',
        webPreferences: {
            preload: path.join(__dirname, 'windows', 'credits-preload.js'),
            contextIsolation: true, nodeIntegration: false,
        },
    });
    creditsWin.setMenuBarVisibility(false);
    creditsWin.loadURL(`http://127.0.0.1:${serverPort}/windows/credits.html`);
    creditsWin.on('closed', () => { creditsWin = null; });
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
                    click: (mi) => sendToMain('settings:apply', { kind: 'view', id: 'alwaysGraph', value: mi.checked }),
                },
                {
                    label: 'Graph…',
                    click: () => openSettingWindow('graph', 'Graph'),
                },
                { type: 'separator' },
                {
                    label: 'Always show trajectory data', type: 'checkbox', checked: !!v.alwaysTraj,
                    click: (mi) => sendToMain('settings:apply', { kind: 'view', id: 'alwaysTraj', value: mi.checked }),
                },
                {
                    label: 'Trajectory data…',
                    click: () => openSettingWindow('trajectory', 'Trajectory Data'),
                },
                { type: 'separator' },
                {
                    label: 'Always show settings panel', type: 'checkbox', checked: v.alwaysSettings !== false,
                    click: (mi) => sendToMain('settings:apply', { kind: 'view', id: 'alwaysSettings', value: mi.checked }),
                },
                { type: 'separator' },
                {
                    label: 'Simulator-only mode', type: 'checkbox', checked: !!v.simOnly,
                    click: (mi) => sendToMain('settings:apply', { kind: 'view', id: 'simOnly', value: mi.checked }),
                },
                { label: 'Show result window now', click: () => { openResultsWindow(); sendToMain('results:request', {}); } },
            ],
        },
        {
            label: 'Help',
            submenu: [
                { label: 'Credits', click: () => openCreditsWindow() },
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
// ── OOXML XLSX 빌더: 데이터 시트 + 네이티브 라인 차트 4개 ──
function buildXlsxWithCharts(headers, rows) {
    const JSZip = require('jszip');
    const zip   = new JSZip();
    const N     = rows.length;

    // Excel 열 문자 변환 (0→A, 25→Z, 26→AA …)
    const col = n => { let s=''; do { s=String.fromCharCode(65+n%26)+s; n=Math.floor(n/26)-1; } while(n>=0); return s; };
    const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    // 차트 정의: 데이터 시트의 열 인덱스 참조
    const CHARTS = [
        { name:'Velocity',     colIdx:2, label:'Velocity (m/s)',        color:'4472C4' },
        { name:'Altitude',     colIdx:1, label:'Altitude (m)',           color:'3FB950' },
        { name:'Acceleration', colIdx:4, label:'Acceleration (m/s²)', color:'F85149' },
        { name:'Air Density',  colIdx:5, label:'Air Density (kg/m³)', color:'D2A105' },
    ];
    const TOTAL = 1 + CHARTS.length; // 데이터 + 차트 시트

    // ── [Content_Types].xml ──
    const sheetCT = Array.from({length:TOTAL},(_,i)=>
        `<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    ).join('');
    const chartCT = CHARTS.map((_,i)=>
        `<Override PartName="/xl/charts/chart${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>` +
        `<Override PartName="/xl/drawings/drawing${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`
    ).join('');
    zip.file('[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        sheetCT + chartCT + `</Types>`);

    zip.file('_rels/.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`);

    // ── xl/workbook.xml ──
    const sheetEls = [
        `<sheet name="Trajectory Data" sheetId="1" r:id="rId1"/>`,
        ...CHARTS.map((c,i)=>`<sheet name="${esc(c.name)}" sheetId="${i+2}" r:id="rId${i+2}"/>`)
    ].join('');
    zip.file('xl/workbook.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets>${sheetEls}</sheets></workbook>`);

    zip.file('xl/_rels/workbook.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        Array.from({length:TOTAL},(_,i)=>
            `<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`
        ).join('') + `</Relationships>`);

    zip.file('xl/styles.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
        `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
        `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="2">` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
        `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/>` +
        `</cellXfs></styleSheet>`);

    // ── xl/worksheets/sheet1.xml (Trajectory Data) ──
    const colDefs = headers.map((h,i)=>{
        const w = Math.min(Math.max(h.length, ...rows.map(r=>String(r[i]??'').length)) + 2, 50);
        return `<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`;
    }).join('');
    const hdrRow = `<row r="1">${headers.map((h,i)=>`<c r="${col(i)}1" t="inlineStr" s="1"><is><t>${esc(h)}</t></is></c>`).join('')}</row>`;
    const dataRowsXml = rows.map((row,ri)=>{
        const cells = row.map((v,ci)=>{
            const addr=`${col(ci)}${ri+2}`;
            return typeof v==='string'
                ? `<c r="${addr}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`
                : `<c r="${addr}"><v>${v}</v></c>`;
        }).join('');
        return `<row r="${ri+2}">${cells}</row>`;
    }).join('');
    zip.file('xl/worksheets/sheet1.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<cols>${colDefs}</cols><sheetData>${hdrRow}${dataRowsXml}</sheetData></worksheet>`);

    // ── 차트 시트 (sheet2–5) ──
    CHARTS.forEach((cd, idx) => {
        const si = idx + 2; // sheet index
        const ci = idx + 1; // chart/drawing index
        const DATA = "'Trajectory Data'";
        const catRef = `${DATA}!$A$2:$A$${N+1}`;
        const valRef = `${DATA}!$${col(cd.colIdx)}$2:$${col(cd.colIdx)}$${N+1}`;
        const lblRef = `${DATA}!$${col(cd.colIdx)}$1`;

        // 빈 시트 (데이터 없음 — 차트만 drawing으로 연결)
        zip.file(`xl/worksheets/sheet${si}.xml`,
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
            `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
            `<sheetData/><drawing r:id="rId1"/></worksheet>`);

        zip.file(`xl/worksheets/_rels/sheet${si}.xml.rels`,
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
            `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
            `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${ci}.xml"/>` +
            `</Relationships>`);

        // Drawing: 절대 위치로 차트 크기 지정 (9144000×5486400 EMU = ~10"×6")
        zip.file(`xl/drawings/drawing${ci}.xml`,
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
            `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
            `<xdr:absoluteAnchor>` +
            `<xdr:pos x="0" y="0"/><xdr:ext cx="9144000" cy="5486400"/>` +
            `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr>` +
            `<xdr:cNvPr id="2" name="Chart ${ci}"/><xdr:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></xdr:cNvGraphicFramePr>` +
            `</xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
            `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">` +
            `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId1"/>` +
            `</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:absoluteAnchor></xdr:wsDr>`);

        zip.file(`xl/drawings/_rels/drawing${ci}.xml.rels`,
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
            `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
            `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${ci}.xml"/>` +
            `</Relationships>`);

        // 차트 XML (라인 차트)
        zip.file(`xl/charts/chart${ci}.xml`,
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
            `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
            `<c:roundedCorners val="0"/>` +
            `<c:chart>` +
            `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr b="1"/></a:pPr><a:r><a:t>${esc(cd.name)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` +
            `<c:autoTitleDeleted val="0"/>` +
            `<c:plotArea>` +
            `<c:lineChart>` +
            `<c:grouping val="standard"/><c:varyColors val="0"/>` +
            `<c:ser>` +
            `<c:idx val="0"/><c:order val="0"/>` +
            `<c:tx><c:strRef><c:f>${lblRef}</c:f></c:strRef></c:tx>` +
            `<c:spPr><a:ln w="25400"><a:solidFill><a:srgbClr val="${cd.color}"/></a:solidFill></a:ln></c:spPr>` +
            `<c:marker><c:symbol val="none"/></c:marker>` +
            `<c:cat><c:numRef><c:f>${catRef}</c:f></c:numRef></c:cat>` +
            `<c:val><c:numRef><c:f>${valRef}</c:f></c:numRef></c:val>` +
            `<c:smooth val="0"/>` +
            `</c:ser>` +
            `<c:axId val="101"/><c:axId val="102"/>` +
            `</c:lineChart>` +
            `<c:catAx>` +
            `<c:axId val="101"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>` +
            `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Time (s)</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` +
            `<c:numFmt formatCode="0.00" sourceLinked="0"/><c:crossAx val="102"/><c:auto val="1"/>` +
            `</c:catAx>` +
            `<c:valAx>` +
            `<c:axId val="102"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>` +
            `<c:title><c:tx><c:rich><a:bodyPr rot="-5400000" vert="horz"/><a:lstStyle/><a:p><a:r><a:t>${esc(cd.label)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` +
            `<c:crossAx val="101"/>` +
            `</c:valAx>` +
            `</c:plotArea>` +
            `<c:legend><c:legendPos val="r"/><c:overlay val="0"/></c:legend>` +
            `<c:plotVisOnly val="1"/>` +
            `</c:chart>` +
            `</c:chartSpace>`);
    });

    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

ipcMain.handle('export-xlsx', async (_e, { headers, rows, filename }) => {
    try {
        const { canceled, filePath } = await dialog.showSaveDialog(mainWin, {
            defaultPath: filename || 'sim-trajectory.xlsx',
            filters: [{ name: 'Excel 파일', extensions: ['xlsx'] }],
        });
        if (canceled || !filePath) return { ok: false };
        const buf = await buildXlsxWithCharts(headers, rows);
        fs.writeFileSync(filePath, buf);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});

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

ipcMain.handle('get-credits', () => {
    try {
        return fs.readFileSync(path.join(__dirname, 'credits.md'), 'utf-8');
    } catch (e) {
        return '# Credits\n\ncredits.md 파일을 찾을 수 없습니다.';
    }
});
