import './Dashboard.css';
import { useEffect, useState } from 'react';

function Dashboard() {
    const [cpuUsage, setCpuUsage] = useState(null);
    const [memoryUsage, setMemoryUsage] = useState(null);
    const [batteryStatus, setBatteryStatus] = useState(null);
    const [logs, setLogs] = useState([]);
    const [powerEvents, setPowerEvents] = useState([]);

    useEffect(() => {
        const electronAPI = window.electronAPI;

        const removeCpuListener =
            electronAPI?.onCpuUsage(setCpuUsage);

        const removeMemoryListener =
            electronAPI?.onMemoryUsage(setMemoryUsage);

        const removeBatteryListener =
            electronAPI?.onBatteryStatus(setBatteryStatus);

        // Initial persisted power-event load
        if (electronAPI?.getPowerEvents) {
            electronAPI.getPowerEvents()
                .then(setPowerEvents)
                .catch(error => {
                    console.error('Could not load power events:', error);
                });
        }

        // Receive newly recorded power events
        const removePowerEventListener =
            electronAPI?.onPowerEvent((event) => {
                setPowerEvents(previous => [
                    event,
                    ...previous,
                ].slice(0, 20));
            });

        // Refresh after an event is edited or deleted
        const removePowerEventsUpdatedListener =
            electronAPI?.onPowerEventsUpdated(() => {
                electronAPI.getPowerEvents()
                    .then(setPowerEvents)
                    .catch(error => {
                        console.error('Could not refresh power events:', error);
                    });
            });

        // Unity's CEF browser has no Electron preload.
        const API_URL =
            'http://127.0.0.1:5175/api/system-monitor';

        let cancelled = false;
        let consecutiveFailures = 0;

        const pollMetrics = async () => {
            try {
                const response = await fetch(API_URL, {
                    cache: 'no-store',
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const metrics = await response.json();

                if (cancelled) return;

                consecutiveFailures = 0;

                // Electron IPC is the primary metrics source.
                // Unity uses the HTTP API instead.
                if (!electronAPI) {
                    setCpuUsage(metrics.cpuUsage);
                    setMemoryUsage(metrics.memoryUsage);
                    setBatteryStatus(metrics.batteryStatus);
                }

                setLogs(metrics.logs ?? []);
                setPowerEvents(metrics.powerEvents ?? []);

            } catch (error) {
                if (cancelled) return;

                consecutiveFailures += 1;

                if (
                    consecutiveFailures === 1 ||
                    consecutiveFailures % 10 === 0
                ) {
                    console.warn(
                        `System Monitor polling unavailable (attempt ${consecutiveFailures}):`,
                        error.message
                    );
                }
            }
        };

        pollMetrics();

        const pollTimer = window.setInterval(
            pollMetrics,
            2000
        );

        return () => {
            cancelled = true;

            window.clearInterval(pollTimer);

            removeCpuListener?.();
            removeMemoryListener?.();
            removeBatteryListener?.();
            removePowerEventListener?.();
            removePowerEventsUpdatedListener?.();
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

            {/* Existing threshold logs */}
            <section className="logs">
                <h2>System Threshold Logs</h2>

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
                            logs.map(log => (
                                <tr key={log.id}>
                                    <td>{log.id}</td>
                                    <td>{log.eventType}</td>
                                    <td>{log.timestamp}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="3">
                                    No threshold events logged yet
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </section>

            {/* Persisted operating-system events */}
            <section className="logs">
                <h2>Power Events</h2>

                <table>
                    <thead>
                        <tr>
                            <th>Event</th>
                            <th>Description</th>
                            <th>Timestamp</th>
                        </tr>
                    </thead>

                    <tbody>
                        {powerEvents.length ? (
                            powerEvents.map(event => (
                                <tr key={event.id}>
                                    <td>{event.type}</td>
                                    <td>{event.description}</td>
                                    <td>
                                        {new Date(
                                            event.timestamp
                                        ).toLocaleString()}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="3">
                                    No power events recorded yet
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </section>
        </main>
    );
}

export default Dashboard;
