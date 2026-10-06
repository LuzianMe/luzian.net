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

// Briefly swap an element's text to confirm the copy (and tell screen readers)
function flashLabel(el, message) {
  announce(message);
  // Remember the real label once, so repeated clicks don't "restore" to the message
  if (!el.dataset.label) el.dataset.label = el.textContent;
  el.textContent = message;
  clearTimeout(el._flashTimer);
  el._flashTimer = setTimeout(() => { el.textContent = el.dataset.label; }, 2000);
}
