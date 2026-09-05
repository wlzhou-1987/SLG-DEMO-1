// Electron 主进程：仅创建窗口加载游戏页面，不含任何游戏逻辑
const { app, BrowserWindow } = require('electron');
const { join } = require('node:path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (app.isPackaged) {
    win.loadFile(join(__dirname, '../dist/index.html'));
  } else {
    // 端口 5174 与 dev:desktop 脚本一致；显式 127.0.0.1 避免解析为 ::1
    win.loadURL('http://127.0.0.1:5174');
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
