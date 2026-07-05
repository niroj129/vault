// Polling-based chat client.
(function () {
  const cfg = window.CHAT;
  const box = document.getElementById('messages');
  const form = document.getElementById('chatForm');
  const text = document.getElementById('chatText');
  const fileInput = document.getElementById('chatImage');
  const attachName = document.getElementById('attachName');
  const onlineList = document.getElementById('onlineList');
  const searchInput = document.getElementById('chatSearch');
  let lastId = 0;
  let searching = false;

  const esc = s => (s || '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function staticUrl(path) { return '/static/' + path; }

  function render(m, append = true) {
    const div = document.createElement('div');
    div.className = 'msg' + (m.mine ? ' mine' : '');
    let inner = m.mine ? '' : `<span class="who">${esc(m.username)}</span>`;
    inner += `<div class="bubble">${esc(m.body)}`;
    if (m.image) inner += `<img src="${staticUrl(m.image)}" alt="image">`;
    inner += `</div><span class="time">${esc((m.created_at || '').slice(11, 16))}</span>`;
    div.innerHTML = inner;
    if (append) box.appendChild(div); else box.prepend(div);
    if (m.id > lastId) lastId = m.id;
  }

  function scrollBottom() { box.scrollTop = box.scrollHeight; }

  function renderOnline(list) {
    onlineList.innerHTML = list.map(u =>
      `<li>${esc(u.username)}<span class="role">${u.role === 'admin' ? '★' : ''}</span></li>`
    ).join('') || '<li class="muted">No one online</li>';
  }

  async function loadHistory(q) {
    const res = await fetch(cfg.historyUrl + (q ? '?q=' + encodeURIComponent(q) : ''));
    const data = await res.json();
    box.innerHTML = '';
    lastId = 0;
    data.messages.forEach(m => render(m, true));
    scrollBottom();
  }

  async function poll() {
    if (searching) return;
    try {
      const res = await fetch(cfg.pollUrl + '?after=' + lastId);
      const data = await res.json();
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      data.messages.forEach(m => render(m, true));
      renderOnline(data.online);
      if (data.messages.length && atBottom) scrollBottom();
    } catch (e) { /* ignore transient errors */ }
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const body = text.value.trim();
    if (!body && !fileInput.files.length) return;
    const fd = new FormData();
    fd.append('body', body);
    fd.append('csrf_token', cfg.csrf);
    if (fileInput.files.length) fd.append('image', fileInput.files[0]);
    text.value = ''; fileInput.value = ''; attachName.textContent = '';
    try {
      const res = await fetch(cfg.sendUrl, {
        method: 'POST', body: fd, headers: { 'X-CSRF-Token': cfg.csrf }
      });
      const data = await res.json();
      if (!data.ok) alert(data.error || 'Could not send');
      await poll(); scrollBottom();
    } catch (e) { alert('Network error'); }
  });

  fileInput.addEventListener('change', () => {
    attachName.textContent = fileInput.files.length
      ? '📎 ' + fileInput.files[0].name : '';
  });

  // emoji picker
  const emojis = ['😀','😂','😍','😎','🤑','🥳','🔥','💰','🎰','🎲','🃏','♠️','♥️','♦️','♣️','🏆','👑','💎','🍀','⭐','👍','🙌','🎉','❤️'];
  const panel = document.getElementById('emojiPanel');
  document.getElementById('emojiBtn').addEventListener('click', () => panel.classList.toggle('open'));
  panel.innerHTML = emojis.map(e => `<span>${e}</span>`).join('');
  panel.querySelectorAll('span').forEach(s =>
    s.addEventListener('click', () => { text.value += s.textContent; panel.classList.remove('open'); text.focus(); }));

  // search
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    searchTimer = setTimeout(async () => {
      searching = !!q;
      await loadHistory(q);
    }, 350);
  });

  // boot
  loadHistory('');
  setInterval(poll, 3000);
})();
