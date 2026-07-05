// Auto-dismiss flash messages after a few seconds.
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.flash').forEach(f => {
    setTimeout(() => { f.style.opacity = '0'; setTimeout(() => f.remove(), 400); }, 5000);
  });
});
