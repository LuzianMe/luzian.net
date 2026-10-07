// Copy text to the clipboard; if the Clipboard API is missing or blocked, use a hidden textarea
function copyText(text) {
  const legacyCopy = () => new Promise((resolve, reject) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textArea);
    ok ? resolve() : reject();
  });

  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(legacyCopy);
  }
  return legacyCopy();
}

// Say something to screen readers without showing it (a hidden status region)
function announce(message) {
  let region = document.getElementById('live-status');
  if (!region) {
    region = document.createElement('div');
    region.id = 'live-status';
    region.className = 'sr-only';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
  }
  region.textContent = '';
  setTimeout(() => { region.textContent = message; }, 50);
}

// Briefly swap an element's content to confirm the copy (and tell screen readers). A button that
// holds an icon shows a check mark instead of the words.
const CHECK_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function flashLabel(el, message) {
  announce(message);
  // Remember the real content once, so repeated clicks don't "restore" to the message
  if (el.dataset.original === undefined) el.dataset.original = el.innerHTML;
  const hasIcon = !!el.querySelector('svg');
  if (hasIcon) el.innerHTML = CHECK_ICON;
  else el.textContent = message;
  clearTimeout(el._flashTimer);
  el._flashTimer = setTimeout(() => { el.innerHTML = el.dataset.original; }, 2000);
}
