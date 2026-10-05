// ===== PAGE 2: PRESET BUILDER =====
// Data shape saved under "presets":
// [ { id, name, exercises: [ { id, name } ] } ]
// Page shows small square cards; clicking one opens a centred pop-up to edit it.

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
  
  // small styled pop-up with a list of buttons -> resolves to the chosen value, or null if cancelled
  function choose(cfg) {
    return new Promise(resolve => {
      const ov = document.createElement('div');
      ov.className = 'dlg-overlay';
      ov.innerHTML = `
        <div class="dlg info" role="dialog" aria-modal="true">
          <div class="dlg-title">${esc(cfg.title)}</div>
          <div class="dlg-actions" style="flex-direction:column;margin-top:20px;max-height:50vh;overflow-y:auto">
            ${cfg.options.map((o, i) => `<button class="btn" data-pick="${i}" style="flex:none;width:100%;height:auto;min-height:48px;white-space:normal">${esc(o.label)}</button>`).join('')}
            <button class="btn ghost" data-pick="cancel" style="flex:none;width:100%">Cancel</button>
          </div>
        </div>`;

      function close(v) {
        document.removeEventListener('keydown', onKey, true);
        ov.remove();
        resolve(v);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }   // closes only this pop-up
      }

      ov.addEventListener('click', e => {
        if (e.target === ov) { close(null); return; }
        const b = e.target.closest('[data-pick]');
        if (!b) return;
        close(b.dataset.pick === 'cancel' ? null : cfg.options[Number(b.dataset.pick)].value);
      });

      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(ov);
    });
  }

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
                <span>${dispName(e.name)}</span>
                <button class="ex-x" data-action="remove-ex" data-ex="${e.id}" aria-label="Remove">×</button>
              </li>`).join('')
            : '<li class="empty-note">No exercises yet</li>'}
        </ul>

        <div class="row">
          <input class="input" data-add-input="${p.id}" placeholder="Add exercise" maxlength="80">
          <button class="btn" data-action="add-ex">Add</button>
        </div>

        <div class="pm-actions">
          <button class="btn small" data-action="rename">Rename</button>
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
        const what = await choose({
          title: 'What do you want to rename?',
          options: [
            { label: 'Day name', value: 'day' },
            { label: 'Exercise name', value: 'ex' }
          ]
        });

        if (what === 'day') {
          const n = await UI.prompt({
            title: 'Rename preset',
            message: 'Example: Day 1 : Chest & Tricep (PUSH)',
            value: preset.name,
            placeholder: 'Preset name'
          });
          const live = presets.find(p => p.id === presetId);
          if (live && n && n.trim()) { live.name = n.trim(); save(); renderAll(); sfx('save'); }
        }

        if (what === 'ex') {
          if (!preset.exercises.length) {
            UI.alert({ title: 'No exercises yet', message: 'Add an exercise first, then you can rename it.' });
            break;
          }
          const exId = await choose({
            title: 'Which exercise?',
            options: preset.exercises.map(x => ({ label: x.name.replace(' - ', ' — '), value: x.id }))
          });
          if (!exId) break;

          const cur = (presets.find(p => p.id === presetId) || preset).exercises.find(x => x.id === exId);
          if (!cur) break;
          const n = await UI.prompt({
            title: 'Rename exercise',
            message: 'Example: Chest - Flat Benchpress',
            value: cur.name,
            placeholder: 'Exercise name'
          });

          const live = presets.find(p => p.id === presetId);
          const ex = live && live.exercises.find(x => x.id === exId);
          if (ex && n && n.trim()) {
            ex.name = n.trim().slice(0, 80);       // only the name changes, the id stays the same
            save(); renderAll(); sfx('save');
          }
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