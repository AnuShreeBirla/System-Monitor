// preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onCpuUsage(callback) {
    const listener = (_event, cpuUsage) => callback(cpuUsage);
    ipcRenderer.on('cpu-usage', listener);

    return () => ipcRenderer.removeListener('cpu-usage', listener);
  },
  onMemoryUsage(callback) {
  const listener = (_event, memoryUsage) => callback(memoryUsage);
  ipcRenderer.on('memory-usage', listener);

  return () => ipcRenderer.removeListener('memory-usage', listener);
  },
  onBatteryStatus(callback) {
  const listener = (_event, batteryStatus) => callback(batteryStatus);
  ipcRenderer.on('battery-status', listener);

  return () => ipcRenderer.removeListener('battery-status', listener);
  },
  onPowerEvent: (callback) => {
    const listener = (_event, log) => callback(log);

    ipcRenderer.on('power-event', listener);

    return () => {
        ipcRenderer.removeListener('power-event', listener);
    };
},
  getPowerEvents(limit) {
    return ipcRenderer.invoke('get-power-events', limit);
  },
  getSettings() {
      return ipcRenderer.invoke('settings:get');
  },
  updateSettings(patch) {
      return ipcRenderer.invoke('settings:update', patch);
  },
});
