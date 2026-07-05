// ---- Modal helpers ----
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
function resetForm(modalId){
  const form = document.querySelector('#' + modalId + ' form');
  if (form) form.reset();
  const hid = document.querySelector('#' + modalId + ' input[name="id"]');
  if (hid) hid.value = '';
}
// Close modal on backdrop click.
document.addEventListener('click', e => {
  if (e.target.classList && e.target.classList.contains('modal')) e.target.classList.remove('open');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
});

// ---- Chart.js line chart used by dashboard & profit ----
function drawLineChart(canvasId, labels, values, label){
  const el = document.getElementById(canvasId);
  if (!el || typeof Chart === 'undefined') return;
  const ctx = el.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 200);
  grad.addColorStop(0, 'rgba(233,196,106,.45)');
  grad.addColorStop(1, 'rgba(233,196,106,0)');
  new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{
      label, data: values, fill: true, backgroundColor: grad,
      borderColor: '#e9c46a', borderWidth: 2, tension: .35,
      pointRadius: 2, pointBackgroundColor: '#f4a261'
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#9aa0b4', maxRotation: 0, autoSkip: true } },
        y: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#9aa0b4' } }
      }
    }
  });
}
