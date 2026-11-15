using System.Collections;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using VoltstroStudios.UnityWebBrowser;
using VoltstroStudios.UnityWebBrowser.Communication;
using VoltstroStudios.UnityWebBrowser.Core;
using VoltstroStudios.UnityWebBrowser.Core.Engines;
using VoltstroStudios.UnityWebBrowser.Input;
using Resolution = VoltstroStudios.UnityWebBrowser.Shared.Resolution;

/// <summary>
/// Owns the single UWB browser surface on the tablet screen and recovers it if
/// its engine process or communication client is disposed or loses connection.
/// </summary>
[DisallowMultipleComponent]
public sealed class UnityDashboardBrowser : MonoBehaviour
{
    private const string ScreenCanvasName = "TabletScreenCanvas";
    private const string DashboardUrl = "http://127.0.0.1:5173/#/";
    private const string SurfaceName = "ReactDashboardSurface";
    private const float DisconnectGraceSeconds = 5f;
    private const float RecoveryCooldownSeconds = 8f;

    private Canvas screenCanvas;
    private GameObject surface;
    private WebBrowserUIBasic browser;
    private string currentUrl = DashboardUrl;
    private float disconnectedSince = -1f;
    private float lastRecoveryTime = -RecoveryCooldownSeconds;
    private float nextSurfaceAttemptTime;
    private bool recoveryInProgress;

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    private static void AttachToTabletScreen()
    {
        if (!Application.isPlaying)
            return;

        Canvas canvas = GameObject.Find(ScreenCanvasName)?.GetComponent<Canvas>();
        if (canvas == null)
        {
            Debug.LogError($"[{nameof(UnityDashboardBrowser)}] Could not find the {ScreenCanvasName} canvas.");
            return;
        }

        UnityDashboardBrowser owner = canvas.GetComponent<UnityDashboardBrowser>();
        if (owner == null)
            owner = canvas.gameObject.AddComponent<UnityDashboardBrowser>();

        owner.screenCanvas = canvas;
        owner.EnsureSurface();
        EnsureEventSystem();
    }

    /// <summary>Called when the physical power button turns the tablet on.</summary>
    public static void RecoverIfUnavailable()
    {
        Canvas canvas = GameObject.Find(ScreenCanvasName)?.GetComponent<Canvas>();
        if (canvas == null)
            return;

        UnityDashboardBrowser owner = canvas.GetComponent<UnityDashboardBrowser>();
        if (owner == null)
        {
            AttachToTabletScreen();
            return;
        }

        owner.screenCanvas = canvas;
        owner.EnsureSurface();
        if (owner.browser == null || owner.browser.browserClient == null || owner.browser.browserClient.HasDisposed)
            owner.BeginRecovery();
    }

    private void Update()
    {
        if (recoveryInProgress)
            return;

        if (surface == null || browser == null)
        {
            EnsureSurface();
            return;
        }

        WebBrowserClient client = browser.browserClient;
        if (client == null || client.HasDisposed)
        {
            BeginRecovery();
            return;
        }

        if (!client.HasInitialized || client.IsConnected)
        {
            disconnectedSince = -1f;
            return;
        }

        if (disconnectedSince < 0f)
            disconnectedSince = Time.unscaledTime;

        if (Time.unscaledTime - disconnectedSince >= DisconnectGraceSeconds)
            BeginRecovery();
    }

    private void EnsureSurface()
    {
        if (screenCanvas == null)
            screenCanvas = GetComponent<Canvas>();
        if (screenCanvas == null || recoveryInProgress)
            return;

        if (surface == null)
        {
            Transform existingSurface = screenCanvas.transform.Find(SurfaceName);
            if (existingSurface != null)
            {
                surface = existingSurface.gameObject;
                browser = surface.GetComponent<WebBrowserUIBasic>();
                if (browser != null && browser.browserClient != null)
                {
                    currentUrl = browser.browserClient.initialUrl;
                    return;
                }

                Destroy(surface);
                surface = null;
            }

            CreateSurface();
        }
    }

    private void CreateSurface()
    {
        if (surface != null || screenCanvas == null || Time.unscaledTime < nextSurfaceAttemptTime)
            return;

        nextSurfaceAttemptTime = Time.unscaledTime + RecoveryCooldownSeconds;

        surface = new GameObject(SurfaceName, typeof(RectTransform), typeof(RawImage));
        surface.transform.SetParent(screenCanvas.transform, false);

        RectTransform rect = surface.GetComponent<RectTransform>();
        rect.anchorMin = Vector2.zero;
        rect.anchorMax = Vector2.one;
        rect.offsetMin = Vector2.zero;
        rect.offsetMax = Vector2.zero;
        rect.localScale = Vector3.one;

        RawImage image = surface.GetComponent<RawImage>();
        image.color = Color.white;
        image.raycastTarget = true;

        browser = surface.AddComponent<WebBrowserUIBasic>();
        EngineConfiguration engine = Resources.Load<EngineConfiguration>("Cef Engine Configuration");
        if (engine == null)
        {
            Debug.LogError($"[{nameof(UnityDashboardBrowser)}] UWB CEF engine configuration is missing.");
            Destroy(surface);
            surface = null;
            browser = null;
            return;
        }

        browser.browserClient.engine = engine;
        // The bundled macOS CEF helper subprocesses crash during sandbox startup
        // in the standalone player before producing browser frames.
        browser.browserClient.noSandbox = true;
        TCPCommunicationLayer communicationLayer = ScriptableObject.CreateInstance<TCPCommunicationLayer>();
        AssignAvailablePorts(communicationLayer);
        browser.browserClient.communicationLayer = communicationLayer;

        FieldInfo resolutionField = typeof(WebBrowserClient).GetField("resolution", BindingFlags.Instance | BindingFlags.NonPublic);
        if (resolutionField == null)
        {
            Debug.LogError($"[{nameof(UnityDashboardBrowser)}] Could not configure the UWB browser resolution.");
            Destroy(surface);
            surface = null;
            browser = null;
            return;
        }

        resolutionField.SetValue(browser.browserClient, new Resolution(1100, 670));
        browser.browserClient.initialUrl = currentUrl;
        browser.browserClient.OnUrlChanged += RememberCurrentUrl;
        browser.inputHandler = ScriptableObject.CreateInstance<WebBrowserOldInputHandler>();
        nextSurfaceAttemptTime = 0f;

        // Keep the existing power-off overlay above the interactive browser.
        Transform shutdownOverlay = screenCanvas.transform.Find("ScreenFlashOverlay");
        if (shutdownOverlay != null)
            surface.transform.SetSiblingIndex(shutdownOverlay.GetSiblingIndex());
    }

    private void RememberCurrentUrl(string url)
    {
        if (!string.IsNullOrWhiteSpace(url))
            currentUrl = url;
    }

    private static void AssignAvailablePorts(TCPCommunicationLayer communicationLayer)
    {
        // UWB defaults to 5555/5556, which collide when both the Unity Editor
        // and its standalone player are open. Reserve two distinct loopback
        // ephemeral ports together, then pass the pair to both UWB processes.
        TcpListener engineListener = new(IPAddress.Loopback, 0);
        TcpListener unityListener = new(IPAddress.Loopback, 0);
        try
        {
            engineListener.Start();
            unityListener.Start();
            communicationLayer.inPort = ((IPEndPoint)engineListener.LocalEndpoint).Port;
            communicationLayer.outPort = ((IPEndPoint)unityListener.LocalEndpoint).Port;
        }
        finally
        {
            engineListener.Stop();
            unityListener.Stop();
        }
    }

    private void BeginRecovery()
    {
        if (recoveryInProgress || Time.unscaledTime - lastRecoveryTime < RecoveryCooldownSeconds)
            return;

        recoveryInProgress = true;
        lastRecoveryTime = Time.unscaledTime;
        disconnectedSince = -1f;
        StartCoroutine(RecreateAfterShutdown());
    }

    private IEnumerator RecreateAfterShutdown()
    {
        if (browser != null && browser.browserClient != null)
        {
            browser.browserClient.OnUrlChanged -= RememberCurrentUrl;
            browser.browserClient.Dispose();
        }

        if (surface != null)
            Destroy(surface);

        surface = null;
        browser = null;
        // Let Unity run the old component's OnDestroy before starting another CEF client.
        yield return null;
        yield return new WaitForSecondsRealtime(0.25f);

        if (Application.isPlaying)
            CreateSurface();

        recoveryInProgress = false;
    }

    private static void EnsureEventSystem()
    {
        if (EventSystem.current != null)
            return;

        GameObject eventSystem = new("TabletDashboardEventSystem");
        eventSystem.AddComponent<EventSystem>();
        eventSystem.AddComponent<StandaloneInputModule>();
    }
}
