import './App.css';
import { useState } from 'react';

function App() {
  const [memoryLimit, setMemoryLimit] = useState(80);
  const logs = [];
  return (
    <main className="dashboard">
      <h1>System Monitor</h1>

      <div className="cards">
        <section className="card">
          <h2>CPU Usage</h2>
          <p>Waiting for CPU data…</p>
        </section>

        <section className="card">
          <h2>Memory Usage</h2>
          <p>Coming next</p>
        </section>

        <section className="card">
          <h2>Battery Status</h2>
          <p>Coming next</p>
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
          onChange={(event) => setMemoryLimit(Number(event.target.value))}
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

export default App;