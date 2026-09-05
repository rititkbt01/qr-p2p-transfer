// ui.js — DOM rendering only. No networking or file logic lives here; main.js calls
// into these functions and reacts to the DOM events they attach.

export const el = (id) => document.getElementById(id);

// Removes a transient entrance-animation class once it's had time to play, so
// an element's resting state never permanently depends on that animation
// actually having run (see the CSS comment on .card-in / .qr-wrapper--enter).
function settleEntranceClass(node, className, delay = 350) {
  if (!node) return;
  setTimeout(() => node.classList.remove(className), delay);
}

export function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '\u2014';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

export function log(msg, type = 'info') {
  const container = el('statusLog');
  if (!container) return;
  const p = document.createElement('p');
  p.textContent = `\u203a ${msg}`;
  if (type === 'success') p.classList.add('success');
  if (type === 'error') p.classList.add('error');
  container.appendChild(p);
  container.scrollTop = container.scrollHeight;
  // Keep the DOM log bounded so a very long session doesn't bloat memory.
  while (container.children.length > 200) container.removeChild(container.firstChild);
}

export function toast(msg, type = 'info') {
  const host = el('toastHost');
  if (!host) return;
  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.textContent = msg;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('toast--in'));
  setTimeout(() => {
    t.classList.remove('toast--in');
    setTimeout(() => t.remove(), 250);
  }, 3200);
}

export function playConnectPulse() {
  const beacon = el('linkPanel');
  if (!beacon) return;
  beacon.classList.remove('pulse-connect');
  // Force reflow so the animation can replay if it fires again.
  void beacon.offsetWidth;
  beacon.classList.add('pulse-connect');
  setTimeout(() => beacon.classList.remove('pulse-connect'), 1200);
}

// ---- Recent devices (Quick Connect chips) ----

export function renderRecentDevices(devices, onSelect, onForget) {
  const wrap = el('recentDevices');
  const list = el('recentList');
  if (!wrap || !list) return;
  list.innerHTML = '';
  if (!devices.length) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  devices.forEach((d) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.innerHTML = `<span class="chip__dot"></span><span>${escapeHTML(d.label)}</span>`;
    chip.title = `Reconnect using code ${d.roomCode}`;
    chip.addEventListener('click', () => onSelect(d));
    const forget = document.createElement('button');
    forget.type = 'button';
    forget.className = 'chip__x';
    forget.setAttribute('aria-label', `Forget ${d.label}`);
    forget.textContent = '\u00d7';
    forget.addEventListener('click', (e) => {
      e.stopPropagation();
      onForget(d);
    });
    chip.appendChild(forget);
    list.appendChild(chip);
  });
}

// ---- Roster ----

export function renderRoster(roster, myId, role) {
  const list = el('rosterList');
  const block = el('rosterBlock');
  const countLabel = el('rosterCount');
  if (!list || !block) return;

  const others = roster.filter((r) => r.id !== myId);
  block.hidden = roster.length === 0;
  if (countLabel) {
    countLabel.textContent =
      others.length === 0 ? 'Waiting for another device\u2026' : `${roster.length} device${roster.length === 1 ? '' : 's'} linked`;
  }

  list.innerHTML = '';
  roster.forEach((r) => {
    const li = document.createElement('li');
    li.className = 'roster-row card-in';
    const isSelf = r.id === myId;
    li.innerHTML = `
      <span class="roster-row__dot"></span>
      <span class="roster-row__name">${escapeHTML(r.name)}${isSelf ? ' (you)' : ''}</span>
      ${role === 'host' && isSelf ? '<span class="roster-row__tag">host</span>' : ''}
    `;
    list.appendChild(li);
    settleEntranceClass(li, 'card-in');
  });
}

// ---- Target selector for sending ----

export function renderTargetOptions(roster, myId, role) {
  const select = el('targetSelect');
  if (!select) return;
  const prev = select.value;
  select.innerHTML = '';
  const others = roster.filter((r) => r.id !== myId);

  if (others.length > 1) {
    const everyone = document.createElement('option');
    everyone.value = 'broadcast';
    everyone.textContent = `Everyone (${others.length})`;
    select.appendChild(everyone);
  }
  others.forEach((r) => {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = role === 'guest' ? `${r.name} (host)` : r.name;
    select.appendChild(opt);
  });

  if ([...select.options].some((o) => o.value === prev)) select.value = prev;
  el('targetRow').hidden = select.options.length <= 1 && others.length <= 1;
}

// ---- Outgoing file list ----

export function addOutgoingRow(transferId, name, size) {
  const list = el('fileList');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'file-item card-in';
  row.id = `out-${transferId}`;
  row.innerHTML = `
    <div class="file-item__main">
      <span class="file-item__name">${escapeHTML(name)}</span>
      <span class="file-item__size">${formatSize(size)}</span>
    </div>
    <div class="file-item__bar"><div class="file-item__fill" style="width:0%"></div></div>
    <span class="file-item__status">Sending\u2026</span>
  `;
  list.prepend(row);
  settleEntranceClass(row, 'card-in');
}

export function updateOutgoingRow(transferId, percent) {
  const row = el(`out-${transferId}`);
  if (!row) return;
  row.querySelector('.file-item__fill').style.width = `${percent}%`;
  row.querySelector('.file-item__status').textContent = `${percent}%`;
}

export function finishOutgoingRow(transferId, ok, message) {
  const row = el(`out-${transferId}`);
  if (!row) return;
  const status = row.querySelector('.file-item__status');
  status.textContent = ok ? 'Sent \u2713' : message || 'Failed \u2717';
  status.classList.add(ok ? 'success' : 'error');
  if (ok) row.querySelector('.file-item__fill').style.width = '100%';
}

// ---- Incoming file cards ----

export function addIncomingCard(transferId, { name, size, peerLabel, encrypted }) {
  const log_ = el('transferLog');
  if (!log_) return;
  el('receiveEmpty').hidden = true;
  const card = document.createElement('div');
  card.className = 'file-card card-in';
  card.id = `in-${transferId}`;
  card.innerHTML = `
    <div class="file-card__header">
      <span class="file-card__name">${escapeHTML(name)}${encrypted ? ' <span class="lock" title="Encrypted">\ud83d\udd12</span>' : ''}</span>
      <span class="file-card__size">${formatSize(size)}</span>
    </div>
    <p class="file-card__from">from ${escapeHTML(peerLabel)}</p>
    <div class="progress-container">
      <div class="progress-bar"><div class="progress-fill" style="width:0%"></div></div>
      <p class="progress-text">0%</p>
    </div>
    <div class="file-card__actions"></div>
  `;
  log_.prepend(card);
  settleEntranceClass(card, 'card-in');
}

export function updateIncomingCard(transferId, percent) {
  const card = el(`in-${transferId}`);
  if (!card) return;
  card.querySelector('.progress-fill').style.width = `${percent}%`;
  card.querySelector('.progress-text').textContent = `${percent}%`;
}

export function markIncomingFailed(transferId, message) {
  const card = el(`in-${transferId}`);
  if (!card) return;
  const text = card.querySelector('.progress-text');
  text.textContent = 'Failed';
  text.classList.add('error');
  const note = document.createElement('p');
  note.className = 'file-card__error';
  note.textContent = message;
  card.appendChild(note);
}

export function markIncomingReady(transferId, actions) {
  const card = el(`in-${transferId}`);
  if (!card) return;
  const text = card.querySelector('.progress-text');
  text.textContent = 'Received';
  text.classList.add('success');
  const actionsEl = card.querySelector('.file-card__actions');
  actionsEl.innerHTML = '';
  actions.forEach(({ label, onClick, variant }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn btn--${variant || 'primary'} btn--sm`;
    btn.textContent = label;
    btn.addEventListener('click', () => onClick(btn));
    actionsEl.appendChild(btn);
  });
}

// ---- History ----

export function renderHistory(entries, { onRedownload, onExtract, canExtract }) {
  const list = el('historyList');
  const empty = el('historyEmpty');
  if (!list) return;
  list.innerHTML = '';
  empty.hidden = entries.length > 0;

  entries.slice(0, 40).forEach((entry) => {
    const li = document.createElement('li');
    li.className = `history-row history-row--${entry.direction}`;
    const arrow = entry.direction === 'sent' ? '\u2197' : '\u2199';
    li.innerHTML = `
      <span class="history-row__arrow">${arrow}</span>
      <span class="history-row__name">${escapeHTML(entry.fileName)}</span>
      <span class="history-row__meta">${formatSize(entry.size)} \u00b7 ${escapeHTML(entry.peerLabel || '')} \u00b7 ${formatTime(entry.timestamp)}</span>
      <span class="history-row__status history-row__status--${entry.status}">${entry.status}</span>
      <span class="history-row__actions"></span>
    `;
    const actions = li.querySelector('.history-row__actions');
    if (entry.direction === 'received' && entry.status === 'complete') {
      const dl = document.createElement('button');
      dl.type = 'button';
      dl.className = 'btn btn--ghost btn--sm';
      dl.textContent = 'Download again';
      dl.addEventListener('click', () => onRedownload(entry));
      actions.appendChild(dl);
      if (entry.isFolder && canExtract) {
        const ex = document.createElement('button');
        ex.type = 'button';
        ex.className = 'btn btn--ghost btn--sm';
        ex.textContent = 'Extract';
        ex.addEventListener('click', () => onExtract(entry));
        actions.appendChild(ex);
      }
    }
    list.appendChild(li);
  });
}

export function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ---- A single, purposeful 3D tilt on the hero QR card ----
// Desktop/mouse only (a phone showing the code to be scanned is usually the one
// held still) — skipped entirely on touch so it never fights a scroll gesture.
const MAX_TILT_DEG = 10;

export function attachTilt(el) {
  if (!el || el.dataset.tiltAttached) return;
  if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  el.dataset.tiltAttached = 'true';

  el.addEventListener('mousemove', (e) => {
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width; // 0..1
    const py = (e.clientY - rect.top) / rect.height;
    const rotateY = (px - 0.5) * 2 * MAX_TILT_DEG;
    const rotateX = (0.5 - py) * 2 * MAX_TILT_DEG;
    el.style.transform = `perspective(700px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
  });
  el.addEventListener('mouseenter', () => {
    el.classList.add('qr-wrapper--tilting');
  });
  el.addEventListener('mouseleave', () => {
    el.classList.remove('qr-wrapper--tilting');
    el.style.transform = 'perspective(700px) rotateX(0deg) rotateY(0deg)';
  });
}
