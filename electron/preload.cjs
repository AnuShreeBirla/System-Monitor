const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Metric push-events (main → renderer) ──────────────
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
  onSystemLogs(callback) {
    const listener = (_event, logs) => callback(logs);
    ipcRenderer.on('system-logs', listener);
    return () => ipcRenderer.removeListener('system-logs', listener);
  },
  getSystemMonitorState() {
    return ipcRenderer.invoke('get-system-monitor-state');
  },

  // ── Settings threshold (renderer → main) ──────────────
  setMemoryThreshold(threshold) {
    ipcRenderer.send('set-memory-threshold', threshold);
  },

  // ── Popover actions (renderer → main) ─────────────────
  launchUnity() {
    ipcRenderer.send('launch-unity');
  },
  closePopover() {
    ipcRenderer.send('close-popover');
  },
  openSettings() {
    ipcRenderer.send('open-settings');
  },
});
