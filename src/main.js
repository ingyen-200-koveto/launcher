const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { Client } = require('minecraft-launcher-core');
const { Account } = require('./account');
const { ensureJava, ensureFabric, ensureMods } = require('./install');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
const dataDir = path.join(app.getPath('appData'), '.icemine');
const gameDir = path.join(dataDir, 'game');
const settingsFile = path.join(dataDir, 'beallitasok.json');

let window = null;
let playing = false;
const account = new Account(dataDir, config);

function readSettings() {
  const total = Math.floor(os.totalmem() / 1024 / 1024 / 1024);
  const defaults = { memory: Math.max(2, Math.min(6, Math.floor(total / 3))), closeOnStart: true, fullscreen: false };
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')) };
  } catch (error) {
    return defaults;
  }
}

function writeSettings(values) {
  const merged = { ...readSettings(), ...values };
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify(merged, null, 2));
  return merged;
}

function send(channel, payload) {
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, payload);
  }
}

function report(text, progress) {
  send('status', { text, progress });
}

function createWindow() {
  window = new BrowserWindow({
    width: 1040,
    height: 640,
    minWidth: 900,
    minHeight: 560,
    frame: false,
    backgroundColor: '#0b1622',
    show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

ipcMain.handle('info', () => ({
  version: app.getVersion(),
  server: config.server,
  minecraft: config.minecraft,
  website: config.website,
  discord: config.discord,
  news: config.news,
  configured: Boolean(config.microsoft && config.microsoft.clientId),
  totalMemory: Math.floor(os.totalmem() / 1024 / 1024 / 1024),
}));

ipcMain.handle('settings:get', () => readSettings());
ipcMain.handle('settings:set', (event, values) => writeSettings(values));

ipcMain.handle('account:restore', async () => {
  try {
    return { profile: await account.restore() };
  } catch (error) {
    return { profile: null, error: Account.message(error) };
  }
});

ipcMain.handle('account:login', async () => {
  try {
    return { profile: await account.login() };
  } catch (error) {
    return { profile: null, error: Account.message(error) };
  }
});

ipcMain.handle('account:logout', () => {
  account.logout();
  return true;
});

ipcMain.handle('window:minimize', () => window && window.minimize());
ipcMain.handle('window:close', () => app.quit());
ipcMain.handle('open:folder', () => {
  fs.mkdirSync(gameDir, { recursive: true });
  return shell.openPath(gameDir);
});
ipcMain.handle('open:url', (event, url) => shell.openExternal(url));

ipcMain.handle('game:launch', async () => {
  if (playing) {
    return { ok: false, error: 'A játék már fut.' };
  }
  playing = true;
  try {
    const settings = readSettings();
    const user = await account.user();
    const java = await ensureJava(dataDir, report);
    const version = await ensureFabric(gameDir, config.minecraft, config.fabricLoader, report);
    const mods = await ensureMods(gameDir, config.minecraft, config.mods, report);
    if (mods.skipped.length) {
      send('log', `Ehhez a verzióhoz nincs: ${mods.skipped.join(', ')}`);
    }
    report('A Minecraft fájljainak ellenőrzése...', null);
    const launcher = new Client();
    launcher.on('progress', (event) => {
      if (event && event.total) {
        report(`Letöltés: ${event.type}`, event.task / event.total);
      }
    });
    launcher.on('debug', (line) => send('log', String(line)));
    launcher.on('data', (line) => send('log', String(line)));
    launcher.on('close', (code) => {
      playing = false;
      send('game:closed', code);
      if (window && !window.isDestroyed()) {
        window.show();
      }
    });
    const child = await launcher.launch({
      root: gameDir,
      javaPath: java,
      authorization: user,
      version: { number: config.minecraft, type: 'release', custom: version },
      memory: { max: `${settings.memory}G`, min: '1G' },
      window: { fullscreen: Boolean(settings.fullscreen) },
      quickPlay: { type: 'multiplayer', identifier: config.server },
    });
    if (!child) {
      throw new Error('A játék nem indult el. Nézd meg a naplót.');
    }
    report('A játék elindult. Jó játékot!', 1);
    send('game:started', true);
    if (settings.closeOnStart && window) {
      window.hide();
    }
    return { ok: true };
  } catch (error) {
    playing = false;
    return { ok: false, error: Account.message(error) };
  }
});

function startUpdater() {
  if (!app.isPackaged) {
    return;
  }
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.on('update-downloaded', () => send('update', 'ready'));
    autoUpdater.checkForUpdatesAndNotify();
  } catch (error) {
    send('log', `Frissítés ellenőrzése nem sikerült: ${error.message}`);
  }
}

ipcMain.handle('update:install', () => {
  const { autoUpdater } = require('electron-updater');
  autoUpdater.quitAndInstall();
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window) {
      window.show();
      window.focus();
    }
  });
  app.whenReady().then(() => {
    createWindow();
    startUpdater();
  });
  app.on('window-all-closed', () => {
    if (!playing) {
      app.quit();
    }
  });
}
