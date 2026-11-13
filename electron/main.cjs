const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const HOSTED_APP_URL = process.env.CHNCAK_APP_URL || 'https://repas-chncak-44b98.web.app';
const localIndexPath = () => path.join(__dirname, '..', 'dist', 'index.html');

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  if (app.isPackaged) {
    window.loadURL(HOSTED_APP_URL).catch(() => {
      window.loadFile(localIndexPath());
    });
  } else {
    window.loadFile(localIndexPath());
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(HOSTED_APP_URL)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
};

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
