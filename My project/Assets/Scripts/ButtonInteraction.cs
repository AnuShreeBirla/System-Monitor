using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Events;

public class ButtonInteraction : MonoBehaviour
{
    [Header("Press Animation Settings")]
    [SerializeField] private float pressDepth = 0.08f;
    [SerializeField] private float pressSpeed = 16f;
    [SerializeField] private float returnSpeed = 10f;

    [Header("Audio Feedback (Optional)")]
    [SerializeField] private AudioSource clickAudioSource;

    [Header("Events")]
    [SerializeField] private UnityEvent onButtonPressed = new UnityEvent();

    private Vector3 originalPosition;
    private Vector3 targetPosition;
    private bool isPressed;
    private Camera cachedCamera;

    public bool IsPressed => isPressed;
    public UnityEvent OnButtonPressed => onButtonPressed;

    private void Start()
    {
        originalPosition = transform.localPosition;
        targetPosition = originalPosition;
        cachedCamera = Camera.main;
    }

    private void Update()
    {
        float speed = isPressed ? pressSpeed : returnSpeed;
        transform.localPosition = Vector3.Lerp(
            transform.localPosition,
            targetPosition,
            Time.deltaTime * speed
        );

        HandlePointerInput();
    }

    private void HandlePointerInput()
    {
        // Handle Mouse Down
        if (Input.GetMouseButtonDown(0))
        {
            if (cachedCamera == null) cachedCamera = Camera.main;
            if (cachedCamera != null)
            {
                Ray ray = cachedCamera.ScreenPointToRay(Input.mousePosition);
                if (Physics.Raycast(ray, out RaycastHit hit))
                {
                    if (hit.transform == transform)
                    {
                        Press();
                    }
                }
            }
        }

        // Handle Mouse Up
        if (Input.GetMouseButtonUp(0) && isPressed)
        {
            Release();
        }
    }

    private void OnMouseDown()
    {
        Press();
    }

    private void OnMouseUp()
    {
        Release();
    }

    public void Press()
    {
        if (isPressed) return;
        isPressed = true;
        targetPosition = originalPosition - new Vector3(0, pressDepth, 0);

        if (clickAudioSource != null)
        {
            clickAudioSource.Play();
        }

        onButtonPressed?.Invoke();
    }

    public void Release()
    {
        if (!isPressed) return;
        isPressed = false;
        targetPosition = originalPosition;
    }

    public void ClickButton()
    {
        StartCoroutine(SimulateClickRoutine());
    }

    private IEnumerator SimulateClickRoutine()
    {
        Press();
        yield return new WaitForSeconds(0.12f);
        Release();
    }
}
