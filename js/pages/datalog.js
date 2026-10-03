// ===== PAGE 4: DATA LOG =====
// Shows everything saved in "history" as square cards (one per workout session), newest first.
// Every "Finish Workout" saves entries that share the same "date" = one session.
// Click a card to open it in a centred pop-up where you can edit or delete.

(function () {
  const root = document.getElementById('datalog-root');
  let openDate = null;   // date (ISO) of the session whose pop-up is open
  let edit = null;       // { type:'ex', date, exId, draft:[{reps,kg}] }  or  { type:'date' }

  // pop-up container
  const overlay = document.createElement('div');
  overlay.className = 'pm-overlay';
  overlay.style.display = 'none';
  document.body.appendChild(overlay);

  // ----- helpers -----
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmt(v) { return (Math.round(v * 10) / 10).toLocaleString('en-GB'); }
  function p2(n) { return String(n).padStart(2, '0'); }
  function toLocalInput(iso) {
    const d = new Date(iso);
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function load() { return DB.load('history', []); }
  function save(h) { DB.save('history', h); }

  // group entries into sessions, newest session first
  function groupSessions(history) {
    const map = {};
    history.forEach(h => { (map[h.date] = map[h.date] || []).push(h); });
    return Object.keys(map)
      .sort((a, b) => Date.parse(b) - Date.parse(a))
      .map(d => ({ date: d, entries: map[d] }));
  }

  // "Day 1 : Chest & Tricep (PUSH)"  ->  main "Day 1", sub "Chest & Tricep (PUSH)"
  function parseName(name) {
    const m = name.match(/^\s*([^:]+?)\s*:\s*(.*)$/);
    return { main: m ? m[1] : name, sub: m ? m[2] : '' };
  }

  // which day/preset a session belongs to (saved name first, otherwise worked out from the exercises)
  function labelFor(entries) {
    const presets = DB.load('presets', []);
    const names = [];
    entries.forEach(e => {
      let n = e.preset;
      if (!n) {
        const p = presets.find(pr => pr.exercises.some(x => x.id === e.exId));
        if (p) n = p.name;
      }
      if (n && !names.includes(n)) names.push(n);
    });
    if (!names.length) return { main: 'Workout', sub: '' };
    const parts = names.map(parseName);
    return {
      main: parts.map(p => p.main).join(' + '),
      sub: parts.map(p => p.sub).filter(Boolean).join(' + ')
    };
  }

  // ----- THE SQUARE CARDS -----
  function renderGrid() {
    const history = load();

    if (!history.length) {
      root.innerHTML = '<div class="card glass empty-note">No saved sessions yet. Finish a workout on the Workout page and it will appear here.</div>';
      return;
    }

    const sessions = groupSessions(history);
    let html = `
      <div class="log-bar">
        <span>${sessions.length} session${sessions.length === 1 ? '' : 's'} · ${history.length} exercise log${history.length === 1 ? '' : 's'}</span>
        <button class="btn small danger" data-action="del-all">Delete all data</button>
      </div>
      <div class="hint log-hint">Tap a session to view, edit or delete it.</div>`;

    let month = '';
    sessions.forEach(s => {
      const d = new Date(s.date);
      const m = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      if (m !== month) {
        if (month) html += '</div>';
        html += `<div class="log-month">${m}</div><div class="preset-grid">`;
        month = m;
      }
      const lab = labelFor(s.entries);
      const n = s.entries.length;
      html += `
        <button class="preset-tile log-tile" data-open="${esc(s.date)}">
          <div>
            <div class="tile-date">${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
            <div class="tile-day">${esc(lab.main)}</div>
            ${lab.sub ? `<div class="tile-sub">${esc(lab.sub)}</div>` : ''}
          </div>
          <div class="tile-foot">
            <span class="tile-count">${n} exercise${n === 1 ? '' : 's'}</span>
            <span class="tile-arrow">›</span>
          </div>
        </button>`;
    });
    html += '</div>';
    root.innerHTML = html;
  }

  // ----- ONE EXERCISE INSIDE THE POP-UP -----
  function exEntry(e) {
    const name = esc(e.exName).replace(' - ', ' — ');
    const editing = edit && edit.type === 'ex' && edit.date === e.date && edit.exId === e.exId;

    if (!editing) {
      return `
        <div class="log-ex" data-ex="${e.exId}">
          <div class="log-ex-top">
            <span class="log-ex-name">${name}</span>
            <div class="row">
              <button class="btn small" data-action="edit-ex">Edit</button>
              <button class="btn small danger" data-action="del-ex">Delete</button>
            </div>
          </div>
          <div class="log-sets">
            ${e.sets.map((s, i) => `<span class="log-set">Set ${i + 1} · <b>${fmt(s.kg)}</b> kg × <b>${s.reps}</b></span>`).join('')}
          </div>
        </div>`;
    }

    return `
      <div class="log-ex editing" data-ex="${e.exId}">
        <div class="log-ex-top"><span class="log-ex-name">${name}</span></div>
        <div class="log-edit-row log-edit-head"><span></span><span>Reps</span><span>Kg</span><span></span></div>
        ${edit.draft.map((s, i) => `
          <div class="log-edit-row" data-i="${i}">
            <span class="set-n">Set ${i + 1}</span>
            <input class="input num" type="number" inputmode="numeric" min="0" data-field="reps" value="${esc(s.reps)}">
            <input class="input num" type="number" inputmode="decimal" min="0" step="0.5" data-field="kg" value="${esc(s.kg)}">
            <button class="log-x" data-action="rm-set" aria-label="Remove set">×</button>
          </div>`).join('')}
        <div class="set-actions">
          <button class="btn small" data-action="add-set">+ Add set</button>
          <button class="btn small primary" data-action="save-ex">Save</button>
          <button class="btn small" data-action="cancel">Cancel</button>
        </div>
      </div>`;
  }

  // ----- THE CENTRED POP-UP -----
  function renderModal() {
    const entries = openDate ? load().filter(h => h.date === openDate) : [];

    if (!entries.length) {            // nothing left in this session -> close
      openDate = null; edit = null;
      overlay.style.display = 'none';
      overlay.innerHTML = '';
      return;
    }

    const d = new Date(openDate);
    const lab = labelFor(entries);
    const sets = entries.reduce((a, e) => a + e.sets.length, 0);
    const n = entries.length;
    const fullDate = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const dateEditing = edit && edit.type === 'date';

    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div class="pm-panel">
        <div class="pm-top">
          <div>
            <div class="tile-date">${fullDate}</div>
            <div class="pm-day">${esc(lab.main)}</div>
            ${lab.sub ? `<div class="pm-sub">${esc(lab.sub)}</div>` : ''}
            <div class="log-meta">${time} · ${n} exercise${n === 1 ? '' : 's'} · ${sets} set${sets === 1 ? '' : 's'}</div>
          </div>
          <button class="pm-close" data-action="close" aria-label="Close">×</button>
        </div>

        ${dateEditing ? `
          <div class="row log-date-edit">
            <input class="input" type="datetime-local" id="log-date-input" value="${toLocalInput(openDate)}">
            <button class="btn small primary" data-action="save-date">Save</button>
            <button class="btn small" data-action="cancel">Cancel</button>
          </div>` : ''}

        <div class="section-label">Exercises</div>
        ${entries.map(exEntry).join('')}

        <div class="pm-actions">
          <button class="btn small" data-action="edit-date">Change date</button>
          <button class="btn small danger" data-action="del-session">Delete session</button>
        </div>
      </div>`;
  }

  function renderAll() { renderGrid(); renderModal(); }

  function openModal(date) {
    openDate = date;
    edit = null;
    overlay.classList.add('opening');
    renderModal();
    setTimeout(() => overlay.classList.remove('opening'), 400);
  }
  function closeModal() { openDate = null; edit = null; renderModal(); }


    // ----- CLICKS ON THE PAGE -----
  root.addEventListener('click', async e => {
    const tile = e.target.closest('[data-open]');
    if (tile) { openModal(tile.dataset.open); return; }

    if (e.target.closest('[data-action="del-all"]')) {
      const n = load().length;
      const yes = await UI.confirm({
        title: 'Delete ALL saved data?',
        message: 'This permanently removes every saved workout (' + n + ' exercise log' + (n === 1 ? '' : 's') + '). Your presets are not touched. This cannot be undone.',
        okText: 'Delete everything',
        requireText: 'DELETE'
      });
      if (!yes) return;
      save([]); closeModal(); renderGrid();
      window.SFX && SFX.play('deleteAll');
    }
  });
   // ----- CLICKS INSIDE THE POP-UP -----
  overlay.addEventListener('click', async e => {
    if (e.target === overlay) { closeModal(); return; }   // click outside the panel

    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const date = openDate;
    const exEl = btn.closest('.log-ex');
    const exId = exEl ? exEl.dataset.ex : null;

    if (action === 'close') { closeModal(); return; }

    if (action === 'del-session') {
      const count = load().filter(h => h.date === date).length;
      const yes = await UI.confirm({
        title: 'Delete this session?',
        message: 'This removes the whole workout (' + count + ' exercise' + (count === 1 ? '' : 's') + ') from your Data Log, Progress and Activity.',
        okText: 'Delete session'
      });
      if (!yes) return;
      save(load().filter(h => h.date !== date)); edit = null; renderAll();
      window.SFX && SFX.play('delete');
      return;
    }

    if (action === 'del-ex') {
      const entry = load().find(h => h.date === date && h.exId === exId);
      if (!entry) return;
      const yes = await UI.confirm({
        title: 'Delete this exercise?',
        message: '"' + entry.exName + '" will be removed from this session.',
        okText: 'Delete'
      });
      if (!yes) return;
      save(load().filter(h => !(h.date === date && h.exId === exId))); edit = null; renderAll();
      window.SFX && SFX.play('delete');
      return;
    }

    if (action === 'edit-ex') {
      const entry = load().find(h => h.date === date && h.exId === exId);
      if (!entry) return;
      edit = { type: 'ex', date: date, exId: exId, draft: entry.sets.map(s => ({ reps: String(s.reps), kg: String(s.kg) })) };
      renderModal();
      return;
    }

    if (action === 'add-set') { edit.draft.push({ reps: '', kg: '' }); renderModal(); return; }

    if (action === 'rm-set') {
      if (edit.draft.length <= 1) return;
      edit.draft.splice(Number(btn.closest('.log-edit-row').dataset.i), 1);
      renderModal();
      return;
    }

    if (action === 'save-ex') {
      const clean = edit.draft
        .filter(s => s.reps !== '')
        .map(s => ({ reps: Number(s.reps), kg: Number(s.kg) || 0 }));
      if (!clean.length) {
        UI.alert({ title: 'Nothing to save', message: 'Add reps for at least one set, or use Delete to remove the exercise.' });
        return;
      }
      if (clean.some(s => !(s.reps >= 0) || s.kg < 0)) {
        UI.alert({ title: 'Check your numbers', message: 'Reps and kg cannot be negative.' });
        return;
      }
      const h = load();
      const entry = h.find(x => x.date === edit.date && x.exId === edit.exId);
      if (entry) entry.sets = clean;
      save(h); edit = null; renderAll();
      window.SFX && SFX.play('save');
      return;
    }

    if (action === 'edit-date') { edit = { type: 'date' }; renderModal(); return; }

    if (action === 'save-date') {
      const v = document.getElementById('log-date-input').value;
      if (!v) {
        UI.alert({ title: 'Pick a date', message: 'Choose a date and time first.' });
        return;
      }
      const newIso = new Date(v).toISOString();
      const h = load();
      h.forEach(x => { if (x.date === openDate) x.date = newIso; });
      window.SFX && SFX.play('save');
      save(h);
      openDate = newIso;
      edit = null;
      renderAll();
      return;
    }

    if (action === 'cancel') { edit = null; renderModal(); }
  });

  // ----- TYPING WHILE EDITING -----
  overlay.addEventListener('input', e => {
    const field = e.target.dataset.field;
    const row = e.target.closest('.log-edit-row');
    if (!field || !row || !edit || edit.type !== 'ex') return;
    edit.draft[Number(row.dataset.i)][field] = e.target.value;
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && openDate) closeModal(); });

  // refresh when you open this tab, close the pop-up when you leave
  document.addEventListener('pagechange', e => {
    if (e.detail !== 'datalog') { closeModal(); return; }
    openDate = null; edit = null;
    renderAll();
  });
})();