using System;
using System.Collections;
using UnityEngine;

public class TabletPowerController : MonoBehaviour
{
    public enum PowerState
    {
        Off,
        PoweringOn,
        On,
        PoweringOff
    }

    [Header("Current State")]
    [SerializeField] private PowerState currentState = PowerState.On;

    [Header("Screen Elements")]
    [SerializeField] private CanvasGroup dashboardCanvasGroup;
    [SerializeField] private UnityEngine.UI.Image screenFlashOverlay;
    [SerializeField] private Renderer screenRenderer;
    [SerializeField] private Light screenGlowLight;
    [SerializeField] private Renderer statusLedRenderer;

    [Header("Transition Durations")]
    [SerializeField] private float bootFlashDuration = 0.35f;
    [SerializeField] private float contentFadeDuration = 0.45f;
    [SerializeField] private float shutdownFadeDuration = 0.4f;

    [Header("3D Hover / Idle Animation")]
    [SerializeField] private bool enableHoverAnimation = true;
    [SerializeField] private float hoverAmplitude = 0.03f;
    [SerializeField] private float hoverFrequency = 1.2f;
    [SerializeField] private float tiltAmplitude = 1.5f;

    // Events
    public event Action<bool> OnPowerStateChanged;

    private Vector3 initialPosition;
    private Quaternion initialRotation;
    private Coroutine activeTransition;
    private Material screenMatInstance;

    public bool IsPoweredOn => currentState == PowerState.On;
    public PowerState CurrentState => currentState;

    private void Awake()
    {
        initialPosition = transform.localPosition;
        initialRotation = transform.localRotation;

        if (screenRenderer != null)
        {
            screenMatInstance = screenRenderer.material;
        }
        EnsurePowerButtonInput();
    }

    private void EnsurePowerButtonInput()
    {
        Transform buttonVisual = transform.Find("StatusLED");
        if (buttonVisual == null)
        {
            Debug.LogError($"[{nameof(TabletPowerController)}] Could not find the existing blue StatusLED button.", this);
            return;
        }

        SphereCollider buttonCollider;
        if (buttonVisual.GetComponentInChildren<TabletPowerButton>(true) is TabletPowerButton existingButton)
        {
            buttonCollider = existingButton.GetComponent<SphereCollider>();
        }
        else
        {
            GameObject hitbox = new("PowerButtonHitbox");
            hitbox.transform.SetParent(buttonVisual, false);
            hitbox.transform.localPosition = Vector3.zero;
            hitbox.transform.localRotation = Quaternion.identity;

            Vector3 parentScale = buttonVisual.lossyScale;
            hitbox.transform.localScale = new Vector3(
                1f / Mathf.Max(Mathf.Abs(parentScale.x), 0.0001f),
                1f / Mathf.Max(Mathf.Abs(parentScale.y), 0.0001f),
                1f / Mathf.Max(Mathf.Abs(parentScale.z), 0.0001f));

            buttonCollider = hitbox.AddComponent<SphereCollider>();
            buttonCollider.radius = 0.045f;
            hitbox.AddComponent<TabletPowerButton>();
        }

        KeepBodyColliderClearOfButton(buttonCollider);
    }

    private void KeepBodyColliderClearOfButton(SphereCollider buttonCollider)
    {
        BoxCollider bodyCollider = GetComponent<BoxCollider>();
        if (bodyCollider == null || buttonCollider == null)
            return;

        // The body collider used to extend over the front-mounted button. Keep its
        // bottom edge and footprint, but stop it below the button's sphere so a
        // mouse ray hits the physical button first.
        Vector3 buttonCenter = transform.InverseTransformPoint(buttonCollider.bounds.center);
        float rootScaleY = Mathf.Max(Mathf.Abs(transform.lossyScale.y), 0.0001f);
        float buttonRadius = buttonCollider.bounds.extents.y / rootScaleY;
        float bodyBottom = bodyCollider.center.y - bodyCollider.size.y * 0.5f;
        float bodyTop = Mathf.Min(bodyCollider.center.y + bodyCollider.size.y * 0.5f,
            buttonCenter.y - buttonRadius - 0.01f);

        if (bodyTop <= bodyBottom)
        {
            Debug.LogError("Tablet body collider cannot be shortened without overlapping the power button.", this);
            return;
        }

        bodyCollider.center = new Vector3(bodyCollider.center.x, (bodyBottom + bodyTop) * 0.5f, bodyCollider.center.z);
        bodyCollider.size = new Vector3(bodyCollider.size.x, bodyTop - bodyBottom, bodyCollider.size.z);
    }

    private void Start()
    {
        // Apply initial state
        if (currentState == PowerState.On)
        {
            SetInstantOn();
        }
        else
        {
            SetInstantOff();
        }
    }

    private void Update()
    {
        // Idle 3D floating animation while powered on
        if (enableHoverAnimation && currentState == PowerState.On)
        {
            float yOffset = Mathf.Sin(Time.time * hoverFrequency) * hoverAmplitude;
            float tiltX = Mathf.Sin(Time.time * hoverFrequency * 0.8f) * tiltAmplitude;
            float tiltY = Mathf.Cos(Time.time * hoverFrequency * 0.6f) * (tiltAmplitude * 0.6f);

            transform.localPosition = initialPosition + new Vector3(0, yOffset, 0);
            transform.localRotation = initialRotation * Quaternion.Euler(tiltX, tiltY, 0);
        }

    }

    public void TogglePower()
    {
        if (currentState == PowerState.PoweringOn || currentState == PowerState.PoweringOff)
            return;

        if (currentState == PowerState.On)
            PowerOff();
        else
            PowerOn();
    }

    public void PowerOn()
    {
        if (currentState != PowerState.Off || activeTransition != null) return;

        activeTransition = StartCoroutine(PowerOnRoutine());
    }

    public void PowerOff()
    {
        if (currentState != PowerState.On || activeTransition != null) return;

        activeTransition = StartCoroutine(PowerOffRoutine());
    }

    private IEnumerator PowerOnRoutine()
    {
        currentState = PowerState.PoweringOn;
        OnPowerStateChanged?.Invoke(true);
        UnityDashboardBrowser.RecoverIfUnavailable();

        // Reveal the existing dashboard by fading its black screen cover away.
        if (dashboardCanvasGroup != null) dashboardCanvasGroup.alpha = 0f;
        if (screenFlashOverlay != null)
        {
            screenFlashOverlay.gameObject.SetActive(true);
            screenFlashOverlay.color = new Color(0f, 0f, 0f, 1f);
        }

        if (statusLedRenderer != null)
        {
            statusLedRenderer.material.SetColor("_BaseColor", new Color(0.2f, 0.9f, 1f));
        }

        float elapsed = 0f;
        float transitionDuration = Mathf.Max(bootFlashDuration + contentFadeDuration, 0.01f);
        while (elapsed < transitionDuration)
        {
            elapsed += Time.unscaledDeltaTime;
            float t = Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(elapsed / transitionDuration));
            if (screenFlashOverlay != null)
            {
                screenFlashOverlay.color = new Color(0f, 0f, 0f, 1f - t);
            }
            if (screenGlowLight != null)
            {
                screenGlowLight.intensity = Mathf.Lerp(0f, 1.2f, t);
            }
            if (dashboardCanvasGroup != null)
            {
                dashboardCanvasGroup.alpha = t;
            }
            yield return null;
        }

        if (screenFlashOverlay != null)
        {
            screenFlashOverlay.gameObject.SetActive(false);
        }

        if (dashboardCanvasGroup != null)
        {
            dashboardCanvasGroup.alpha = 1f;
        }

        currentState = PowerState.On;
        activeTransition = null;
    }

    private IEnumerator PowerOffRoutine()
    {
        currentState = PowerState.PoweringOff;
        OnPowerStateChanged?.Invoke(false);

        if (screenFlashOverlay != null)
        {
            screenFlashOverlay.gameObject.SetActive(true);
            screenFlashOverlay.color = new Color(0f, 0f, 0f, 0f);
        }

        float elapsed = 0f;
        float transitionDuration = Mathf.Max(shutdownFadeDuration, 0.01f);
        while (elapsed < transitionDuration)
        {
            elapsed += Time.unscaledDeltaTime;
            float t = Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(elapsed / transitionDuration));

            if (screenFlashOverlay != null)
            {
                screenFlashOverlay.color = new Color(0f, 0f, 0f, t);
            }

            if (dashboardCanvasGroup != null)
            {
                dashboardCanvasGroup.alpha = 1f - t;
            }

            if (screenGlowLight != null)
            {
                screenGlowLight.intensity = Mathf.Lerp(1.2f, 0f, t);
            }

            yield return null;
        }

        SetInstantOff();
        currentState = PowerState.Off;
        activeTransition = null;
    }

    private void SetInstantOn()
    {
        currentState = PowerState.On;
        if (dashboardCanvasGroup != null) dashboardCanvasGroup.alpha = 1f;
        if (screenFlashOverlay != null)
        {
            screenFlashOverlay.color = new Color(0f, 0f, 0f, 0f);
            screenFlashOverlay.gameObject.SetActive(false);
        }
        if (screenGlowLight != null) screenGlowLight.intensity = 1.2f;
        if (statusLedRenderer != null) statusLedRenderer.material.SetColor("_BaseColor", new Color(0.2f, 0.9f, 1f));
    }

    private void SetInstantOff()
    {
        currentState = PowerState.Off;
        if (dashboardCanvasGroup != null) dashboardCanvasGroup.alpha = 0f;
        if (screenFlashOverlay != null)
        {
            screenFlashOverlay.gameObject.SetActive(true);
            screenFlashOverlay.color = new Color(0f, 0f, 0f, 1f);
        }
        if (screenGlowLight != null) screenGlowLight.intensity = 0f;
        if (statusLedRenderer != null) statusLedRenderer.material.SetColor("_BaseColor", new Color(0.1f, 0.15f, 0.2f));
        transform.localPosition = initialPosition;
        transform.localRotation = initialRotation;
    }
}
