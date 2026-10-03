// ===== PAGE 1: WORKOUT =====
// Saved data:
//   "session" = { loaded, loadedOn, presetIds, order, sets, exDone, finishedOn, summary }
//   "history" = [ { date, exId, exName, preset, sets: [ {reps, kg} ] } ]   (used by Progress, Data Log, Activity)
// One day = one preset group (e.g. Day 1 : Chest & Tricep).
// Tapping an exercise opens a centred pop-up with its sets.

(function () {
  const root = document.getElementById('workout-root');
  const DEFAULT_SETS = 4;
  let openEx = null;            // exercise whose centred pop-up is open
  let finishing = false;
  let justFinished = false;     // confetti only plays right after finishing
  let renderedKey = '';
  let suppressClickUntil = 0;   // stops the click that follows a drag from opening an exercise

  const sfx = (name, opts) => { try { if (window.SFX) SFX.play(name, opts); } catch (e) {} };

  // pop-up container for one exercise
  const exOverlay = document.createElement('div');
  exOverlay.className = 'pm-overlay';
  exOverlay.style.display = 'none';
  document.body.appendChild(exOverlay);

  const MESSAGES = [
    'Great work today. Every rep you just did is a step toward the stronger you.',
    'You showed up and did the work. That is exactly how progress is built.',
    'Strong session. Rest well, eat well, and come back even stronger.',
    'Another one done. Consistency like this changes everything.',
    'That is real discipline. Be proud of what you just did.'
  ];

  function fresh() {
    return { loaded: false, loadedOn: null, presetIds: [], order: [], sets: {}, exDone: {}, finishedOn: null, summary: null };
  }
  let state = Object.assign(fresh(), DB.load('session', {}));
  if (state.presetIds.length > 1) state.presetIds = [state.presetIds[0]];   // one group per day

  function save() { DB.save('session', state); }
  function allPresets() { return DB.load('presets', []); }

  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // display name: " - " is shown as " — " (the saved name is not changed)
  function dispName(n) { return esc(n).replace(' - ', ' — '); }

  const HANDLE_ICON = '<svg width="14" height="22" viewBox="0 0 14 22" fill="currentColor"><circle cx="3" cy="4" r="1.7"/><circle cx="11" cy="4" r="1.7"/><circle cx="3" cy="11" r="1.7"/><circle cx="11" cy="11" r="1.7"/><circle cx="3" cy="18" r="1.7"/><circle cx="11" cy="18" r="1.7"/></svg>';

  // ----- sidebar SESSION card -----
  function updateSidebar() {
    const box = document.getElementById('side-session');
    if (!box) return;
    const chosen = allPresets().filter(p => state.presetIds.includes(p.id));
    let title = 'No session', sub = 'Load a workout';
    if (chosen.length && state.loaded) {
      const parts = chosen.map(p => {
        const m = p.name.match(/^\s*([^:]+?)\s*:\s*(.*)$/);
        return {
          t: m ? m[1] : p.name,
          s: (m ? m[2] : '').replace(/\s*\([^)]*\)\s*$/, '').trim()
        };
      });
      title = parts.map(x => x.t).join(' + ');
      sub = parts.map(x => x.s).filter(Boolean).join(' + ') || ' ';
      if (state.finishedOn === todayKey()) sub = 'Finished ✓';
    }
    box.innerHTML = '<div class="side-label">Session</div><div class="side-title">' + esc(title) +
                    '</div><div class="side-sub">' + esc(sub) + '</div>';
  }

  // ----- exercises from the chosen preset, in your saved order -----
  function currentExercises() {
    const found = [];
    const seen = new Set();
    allPresets().filter(p => state.presetIds.includes(p.id)).forEach(p => {
      p.exercises.forEach(e => {
        if (!seen.has(e.id)) { seen.add(e.id); found.push(e); }
      });
    });
    const byId = {};
    found.forEach(e => { byId[e.id] = e; });

    const ordered = state.order.filter(id => byId[id]).map(id => byId[id]);
    found.forEach(e => { if (!state.order.includes(e.id)) ordered.push(e); });

    state.order = ordered.map(e => e.id);
    return ordered;
  }

  function getSets(exId) {
    if (!state.sets[exId]) {
      state.sets[exId] = Array.from({ length: DEFAULT_SETS }, () => ({ reps: '', kg: '', done: false }));
    }
    return state.sets[exId];
  }

  function allTicked(exId) {
    const s = getSets(exId);
    return s.length > 0 && s.every(x => x.done);
  }

  // true if you already typed or ticked anything in the current session
  function hasProgress() {
    return Object.keys(state.sets).some(id => state.sets[id].some(s => s.done || s.reps !== '' || s.kg !== ''));
  }

  // what you did the last time you finished this exercise
  function lastTime(exId) {
    const history = DB.load('history', []);
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].exId === exId) return history[i].sets;
    }
    return null;
  }

  // ----- HEADER: day name, date, year -----
  function todayHeader() {
    const d = new Date();
    return `
      <div class="today">
        <div class="today-day">${d.toLocaleDateString('en-GB', { weekday: 'long' })}</div>
        <div class="today-date">${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</div>
        <div class="today-year">${d.getFullYear()}</div>
      </div>`;
  }

  // ----- ONE EXERCISE BAR (compact; sets live in the pop-up) -----
  function exerciseCard(e) {
    const sets = getSets(e.id);
    const done = sets.filter(s => s.done).length;
    const isDone = !!state.exDone[e.id];

    return `
      <div class="ex-card glass ${isDone ? 'finished' : 'todo'}" data-ex="${e.id}">
        <div class="ex-top" data-action="open-ex">
          <span class="handle" data-handle>${HANDLE_ICON}</span>
          <span class="ex-name">${dispName(e.name)}</span>
          <span class="ex-bar"><i style="width:${isDone ? 100 : (sets.length ? (done / sets.length) * 100 : 0)}%"></i></span>
          <span class="ex-count">${isDone ? 'Done ✓' : done + '/' + sets.length}</span>
        </div>
      </div>`;
  }

  // update one bar without redrawing the page
  function refreshCard(card) {
    const id = card.dataset.ex;
    const sets = getSets(id);
    const ticked = sets.filter(s => s.done).length;
    const isDone = !!state.exDone[id];
    card.classList.toggle('finished', isDone);
    card.classList.toggle('todo', !isDone);
    card.querySelector('.ex-count').textContent = isDone ? 'Done ✓' : ticked + '/' + sets.length;
    card.querySelector('.ex-bar i').style.width = (isDone ? 100 : (sets.length ? (ticked / sets.length) * 100 : 0)) + '%';
  }

  function updateProgress() {
    const ex = currentExercises();
    const n = ex.filter(e => state.exDone[e.id]).length;
    const bar = document.getElementById('wk-prog-bar');
    const txt = document.getElementById('wk-prog-text');
    if (bar) bar.style.width = (ex.length ? (n / ex.length) * 100 : 0) + '%';
    if (txt) txt.textContent = n + ' of ' + ex.length + ' exercises done';
  }

  // bar + progress + pop-up header + save, all in one go
  function syncUI(id) {
    const card = root.querySelector('.ex-card[data-ex="' + id + '"]');
    if (card) refreshCard(card);
    updateProgress();
    updateExModal();
    save();
  }

  // ----- THE CENTRED EXERCISE POP-UP -----
  function setRowsHTML(id) {
    const sets = getSets(id);
    const last = lastTime(id);
    return sets.map((s, i) => `
      <div class="set-row ${s.done ? 'done' : ''}" data-set="${i}">
        <span class="set-n">Set ${i + 1}</span>
        <input class="input num" type="number" inputmode="numeric" min="0" data-field="reps"
               value="${s.reps}" placeholder="${last && last[i] ? last[i].reps : '-'}">
        <input class="input num" type="number" inputmode="decimal" min="0" step="0.5" data-field="kg"
               value="${s.kg}" placeholder="${last && last[i] ? last[i].kg : '-'}">
        <button class="tick ${s.done ? 'on' : ''}" data-action="tick" aria-label="Set done"></button>
      </div>`).join('');
  }

  function renderExModal() {
    const list = currentExercises();
    const ex = list.find(e => e.id === openEx);
    if (!ex) { openEx = null; exOverlay.style.display = 'none'; exOverlay.innerHTML = ''; return; }

    const sets = getSets(ex.id);
    const ticked = sets.filter(s => s.done).length;
    const isDone = !!state.exDone[ex.id];
    const idx = list.findIndex(e => e.id === ex.id) + 1;

    exOverlay.style.display = 'flex';
    exOverlay.innerHTML = `
      <div class="pm-panel ex-panel ${isDone ? 'finished' : 'todo'}" data-ex="${ex.id}">
        <div class="pm-top">
          <div>
            <div class="tile-date">Exercise ${idx} of ${list.length}</div>
            <div class="pm-day ex-title">${dispName(ex.name)}</div>
            <div class="pm-sub" id="xp-sub">${isDone ? 'Finished ✓ · ' + ticked + ' of ' + sets.length + ' sets' : ticked + ' of ' + sets.length + ' sets done'}</div>
          </div>
          <button class="pm-close" data-action="x-close" aria-label="Close">×</button>
        </div>

        <div class="ex-prog"><i id="xp-bar" style="width:${sets.length ? (ticked / sets.length) * 100 : 0}%"></i></div>

        <div class="set-head"><span></span><span>Reps</span><span>Kg</span><span></span></div>
        ${setRowsHTML(ex.id)}

        <div class="set-actions ex-actions">
          <button class="btn small" data-action="add-set">+ Add set</button>
          <button class="btn small" data-action="remove-set">− Remove last set</button>
        </div>

        <div class="pm-actions">
          <button class="btn" data-action="x-close">Close</button>
          <button class="btn primary" id="xp-done" data-action="ex-done">${isDone ? 'Reopen exercise' : 'Finish exercise'}</button>
        </div>
      </div>`;
  }

  // refresh just the header parts of the open pop-up (keeps your typing focus)
  function updateExModal() {
    if (!openEx) return;
    const panel = exOverlay.querySelector('.ex-panel');
    if (!panel) return;
    const sets = getSets(openEx);
    const ticked = sets.filter(s => s.done).length;
    const isDone = !!state.exDone[openEx];
    panel.classList.toggle('finished', isDone);
    panel.classList.toggle('todo', !isDone);
    const sub = panel.querySelector('#xp-sub');
    const bar = panel.querySelector('#xp-bar');
    const btn = panel.querySelector('#xp-done');
    if (sub) sub.textContent = isDone ? 'Finished ✓ · ' + ticked + ' of ' + sets.length + ' sets' : ticked + ' of ' + sets.length + ' sets done';
    if (bar) bar.style.width = (sets.length ? (ticked / sets.length) * 100 : 0) + '%';
    if (btn) btn.textContent = isDone ? 'Reopen exercise' : 'Finish exercise';
  }

  function openExModal(id) {
    openEx = id;
    exOverlay.classList.add('opening');
    renderExModal();
    setTimeout(() => exOverlay.classList.remove('opening'), 400);
    sfx('open');
  }
  function closeEx() { openEx = null; renderExModal(); }

  // an exercise just became finished
  function afterComplete(id) {
    const ex = currentExercises();
    const everyDone = ex.length && ex.every(e => state.exDone[e.id]);
    if (everyDone) { closeEx(); checkAllDone(); return; }          // the big finish sound takes over
    sfx('exdone');
    setTimeout(() => { if (openEx === id && state.exDone[id]) closeEx(); }, 800);
  }

  // ----- FINISHED SCREEN -----
  function finishedScreen() {
    const s = state.summary || { exercises: 0, sets: 0, msg: 0 };
    return `
      <div class="confetti-box"></div>
      <div class="done-screen">
        <div class="done-rings">
          <span></span><span></span><span></span>
          <svg class="done-check" viewBox="0 0 52 52" width="96" height="96">
            <circle class="dc-circle" cx="26" cy="26" r="24"/>
            <path class="dc-tick" d="M14 27 l8 8 l16 -18"/>
          </svg>
        </div>
        <h2 class="done-title">Workout finished for today</h2>
        <p class="done-msg">${MESSAGES[s.msg % MESSAGES.length]}</p>
        <div class="done-stats">
          <span><b>${s.exercises}</b> exercise${s.exercises === 1 ? '' : 's'}</span>
          <span><b>${s.sets}</b> set${s.sets === 1 ? '' : 's'}</span>
        </div>
        <button class="btn small ghost" data-action="again">Start another workout</button>
      </div>`;
  }

  function launchConfetti() {
    const box = root.querySelector('.confetti-box');
    if (!box) return;
    const colors = ['#a66bff', '#c49bff', '#34d399', '#6ee7b7', '#ffffff'];
    for (let i = 0; i < 36; i++) {
      const p = document.createElement('i');
      p.className = 'confetti';
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 0.8) + 's';
      p.style.animationDuration = (2.2 + Math.random() * 1.8) + 's';
      p.style.setProperty('--drift', (Math.random() * 120 - 60) + 'px');
      box.appendChild(p);
    }
  }

  // ----- DRAW THE PAGE -----
  function render() {
    const key = todayKey();
    renderedKey = key;

    // new day: forget yesterday's finished screen
    if (state.finishedOn && state.finishedOn !== key) state = fresh();
    // new day and nothing logged yet: start over at the big button
    if (state.loaded && state.loadedOn !== key && !hasProgress()) state = fresh();
    updateSidebar();

    let html = todayHeader();

    // 1) workout already finished today
    if (state.finishedOn === key) {
      root.innerHTML = html + finishedScreen();
      if (justFinished) { launchConfetti(); justFinished = false; }
      save();
      return;
    }

    // 2) nothing loaded yet -> big button
    if (!state.loaded) {
      root.innerHTML = html + `
        <div class="start-wrap">
          <button class="btn start-btn" data-action="load-today">Load Exercise for Today</button>
        </div>`;
      save();
      return;
    }

    // 3) pick today's group, then show only that group's exercises
    const presets = allPresets();
    const exercises = currentExercises();
    const chosen = presets.find(p => state.presetIds.includes(p.id));

    if (!presets.length) {
      html += '<div class="card glass empty-note">No presets yet. Build one on the Presets page first.</div>';
    } else if (!chosen) {
      html += `
        <div class="card glass chips-card">
          <div class="section-label">Load preset(s)</div>
          <div class="chips">
            ${presets.map(p => `<button class="chip" data-preset="${p.id}">${esc(p.name)}</button>`).join('')}
          </div>
        </div>`;
    } else {
      html += `
        <div class="card glass chips-card">
          <div class="section-label">Today's workout</div>
          <div class="chips">
            <span class="chip on locked">${esc(chosen.name)}</span>
            <button class="btn small ghost" data-action="change-day">Change</button>
          </div>
        </div>`;
    }

    if (chosen && exercises.length) {
      const n = exercises.filter(e => state.exDone[e.id]).length;
      html += `
        <div class="wk-prog-wrap">
          <div class="wk-prog"><div class="wk-prog-bar" id="wk-prog-bar" style="width:${(n / exercises.length) * 100}%"></div></div>
          <span id="wk-prog-text">${n} of ${exercises.length} exercises done</span>
        </div>`;
      html += '<div class="hint">Hold any exercise and drag to reorder. Tap one to log its sets.</div>';
      html += '<div class="wk-list" id="wk-list">' + exercises.map(exerciseCard).join('') + '</div>';
      html += '<button class="btn finish" data-action="finish">Finish Workout</button>';
    } else if (presets.length && !chosen) {
      html += '<div class="hint">Tap a preset above to load its exercises.</div>';
    }

    root.innerHTML = html;
    save();
  }

  // ----- FINISH WORKOUT -----
  function checkAllDone() {
    const ex = currentExercises();
    if (ex.length && ex.every(e => state.exDone[e.id]) && !finishing) {
      finishing = true;
      setTimeout(() => finish(true), 700);
    }
  }

  function playVanish(done) {
    const items = root.querySelectorAll('.chips-card, .wk-prog-wrap, .hint, .ex-card, .finish');
    items.forEach((el, i) => {
      el.style.animationDelay = (i * 70) + 'ms';
      el.classList.add('vanish');
    });
    setTimeout(done, items.length * 70 + 700);
  }

  function finish(auto) {
    const exercises = currentExercises();

    // auto-finish only if everything is still marked done
    if (auto && !(exercises.length && exercises.every(e => state.exDone[e.id]))) { finishing = false; return; }

    const date = new Date().toISOString();
    const history = DB.load('history', []);
    let savedExercises = 0, savedSets = 0;
    const chosen = allPresets().filter(p => state.presetIds.includes(p.id));

    exercises.forEach(e => {
      const sets = getSets(e.id)
        .filter(s => s.done && s.reps !== '')
        .map(s => ({ reps: Number(s.reps), kg: Number(s.kg) || 0 }));
      if (sets.length) {
        const owner = chosen.find(p => p.exercises.some(x => x.id === e.id));
        history.push({ date: date, exId: e.id, exName: e.name, preset: owner ? owner.name : '', sets: sets });
        savedExercises++;
        savedSets += sets.length;
      }
    });

    if (!savedExercises) {
      finishing = false;
      sfx('error');
      UI.alert({ title: 'Nothing to save yet', message: 'Tick at least one set (with reps) first, then finish your workout.' });
      return;
    }

    DB.save('history', history);
    closeEx();
    sfx('finish');

    state.summary = { exercises: savedExercises, sets: savedSets, msg: Math.floor(Math.random() * MESSAGES.length) };
    state.sets = {};
    state.exDone = {};
    state.finishedOn = todayKey();
    justFinished = true;
    save();

    playVanish(() => { finishing = false; render(); });
  }

  // ----- CLICKS ON THE PAGE -----
  root.addEventListener('click', async e => {
    if (performance.now() < suppressClickUntil) return;      // this click was the end of a drag
    if (e.target.closest('[data-handle]')) return;           // the dots are for dragging only

    // choose today's group (the other groups then disappear)
    const chip = e.target.closest('[data-preset]');
    if (chip) {
      state.presetIds = [chip.dataset.preset];
      state.order = [];
      state.sets = {};
      state.exDone = {};
      save(); render();
      sfx('load');
      return;
    }

    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'load-today') { state.loaded = true; state.loadedOn = todayKey(); save(); render(); sfx('boot'); return; }
    if (action === 'again')      { state = fresh(); save(); render(); sfx('boot'); return; }
    if (action === 'finish')     { finish(false); return; }

    if (action === 'change-day') {
      if (hasProgress()) {
        const yes = await UI.confirm({
          title: 'Switch to a different day?',
          message: 'The sets you already entered for today will be cleared.',
          okText: 'Switch day'
        });
        if (!yes) return;
      }
      state.presetIds = []; state.order = []; state.sets = {}; state.exDone = {};
      save(); render();
      sfx('close');
      return;
    }

    if (action === 'open-ex') {
      const card = btn.closest('.ex-card');
      if (card) openExModal(card.dataset.ex);
    }
  });

  // ----- CLICKS INSIDE THE EXERCISE POP-UP -----
  exOverlay.addEventListener('click', async e => {
    if (e.target === exOverlay) { closeEx(); return; }       // click outside the panel

    const btn = e.target.closest('[data-action]');
    if (!btn || !openEx) return;
    const action = btn.dataset.action;
    const id = openEx;

    if (action === 'x-close') { closeEx(); return; }

    if (action === 'add-set') {
      getSets(id).push({ reps: '', kg: '', done: false });
      state.exDone[id] = false;
      sfx('add');
      renderExModal();
      syncUI(id);
      return;
    }

    if (action === 'remove-set') {
      const sets = getSets(id);
      if (sets.length <= 1) return;
      const lastSet = sets[sets.length - 1];
      const hasData = lastSet.done || lastSet.reps !== '' || lastSet.kg !== '';
      if (hasData) {
        const yes = await UI.confirm({
          title: 'Remove set ' + sets.length + '?',
          message: 'The reps and kg you entered for this set will be lost.',
          okText: 'Remove set'
        });
        if (!yes || openEx !== id) return;
      }
      sets.pop();
      sfx('remove');
      renderExModal();
      if (allTicked(id)) { state.exDone[id] = true; syncUI(id); afterComplete(id); }
      else { syncUI(id); }
      return;
    }

    if (action === 'ex-done') {
      if (state.exDone[id]) {
        state.exDone[id] = false;
        sfx('untick', { n: 1 });
        syncUI(id);
      } else {
        if (!getSets(id).some(s => s.done)) {
          sfx('deny');
          const r = exOverlay.querySelector('[data-field="reps"]');
          if (r) r.focus();                                  // tick at least one set first
          return;
        }
        state.exDone[id] = true;
        syncUI(id);
        afterComplete(id);
      }
      return;
    }

    if (action === 'tick') {
      const row = btn.closest('.set-row');
      const sets = getSets(id);
      const s = sets[Number(row.dataset.set)];
      if (!s.done && s.reps === '') {                        // need reps first
        sfx('deny');
        row.querySelector('[data-field="reps"]').focus();
        return;
      }

      s.done = !s.done;
      row.classList.toggle('done', s.done);
      btn.classList.toggle('on', s.done);

      if (s.done && allTicked(id)) {
        state.exDone[id] = true;
        syncUI(id);
        afterComplete(id);
      } else {
        if (!s.done) state.exDone[id] = false;
        syncUI(id);
        sfx(s.done ? 'tick' : 'untick', { n: sets.filter(x => x.done).length });
      }
    }
  });

  // ----- TYPING REPS / KG (inside the pop-up) -----
  exOverlay.addEventListener('input', e => {
    const field = e.target.dataset.field;
    if (!field || !openEx) return;
    const row = e.target.closest('.set-row');
    getSets(openEx)[Number(row.dataset.set)][field] = e.target.value;
    save();
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && openEx) closeEx(); });

  // =====================================================================
  //  DRAG TO REORDER  (hold anywhere on an exercise bar, then drag)
  //  - the bar lifts and follows your finger/cursor with a soft spring
  //  - a dashed placeholder shows where it will land
  //  - the other bars glide aside (FLIP animation)
  //  - on release the bar settles into its slot
  // =====================================================================

  // remember where every bar is right now
  function snapshot(list) {
    const m = new Map();
    list.querySelectorAll('.ex-card:not(.dragging)').forEach(c => m.set(c, c.getBoundingClientRect()));
    return m;
  }

  // animate every bar from its old position to its new one
  function playFlip(first) {
    first.forEach((f, c) => {
      c.style.transition = 'none';
      c.style.transform = '';
      const l = c.getBoundingClientRect();
      const dx = f.left - l.left, dy = f.top - l.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) { c.style.transition = ''; return; }
      c.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      c.getBoundingClientRect();                                     // lock in the start position
      c.style.transition = 'transform .34s cubic-bezier(.22,.9,.28,1)';
      c.style.transform = '';
      clearTimeout(c._flipT);
      c._flipT = setTimeout(() => { c.style.transition = ''; }, 360);
    });
  }

  // when does a press turn into a drag?
  root.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const top = e.target.closest('.ex-top');
    if (!top) return;
    const card = top.closest('.ex-card');
    const list = document.getElementById('wk-list');
    if (!card || !list || list.classList.contains('reordering')) return;

    const onHandle = !!e.target.closest('[data-handle]');
    const isTouch = e.pointerType !== 'mouse';
    const sx = e.clientX, sy = e.clientY;
    let cx = sx, cy = sy, started = false, timer = null;

    function stopWaiting() {
      clearTimeout(timer);
      window.removeEventListener('pointermove', onPre);
      window.removeEventListener('pointerup', stopWaiting);
      window.removeEventListener('pointercancel', stopWaiting);
    }
    function begin() {
      if (started) return;
      started = true;
      stopWaiting();
      startDrag(card, cx, cy);
    }
    function onPre(ev) {
      cx = ev.clientX; cy = ev.clientY;
      if (Math.hypot(cx - sx, cy - sy) > (isTouch ? 10 : 4)) {
        if (isTouch && !onHandle) stopWaiting();     // the finger is scrolling the page, not dragging
        else begin();
      }
    }

    window.addEventListener('pointermove', onPre);
    window.addEventListener('pointerup', stopWaiting);
    window.addEventListener('pointercancel', stopWaiting);

    if (onHandle) { e.preventDefault(); begin(); }               // the dots start instantly
    else timer = setTimeout(begin, isTouch ? 200 : 260);         // anywhere else: press and hold
  });

  function startDrag(card, startX, startY) {
    const list = document.getElementById('wk-list');
    if (!list) return;
    const stage = document.querySelector('.stage');
    const cs = getComputedStyle(list);
    const scroller = (cs.overflowY === 'auto' || cs.overflowY === 'scroll') ? list : stage;

    // 1) leave a placeholder where this bar was, lift the bar out
    const first = snapshot(list);
    first.delete(card);
    const rect0 = card.getBoundingClientRect();

    list.classList.add('reordering');

    const h = card.offsetHeight;
    const ph = document.createElement('div');
    ph.className = 'ex-placeholder';
    ph.style.height = h + 'px';
    list.insertBefore(ph, card);
    const w = ph.offsetWidth;

    const gx = Math.min(Math.max(startX - rect0.left, 16), w - 16);   // where you grabbed the bar
    const gy = Math.min(Math.max(startY - rect0.top, 12), h - 12);

    card.classList.add('dragging');
    card.style.cssText =
      'position:fixed; left:0; top:0; margin:0; z-index:1000; pointer-events:none; will-change:transform;' +
      'width:' + w + 'px; height:' + h + 'px; transition: box-shadow .2s ease, border-color .2s ease;';

    let x = startX, y = startY;
    let cx = x - gx, cy = y - gy, lift = 0, raf = 0;
    card.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)';

    document.body.classList.add('is-dragging');
    if (navigator.vibrate) navigator.vibrate(8);
    sfx('lift');
    playFlip(first);

    function nextSib(el) {
      let n = el.nextElementSibling;
      if (n === card) n = n.nextElementSibling;
      return n;
    }
    function movePlaceholder(beforeNode) {
      if (beforeNode === ph || nextSib(ph) === beforeNode) return;
      const f = snapshot(list);
      list.insertBefore(ph, beforeNode);
      playFlip(f);
    }

    function onMove(ev) { x = ev.clientX; y = ev.clientY; }
    function blockTouch(ev) { ev.preventDefault(); }                    // stops the page scrolling while dragging

    function loop() {
      // soft spring towards the pointer, a little lift and tilt
      const tx = x - gx, ty = y - gy;
      cx += (tx - cx) * 0.34;
      cy += (ty - cy) * 0.34;
      lift += (1 - lift) * 0.22;
      const tilt = Math.max(-4, Math.min(4, (tx - cx) * 0.07));
      card.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0) scale(' +
                             (1 + 0.035 * lift).toFixed(3) + ') rotate(' + tilt.toFixed(2) + 'deg)';

      // scroll when you drag near the top or bottom edge
      const sr = scroller.getBoundingClientRect();
      if (y < sr.top + 56) scroller.scrollTop -= Math.min(18, Math.ceil((56 - (y - sr.top)) / 4));
      else if (y > sr.bottom - 56) scroller.scrollTop += Math.min(18, Math.ceil((56 - (sr.bottom - y)) / 4));

      // which slot is the pointer over? (uses layout positions, so it ignores animations in progress)
      const lr = list.getBoundingClientRect();
      const px = x - lr.left + list.scrollLeft;
      const py = y - lr.top + list.scrollTop;
      const items = Array.from(list.children).filter(k => k !== card);
      let target = null;
      for (const o of items) {
        if (o === ph) continue;
        if (px >= o.offsetLeft && px <= o.offsetLeft + o.offsetWidth &&
            py >= o.offsetTop && py <= o.offsetTop + o.offsetHeight) { target = o; break; }
      }
      if (target) {
        movePlaceholder(items.indexOf(ph) < items.indexOf(target) ? nextSib(target) : target);
      } else if (items.length > 1) {
        const firstEl = items[0], lastEl = items[items.length - 1];
        if (py < firstEl.offsetTop) movePlaceholder(firstEl);
        else if (py > lastEl.offsetTop + lastEl.offsetHeight ||
                 (py >= lastEl.offsetTop && px > lastEl.offsetLeft + lastEl.offsetWidth)) movePlaceholder(null);
      }

      raf = requestAnimationFrame(loop);
    }

    function onEnd() {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      window.removeEventListener('touchmove', blockTouch);
      suppressClickUntil = performance.now() + 450;

      // settle into the placeholder
      const pr = ph.getBoundingClientRect();
      card.style.transition = 'transform .3s cubic-bezier(.22,.9,.28,1), box-shadow .3s ease';
      card.style.transform = 'translate3d(' + pr.left + 'px,' + pr.top + 'px,0) scale(1) rotate(0deg)';
      sfx('drop');

      setTimeout(() => {
        list.insertBefore(card, ph);
        ph.remove();
        card.classList.remove('dragging');
        card.removeAttribute('style');
        list.classList.remove('reordering');
        document.body.classList.remove('is-dragging');
        state.order = Array.from(list.querySelectorAll('.ex-card')).map(c => c.dataset.ex);
        save();
      }, 310);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    window.addEventListener('touchmove', blockTouch, { passive: false });
    loop();
  }

  // refresh when you open this tab, and when the date rolls over at midnight
   document.addEventListener('pagechange', e => {
    if (e.detail === 'workout') {
      state = Object.assign(fresh(), DB.load('session', {}));      // pick up changes from other devices
      if (state.presetIds.length > 1) state.presetIds = [state.presetIds[0]];
      render();
    } else closeEx();
  });
  setInterval(() => {
    const active = document.getElementById('page-workout').classList.contains('active');
    if (active && todayKey() !== renderedKey) render();
  }, 30000);

  render();
})();