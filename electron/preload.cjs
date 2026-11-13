const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onCpuUsage(callback) {
    const listener = (_event, cpuUsage) => callback(cpuUsage);
    ipcRenderer.on('cpu-usage', listener);

    return () => ipcRenderer.removeListener('cpu-usage', listener);
  },
});