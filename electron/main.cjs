// // main.cjs
// Modules
const {
    app,
    BrowserWindow,
    Tray,
    Menu,
    ipcMain,
    Notification,
    powerMonitor
} = require('electron');

const http = require('http');
const os = require('os');
const path = require('path');
const si = require('systeminformation');

const {
    cloneDefaults,
    updateSettings,
    loadSettings,
    saveSettings
} = require('./backend/settings.cjs');

const {
    addPowerEvent,
    getPowerEvents
} = require('./backend/powerEvents.cjs');


// Variables
let mainWindow = null;
let tray = null;
let settingsWindow = null;
let isQuitting = false;

let memoryUsage = 0;
let memoryAlertActive = false;

let settings = cloneDefaults();
let settingsFilePath = null;
let powerEventsFilePath = null;

let monitoringTimer = null;
let unityApiServer = null;


// Unity API Server
function startUnityApiServer() {
    const unityOrigin = 'http://127.0.0.1:5173';

    unityApiServer = http.createServer(async (request, response) => {
        if (request.headers.origin === unityOrigin) {
            response.setHeader('Access-Control-Allow-Origin', unityOrigin);
            response.setHeader('Vary', 'Origin');
        }

        if (request.method === 'OPTIONS') {
            response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            response.writeHead(204);
            response.end();
            return;
        }

        const requestUrl = new URL(request.url, 'http://127.0.0.1');

        if (
            request.method !== 'GET' ||
            requestUrl.pathname !== '/api/power-events'
        ) {
            response.writeHead(404);
            response.end();
            return;
        }

        try {
            const limit = requestUrl.searchParams.get('limit') || '5';

            const powerEvents = await getPowerEvents(
                powerEventsFilePath,
                limit
            );

            response.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8'
            });

            response.end(JSON.stringify(powerEvents));

        } catch (error) {
            console.error('Could not load Unity power events:', error.message);

            response.writeHead(500, {
                'Content-Type': 'application/json; charset=utf-8'
            });

            response.end(JSON.stringify({
                error: 'Could not load power events'
            }));
        }
    });

    unityApiServer.on('error', (error) => {
        console.error('Unity power-event API unavailable:', error.message);
    });

    unityApiServer.listen(5174, '127.0.0.1');
}


// IPC: Retrieve Settings
ipcMain.handle('settings:get', () => {
    return settings;
});


// IPC: Retrieve Power Events
ipcMain.handle('get-power-events', (_event, limit) => {
    return getPowerEvents(powerEventsFilePath, limit);
});


// IPC: Update and Save Settings
ipcMain.handle('settings:update', (_event, patch) => {
    const result = updateSettings(settings, patch);

    // Stop if validation fails
    if (!result.ok) {
        return result;
    }

    try {
        // Save before applying the new settings
        saveSettings(settingsFilePath, result.settings);

        settings = result.settings;

        // Reset alert state if memory is below the new threshold
        if (memoryUsage < settings.memoryThreshold) {
            memoryAlertActive = false;
        }

        // Apply startup preference
        configureStartup(settings.openAtLogin);

        // Restart monitoring with the new interval
        startMonitoring();

        return {
            ok: true,
            settings,
            errors: []
        };

    } catch (error) {
        return {
            ok: false,
            settings,
            errors: [`Could not save settings: ${error.message}`]
        };
    }
});


// Main Window
function createWindow(options = {}) {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 600,
        show: options.show ?? true,

        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadURL('http://localhost:5173/#/');

    // Hide instead of closing
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}


// System Tray
function createTray() {
    const iconPath = path.join(
        __dirname,
        'assets',
        'temp-tray-44.png'
    );

    tray = new Tray(iconPath);

    tray.setToolTip('Resource Monitor');

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Open Dashboard',
            click: () => {
                mainWindow.show();
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
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        mainWindow.show();
    });
}


// Power Events
function setupPowerEvents() {
    const events = {
        'suspend': {
            type: 'sleep',
            description: 'System entered sleep mode'
        },
        'resume': {
            type: 'wake',
            description: 'System woke from sleep'
        },
        'lock-screen': {
            type: 'lock',
            description: 'Screen locked'
        },
        'unlock-screen': {
            type: 'unlock',
            description: 'Screen unlocked'
        },
        'on-ac': {
            type: 'battery plugged in',
            description: 'Battery connected to power'
        },
        'on-battery': {
            type: 'charging stopped',
            description: 'Charging stopped after switching to battery power'
        }
    };

    Object.entries(events).forEach(([eventName, eventDetails]) => {
        powerMonitor.on(eventName, async () => {
            try {
                const log = await addPowerEvent(
                    powerEventsFilePath,
                    eventDetails.type,
                    eventDetails.description
                );

                console.log('Power Event:', log);

                // Send event to renderer windows
                BrowserWindow.getAllWindows().forEach((win) => {
                    if (!win.isDestroyed()) {
                        win.webContents.send('power-event', log);
                    }
                });

            } catch (error) {
                console.error('Could not save power event:', error.message);
            }
        });
    });
}


// Settings Window
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

        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // Development
    settingsWindow.loadURL('http://localhost:5173/#/settings');

    settingsWindow.once('ready-to-show', () => {
        settingsWindow.show();
    });

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
}


// Startup Configuration
function configureStartup(open) {
    app.setLoginItemSettings({
        openAtLogin: open
    });

    const loginSettings = app.getLoginItemSettings();
    const wasOpenedAtLogin = loginSettings.wasOpenedAtLogin;

    const startHidden = wasOpenedAtLogin;

    return startHidden;
}


// CPU Monitoring
let cpuUsage = 0;
let previousCpuTimes = getCpuTimes();

function getCpuTimes() {
    let total = 0;
    let idle = 0;

    for (const cpu of os.cpus()) {
        idle += cpu.times.idle;

        total += Object.values(cpu.times).reduce(
            (sum, time) => sum + time,
            0
        );
    }

    return { total, idle };
}


// Battery Monitoring
let batteryStatus = null;

async function updateBatteryStatus() {
    try {
        batteryStatus = await si.battery();

        mainWindow?.webContents.send(
            'battery-status',
            batteryStatus
        );

    } catch (error) {
        console.error('Could not read battery status:', error.message);
    }
}


// System Usage Monitoring
function updateSystemUsage() {
    const currentCpuTimes = getCpuTimes();

    // Calculate memory usage
    const totalMemory = os.totalmem();

    memoryUsage = Math.round(
        ((totalMemory - os.freemem()) / totalMemory) * 100
    );

    // Handle memory threshold and notifications
    if (memoryUsage >= settings.memoryThreshold && !memoryAlertActive) {
        memoryAlertActive = true;

        console.log(
            `Threshold crossed: ${memoryUsage}% >= ${settings.memoryThreshold}%`
        );

        if (settings.notificationsEnabled) {
            if (!Notification.isSupported()) {
                console.error('Desktop notifications are not supported');
            } else {
                const notification = new Notification({
                    title: 'High memory usage',
                    body: `Memory usage is ${memoryUsage}%, above your ${settings.memoryThreshold}% limit.`
                });

                notification.on('show', () =>
                    console.log('Notification shown')
                );

                notification.on('failed', (_event, error) =>
                    console.error('Notification failed:', error)
                );

                notification.show();
            }
        }

    } else if (memoryUsage < settings.memoryThreshold) {
        memoryAlertActive = false;
    }

    // Calculate CPU usage
    const totalDiff = currentCpuTimes.total - previousCpuTimes.total;
    const idleDiff = currentCpuTimes.idle - previousCpuTimes.idle;

    if (totalDiff > 0) {
        cpuUsage = Math.round(
            (1 - idleDiff / totalDiff) * 100
        );
    }

    previousCpuTimes = currentCpuTimes;

    // Update tray tooltip
    tray?.setToolTip(
        `CPU: ${cpuUsage}% | Memory: ${memoryUsage}% | Battery: ${
            batteryStatus?.hasBattery
                ? `${batteryStatus.percent}% (${batteryStatus.acConnected ? 'Plugged in' : 'Not plugged in'})`
                : 'Unavailable'
        }`
    );

    // Send updated usage to renderer
    mainWindow?.webContents.send('cpu-usage', cpuUsage);
    mainWindow?.webContents.send('memory-usage', memoryUsage);
}


// Start Monitoring
function startMonitoring() {
    if (monitoringTimer) {
        clearInterval(monitoringTimer);
        monitoringTimer = null;
    }

    if (settings.monitoringEnabled) {
        monitoringTimer = setInterval(
            updateSystemUsage,
            settings.refreshInterval
        );
    }
}


// Application Startup
app.whenReady().then(async () => {

    // Set storage paths
    const userDataPath = app.getPath('userData');

    settingsFilePath = path.join(
        userDataPath,
        'settings.json'
    );

    powerEventsFilePath = path.join(
        userDataPath,
        'powerEvents.json'
    );

    // Initialize JSON file if it does not exist
    try {
        await getPowerEvents(powerEventsFilePath, '5');
    } catch (error) {
        console.error('Could not initialize power events:', error.message);
    }

    startUnityApiServer();

    // Load Settings
    const loaded = loadSettings(settingsFilePath);

    settings = loaded.settings;

    console.log('Settings status:', loaded.status);

    if (loaded.errors.length > 0) {
        console.warn('Settings errors:', loaded.errors);
    }

    if (loaded.status === 'missing' || loaded.status === 'repaired') {
        saveSettings(settingsFilePath, settings);
    }

    const startHidden = configureStartup(settings.openAtLogin);

    createWindow({ show: !startHidden });
    createTray();
    setupPowerEvents();

    startMonitoring();

    updateBatteryStatus();
    setInterval(updateBatteryStatus, 10000);
});


// Application Shutdown
app.on('before-quit', () => {
    isQuitting = true;

    if (unityApiServer?.listening) {
        unityApiServer.close();
    }
});


// macOS Activation
app.on('activate', () => {
    if (
        mainWindow &&
        !mainWindow.isDestroyed() &&
        !mainWindow.isVisible()
    ) {
        mainWindow.show();
    }
});