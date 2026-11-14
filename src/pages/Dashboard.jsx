
import './Dashboard.css';
import { useEffect, useState } from 'react';

function Dashboard() {
  const [cpuUsage, setCpuUsage] = useState(null);
  const [memoryUsage, setMemoryUsage] = useState(null);
  const [batteryStatus, setBatteryStatus] = useState(null);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const electronAPI = window.electronAPI;
    const removeCpuListener = electronAPI?.onCpuUsage(setCpuUsage);
    const removeMemoryListener = electronAPI?.onMemoryUsage(setMemoryUsage);
    const removeBatteryListener = electronAPI?.onBatteryStatus(setBatteryStatus);

    // Unity's UWB CEF browser has no Electron preload, so it relies entirely
    // on this HTTP poll.  The API server always runs on 127.0.0.1:5175 inside
    // the Electron process, independent of whether the Vite dev server is up.
    // Using an absolute URL avoids both the localhost/127.0.0.1 name mismatch
    // and any relative-URL resolution surprises inside CEF.
    const API_URL = 'http://127.0.0.1:5175/api/system-monitor';

    let cancelled = false;
    let consecutiveFailures = 0;

    const pollMetrics = async () => {
      try {
        const response = await fetch(API_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const metrics = await response.json();
        if (cancelled) return;

        consecutiveFailures = 0;

        // Electron IPC stays the primary source in the desktop app. Unity's
        // separate CEF process has no preload, so it uses this HTTP feed.
        if (!electronAPI) {
          setCpuUsage(metrics.cpuUsage);
          setMemoryUsage(metrics.memoryUsage);
          setBatteryStatus(metrics.batteryStatus);
        }
        setLogs(metrics.logs ?? []);
      } catch (error) {
        if (cancelled) return;
        consecutiveFailures += 1;
        // Log the first failure, then only every 10th to avoid console spam
        if (consecutiveFailures === 1 || consecutiveFailures % 10 === 0) {
          console.warn(
            `System Monitor polling unavailable (attempt ${consecutiveFailures}):`,
            error.message,
          );
        }
      }
    };

    pollMetrics();
    const pollTimer = window.setInterval(pollMetrics, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
      removeCpuListener?.();
      removeMemoryListener?.();
      removeBatteryListener?.();
    };
  }, []);

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
                  <td>{log.id}</td>
                  <td>{log.eventType}</td>
                  <td>{log.timestamp}</td>
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
