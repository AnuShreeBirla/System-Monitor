const { app, BrowserWindow, Menu, Tray } = require("electron");
const path = require("path");

let tray = null
app.whenReady().then(() => {
  const window = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const iconPath = path.join(__dirname, 'assets','temp-tray-44.png');
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Item1', type: 'radio' },
    { label: 'Item2', type: 'radio' },
    { label: 'Item3', type: 'radio', checked: true },
    { label: 'Item4', type: 'radio' }
  ])
  tray.setToolTip('System Monitor')
  tray.setContextMenu(contextMenu)



  window.loadURL("http://localhost:5173");
});