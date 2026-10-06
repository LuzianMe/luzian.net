// Messages come from data attributes on <body>, so the Spanish pages reuse this script
const msg = document.body.dataset;

const copyEmailBtn = document.getElementById('copyEmail');
if (copyEmailBtn) {
  copyEmailBtn.addEventListener('click', () => {
    const email = 'me@luzian.net';
    copyText(email)
      .then(() => flashLabel(copyEmailBtn.querySelector('p'), msg.copied || 'Copied!'))
      .catch(() => prompt(msg.promptEmail || 'Copy this email:', email));
  });
}

// Share modal: QR code of this page, plus a copy-link button
const shareModal = document.getElementById('share-modal');
const shareTrigger = document.getElementById('share-trigger');
const shareLink = document.getElementById('share-link');

if (shareModal && shareTrigger) {
  const open = () => window.showModal(shareModal);
  const close = () => window.hideModal(shareModal);

  shareTrigger.addEventListener('click', open);
  shareModal.querySelector('[data-close]').addEventListener('click', close);
  shareModal.addEventListener('click', (event) => {
    if (event.target === shareModal) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && shareModal.style.display === 'block') close();
  });

  shareLink.addEventListener('click', () => {
    const url = msg.shareUrl || 'https://luzian.net/contact/';
    copyText(url)
      .then(() => flashLabel(shareLink, msg.linkCopied || 'Link copied!'))
      .catch(() => prompt(msg.promptLink || 'Copy this link:', url));
  });
}
