const copyEmailBtn = document.getElementById('copyEmail');

if (copyEmailBtn) {
  copyEmailBtn.addEventListener('click', () => {
    const email = "me@luzian.net";
    const textElement = copyEmailBtn.querySelector('p');
    const originalText = textElement ? textElement.textContent : email;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(email)
        .then(() => {
          if (textElement) {
            textElement.textContent = "Copied!";
            setTimeout(() => {
              textElement.textContent = originalText;
            }, 2000);
          } else {
            alert("Email copied to clipboard!");
          }
        })
        .catch(() => {
          fallbackCopyTextToClipboard(email, textElement, originalText);
        });
    } else {
      fallbackCopyTextToClipboard(email, textElement, originalText);
    }
  });
}

function fallbackCopyTextToClipboard(text, textElement, originalText) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.top = "-9999px";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    if (textElement) {
      textElement.textContent = "Copied!";
      setTimeout(() => {
        textElement.textContent = originalText;
      }, 2000);
    } else {
      alert("Email copied to clipboard!");
    }
  } catch (err) {
    prompt("Copy this email:", text);
  }
  document.body.removeChild(textArea);
}
