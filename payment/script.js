document.getElementById('copyEmail').addEventListener('click', () => {
  const email = "me@luzian.net";
  navigator.clipboard.writeText(email).then(() => {
    alert("Email copied to clipboard!");
  });
});
