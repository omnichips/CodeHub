// A light tap felt on every button press. iOS Safari has no vibration API, but since iOS 18 toggling an
// <input type="checkbox" switch> gives a haptic tick, so a hidden one is toggled. Android uses navigator.vibrate.
// It only works inside a tap, which is why it hangs off the click event. Untestable on Windows: check on the iPhone.
let toggle: HTMLLabelElement | null = null;

export function tick() {
  try {
    if (navigator.vibrate?.(8)) return;
    if (!toggle) {
      toggle = document.createElement('label');
      toggle.setAttribute('aria-hidden', 'true');
      toggle.style.display = 'none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      toggle.append(input);
      document.body.append(toggle);
    }
    toggle.click();
  } catch {
    /* no haptics here; the visual press state still shows */
  }
}

export function enableHaptics() {
  document.addEventListener('click', (e) => (e.target as Element | null)?.closest?.('button, [role="tab"]') && tick(), true);
}
