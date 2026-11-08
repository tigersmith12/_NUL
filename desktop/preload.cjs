const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nulDesktop', {
  isDesktop: true,
  platform: process.platform,
  setMode: mode => ipcRenderer.invoke('nul:set-mode', mode),
  setPinned: pinned => ipcRenderer.invoke('nul:set-pinned', Boolean(pinned)),
  windowControl: action => ipcRenderer.invoke('nul:window-control', action),
  saveJSON: payload => ipcRenderer.invoke('nul:save-json', payload),
  onModeChanged: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('nul:mode-changed', listener);
    return () => ipcRenderer.removeListener('nul:mode-changed', listener);
  }
});
