import "./Setting.css";
import { useEffect, useState } from "react";

function Settings() {
    const [settings, setSettings] = useState({
        memoryThreshold: 80,
        monitoringEnabled: true,
        refreshInterval: 1000,
        openAtLogin: true,
        notificationsEnabled: true,
    });

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");

    // Load settings from the main process
    useEffect(() => {
        let cancelled = false;

        async function loadSavedSettings() {
            try {
                const savedSettings =
                    await window.electronAPI.getSettings();

                if (!cancelled) {
                    setSettings(savedSettings);
                }
            } catch (error) {
                console.error("Failed to load settings:", error);

                if (!cancelled) {
                    setError("Could not load saved settings.");
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        }

        loadSavedSettings();

        return () => {
            cancelled = true;
        };
    }, []);

    // Update settings through the main process
    const handleChange = async (key, value) => {
        try {
            setError("");

            const result =
                await window.electronAPI.updateSettings({
                    [key]: value,
                });

            if (!result.ok) {
                setError(result.errors.join(", "));
                return;
            }

            setSettings(result.settings);

        } catch (error) {
            console.error("Failed to update settings:", error);
            setError("Could not save settings.");
        }
    };

    if (isLoading) {
        return <p>Loading settings...</p>;
    }

    return (
        <main className="settings-page">
            <header className="settings-header">
                <p className="settings-label">SYSTEM MONITOR</p>
                <h1>Settings</h1>
                <p>Manage your system monitoring preferences.</p>
            </header>

            {error && (
                <p className="error-message" role="alert">
                    {error}
                </p>
            )}

            {/* Monitoring */}
            <section className="settings-section">
                <h2>Monitoring</h2>

                <p className="section-description">
                    Control how your system resources are monitored.
                </p>

                <div className="setting-item">
                    <div>
                        <h3>Enable Monitoring</h3>
                        <p>Start or pause system resource monitoring.</p>
                    </div>

                    <input
                        type="checkbox"
                        checked={settings.monitoringEnabled}
                        onChange={(e) =>
                            handleChange(
                                "monitoringEnabled",
                                e.target.checked
                            )
                        }
                    />
                </div>

                <div className="setting-item">
                    <div>
                        <h3>Refresh Interval</h3>
                        <p>Choose how frequently system data is refreshed.</p>
                    </div>

                    <select
                        value={settings.refreshInterval}
                        onChange={(e) =>
                            handleChange(
                                "refreshInterval",
                                Number(e.target.value)
                            )
                        }
                    >
                        <option value={500}>500 ms</option>
                        <option value={1000}>1 second</option>
                        <option value={2000}>2 seconds</option>
                        <option value={5000}>5 seconds</option>
                    </select>
                </div>
            </section>

            {/* Alerts and Notifications */}
            <section className="settings-section">
                <h2>Alerts & Notifications</h2>

                <p className="section-description">
                    Configure memory warnings and notifications.
                </p>

                <div className="setting-item">
                    <div>
                        <h3>Memory Threshold</h3>
                        <p>
                            Get notified when RAM usage reaches this limit.
                        </p>
                    </div>

                    <strong>{settings.memoryThreshold}%</strong>
                </div>

                <div className="threshold-control">
                    <input
                        type="range"
                        min="50"
                        max="100"
                        step="5"
                        value={settings.memoryThreshold}
                        onChange={(e) =>
                            handleChange(
                                "memoryThreshold",
                                Number(e.target.value)
                            )
                        }
                    />

                    <div className="range-labels">
                        <span>50%</span>
                        <span>100%</span>
                    </div>
                </div>

                <div className="setting-item">
                    <div>
                        <h3>Desktop Notifications</h3>
                        <p>Receive alerts about system activity.</p>
                    </div>

                    <input
                        type="checkbox"
                        checked={settings.notificationsEnabled}
                        onChange={(e) =>
                            handleChange(
                                "notificationsEnabled",
                                e.target.checked
                            )
                        }
                    />
                </div>
            </section>

            {/* Startup */}
            <section className="settings-section">
                <h2>Startup</h2>

                <p className="section-description">
                    Configure application startup preferences.
                </p>

                <div className="setting-item">
                    <div>
                        <h3>Launch at Login</h3>
                        <p>
                            Automatically start System Monitor when you log in.
                        </p>
                    </div>

                    <input
                        type="checkbox"
                        checked={settings.openAtLogin}
                        onChange={(e) =>
                            handleChange(
                                "openAtLogin",
                                e.target.checked
                            )
                        }
                    />
                </div>
            </section>
        </main>
    );
}

export default Settings;
