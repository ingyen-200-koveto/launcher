const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  info: () => ipcRenderer.invoke('info'),
  settings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (values) => ipcRenderer.invoke('settings:set', values),
  restore: () => ipcRenderer.invoke('account:restore'),
  login: () => ipcRenderer.invoke('account:login'),
  logout: () => ipcRenderer.invoke('account:logout'),
  launch: () => ipcRenderer.invoke('game:launch'),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  openFolder: () => ipcRenderer.invoke('open:folder'),
  openUrl: (url) => ipcRenderer.invoke('open:url', url),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  on: (channel, callback) => {
    const allowed = ['status', 'log', 'game:started', 'game:closed', 'update'];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (event, payload) => callback(payload));
    }
  },
});
