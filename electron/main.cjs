const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  Notification,
} = require('electron');
const os = require('os');
const path = require('path');
const si = require('systeminformation');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let memoryUsage = 0;
let memoryThreshold = 80;
let memoryAlertActive = false;

ipcMain.on('set-memory-threshold', (_event, threshold) => {
  if (Number.isFinite(threshold) && threshold >= 1 && threshold <= 100) {
    memoryThreshold = threshold;

    if (memoryUsage < memoryThreshold) {
      memoryAlertActive = false;
    }
  }
});

function createWindow() {
    mainWindow = new BrowserWindow({
      width: 900,
      height: 600,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    

    mainWindow.loadURL('http://localhost:5173');

    // Hide instead of closing
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

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
            label: 'Pause Monitoring',
            type: 'checkbox',
            checked: false,
            click: (item) => {
                console.log('Monitoring paused:', item.checked);
            }
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
    mainWindow?.webContents.send('battery-status', batteryStatus);
  } catch (error) {
    console.error('Could not read battery status:', error.message);
  }
}

function updateSystemUsage() {
  const currentCpuTimes = getCpuTimes();
  const totalMemory = os.totalmem();
  memoryUsage = Math.round(((totalMemory - os.freemem()) / totalMemory) * 100);
//   if (memoryUsage >= memoryThreshold && !memoryAlertActive) {
//   memoryAlertActive = true;

//   if (Notification.isSupported()) {
//     new Notification({
//       title: 'High memory usage',
//       body: `Memory usage is ${memoryUsage}%, above your ${memoryThreshold}% limit.`,
//     }).show();
//   }
//   } else if (memoryUsage < memoryThreshold) {
//    memoryAlertActive = false;
//   }
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
  tray?.setToolTip(
  `CPU: ${cpuUsage}% | Memory: ${memoryUsage}% | Battery: ${batteryStatus?.hasBattery? `${batteryStatus.percent}% (${batteryStatus.acConnected ? 'Plugged in' : 'Not plugged in'})`: 'Unavailable'}`);
  mainWindow?.webContents.send('cpu-usage', cpuUsage);
  mainWindow?.webContents.send('memory-usage', memoryUsage);
}

app.whenReady().then(() => {
    createWindow();
    createTray();
    setInterval(updateSystemUsage, 1000);
    updateBatteryStatus();
    setInterval(updateBatteryStatus, 10000);
});

app.on('before-quit', () => {
    isQuitting = true;
});