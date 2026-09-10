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

// Update copyright year
const yearEl = document.getElementById('current-year');
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}
