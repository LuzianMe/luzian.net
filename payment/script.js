// Get modal elements
const modal = document.getElementById('zelle-modal');
const zelleTrigger = document.getElementById('zelle-trigger');
const closeModal = document.getElementById('close-modal');

if (zelleTrigger && modal) {
  // Show modal when clicking the Zelle trigger
  zelleTrigger.addEventListener('click', () => {
    modal.style.display = 'block';
  });

  // Close modal when clicking the close button
  if (closeModal) {
    closeModal.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  // Close modal when clicking outside the modal content
  window.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  });

  // Close modal with Escape key
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.style.display === 'block') {
      modal.style.display = 'none';
    }
  });
}

// Copy buttons on each payment card (messages come from data attributes on <body>)
const msg = document.body.dataset;
document.querySelectorAll('.pay-btn[data-copy]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const text = btn.dataset.copy;
    copyText(text)
      .then(() => flashLabel(btn, msg.copied || 'Copied!'))
      .catch(() => prompt(msg.promptCopy || 'Copy this:', text));
  });
});

// Update copyright year
const yearEl = document.getElementById('current-year');
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}
