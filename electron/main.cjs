const { 
    app, 
    BrowserWindow, 
    Tray, 
    Menu 
} = require('electron');
const os = require('os');
const path = require('path');

let mainWindow = null;
let tray = null;
let isQuitting = false;

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

function updateSystemUsage() {
  const currentCpuTimes = getCpuTimes();
  const totalMemory = os.totalmem();
  memoryUsage = Math.round(((totalMemory - os.freemem()) / totalMemory) * 100);
  const totalDiff = currentCpuTimes.total - previousCpuTimes.total;
  const idleDiff = currentCpuTimes.idle - previousCpuTimes.idle;

  if (totalDiff > 0) {
    cpuUsage = Math.round((1 - idleDiff / totalDiff) * 100);
  }

  previousCpuTimes = currentCpuTimes;
  mainWindow?.webContents.send('cpu-usage', cpuUsage);
  mainWindow?.webContents.send('memory-usage', memoryUsage);
}

let memoryUsage = 0;

app.whenReady().then(() => {
    createWindow();
    createTray();
    setInterval(updateSystemUsage, 1000);
});

app.on('before-quit', () => {
    isQuitting = true;
});