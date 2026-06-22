const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let physics;
try {
    physics = require('./build/Release/physics.node');
} catch {
    physics = require(path.join(process.resourcesPath, 'physics.node'));
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
