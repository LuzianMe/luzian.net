const copyEmailBtn = document.getElementById('copyEmail');
if (copyEmailBtn) {
  copyEmailBtn.addEventListener('click', () => {
    const email = 'me@luzian.net';
    copyText(email)
      .then(() => flashLabel(copyEmailBtn.querySelector('p'), 'Copied!'))
      .catch(() => prompt('Copy this email:', email));
  });
}

// Share modal: QR code of this page, plus a copy-link button
const shareModal = document.getElementById('share-modal');
const shareTrigger = document.getElementById('share-trigger');
const shareLink = document.getElementById('share-link');

if (shareModal && shareTrigger) {
  const open = () => { shareModal.style.display = 'block'; };
  const close = () => { shareModal.style.display = 'none'; };

  shareTrigger.addEventListener('click', open);
  shareModal.querySelector('[data-close]').addEventListener('click', close);
  shareModal.addEventListener('click', (event) => {
    if (event.target === shareModal) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  shareLink.addEventListener('click', () => {
    const url = 'https://luzian.net/contact/';
    copyText(url)
      .then(() => flashLabel(shareLink, 'Link copied!'))
      .catch(() => prompt('Copy this link:', url));
  });
}

// Update copyright year
const yearEl = document.getElementById('current-year');
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}
