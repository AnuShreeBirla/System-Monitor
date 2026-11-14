
import './Dashboard.css';
import { useEffect, useState } from 'react';

function Dashboard() {
  const [cpuUsage, setCpuUsage] = useState(null);
  const [memoryUsage, setMemoryUsage] = useState(null);
  const [batteryStatus, setBatteryStatus] = useState(null);
  const [logs,setLogs] = useState([])

  useEffect(() => {
    const removePowerListener =
        window.electronAPI.onPowerEvent((log) => {
            setLogs((previousLogs) => [log, ...previousLogs]);
        });

    return () => {
        removePowerListener();
    };
  }, []);

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
