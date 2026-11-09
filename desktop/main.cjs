const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, dialog } = require('electron');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

if (process.env.NUL_USER_DATA_DIR) app.setPath('userData', path.resolve(process.env.NUL_USER_DATA_DIR));

// Optional runtime budget mode. This does not cap the OS process; it avoids
// GPU/OpenGL overhead and Chromium services that an offline companion does not need.
const lowMemory = process.env.NUL_LOW_MEMORY === '1' || process.argv.includes('--low-memory');
if (lowMemory) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-background-networking');
  app.commandLine.appendSwitch('disable-component-update');
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
  app.commandLine.appendSwitch('disk-cache-size', '1048576');
  app.commandLine.appendSwitch('renderer-process-limit', '1');
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=64 --optimize-for-size');
  app.commandLine.appendSwitch('disable-features', 'MediaRouter,OptimizationHints,Translate,SpellcheckServiceInit,BackForwardCache');
}

const CURRENT_VERSION = app.getVersion();
const instanceMarkerPath = () => path.join(app.getPath('userData'), 'running-instance.json');

function sleepSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) { /* spin fallback */ }
  }
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readRunningInstance() {
  try {
    return JSON.parse(fs.readFileSync(instanceMarkerPath(), 'utf8'));
  } catch {
    return null;
  }
}

function writeRunningInstance() {
  try {
    fs.mkdirSync(path.dirname(instanceMarkerPath()), { recursive: true });
    fs.writeFileSync(instanceMarkerPath(), JSON.stringify({
      version: CURRENT_VERSION,
      pid: process.pid,
      startedAt: new Date().toISOString()
    }, null, 2));
  } catch {}
}

function clearRunningInstance() {
  try {
    const current = readRunningInstance();
    if (!current || current.pid === process.pid) {
      fs.unlinkSync(instanceMarkerPath());
    }
  } catch {}
}

/**
 * Terminates stale background tray instances from an older release (e.g. v0.1.2 hidden in
 * the Windows system tray) so launching a newer portable/installed build starts the new
 * version instead of waking the old tray process via `requestSingleInstanceLock()`.
 */
function terminateStaleCompanionProcesses(recordedPid) {
  const selfPid = process.pid;
  const parentPid = process.ppid;

  if (Number.isInteger(recordedPid) && recordedPid > 0 && recordedPid !== selfPid && recordedPid !== parentPid) {
    try { process.kill(recordedPid, 'SIGTERM'); } catch {}
  }

  if (process.platform === 'win32') {
    let killedViaCim = false;
    try {
      const psScript = [
        `$self = ${selfPid}; $parent = ${parentPid};`,
        `Get-CimInstance Win32_Process -Filter "Name = 'nul-companion.exe'" |`,
        `Where-Object { $_.ProcessId -ne $self -and $_.ProcessId -ne $parent -and $_.ParentProcessId -ne $self } |`,
        `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
      ].join(' ');
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psScript], {
        stdio: 'ignore',
        timeout: 4000,
        windowsHide: true
      });
      killedViaCim = true;
    } catch {}

    if (!killedViaCim) {
      try {
        const csv = execFileSync('tasklist.exe', ['/FO', 'CSV', '/NH', '/FI', 'IMAGENAME eq nul-companion.exe'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 3000,
          windowsHide: true
        });
        for (const line of csv.split(/\r?\n/)) {
          const match = line.match(/^"[^"]+","(\d+)"/);
          if (!match) continue;
          const pid = Number.parseInt(match[1], 10);
          if (pid > 0 && pid !== selfPid && pid !== parentPid) {
            try {
              execFileSync('taskkill.exe', ['/F', '/PID', String(pid)], {
                stdio: 'ignore',
                timeout: 2000,
                windowsHide: true
              });
            } catch {}
          }
        }
      } catch {}
    }
  } else {
    try {
      const out = execFileSync('ps', ['-eo', 'pid=,ppid=,comm='], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 2000
      });
      for (const line of out.split('\n')) {
        const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
        if (!m) continue;
        const pid = Number.parseInt(m[1], 10);
        const ppid = Number.parseInt(m[2], 10);
        const comm = m[3].trim();
        if (
          (comm === 'nul-companion' || comm === 'NUL Companion') &&
          pid !== selfPid &&
          pid !== parentPid &&
          ppid !== selfPid
        ) {
          try { process.kill(pid, 'SIGTERM'); } catch {}
        }
      }
    } catch {}
  }
}

function acquireVersionedSingleInstanceLock() {
  const existing = readRunningInstance();
  const sameVersionAlive = existing && existing.version === CURRENT_VERSION && isPidAlive(existing.pid);

  // If no marker exists (e.g. v0.1.2 hidden in tray) or version differs, close stale tray process BEFORE
  // calling requestSingleInstanceLock so we never wake up an older version's window.
  if (!sameVersionAlive) {
    terminateStaleCompanionProcesses(existing?.pid);
  }

  let acquired = app.requestSingleInstanceLock({ version: CURRENT_VERSION, pid: process.pid });
  if (!acquired && !sameVersionAlive) {
    for (let attempt = 0; attempt < 20 && !acquired; attempt++) {
      sleepSync(100);
      terminateStaleCompanionProcesses(existing?.pid);
      acquired = app.requestSingleInstanceLock({ version: CURRENT_VERSION, pid: process.pid });
    }
  }

  if (acquired) {
    writeRunningInstance();
  }
  return acquired;
}

const singleInstance = acquireVersionedSingleInstanceLock();
if (!singleInstance) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let tray = null;
let quitting = false;
let mode = 'lab';
let pinned = true;
let state = null;
let stateTimer = null;

const statePath = () => path.join(app.getPath('userData'), 'window-state.json');
const defaultState = () => ({
  mode: 'lab',
  pinned: true,
  labBounds: { width: 1360, height: 940 },
  companionBounds: { width: 360, height: 480 }
});

function readState() {
  const fallback = defaultState();
  try {
    const saved = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    return { ...fallback, ...saved };
  } catch { return fallback; }
}

function queueStateSave() {
  clearTimeout(stateTimer);
  stateTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed() || !state) return;
    try {
      state[mode === 'companion' ? 'companionBounds' : 'labBounds'] = mainWindow.getBounds();
      state.mode = mode;
      state.pinned = pinned;
      fs.mkdirSync(path.dirname(statePath()), { recursive: true });
      fs.writeFileSync(statePath(), JSON.stringify(state, null, 2));
    } catch (error) { console.warn('Window state could not be saved:', error.message); }
  }, 180);
}

function currentWorkArea() {
  const display = mainWindow ? screen.getDisplayMatching(mainWindow.getBounds()) : screen.getPrimaryDisplay();
  return display.workArea;
}

function boundedRectangle(bounds, fallbackWidth, fallbackHeight, minWidth, minHeight) {
  const area = currentWorkArea();
  const width = Math.max(minWidth, Math.min(Number(bounds?.width) || fallbackWidth, area.width - 24));
  const height = Math.max(minHeight, Math.min(Number(bounds?.height) || fallbackHeight, area.height - 24));
  const x = Number.isFinite(bounds?.x) ? bounds.x : Math.round(area.x + (area.width - width) / 2);
  const y = Number.isFinite(bounds?.y) ? bounds.y : Math.round(area.y + (area.height - height) / 2);
  return {
    width: Math.round(width), height: Math.round(height),
    x: Math.round(Math.max(area.x - width + 80, Math.min(x, area.x + area.width - 80))),
    y: Math.round(Math.max(area.y - height + 60, Math.min(y, area.y + area.height - 60)))
  };
}

function modeState() { return { mode, pinned }; }

function broadcastMode() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('nul:mode-changed', modeState());
  rebuildTrayMenu();
}

function applyMode(nextMode, initial = false) {
  if (!mainWindow || mainWindow.isDestroyed()) return modeState();
  const next = nextMode === 'companion' ? 'companion' : 'lab';
  if (!initial && mainWindow.isVisible()) state[mode === 'companion' ? 'companionBounds' : 'labBounds'] = mainWindow.getBounds();
  mode = next;

  if (mode === 'companion') {
    mainWindow.setMinimumSize(280, 330);
    mainWindow.setResizable(true);
    mainWindow.setAlwaysOnTop(pinned, 'floating');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    let bounds = boundedRectangle(state.companionBounds, 360, 480, 280, 330);
    if (!Number.isFinite(state.companionBounds?.x)) {
      const area = currentWorkArea();
      bounds.x = area.x + area.width - bounds.width - 22;
      bounds.y = area.y + area.height - bounds.height - 22;
    }
    mainWindow.setBounds(bounds);
  } else {
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setVisibleOnAllWorkspaces(false);
    mainWindow.setMinimumSize(860, 620);
    mainWindow.setResizable(true);
    mainWindow.setBounds(boundedRectangle(state.labBounds, 1360, 940, 860, 620));
  }
  broadcastMode();
  queueStateSave();
  return modeState();
}

function showWindow() {
  if (!mainWindow) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function rebuildTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `NUL Companion v${CURRENT_VERSION}`, enabled: false },
    { type: 'separator' },
    { label: 'Show NUL', click: showWindow },
    { label: 'Full lab', type: 'radio', checked: mode === 'lab', click: () => { showWindow(); applyMode('lab'); } },
    { label: 'Desktop companion', type: 'radio', checked: mode === 'companion', click: () => { showWindow(); applyMode('companion'); } },
    { label: 'Always on top', type: 'checkbox', checked: pinned && mode === 'companion', enabled: mode === 'companion', click: item => {
      pinned = item.checked;
      mainWindow.setAlwaysOnTop(pinned, 'floating');
      broadcastMode(); queueStateSave();
    } },
    { type: 'separator' },
    { label: 'Quit NUL', click: () => { quitting = true; app.quit(); } }
  ]));
}

function createTray() {
  try {
    const image = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png')).resize({ width: 18, height: 18 });
    tray = new Tray(image);
    tray.setToolTip(`NUL Companion v${CURRENT_VERSION} — autonomous desktop companion`);
    tray.on('click', showWindow);
    rebuildTrayMenu();
  } catch (error) { console.warn('Tray unavailable:', error.message); }
}

function createWindow() {
  state = readState();
  mode = state.mode === 'companion' ? 'companion' : 'lab';
  pinned = state.pinned !== false;
  const initial = boundedRectangle(state.labBounds, 1360, 940, 860, 620);
  mainWindow = new BrowserWindow({
    ...initial,
    title: `NUL Companion v${CURRENT_VERSION}`,
    minWidth: 860,
    minHeight: 620,
    frame: false,
    transparent: true,
    roundedCorners: true,
    backgroundColor: '#00000000',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    applyMode(mode, true);
  });
  mainWindow.on('resize', queueStateSave);
  mainWindow.on('move', queueStateSave);
  mainWindow.on('close', event => {
    queueStateSave();
    if (!quitting && tray && !tray.isDestroyed()) { event.preventDefault(); mainWindow.hide(); }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
}

ipcMain.handle('nul:set-mode', (_event, nextMode) => applyMode(nextMode));
ipcMain.handle('nul:set-pinned', (_event, value) => {
  pinned = Boolean(value);
  if (mainWindow && mode === 'companion') mainWindow.setAlwaysOnTop(pinned, 'floating');
  broadcastMode(); queueStateSave();
  return modeState();
});
ipcMain.handle('nul:window-control', (_event, action) => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  if (action === 'hide') {
    if (tray && !tray.isDestroyed()) mainWindow.hide();
    else mainWindow.minimize();
  }
});
ipcMain.handle('nul:save-json', async (_event, payload) => {
  const suggestedName = path.basename(String(payload?.suggestedName || 'nul-world.json'));
  const contents = typeof payload?.contents === 'string' ? payload.contents : '{}';
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save NUL data',
    defaultPath: path.join(app.getPath('documents'), suggestedName),
    filters: [{ name: 'JSON data', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { saved: false };
  fs.writeFileSync(result.filePath, contents, 'utf8');
  return { saved: true, filePath: result.filePath };
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  app.on('activate', showWindow);
});
app.on('second-instance', (_event, _argv, _cwd, additionalData) => {
  if (additionalData && additionalData.version && additionalData.version !== CURRENT_VERSION) {
    quitting = true;
    clearRunningInstance();
    app.releaseSingleInstanceLock();
    app.quit();
    return;
  }
  showWindow();
});
app.on('before-quit', () => {
  quitting = true;
  if (stateTimer) {
    clearTimeout(stateTimer);
    stateTimer = null;
  }
  if (mainWindow && !mainWindow.isDestroyed() && state) {
    try {
      state[mode === 'companion' ? 'companionBounds' : 'labBounds'] = mainWindow.getBounds();
      state.mode = mode; state.pinned = pinned;
      fs.writeFileSync(statePath(), JSON.stringify(state, null, 2));
    } catch {}
  }
});
app.on('will-quit', () => {
  clearRunningInstance();
  if (tray && !tray.isDestroyed()) tray.destroy();
});
