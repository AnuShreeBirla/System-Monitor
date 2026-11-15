const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Metrics: main -> renderer
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
    setMemoryThreshold: (threshold) => {
    ipcRenderer.send('set-memory-threshold', threshold);
    },
    // Power events: main -> renderer
    onPowerEvent(callback) {
        const listener = (_event, event) => callback(event);
        ipcRenderer.on('power-event', listener);

        return () => ipcRenderer.removeListener('power-event', listener);
    },

    onPowerEventsUpdated(callback) {
        const listener = () => callback();
        ipcRenderer.on('power-events-updated', listener);

        return () => ipcRenderer.removeListener(
            'power-events-updated',
            listener
        );
    },

    getPowerEvents() {
        return ipcRenderer.invoke('power-events:get');
    },

    updatePowerEvent(id, updates) {
        return ipcRenderer.invoke('power-events:update', id, updates);
    },

    deletePowerEvent(id) {
        return ipcRenderer.invoke('power-events:delete', id);
    },

    // Settings: renderer -> main
    getSettings() {
        return ipcRenderer.invoke('settings:get');
    },

    updateSettings(patch) {
        return ipcRenderer.invoke('settings:update', patch);
    },

    // Popover actions
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