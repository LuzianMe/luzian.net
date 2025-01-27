// Get modal elements
const modal = document.getElementById('zelle-modal');
const zelleTrigger = document.getElementById('zelle-trigger');
const closeModal = document.getElementById('close-modal');

// Show modal when clicking the Zelle trigger
zelleTrigger.addEventListener('click', () => {
  modal.style.display = 'block';
});

// Close modal when clicking the close button
closeModal.addEventListener('click', () => {
  modal.style.display = 'none';
});

// Close modal when clicking outside the modal content
window.addEventListener('click', (event) => {
  if (event.target === modal) {
    modal.style.display = 'none';
  }
});
