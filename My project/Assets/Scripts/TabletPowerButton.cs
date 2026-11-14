using UnityEngine;

[DisallowMultipleComponent]
[RequireComponent(typeof(SphereCollider))]
public sealed class TabletPowerButton : MonoBehaviour
{
    private TabletPowerController powerController;

    private void Awake()
    {
        powerController = GetComponentInParent<TabletPowerController>();
        if (powerController == null)
        {
            Debug.LogError($"[{nameof(TabletPowerButton)}] No TabletPowerController was found in the parent hierarchy.", this);
            enabled = false;
        }
    }

    private void OnMouseDown()
    {
        powerController?.TogglePower();
    }
}
