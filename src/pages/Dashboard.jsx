import './App.css';
import { useEffect, useState } from 'react';

function Dashboard() {
  const [memoryLimit, setMemoryLimit] = useState(80);
  const logs = [];

  const [cpuUsage, setCpuUsage] = useState(null);
  const [memoryUsage, setMemoryUsage] = useState(null);
  const [batteryStatus, setBatteryStatus] = useState(null);

  useEffect(() => {
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

      <section className="memory-limit">
        <label htmlFor="memory-limit">Memory limit</label>
        <input
          id="memory-limit"
          type="number"
          min="1"
          max="100"
          value={memoryLimit}
          onChange={(event) => {
            const threshold = Number(event.target.value);

            if (threshold >= 1 && threshold <= 100) {
              setMemoryLimit(threshold);
              window.electronAPI.setMemoryThreshold(threshold);
            }
          }}
        />
        <span>%</span>
      </section>

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
              logs.slice(0, 5).map((log) => (
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