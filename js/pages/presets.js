// ===== PAGE 2: PRESET BUILDER =====
// Data shape saved under "presets":
// [ { id, name, exercises: [ { id, name } ] } ]
// Page shows small square cards; clicking one opens a centred pop-up to edit it.
// Renaming a day or an exercise also updates old saved workouts ("history"), so every page matches.

(function () {
  let presets = DB.load('presets', []);
  let openId = null;     // which preset's pop-up is open

  const root = document.getElementById('presets-root');
  const nameInput = document.getElementById('preset-name');
  const createBtn = document.getElementById('preset-create');

  if (!root || !nameInput || !createBtn) {
    console.error('Presets page: presets-root / preset-name / preset-create not found in index.html');
    return;
  }

  const sfx = name => { try { if (window.SFX) SFX.play(name); } catch (e) {} };

  // pop-up container (lives on the page body so it can sit above everything)
  const overlay = document.createElement('div');
  overlay.className = 'pm-overlay';
  overlay.style.display = 'none';
  document.body.appendChild(overlay);

  function save() { DB.save('presets', presets); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function dispName(n) { return esc(n).replace(' - ', ' — '); }

  // "Day 1 : Chest & Tricep (PUSH)"  ->  main "Day 1", sub "Chest & Tricep (PUSH)"
  function parseName(name) {
    const m = name.match(/^\s*([^:]+?)\s*:\s*(.*)$/);
    return { main: m ? m[1] : name, sub: m ? m[2] : '' };
  }

  // ----- THE SQUARE CARDS -----
  function renderGrid() {
    if (!presets.length) {
      root.innerHTML = '<div class="card glass empty-note">No presets yet. Create your first one above (for example: Day 1 : Chest &amp; Tricep).</div>';
      return;
    }

    root.innerHTML = '<div class="hint">Tap a day to view or edit its exercises.</div>' +
      '<div class="preset-grid">' + presets.map(p => {
        const n = parseName(p.name);
        const c = p.exercises.length;
        return `
          <button class="preset-tile" data-open="${p.id}">
            <div>
              <div class="tile-day">${esc(n.main)}</div>
              ${n.sub ? `<div class="tile-sub">${esc(n.sub)}</div>` : ''}
            </div>
            <div class="tile-foot">
              <span class="tile-count">${c} exercise${c === 1 ? '' : 's'}</span>
              <span class="tile-arrow">›</span>
            </div>
          </button>`;
      }).join('') + '</div>';
  }

  // ----- THE CENTRED POP-UP -----
  function renderModal() {
    const p = presets.find(x => x.id === openId);
    if (!p) { overlay.style.display = 'none'; overlay.innerHTML = ''; return; }

    const n = parseName(p.name);
    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div class="pm-panel" data-id="${p.id}">
        <div class="pm-top">
          <div>
            <div class="pm-day">${esc(n.main)}</div>
            ${n.sub ? `<div class="pm-sub">${esc(n.sub)}</div>` : ''}
          </div>
          <button class="pm-close" data-action="close" aria-label="Close">×</button>
        </div>

        <div class="section-label">Exercises (${p.exercises.length})</div>
        <ul class="ex-list">
          ${p.exercises.length
            ? p.exercises.map(e => `
              <li class="ex-item">
                <span class="ex-label">${dispName(e.name)}</span>
                <span class="ex-acts">
                  <button class="ex-edit" data-action="rename-ex" data-ex="${e.id}" aria-label="Rename exercise">✎</button>
                  <button class="ex-x" data-action="remove-ex" data-ex="${e.id}" aria-label="Remove">×</button>
                </span>
              </li>`).join('')
            : '<li class="empty-note">No exercises yet</li>'}
        </ul>

        <div class="row">
          <input class="input" data-add-input="${p.id}" placeholder="Add exercise" maxlength="80">
          <button class="btn" data-action="add-ex">Add</button>
        </div>

        <div class="pm-actions">
          <button class="btn small" data-action="rename">Rename day</button>
          <button class="btn small danger" data-action="delete">Delete preset</button>
        </div>
      </div>`;
  }

  function renderAll() { renderGrid(); renderModal(); }

  function openModal(id) {
    openId = id;
    overlay.classList.add('opening');          // pop-in animation only on first open
    renderModal();
    setTimeout(() => overlay.classList.remove('opening'), 400);
  }
  function closeModal() { openId = null; renderModal(); }

  // ----- ACTIONS -----
  function createPreset() {
    const name = nameInput.value.trim();
    if (!name) return;
    const p = { id: DB.uid(), name: name, exercises: [] };
    presets.push(p);
    nameInput.value = '';
    save();
    sfx('save');
    renderGrid();
    openModal(p.id);                            // open it so you can add exercises right away
  }

  function addExercise(presetId) {
    const input = overlay.querySelector('[data-add-input]');
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;
    presets.find(p => p.id === presetId).exercises.push({ id: DB.uid(), name: name });
    save();
    renderAll();
    const next = overlay.querySelector('[data-add-input]');
    if (next) next.focus();                     // ready for the next exercise
  }

  // ----- EVENTS -----
  createBtn.addEventListener('click', createPreset);
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') createPreset(); });

  // click a square card
  root.addEventListener('click', e => {
    const tile = e.target.closest('[data-open]');
    if (tile) openModal(tile.dataset.open);
  });

  // inside the pop-up
  overlay.addEventListener('click', async e => {
    if (e.target === overlay) { closeModal(); return; }       // click outside the panel

    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const preset = presets.find(p => p.id === openId);
    if (!preset) return;

    switch (btn.dataset.action) {
      case 'close':
        closeModal();
        break;
      case 'add-ex':
        addExercise(preset.id);
        break;
      case 'remove-ex':
        preset.exercises = preset.exercises.filter(x => x.id !== btn.dataset.ex);
        save(); renderAll();
        break;
      case 'rename': {
        const presetId = preset.id;
        const n = await UI.prompt({
          title: 'Rename day',
          message: 'Example: Day 1 : Chest & Tricep (PUSH)',
          value: preset.name,
          placeholder: 'Preset name'
        });
        const live = presets.find(p => p.id === presetId);
        if (live && n && n.trim() && n.trim() !== live.name) {
          const oldName = live.name;
          live.name = n.trim();
          save();

          // update old workouts so the Data Log and Activity show the new day name
          const hist = DB.load('history', []);
          let touched = false;
          hist.forEach(h => { if (h.preset === oldName) { h.preset = live.name; touched = true; } });
          if (touched) DB.save('history', hist);

          renderAll(); sfx('save');
        }
        break;
      }
      case 'rename-ex': {
        const presetId = preset.id;
        const exId = btn.dataset.ex;
        const cur = preset.exercises.find(x => x.id === exId);
        if (!cur) break;
        const n = await UI.prompt({
          title: 'Rename exercise',
          message: 'Example: Chest - Flat Benchpress',
          value: cur.name,
          placeholder: 'Exercise name'
        });
        const live = presets.find(p => p.id === presetId);
        const ex = live && live.exercises.find(x => x.id === exId);
        if (ex && n && n.trim() && n.trim().slice(0, 80) !== ex.name) {
          ex.name = n.trim().slice(0, 80);       // the id stays the same
          save();

          // update every old workout that used this exercise
          const hist = DB.load('history', []);
          let touched = false;
          hist.forEach(h => { if (h.exId === exId) { h.exName = ex.name; touched = true; } });
          if (touched) DB.save('history', hist);

          renderAll(); sfx('save');
        }
        break;
      }
      case 'delete': {
        const yes = await UI.confirm({
          title: 'Delete this preset?',
          message: '"' + preset.name + '" and all its exercises will be removed. Your saved workout history is not affected.',
          okText: 'Delete preset'
        });
        if (yes) {
          presets = presets.filter(p => p.id !== preset.id);
          save();
          sfx('delete');
          closeModal();
          renderGrid();
        }
        break;
      }
    }
  });

  overlay.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.dataset.addInput) addExercise(e.target.dataset.addInput);
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && openId) closeModal(); });

  // when you leave this tab, close the pop-up; when you come back, refresh
  document.addEventListener('pagechange', e => {
    if (e.detail !== 'presets') closeModal();
    else { presets = DB.load('presets', []); renderGrid(); }
  });

  renderGrid();
})();