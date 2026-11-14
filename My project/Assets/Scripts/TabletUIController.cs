using System;
using UnityEngine;
using UnityEngine.UI;

public class TabletUIController : MonoBehaviour
{
    [System.Serializable]
    public class SystemMetricsData
    {
        public float cpu;
        public float memory;
        public BatteryData battery;
        public float memoryThreshold = 80f;
        public string latestLog;
    }

    [System.Serializable]
    public class BatteryData
    {
        public bool hasBattery = true;
        public float percent = 85f;
        public bool acConnected = true;
    }

    [Header("Header Elements")]
    [SerializeField] private Text titleText;
    [SerializeField] private Text statusBadgeText;
    [SerializeField] private Image statusBadgeBg;
    [SerializeField] private Text memoryLimitBadgeText;

    [Header("CPU Section")]
    [SerializeField] private Text cpuValueText;
    [SerializeField] private Image cpuBarFill;
    [SerializeField] private Text cpuStatusText;

    [Header("RAM Section")]
    [SerializeField] private Text ramValueText;
    [SerializeField] private Text ramDetailText;
    [SerializeField] private Image ramBarFill;
    [SerializeField] private Text ramStatusText;

    [Header("Battery Section")]
    [SerializeField] private Text batteryValueText;
    [SerializeField] private Text batteryStatusText;
    [SerializeField] private Image batteryBarFill;

    [Header("Logs & Alerts")]
    [SerializeField] private Text latestLogText;
    [SerializeField] private Image alertBannerBox;
    [SerializeField] private Text alertBannerText;

    [Header("Configuration")]
    [SerializeField] private float cpuThreshold = 80f;
    [SerializeField] private float ramThreshold = 80f;
    [SerializeField] private float batteryLowThreshold = 20f;
    [SerializeField] private float totalRamGB = 16f;

    [Header("Theme Colors")]
    private readonly Color normalCyan = new Color(0.0f, 0.9f, 1.0f);
    private readonly Color normalGreen = new Color(0.18f, 0.85f, 0.45f);
    private readonly Color warningRed = new Color(1.0f, 0.22f, 0.28f);
    private readonly Color cardDarkBg = new Color(0.06f, 0.08f, 0.12f, 0.85f);
    private readonly Color alertWarningBg = new Color(0.35f, 0.08f, 0.1f, 0.9f);
    private readonly Color alertNormalBg = new Color(0.04f, 0.2f, 0.12f, 0.7f);

    private void Start()
    {
        if (SystemInfo.systemMemorySize > 0)
        {
            totalRamGB = SystemInfo.systemMemorySize / 1024f;
        }

        // Apply initial clean prototype metrics
        UpdateMetrics(34f, 54f, 85f, true, 80f, "EVT-101 [SYS_READY] Monitoring active");
    }

    public void UpdateMetricsJson(string json)
    {
        try
        {
            var data = JsonUtility.FromJson<SystemMetricsData>(json);
            if (data != null)
            {
                float bat = data.battery != null ? data.battery.percent : 100f;
                bool ac = data.battery != null && data.battery.acConnected;
                UpdateMetrics(data.cpu, data.memory, bat, ac, data.memoryThreshold, data.latestLog);
            }
        }
        catch (Exception ex)
        {
            Debug.LogWarning("[TabletUIController] JSON Parse error: " + ex.Message);
        }
    }

    public void UpdateMetrics(float cpu, float ram, float batteryPercent, bool acConnected, float memoryThreshold, string logMsg)
    {
        ramThreshold = memoryThreshold > 0 ? memoryThreshold : 80f;

        bool cpuWarn = cpu > cpuThreshold;
        bool ramWarn = ram > ramThreshold;
        bool batWarn = batteryPercent < batteryLowThreshold;
        bool anyWarning = cpuWarn || ramWarn || batWarn;

        // 1. Header
        if (memoryLimitBadgeText != null)
        {
            memoryLimitBadgeText.text = $"LIMIT: {ramThreshold:F0}%";
        }

        if (statusBadgeText != null && statusBadgeBg != null)
        {
            if (anyWarning)
            {
                statusBadgeText.text = "ALERT ACTIVE";
                statusBadgeText.color = warningRed;
                statusBadgeBg.color = alertWarningBg;
            }
            else
            {
                statusBadgeText.text = "SYSTEM NOMINAL";
                statusBadgeText.color = normalGreen;
                statusBadgeBg.color = alertNormalBg;
            }
        }

        // 2. CPU
        if (cpuValueText != null) cpuValueText.text = $"{cpu:F0}%";
        if (cpuBarFill != null)
        {
            cpuBarFill.fillAmount = Mathf.Clamp01(cpu / 100f);
            cpuBarFill.color = cpuWarn ? warningRed : normalCyan;
        }
        if (cpuStatusText != null)
        {
            cpuStatusText.text = cpuWarn ? "LOAD EXCEEDED (>80%)" : "NOMINAL LOAD";
            cpuStatusText.color = cpuWarn ? warningRed : normalCyan;
        }

        // 3. RAM
        if (ramValueText != null) ramValueText.text = $"{ram:F0}%";
        float usedGB = totalRamGB * (ram / 100f);
        if (ramDetailText != null) ramDetailText.text = $"{usedGB:F1} / {totalRamGB:F1} GB";
        if (ramBarFill != null)
        {
            ramBarFill.fillAmount = Mathf.Clamp01(ram / 100f);
            ramBarFill.color = ramWarn ? warningRed : normalGreen;
        }
        if (ramStatusText != null)
        {
            ramStatusText.text = ramWarn ? $"EXCEEDED ({ram:F0}% > {ramThreshold:F0}%)" : "OPTIMAL CACHE";
            ramStatusText.color = ramWarn ? warningRed : normalGreen;
        }

        // 4. Battery
        if (batteryValueText != null) batteryValueText.text = $"{batteryPercent:F0}%";
        if (batteryStatusText != null)
        {
            batteryStatusText.text = acConnected ? "PLUGGED IN (AC)" : (batWarn ? "LOW BATTERY (<20%)" : "DISCHARGING");
            batteryStatusText.color = batWarn ? warningRed : (acConnected ? normalGreen : Color.white);
        }
        if (batteryBarFill != null)
        {
            batteryBarFill.fillAmount = Mathf.Clamp01(batteryPercent / 100f);
            batteryBarFill.color = batWarn ? warningRed : normalGreen;
        }

        // 5. System Logs
        if (latestLogText != null && !string.IsNullOrEmpty(logMsg))
        {
            latestLogText.text = logMsg;
        }

        // 6. Alert Banner
        if (alertBannerBox != null && alertBannerText != null)
        {
            if (anyWarning)
            {
                alertBannerBox.color = alertWarningBg;
                string warnDetails = "";
                if (cpuWarn) warnDetails += $"[CPU {cpu:F0}%] ";
                if (ramWarn) warnDetails += $"[RAM {ram:F0}% > {ramThreshold:F0}%] ";
                if (batWarn) warnDetails += $"[BATTERY {batteryPercent:F0}%] ";
                alertBannerText.text = $"WARNING DETECTED: {warnDetails}";
                alertBannerText.color = warningRed;
            }
            else
            {
                alertBannerBox.color = alertNormalBg;
                alertBannerText.text = "ALL HARDWARE CHANNELS NOMINAL // 0 CRITICAL ALERTS";
                alertBannerText.color = normalGreen;
            }
        }
    }
}
