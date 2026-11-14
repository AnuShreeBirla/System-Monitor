// Modules
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  dialog,
  ipcMain,
  Notification,
  powerMonitor,
  screen,
} = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const { existsSync } = fs;
const http = require('http');
const os = require('os');
const path = require('path');
const si = require('systeminformation');

// Constants
const openWhenLogedIn = true;
const unityAppPath = process.env.SYSTEM_MONITOR_UNITY_APP_PATH || path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'My project',
  'Builds',
  'macOS',
  'My project.app',
);

// Variables
let tray = null;
let settingsWindow = null;
let popoverWindow = null;
let memoryUsage = 0;
let memoryThreshold = 80;
let memoryAlertActive = false;

// ─── Threshold-event log (shared by HTTP API) ─────────────────────────────────

const apiLogs = [];
let apiNextLogId = 1;
const apiAlertState = new Map();

function recordApiThresholdEvent(key, active, eventType) {
  if (apiAlertState.get(key) === active) return;
  apiAlertState.set(key, active);
  if (!active) return;

  apiLogs.unshift({
    id: apiNextLogId++,
    eventType,
    timestamp: new Date().toLocaleString(),
  });
  if (apiLogs.length > 20) apiLogs.length = 20;
  broadcastToAllWindows('system-logs', apiLogs.slice(0, 5));
}

// ─── IPC handlers ────────────────────────────────────────────────────────────

ipcMain.on('set-memory-threshold', (_event, threshold) => {
  if (Number.isFinite(threshold) && threshold >= 1 && threshold <= 100) {
    memoryThreshold = threshold;
    if (memoryUsage < memoryThreshold) {
      memoryAlertActive = false;
    }
  }
});

ipcMain.on('launch-unity', () => {
  openUnityDashboard();
});

ipcMain.on('close-popover', () => {
  if (popoverWindow && !popoverWindow.isDestroyed()) {
    popoverWindow.hide();
  }
});

ipcMain.on('open-settings', () => {
  createSettingsWindow();
});

// ─── Unity launcher ──────────────────────────────────────────────────────────

function openUnityDashboard() {
    if (process.platform !== 'darwin') {
        dialog.showErrorBox('Unity tablet is available on macOS', 'Build and run the macOS Unity player to open the 3D dashboard.');
        return;
    }

    if (!existsSync(unityAppPath)) {
        dialog.showErrorBox(
            'Unity tablet build not found',
            `Build the Unity project to:\n${unityAppPath}\n\nYou can override this path with SYSTEM_MONITOR_UNITY_APP_PATH.`,
        );
        return;
    }

    // `open -a` activates an already-running instance instead of spawning a
    // second Unity player process, so repeated clicks are safe.
    const launch = spawn(
        'open',
        ['-a', unityAppPath, '--args', '-screen-width', '1100', '-screen-height', '670', '-screen-fullscreen', '0'],
        { detached: true, stdio: 'ignore' },
    );
    launch.once('error', (error) => {
        dialog.showErrorBox('Could not open the Unity tablet', error.message);
    });
    launch.unref();
}

// ─── Popover window ──────────────────────────────────────────────────────────

function createPopoverWindow() {
  if (popoverWindow && !popoverWindow.isDestroyed()) {
    return popoverWindow;
  }

  popoverWindow = new BrowserWindow({
    width: 550,
    height: 335,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    transparent: false,
    backgroundColor: '#1a1b22',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  popoverWindow.loadURL('http://127.0.0.1:5175/#/').catch((error) => {
    console.error('[System Monitor] Could not load the shared dashboard in the tray popover:', error);
  });
  const dashboardWindow = popoverWindow;
  dashboardWindow.webContents.once('did-finish-load', () => {
    // Unity renders this same React route at 1100×670; half-scale it into the popover.
    if (!dashboardWindow.isDestroyed()) dashboardWindow.webContents.setZoomFactor(0.5);
  });

  // Hide after focus really leaves the popover. On macOS a tray click can
  // briefly produce a blur while Electron activates the newly shown window.
  popoverWindow.on('blur', () => {
    const blurredWindow = popoverWindow;
    setTimeout(() => {
      if (
        popoverWindow === blurredWindow &&
        blurredWindow &&
        !blurredWindow.isDestroyed() &&
        blurredWindow.isVisible() &&
        !blurredWindow.isFocused()
      ) {
        blurredWindow.hide();
      }
    }, 120);
  });

  popoverWindow.on('closed', () => {
    popoverWindow = null;
  });

  return popoverWindow;
}

function showPopover() {
  const win = createPopoverWindow();
  const trayBounds = tray.getBounds();
  const { workArea } = screen.getDisplayMatching(trayBounds);

  // Position the popover just below the tray icon, horizontally centered on it
  const popoverWidth = 550;
  const popoverHeight = 335;
  const gap = 4;

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - popoverWidth / 2);
  let y = Math.round(trayBounds.y + trayBounds.height + gap);

  // Clamp to work area
  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - popoverWidth));
  y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - popoverHeight));

  win.setBounds({ x, y, width: popoverWidth, height: popoverHeight });

  if (win.isVisible()) {
    win.hide();
    return;
  }

  // Activate the popover as one operation. showInactive() followed by focus()
  // can race the blur-to-hide handler on macOS and make the popover disappear
  // as soon as the tray click opens it.
  win.show();
}

// ─── Tray ────────────────────────────────────────────────────────────────────

function createTray() {
    if (tray) return;

    const iconPath = path.join(__dirname, 'assets', 'system-monitor-tablet.png');

    tray = new Tray(iconPath);
    tray.setToolTip('System Monitor');

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Open Dashboard',
            click: openUnityDashboard,
        },
        {
            label: 'Pause Monitoring',
            type: 'checkbox',
            checked: false,
            click: (item) => {
                console.log('Monitoring paused:', item.checked);
            }
        },
        {
            label: 'Open Settings',
            click: () => createSettingsWindow()
        },
        {
            type: 'separator'
        },
        {
            label: 'Quit',
            click: () => {
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);

    // Left-click → show compact popover
    tray.on('click', () => {
        showPopover();
    });

    // Right-click → context menu (macOS sends this automatically via setContextMenu)
    tray.on('right-click', () => {
        tray.popUpContextMenu(contextMenu);
    });
}

// ─── Settings window ─────────────────────────────────────────────────────────

function createSettingsWindow() {

    // If Settings is already open, reuse it
    if (settingsWindow && !settingsWindow.isDestroyed()) {

        if (settingsWindow.isMinimized()) {
            settingsWindow.restore();
        }

        settingsWindow.show();
        settingsWindow.focus();

        return;
    }

    settingsWindow = new BrowserWindow({

        width: 600,
        height: 500,

        resizable: true,
        show: false,
        title: 'System Monitor Settings',

        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false
        }

    });

    // Development: load from Vite dev server; in production load from dist
    const devURL = 'http://localhost:5174/#/settings';
    const distPath = path.join(__dirname, '..', 'dist', 'index.html');

    if (existsSync(distPath)) {
      settingsWindow.loadFile(distPath, { hash: '/settings' });
    } else {
      settingsWindow.loadURL(devURL);
    }

    settingsWindow.once('ready-to-show', () => {
        settingsWindow.show();
    });

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });

}

function configureStartup(open) {
    app.setLoginItemSettings({ openAtLogin: open });
}

// ─── System metrics ──────────────────────────────────────────────────────────

let cpuUsage = 0;
let previousCpuTimes = getCpuTimes();

function getCpuTimes() {
  let total = 0;
  let idle = 0;

  for (const cpu of os.cpus()) {
    idle += cpu.times.idle;
    total += Object.values(cpu.times).reduce((sum, time) => sum + time, 0);
  }

  return { total, idle };
}

let batteryStatus = null;

async function updateBatteryStatus() {
  try {
    batteryStatus = await si.battery();
    broadcastToAllWindows('battery-status', batteryStatus);
    // Record battery-low threshold event for the HTTP API log feed
    recordApiThresholdEvent(
      'battery-low',
      batteryStatus?.hasBattery && batteryStatus.percent <= 20 && !batteryStatus.acConnected,
      `Low battery: ${batteryStatus?.percent ?? 0}%`,
    );
  } catch (error) {
    console.error('Could not read battery status:', error.message);
  }
}

/**
 * Broadcast an IPC event to every open BrowserWindow that has a valid
 * webContents (settings, popover, or any future window).
 */
function broadcastToAllWindows(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && win.webContents) {
      win.webContents.send(channel, payload);
    }
  }
}

function updateSystemUsage() {
  const currentCpuTimes = getCpuTimes();
  const totalMemory = os.totalmem();
  memoryUsage = Math.round(((totalMemory - os.freemem()) / totalMemory) * 100);

  if (memoryUsage >= memoryThreshold && !memoryAlertActive) {
    memoryAlertActive = true;
    console.log(`Threshold crossed: ${memoryUsage}% >= ${memoryThreshold}%`);

    if (!Notification.isSupported()) {
      console.error('Desktop notifications are not supported');
    } else {
      const notification = new Notification({
        title: 'High memory usage',
        body: `Memory usage is ${memoryUsage}%, above your ${memoryThreshold}% limit.`,
      });

      notification.on('show', () => console.log('Notification shown'));
      notification.on('failed', (_event, error) =>
        console.error('Notification failed:', error)
      );

      notification.show();
    }
  } else if (memoryUsage < memoryThreshold) {
    memoryAlertActive = false;
  }

  const totalDiff = currentCpuTimes.total - previousCpuTimes.total;
  const idleDiff = currentCpuTimes.idle - previousCpuTimes.idle;

  if (totalDiff > 0) {
    cpuUsage = Math.round((1 - idleDiff / totalDiff) * 100);
  }

  previousCpuTimes = currentCpuTimes;

  // Record threshold events for the HTTP API log feed
  recordApiThresholdEvent('cpu-high', cpuUsage >= 90, `High CPU usage: ${cpuUsage}%`);
  recordApiThresholdEvent('memory-high', memoryUsage >= memoryThreshold, `High memory usage: ${memoryUsage}%`);

  tray?.setToolTip(
    `CPU: ${cpuUsage}% | Memory: ${memoryUsage}% | Battery: ${batteryStatus?.hasBattery ? `${batteryStatus.percent}% (${batteryStatus.acConnected ? 'Plugged in' : 'Not plugged in'})` : 'Unavailable'}`
  );

  // Broadcast to ALL open windows (settings, popover, any future window)
  broadcastToAllWindows('cpu-usage', cpuUsage);
  broadcastToAllWindows('memory-usage', memoryUsage);
}

ipcMain.handle('get-system-monitor-state', async () => {
  if (!batteryStatus) {
    await updateBatteryStatus();
  }

  return {
    cpuUsage,
    memoryUsage,
    batteryStatus: batteryStatus
      ? {
          hasBattery: Boolean(batteryStatus.hasBattery),
          percent: batteryStatus.hasBattery ? Math.round(batteryStatus.percent) : null,
          acConnected: Boolean(batteryStatus.acConnected),
        }
      : null,
    logs: apiLogs.slice(0, 5),
  };
});

// ─── Standalone HTTP API server (port 5175) ───────────────────────────────────
//
// One always-on Electron server delivers both the production React build and
// live metrics to Unity's UWB browser. The dashboard and API share an origin,
// so the standalone player does not depend on the Vite dev server or CORS.

const API_PORT = 5175;
const API_HOST = '127.0.0.1';
const DASHBOARD_DIST_DIR = path.resolve(__dirname, '..', 'dist');
const DASHBOARD_INDEX_FILE = path.join(DASHBOARD_DIST_DIR, 'index.html');
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serveDashboardFile(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }

  if (!existsSync(DASHBOARD_INDEX_FILE)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('System Monitor dashboard build is missing. Run npm start to build it.');
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }

  const candidatePath = path.resolve(DASHBOARD_DIST_DIR, `.${decodedPath}`);
  if (
    candidatePath !== DASHBOARD_DIST_DIR &&
    !candidatePath.startsWith(`${DASHBOARD_DIST_DIR}${path.sep}`)
  ) {
    res.writeHead(403);
    res.end();
    return;
  }

  fs.stat(candidatePath, (statError, stats) => {
    const filePath = !statError && stats.isFile()
      ? candidatePath
      : path.extname(decodedPath)
        ? null
        : DASHBOARD_INDEX_FILE;

    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    fs.readFile(filePath, (readError, content) => {
      if (readError) {
        console.error(`[System Monitor] Could not read dashboard file ${filePath}:`, readError);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Could not load the System Monitor dashboard.');
        return;
      }

      const extension = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES[extension] || 'application/octet-stream',
        'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
        'Content-Length': content.length,
      });
      res.end(req.method === 'HEAD' ? undefined : content);
    });
  });
}

function startApiServer() {
  const server = http.createServer((req, res) => {
    // Allow any origin so the CEF renderer can fetch without CORS errors
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${API_HOST}:${API_PORT}`);

    if (url.pathname !== '/api/system-monitor') {
      serveDashboardFile(req, res, url.pathname);
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });

    res.end(JSON.stringify({
      cpuUsage,
      memoryUsage,
      batteryStatus: batteryStatus
        ? {
            hasBattery: Boolean(batteryStatus.hasBattery),
            percent: batteryStatus.hasBattery ? Math.round(batteryStatus.percent) : null,
            acConnected: Boolean(batteryStatus.acConnected),
          }
        : null,
      logs: apiLogs,
    }));
  });

  return new Promise((resolve) => {
    server.once('error', (err) => {
      console.error(`[System Monitor] Could not start dashboard/API server on ${API_HOST}:${API_PORT}: ${err.message}`);
      resolve(false);
    });

    server.listen(API_PORT, API_HOST, () => {
      console.log(`[System Monitor] Dashboard and API server listening on http://${API_HOST}:${API_PORT}`);
      resolve(true);
    });
  });
}

// ─── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(async () => {
    configureStartup(openWhenLogedIn);
    if (process.platform === 'darwin') app.dock.hide();
    await startApiServer();
    createTray();

    updateSystemUsage();
    setInterval(updateSystemUsage, 1000);
    updateBatteryStatus();
    setInterval(updateBatteryStatus, 10000);
});

// Keep the tray application alive when its windows are closed.
app.on('window-all-closed', () => {});

app.on('activate', () => tray?.popUpContextMenu());
