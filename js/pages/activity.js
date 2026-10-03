// ===== PAGE 5: ACTIVITY (gym calendar + automatic summary) =====
// Reads "history" (the same data as the Data Log). One gym day = any day that has saved exercises.

(function () {
  const root = document.getElementById('activity-root');
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today0 = new Date();
  let view = { y: today0.getFullYear(), m: today0.getMonth() };
  let openDay = null;     // yyyy-mm-dd of the day whose pop-up is open

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
  function dayKey(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function keyOf(y, m, d) { return y + '-' + p2(m + 1) + '-' + p2(d); }
  function parseKey(k) { const a = k.split('-'); return new Date(Number(a[0]), Number(a[1]) - 1, Number(a[2])); }
  function weekStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)); }

  function parseName(name) {
    const m = name.match(/^\s*([^:]+?)\s*:\s*(.*)$/);
    return { main: m ? m[1] : name, sub: m ? m[2] : '' };
  }

  // which day/preset a group of entries belongs to
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
    if (!names.length) return { main: 'Workout', sub: '', mains: ['Workout'] };
    const parts = names.map(parseName);
    return {
      main: parts.map(p => p.main).join(' + '),
      sub: parts.map(p => p.sub).filter(Boolean).join(' + '),
      mains: parts.map(p => p.main)
    };
  }

  // yyyy-mm-dd -> [ { date, entries } ]  (one item per finished workout)
  function buildDays() {
    const history = DB.load('history', []);
    const sessions = {};
    history.forEach(h => { (sessions[h.date] = sessions[h.date] || []).push(h); });
    const days = {};
    Object.keys(sessions).sort().forEach(iso => {
      const k = dayKey(new Date(iso));
      (days[k] = days[k] || []).push({ date: iso, entries: sessions[iso] });
    });
    return days;
  }

  // consecutive weeks that reached the weekly goal
  function weekStreaks(days, goal) {
    const counts = {};
    Object.keys(days).forEach(k => {
      const wk = dayKey(weekStart(parseKey(k)));
      counts[wk] = (counts[wk] || 0) + 1;
    });
    const thisWk = weekStart(new Date());

    let cur = 0;
    const w = new Date(thisWk);
    if ((counts[dayKey(w)] || 0) < goal) w.setDate(w.getDate() - 7);   // this week not over yet: don't break the streak
    while ((counts[dayKey(w)] || 0) >= goal) { cur++; w.setDate(w.getDate() - 7); }

    let best = 0, run = 0;
    const keys = Object.keys(counts).sort();
    if (keys.length) {
      for (const x = parseKey(keys[0]); x <= thisWk; x.setDate(x.getDate() + 7)) {
        if ((counts[dayKey(x)] || 0) >= goal) { run++; best = Math.max(best, run); } else { run = 0; }
      }
    }
    return { cur: cur, best: best };
  }

  // ----- DRAW THE PAGE -----
   // ----- DRAW THE PAGE -----
  function render() {
    const days = buildDays();
    const today = new Date();
    const tKey = dayKey(today);
    const y = view.y, m = view.m;
    const first = new Date(y, m, 1);
    const offset = (first.getDay() + 6) % 7;
    const dim = new Date(y, m + 1, 0).getDate();
    const title = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const isCurrent = y === today.getFullYear() && m === today.getMonth();

    // month navigation
    const nav = `
      <div class="cal-nav">
        <button class="cal-arrow" data-action="prev" aria-label="Previous month">←</button>
        <div class="cal-title">${title}</div>
        <button class="cal-arrow" data-action="next" aria-label="Next month">→</button>
        ${isCurrent ? '' : '<button class="btn small ghost" data-action="today">Today</button>'}
      </div>`;

    // calendar
    let cal = '<div class="cal"><div class="cal-head">' + DAYS.map(d => '<div>' + d.toUpperCase() + '</div>').join('') + '</div><div class="cal-grid">';
    for (let i = 0; i < offset; i++) cal += '<div class="cal-cell blank"></div>';

    let trained = 0, sets = 0;
    const split = {};

    for (let d = 1; d <= dim; d++) {
      const k = keyOf(y, m, d);
      const ds = days[k];
      const isToday = k === tKey;

      if (ds) {
        trained++;
        const mains = [];
        let exCount = 0;
        ds.forEach(s => {
          const lab = labelFor(s.entries);
          exCount += s.entries.length;
          s.entries.forEach(e => { sets += e.sets.length; });
          lab.mains.forEach(x => {
            if (!mains.includes(x)) mains.push(x);
            split[x] = (split[x] || 0) + 1;
          });
        });
        cal += `
          <button class="cal-cell gym ${isToday ? 'today' : ''}" data-day="${k}">
            <span class="cal-n">${d}</span>
            <span class="cal-bottom">
              <span class="cal-txt">${esc(mains.join(' + '))}</span>
              <span class="cal-sub">${exCount} exercise${exCount === 1 ? '' : 's'}</span>
            </span>
          </button>`;
      } else {
        cal += `
          <div class="cal-cell ${isToday ? 'today' : ''}">
            <span class="cal-n">${d}</span>
            <span class="cal-bottom"><span class="cal-none">No data</span></span>
          </div>`;
      }
    }

    const trailing = (7 - ((offset + dim) % 7)) % 7;
    for (let i = 0; i < trailing; i++) cal += '<div class="cal-cell blank"></div>';
    cal += '</div></div>';

    // month numbers
    const elapsed = isCurrent ? today.getDate() : (first > today ? 0 : dim);
    const avg = elapsed ? trained / Math.max(1, elapsed / 7) : 0;
    const rest = Math.max(0, elapsed - trained);
    const splitKeys = Object.keys(split).sort((a, b) => split[b] - split[a]).slice(0, 4);
    const splitMax = splitKeys.length ? split[splitKeys[0]] : 1;

    // this week (always about right now)
    const goal = Math.min(7, Math.max(1, DB.load('activityGoal', 4)));
    const ws = weekStart(today);
    let weekCount = 0;
    let dots = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + i);
      const k = dayKey(d);
      const on = !!days[k];
      if (on) weekCount++;
      dots += `<span class="wd ${on ? 'on' : ''} ${k === tKey ? 'today' : ''}">${DAYS[i][0]}</span>`;
    }

    // streaks, last workout, all time
    const streak = weekStreaks(days, goal);
    const allKeys = Object.keys(days).sort();
    const total = allKeys.length;
    let lastTxt = 'None yet', lastSub = '';
    if (total) {
      const lastDate = parseKey(allKeys[total - 1]);
      const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const diff = Math.round((t0 - lastDate) / 86400000);
      lastTxt = diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : diff + ' days ago';
      lastSub = lastDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    }
    const wdCounts = [0, 0, 0, 0, 0, 0, 0];
    allKeys.forEach(k => { wdCounts[(parseKey(k).getDay() + 6) % 7]++; });
    const favTxt = total ? DAYS[wdCounts.indexOf(Math.max(...wdCounts))] : '–';

    root.innerHTML = `
      <div class="act-layout">
        <div class="act-main">
          ${nav}
          ${cal}
        </div>

        <aside class="act-side">
          <div class="side-card">
            <div class="stat-k">${title}</div>
            <div class="mini-grid">
              <div class="mini"><div class="mini-v">${trained}</div><div class="mini-k">Days trained</div><div class="mini-s">${isCurrent ? 'of ' + elapsed + ' so far' : 'of ' + dim + ' days'}</div></div>
              <div class="mini"><div class="mini-v">${avg.toFixed(1)}</div><div class="mini-k">Avg / week</div><div class="mini-s">gym days</div></div>
              <div class="mini"><div class="mini-v">${sets}</div><div class="mini-k">Sets logged</div><div class="mini-s">this month</div></div>
              <div class="mini"><div class="mini-v">${rest}</div><div class="mini-k">Rest days</div><div class="mini-s">days off</div></div>
            </div>
          </div>

          <div class="side-card">
            <div class="side-row-head">
              <span class="stat-k">This week</span>
              <span class="week-count">${weekCount}<span class="stat-of"> / ${goal}</span></span>
            </div>
            <div class="week-dots">${dots}</div>
            <div class="goal-row">
              <span>Weekly goal</span>
              <button class="goal-btn" data-action="goal-down" aria-label="Lower goal">−</button>
              <b>${goal}</b>
              <button class="goal-btn" data-action="goal-up" aria-label="Raise goal">+</button>
            </div>
          </div>

          <div class="side-card">
            <div class="stat-k">Training split</div>
            ${splitKeys.length
              ? splitKeys.map(n => `
                  <div class="split-row">
                    <span>${esc(n)}</span>
                    <span class="split-track"><i style="width:${(split[n] / splitMax) * 100}%"></i></span>
                    <span class="split-n">${split[n]}</span>
                  </div>`).join('')
              : '<div class="stat-s">No sessions this month.</div>'}
          </div>

          <div class="side-card">
            <div class="li"><span>Week streak</span><b>${streak.cur} wk<small>best ${streak.best}</small></b></div>
            <div class="li"><span>Last workout</span><b>${lastTxt}${lastSub ? '<small>' + lastSub + '</small>' : ''}</b></div>
            <div class="li"><span>All time</span><b>${total} days<small>fav ${favTxt}</small></b></div>
          </div>
        </aside>
      </div>`;
  }

  // ----- DAY POP-UP -----
  function renderModal() {
    const ds = openDay ? buildDays()[openDay] : null;
    if (!ds) { openDay = null; overlay.style.display = 'none'; overlay.innerHTML = ''; return; }

    const all = [];
    ds.forEach(s => s.entries.forEach(e => all.push(e)));
    const lab = labelFor(all);
    const fullDate = parseKey(openDay).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div class="pm-panel">
        <div class="pm-top">
          <div>
            <div class="tile-date">${fullDate}</div>
            <div class="pm-day">${esc(lab.main)}</div>
            ${lab.sub ? `<div class="pm-sub">${esc(lab.sub)}</div>` : ''}
          </div>
          <button class="pm-close" data-action="close" aria-label="Close">×</button>
        </div>

        ${ds.map(s => {
          const sl = labelFor(s.entries);
          const time = new Date(s.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          return `
            <div class="section-label">${time} · ${esc(sl.main)}</div>
            ${s.entries.map(e => `
              <div class="log-ex">
                <div class="log-ex-top"><span class="log-ex-name">${esc(e.exName).replace(' - ', ' — ')}</span></div>
                <div class="log-sets">
                  ${e.sets.map((x, i) => `<span class="log-set">Set ${i + 1} · <b>${fmt(x.kg)}</b> kg × <b>${x.reps}</b></span>`).join('')}
                </div>
              </div>`).join('')}`;
        }).join('')}

        <div class="pm-actions">
          <button class="btn small" data-action="goto-log">Open in Data Log</button>
        </div>
      </div>`;
  }

  function openModal(k) {
    openDay = k;
    overlay.classList.add('opening');
    renderModal();
    setTimeout(() => overlay.classList.remove('opening'), 400);
  }
  function closeModal() { openDay = null; renderModal(); }

  // ----- CLICKS ON THE PAGE -----
  root.addEventListener('click', e => {
    const cell = e.target.closest('[data-day]');
    if (cell) { openModal(cell.dataset.day); return; }

    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    switch (btn.dataset.action) {
      case 'prev':
        view.m--; if (view.m < 0) { view.m = 11; view.y--; }
        render();
        break;
      case 'next':
        view.m++; if (view.m > 11) { view.m = 0; view.y++; }
        render();
        break;
      case 'today':
        view = { y: new Date().getFullYear(), m: new Date().getMonth() };
        render();
        break;
      case 'goal-up':
      case 'goal-down': {
        const g = Math.min(7, Math.max(1, DB.load('activityGoal', 4)));
        DB.save('activityGoal', Math.min(7, Math.max(1, g + (btn.dataset.action === 'goal-up' ? 1 : -1))));
        render();
        break;
      }
    }
  });

  // ----- CLICKS INSIDE THE POP-UP -----
  overlay.addEventListener('click', e => {
    if (e.target === overlay) { closeModal(); return; }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'close') closeModal();
    if (btn.dataset.action === 'goto-log') {
      closeModal();
      const tab = document.querySelector('.nav-btn[data-page="datalog"]');
      if (tab) tab.click();
    }
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && openDay) closeModal(); });

  // refresh whenever you open this tab (so it always matches your Data Log)
  document.addEventListener('pagechange', e => {
    if (e.detail !== 'activity') { closeModal(); return; }
    const n = new Date();
    view = { y: n.getFullYear(), m: n.getMonth() };
    openDay = null;
    render();
  });
})();