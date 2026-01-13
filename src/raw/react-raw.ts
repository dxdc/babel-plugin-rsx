let scheduleHostRender: (() => void) | null = null;

/**
 * Bind the host renderer (e.g. React's setState force update).
 * This must be called exactly once per mounted component.
 */
export function bindRender(fn: () => void) {
  fn(); // Execute immediately to set up __instance.__rsx_triggerRender
}

/**
 * Schedule a render of the host framework.
 * Safe to call from anywhere inside an RSX instance.
 */
export function render() {
  if (!scheduleHostRender) return;
  scheduleHostRender();
}