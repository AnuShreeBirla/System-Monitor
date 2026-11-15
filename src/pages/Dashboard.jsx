// dashboard

import './Dashboard.css';
import { useEffect, useState } from 'react';

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function Dashboard() {
  const [cpuUsage, setCpuUsage] = useState(null);
  const [memoryUsage, setMemoryUsage] = useState(null);
  const [batteryStatus, setBatteryStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logLimit, setLogLimit] = useState('5');

  useEffect(() => {
    if (window.electronAPI) {
      const removeCpuListener = window.electronAPI.onCpuUsage(setCpuUsage);
      const removeMemoryListener =
        window.electronAPI.onMemoryUsage(setMemoryUsage);
      const removeBatteryListener =
        window.electronAPI.onBatteryStatus(setBatteryStatus);

      return () => {
        removeCpuListener();
        removeMemoryListener();
        removeBatteryListener();
      };
    }

    let active = true;

    async function loadBrowserStats() {
      try {
        const response = await fetch('/api/system-monitor');
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);

        const stats = await response.json();
        if (!active) return;

        setCpuUsage(stats.cpuUsage);
        setMemoryUsage(stats.memoryUsage);
        setBatteryStatus(stats.batteryStatus);
      } catch (error) {
        console.error('Could not load dashboard stats:', error);
      }
    }

    loadBrowserStats();
    const timer = setInterval(loadBrowserStats, 1000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadPowerEvents() {
      try {
        if (window.electronAPI) {
          const events = await window.electronAPI.getPowerEvents(logLimit);
          if (active) setLogs(events);
          return;
        }

        const response = await fetch(
          `http://127.0.0.1:5174/api/power-events?limit=${encodeURIComponent(logLimit)}`
        ).catch(() => null);

        if (active && response?.ok) setLogs(await response.json());
      } catch (error) {
        console.error('Could not load power events:', error);
      }
    }

    loadPowerEvents();
    const removePowerListener = window.electronAPI?.onPowerEvent(loadPowerEvents);
    const timer = window.electronAPI ? null : setInterval(loadPowerEvents, 1000);

    return () => {
      active = false;
      removePowerListener?.();
      if (timer) clearInterval(timer);
    };
  }, [logLimit]);

  return (
    <main className="dashboard">
      <h1>System Monitor</h1>

      <div className="cards">
        <section className="card">
          <h2>CPU Usage</h2>
          <p>
            {cpuUsage === null
              ? 'Waiting for CPU data…'
              : `${cpuUsage}%`}
          </p>
        </section>

        <section className="card">
          <h2>Memory Usage</h2>
          <p>
            {memoryUsage === null
              ? 'Waiting for memory data…'
              : `${memoryUsage}%`}
          </p>
        </section>

        <section className="card">
          <h2>Battery Status</h2>
          <p>
            {batteryStatus === null
              ? 'Waiting for battery data…'
              : batteryStatus.hasBattery
                ? `${batteryStatus.percent}%`
                : 'No battery detected'}
          </p>
          <p>
            {batteryStatus === null
              ? ''
              : batteryStatus.acConnected
                ? 'Plugged in'
                : 'Not plugged in'}
          </p>
        </section>
      </div>

      <section className="logs">
        <h2>Logs</h2>

        <div className="logs-controls">
          <label htmlFor="log-limit">Show</label>
          <select
            id="log-limit"
            value={logLimit}
            onChange={(event) => setLogLimit(event.target.value)}
          >
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="all">All</option>
          </select>
          <span>logs</span>
        </div>

        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Event Type</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {logs.length ? (
              logs.map((log) => (
                <tr key={log.id}>
                  <td>{`evt_${String(log.id).padStart(3, '0')}`}</td>
                  <td>{log.eventType}</td>
                  <td>{formatTimestamp(log.timestamp)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="3">No events logged yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}

export default Dashboard;
