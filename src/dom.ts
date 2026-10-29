const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes text for safe use inside HTML text and attribute values. */
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** The first element matching a selector, or null. */
export function $(selector: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(selector);
}

/** The current value of an input, select or textarea with this id, or an empty string. */
export function valueOf(id: string): string {
  const el = document.getElementById(id);
  return el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement
    ? el.value
    : '';
}

/** Whether the checkbox with this id is ticked. */
export function isChecked(id: string): boolean {
  const el = document.getElementById(id);
  return el instanceof HTMLInputElement && el.checked;
}

let flashTimer: number | undefined;

/** Shows a short message in the banner at the top of the page for six seconds. */
export function flash(message: string): void {
  const el = $('#fl');
  if (!el) return;
  el.textContent = message;
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => {
    el.textContent = '';
  }, 6000);
}

/** Reports a failed save to the console and to the person using the page. */
export function fail(error: unknown): void {
  console.error(error);
  flash(
    error instanceof Error && error.message === 'busy'
      ? 'Someone else is editing right now. Please try again in a moment.'
      : 'That change could not be saved. Please try again.',
  );
}
