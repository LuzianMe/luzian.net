// Pop-up helpers: opening a pop-up moves the keyboard focus into it and keeps Tab inside it;
// closing it gives the focus back to the button that opened it.
(function () {
  'use strict';

  const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const opener = new WeakMap();   // pop-up -> the element that had focus before it opened
  const trap = new WeakMap();     // pop-up -> its Tab handler

  window.showModal = function (modal) {
    opener.set(modal, document.activeElement);
    modal.style.display = 'block';
    const first = modal.querySelector('[data-close], #close-modal') || modal.querySelector(FOCUSABLE);
    modal.setAttribute('tabindex', '-1');
    (first || modal).focus();

    const onKey = (event) => {
      if (event.key !== 'Tab') return;
      const items = Array.from(modal.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!items.length) { event.preventDefault(); return; }
      const start = items[0];
      const end = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === start || document.activeElement === modal)) {
        event.preventDefault();
        end.focus();
      } else if (!event.shiftKey && document.activeElement === end) {
        event.preventDefault();
        start.focus();
      }
    };
    trap.set(modal, onKey);
    document.addEventListener('keydown', onKey);
  };

  window.hideModal = function (modal) {
    modal.style.display = 'none';
    const onKey = trap.get(modal);
    if (onKey) document.removeEventListener('keydown', onKey);
    trap.delete(modal);
    const back = opener.get(modal);
    opener.delete(modal);
    if (back && back.focus) back.focus();
  };
})();
