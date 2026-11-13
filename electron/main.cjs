const { 
    app, 
    BrowserWindow, 
    Tray, 
    Menu 
} = require('electron');

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

app.whenReady().then(() => {
    createWindow();
    createTray();
});

app.on('before-quit', () => {
    isQuitting = true;
});