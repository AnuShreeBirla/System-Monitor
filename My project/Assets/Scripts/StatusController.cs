using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

public class StatusController : MonoBehaviour
{
    public enum SimulationPreset
    {
        Normal,
        HighCPU,
        HighRAM,
        LowBattery,
        CriticalAll
    }

    [Header("Hardware References")]
    [SerializeField] private Renderer statusLedRenderer;
    [SerializeField] private Light statusLedLight;
    [SerializeField] private ButtonInteraction physicalButton;

    [Header("LED Materials")]
    [SerializeField] private Material normalMaterial;
    [SerializeField] private Material warningMaterial;

    [Header("Warning Thresholds")]
    [Range(10f, 100f)]
    [SerializeField] private float cpuWarningThreshold = 80f;

    [Range(10f, 100f)]
    [SerializeField] private float ramWarningThreshold = 80f;

    [Range(5f, 50f)]
    [SerializeField] private float batteryWarningThreshold = 20f;

    [Header("UI Toolkit")]
    [SerializeField] private UIDocument uiDocument;

    [Header("Simulation & Telemetry")]
    [SerializeField] private bool useDynamicFluctuation = true;
    [SerializeField] private SimulationPreset currentPreset = SimulationPreset.Normal;

    [Range(0f, 100f)]
    [SerializeField] private float currentCpuUsage = 35f;

    [Range(0f, 100f)]
    [SerializeField] private float currentRamUsage = 52f;

    [Range(0f, 100f)]
    [SerializeField] private float currentBatteryLevel = 88f;

    // Internal State
    private bool isWarningActive = false;
    private float targetCpuUsage = 35f;
    private float targetRamUsage = 52f;
    private float targetBatteryLevel = 88f;
    private float totalSystemRamGB = 16f;

    // UI Toolkit Cached Elements
    private VisualElement rootElement;
    private Label statusBadgeText;
    private VisualElement statusBadge;
    private Label cpuValueLabel;
    private VisualElement cpuBarFill;
    private Label ramValueLabel;
    private VisualElement ramBarFill;
    private Label batteryValueLabel;
    private VisualElement batteryBarFill;
    private VisualElement warningBox;
    private Label warningText;

    private readonly Color normalColor = new Color(0.18f, 0.8f, 0.44f);
    private readonly Color warningColor = new Color(0.91f, 0.3f, 0.24f);

    private void Awake()
    {
        // Auto-discover components if not assigned
        if (statusLedRenderer == null)
        {
            Transform ledTransform = transform.Find("StatusLED");
            if (ledTransform != null)
            {
                statusLedRenderer = ledTransform.GetComponent<Renderer>();
                statusLedLight = ledTransform.GetComponent<Light>();
            }
        }
        else if (statusLedLight == null)
        {
            statusLedLight = statusLedRenderer.GetComponent<Light>();
        }

        if (physicalButton == null)
        {
            physicalButton = GetComponentInChildren<ButtonInteraction>();
        }

        if (uiDocument == null)
        {
            uiDocument = FindAnyObjectByType<UIDocument>();
        }

        // Initialize total RAM from system
        if (SystemInfo.systemMemorySize > 0)
        {
            totalSystemRamGB = SystemInfo.systemMemorySize / 1024f;
        }
    }

    private void Start()
    {
        if (physicalButton != null)
        {
            physicalButton.OnButtonPressed.AddListener(OnPhysicalButtonPressed);
        }

        InitializeUI();
        ApplyPreset(currentPreset);
        EvaluateStatus();
    }

    private void OnEnable()
    {
        InitializeUI();
    }

    private void InitializeUI()
    {
        if (uiDocument == null) return;

        rootElement = uiDocument.rootVisualElement;
        if (rootElement == null) return;

        statusBadgeText = rootElement.Q<Label>("status-badge-text");
        statusBadge = rootElement.Q<VisualElement>("status-badge");
        cpuValueLabel = rootElement.Q<Label>("cpu-value");
        cpuBarFill = rootElement.Q<VisualElement>("cpu-bar-fill");
        ramValueLabel = rootElement.Q<Label>("ram-value");
        ramBarFill = rootElement.Q<VisualElement>("ram-bar-fill");
        batteryValueLabel = rootElement.Q<Label>("battery-value");
        batteryBarFill = rootElement.Q<VisualElement>("battery-bar-fill");
        warningBox = rootElement.Q<VisualElement>("warning-box");
        warningText = rootElement.Q<Label>("warning-text");

        // Bind interactive UI buttons
        Button btnNormal = rootElement.Q<Button>("btn-normal");
        if (btnNormal != null) btnNormal.clicked += () => ApplyPreset(SimulationPreset.Normal);

        Button btnCpu = rootElement.Q<Button>("btn-cpu");
        if (btnCpu != null) btnCpu.clicked += () => ApplyPreset(SimulationPreset.HighCPU);

        Button btnRam = rootElement.Q<Button>("btn-ram");
        if (btnRam != null) btnRam.clicked += () => ApplyPreset(SimulationPreset.HighRAM);

        Button btnBattery = rootElement.Q<Button>("btn-battery");
        if (btnBattery != null) btnBattery.clicked += () => ApplyPreset(SimulationPreset.LowBattery);
    }

    private void Update()
    {
        HandleHotkeys();
        UpdateMetrics();
        EvaluateStatus();
        UpdateUI();
    }

    private void HandleHotkeys()
    {
        if (Input.GetKeyDown(KeyCode.Alpha1)) ApplyPreset(SimulationPreset.Normal);
        if (Input.GetKeyDown(KeyCode.Alpha2)) ApplyPreset(SimulationPreset.HighCPU);
        if (Input.GetKeyDown(KeyCode.Alpha3)) ApplyPreset(SimulationPreset.HighRAM);
        if (Input.GetKeyDown(KeyCode.Alpha4)) ApplyPreset(SimulationPreset.LowBattery);
        if (Input.GetKeyDown(KeyCode.Alpha5) || Input.GetKeyDown(KeyCode.Space)) CyclePreset();

        if (Input.GetKeyDown(KeyCode.R)) SetWarning(true);
        if (Input.GetKeyDown(KeyCode.G)) SetWarning(false);
    }

    public void OnPhysicalButtonPressed()
    {
        // When physical 3D button is pushed, cycle test modes or refresh system status
        CyclePreset();
    }

    public void CyclePreset()
    {
        int next = ((int)currentPreset + 1) % 5;
        ApplyPreset((SimulationPreset)next);
    }

    public void ApplyPreset(SimulationPreset preset)
    {
        currentPreset = preset;
        switch (preset)
        {
            case SimulationPreset.Normal:
                targetCpuUsage = 34f;
                targetRamUsage = 54f;
                targetBatteryLevel = 88f;
                break;
            case SimulationPreset.HighCPU:
                targetCpuUsage = 88f; // > 80% threshold
                targetRamUsage = 58f;
                targetBatteryLevel = 82f;
                break;
            case SimulationPreset.HighRAM:
                targetCpuUsage = 45f;
                targetRamUsage = 87f; // > ramWarningThreshold
                targetBatteryLevel = 75f;
                break;
            case SimulationPreset.LowBattery:
                targetCpuUsage = 40f;
                targetRamUsage = 50f;
                targetBatteryLevel = 14f; // < 20% threshold
                break;
            case SimulationPreset.CriticalAll:
                targetCpuUsage = 93f;
                targetRamUsage = 91f;
                targetBatteryLevel = 9f;
                break;
        }
    }

    private void UpdateMetrics()
    {
        // Smoothly interpolate towards targets
        float lerpRate = Time.deltaTime * 5f;
        currentCpuUsage = Mathf.Lerp(currentCpuUsage, targetCpuUsage, lerpRate);
        currentRamUsage = Mathf.Lerp(currentRamUsage, targetRamUsage, lerpRate);
        currentBatteryLevel = Mathf.Lerp(currentBatteryLevel, targetBatteryLevel, lerpRate);

        if (useDynamicFluctuation)
        {
            // Subtle realistic jitter
            float jitter = Mathf.PerlinNoise(Time.time * 1.5f, 0f) - 0.5f;
            currentCpuUsage = Mathf.Clamp(currentCpuUsage + jitter * 0.4f, 0f, 100f);
        }
    }

    private void EvaluateStatus()
    {
        List<string> activeWarnings = new List<string>();

        bool cpuWarning = currentCpuUsage > cpuWarningThreshold;
        bool ramWarning = currentRamUsage > ramWarningThreshold;
        bool batteryWarning = currentBatteryLevel < batteryWarningThreshold;

        if (cpuWarning)
        {
            activeWarnings.Add($"CPU usage high: {currentCpuUsage:F0}% (Threshold: {cpuWarningThreshold:F0}%)");
        }

        if (ramWarning)
        {
            activeWarnings.Add($"RAM usage high: {currentRamUsage:F0}% (Threshold: {ramWarningThreshold:F0}%)");
        }

        if (batteryWarning)
        {
            activeWarnings.Add($"Battery low: {currentBatteryLevel:F0}% (Threshold: {batteryWarningThreshold:F0}%)");
        }

        bool shouldWarn = activeWarnings.Count > 0;
        SetWarningState(shouldWarn, activeWarnings);
    }

    public void SetWarning(bool warning)
    {
        if (warning)
        {
            ApplyPreset(SimulationPreset.HighCPU);
        }
        else
        {
            ApplyPreset(SimulationPreset.Normal);
        }
    }

    private void SetWarningState(bool warning, List<string> warningMessages)
    {
        isWarningActive = warning;

        // 1. Hardware LED material
        if (statusLedRenderer != null)
        {
            Material targetMat = warning ? warningMaterial : normalMaterial;
            if (targetMat != null && statusLedRenderer.sharedMaterial != targetMat)
            {
                statusLedRenderer.material = targetMat;
            }
        }

        // 2. Hardware LED Point Light
        if (statusLedLight != null)
        {
            statusLedLight.color = warning ? warningColor : normalColor;
            // Pulsing glow in warning state
            float pulse = warning ? (1.2f + 0.5f * Mathf.Sin(Time.time * 6f)) : 1.2f;
            statusLedLight.intensity = pulse;
        }

        // 3. Status messages for UI
        if (warningText != null && warningBox != null)
        {
            if (warning)
            {
                warningBox.RemoveFromClassList("warning-container-normal");
                warningBox.AddToClassList("warning-container-alert");

                warningText.RemoveFromClassList("warning-text-normal");
                warningText.AddToClassList("warning-text-alert");

                warningText.text = "WARNING:\n• " + string.Join("\n• ", warningMessages);
            }
            else
            {
                warningBox.RemoveFromClassList("warning-container-alert");
                warningBox.AddToClassList("warning-container-normal");

                warningText.RemoveFromClassList("warning-text-alert");
                warningText.AddToClassList("warning-text-normal");

                warningText.text = "STATUS NORMAL: All monitored system metrics within optimal parameters.";
            }
        }

        // 4. Status Badge
        if (statusBadge != null && statusBadgeText != null)
        {
            if (warning)
            {
                statusBadge.RemoveFromClassList("status-badge-normal");
                statusBadge.AddToClassList("status-badge-warning");

                statusBadgeText.RemoveFromClassList("badge-text-normal");
                statusBadgeText.AddToClassList("badge-text-warning");

                statusBadgeText.text = "WARNING";
            }
            else
            {
                statusBadge.RemoveFromClassList("status-badge-warning");
                statusBadge.AddToClassList("status-badge-normal");

                statusBadgeText.RemoveFromClassList("badge-text-warning");
                statusBadgeText.AddToClassList("badge-text-normal");

                statusBadgeText.text = "SYSTEM OK";
            }
        }
    }

    private void UpdateUI()
    {
        if (rootElement == null) return;

        // Update CPU
        if (cpuValueLabel != null)
        {
            cpuValueLabel.text = $"{currentCpuUsage:F0}%";
        }
        if (cpuBarFill != null)
        {
            cpuBarFill.style.width = new Length(Mathf.Clamp(currentCpuUsage, 2f, 100f), LengthUnit.Percent);
            bool isCpuWarn = currentCpuUsage > cpuWarningThreshold;
            cpuBarFill.EnableInClassList("bar-fill-warning", isCpuWarn);
        }

        // Update RAM
        if (ramValueLabel != null)
        {
            float usedGB = totalSystemRamGB * (currentRamUsage / 100f);
            ramValueLabel.text = $"{currentRamUsage:F0}% ({usedGB:F1} / {totalSystemRamGB:F1} GB)";
        }
        if (ramBarFill != null)
        {
            ramBarFill.style.width = new Length(Mathf.Clamp(currentRamUsage, 2f, 100f), LengthUnit.Percent);
            bool isRamWarn = currentRamUsage > ramWarningThreshold;
            ramBarFill.EnableInClassList("bar-fill-warning", isRamWarn);
        }

        // Update Battery
        if (batteryValueLabel != null)
        {
            batteryValueLabel.text = $"{currentBatteryLevel:F0}%";
        }
        if (batteryBarFill != null)
        {
            batteryBarFill.style.width = new Length(Mathf.Clamp(currentBatteryLevel, 2f, 100f), LengthUnit.Percent);
            bool isBatWarn = currentBatteryLevel < batteryWarningThreshold;
            batteryBarFill.EnableInClassList("bar-fill-warning", isBatWarn);
        }
    }
}
