// ===== PAGE 3: PROGRESS (PROGRESSIVE OVERLOAD) =====
// Reads "history" saved by Page 1:
//   [ { date, exId, exName, sets: [ {reps, kg} ] } ]

(function () {
  const root = document.getElementById('progress-root');
  const DAY = 86400000;

  const RANGES = {
    '1m': { label: '1 Month',  short: '1M', days: 30 },
    '3m': { label: '3 Months', short: '3M', days: 91 },
    '6m': { label: '6 Months', short: '6M', days: 182 },
    '1y': { label: '1 Year',   short: '1Y', days: 365 }
  };
    const METRICS = {
    avgkg:  { label: 'Avg weight', unit: 'kg' },
    topkg:  { label: 'Top weight', unit: 'kg' },
    volume: { label: 'Volume',     unit: 'kg' },
    reps:   { label: 'Total reps', unit: 'reps' }
  };
  const COLORS = { up: '#7dff6b', down: '#ff4d5e', flat: '#aab3c0' };

    let sel = DB.load('progress', { presetIds: [], range: '3m', metric: 'avgkg' });
  let demo = false;   // demo data is never saved

  function save() { DB.save('progress', sel); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmt(v) { return (Math.round(v * 10) / 10).toLocaleString('en-GB'); }

  // ----- exercises from the chosen presets -----
  function chosenExercises(presets) {
    const out = [];
    const seen = new Set();
    presets.filter(p => sel.presetIds.includes(p.id)).forEach(p => {
      p.exercises.forEach(e => {
        if (!seen.has(e.id)) { seen.add(e.id); out.push(e); }
      });
    });
    return out;
  }

  // ----- fake history for the demo chip -----
  function demoHistory(exercises) {
    const out = [];
    const now = Date.now();
    exercises.forEach((e, idx) => {
      const trend = idx % 3 === 2 ? -0.0006 : (idx % 3 === 1 ? 0.0002 : 0.0012);   // per day
      let seed = 7 + idx * 13;
      const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      for (let d = 365; d >= 0; d -= 3 + Math.floor(rnd() * 3)) {
        const f = 1 + trend * (365 - d) + (rnd() - 0.5) * 0.08;
        const kg = Math.round(40 * f / 2.5) * 2.5;
        const reps = Math.max(5, Math.round(8 * (1 + (rnd() - 0.5) * 0.2)));
        out.push({
          date: new Date(now - d * DAY).toISOString(),
          exId: e.id, exName: e.name,
          sets: [1, 2, 3, 4].map(() => ({ reps: reps, kg: kg }))
        });
      }
    });
    return out;
  }

  // ----- maths -----
  function entriesByExercise(history) {
    const map = {};
    history.forEach(h => {
      (map[h.exId] = map[h.exId] || []).push({ t: Date.parse(h.date), sets: h.sets });
    });
    Object.keys(map).forEach(k => map[k].sort((a, b) => a.t - b.t));
    return map;
  }

   function metricValue(entry, metric) {
    const s = entry.sets;
    if (metric === 'avgkg') return s.reduce((a, x) => a + x.kg, 0) / s.length;
    if (metric === 'topkg') return Math.max(...s.map(x => x.kg));
    if (metric === 'reps') return s.reduce((a, x) => a + x.reps, 0);
    return s.reduce((a, x) => a + x.reps * x.kg, 0);
  }

  function seriesFor(entries, metric, days) {
    const cutoff = Date.now() - days * DAY;
    return (entries || []).filter(en => en.t >= cutoff).map(en => ({ t: en.t, v: metricValue(en, metric), sets: en.sets }));
  }

  // trend line through the sessions -> up / down / flat + percent change
  function trend(points) {
    const n = points.length;
    if (n < 2) return null;
    let xs = points.map(p => (p.t - points[0].t) / DAY);
    if (xs[n - 1] === 0) xs = points.map((p, i) => i);   // all on the same day
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = points.reduce((a, p) => a + p.v, 0) / n;
    let num = 0, den = 0;
    xs.forEach((x, i) => { num += (x - mx) * (points[i].v - my); den += (x - mx) * (x - mx); });
    const slope = den ? num / den : 0;
    const startFit = my + slope * (xs[0] - mx);
    const endFit = my + slope * (xs[n - 1] - mx);
    let pct;
    if (startFit > 0) pct = (endFit - startFit) / startFit * 100;
    else pct = endFit > 0 ? 100 : 0;
    const dir = pct > 2 ? 'up' : pct < -2 ? 'down' : 'flat';
    return { dir: dir, pct: pct };
  }

  function verdictText(t, short) {
    if (!t) return short ? '–' : 'Need 2+ sessions';
    const p = Math.min(999, Math.round(Math.abs(t.pct)));
    if (t.dir === 'up')   return '▲ ' + (short ? '+' + p + '%' : 'Positive +' + p + '%');
    if (t.dir === 'down') return '▼ ' + (short ? '−' + p + '%' : 'Negative −' + p + '%');
    return short ? '● flat' : '● Steady';
  }

  // ----- the graph (plain SVG, no libraries) -----
  function chartSVG(points, color, w, id) {
    const H = 150, L = 48, R = 12, T = 12, B = 26;
    const iw = Math.max(50, w - L - R), ih = H - T - B;
    const t0 = points[0].t, t1 = points[points.length - 1].t;

    const dataMin = Math.min(...points.map(p => p.v));
    const dataMax = Math.max(...points.map(p => p.v));
    let vmin = dataMin, vmax = dataMax;
    if (vmin === vmax) { const pad = Math.abs(vmax) * 0.1 || 1; vmin -= pad; vmax += pad; }
    else { const pad = (vmax - vmin) * 0.12; vmin -= pad; vmax += pad; }

    const x = t => (t1 === t0 ? L + iw / 2 : L + (t - t0) / (t1 - t0) * iw);
    const y = v => T + (1 - (v - vmin) / (vmax - vmin)) * ih;
    const pts = points.map(p => [x(p.t), y(p.v)]);

    const grid = [0, 0.5, 1].map(f => {
      const gy = T + f * ih;
      return `<line x1="${L}" x2="${w - R}" y1="${gy}" y2="${gy}" stroke="rgba(255,255,255,0.07)"/>`;
    }).join('');

    let line = '', area = '', dots = '';
    if (pts.length > 1) {
      line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
      area = line + ` L${pts[pts.length - 1][0].toFixed(1)},${T + ih} L${pts[0][0].toFixed(1)},${T + ih} Z`;
    }
    if (pts.length <= 40) {
      dots = pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2" fill="${color}"/>`).join('');
    }

    // y labels (real min and max of your data)
    const yMax = y(dataMax), yMin = y(dataMin);
    let labels = `<text x="${L - 8}" y="${yMax + 3}" text-anchor="end" fill="#7f8794" font-size="10">${fmt(dataMax)}</text>`;
    if (Math.abs(yMax - yMin) > 14) {
      labels += `<text x="${L - 8}" y="${yMin + 3}" text-anchor="end" fill="#7f8794" font-size="10">${fmt(dataMin)}</text>`;
    }

    // x labels (first and last date)
    const withYear = (t1 - t0) > 150 * DAY;
    const dOpt = withYear ? { day: 'numeric', month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' };
    const d0 = new Date(t0).toLocaleDateString('en-GB', dOpt);
    const d1 = new Date(t1).toLocaleDateString('en-GB', dOpt);
    labels += `<text x="${L}" y="${H - 6}" fill="#7f8794" font-size="10">${d0}</text>`;
    if (pts.length > 1) {
      labels += `<text x="${w - R}" y="${H - 6}" text-anchor="end" fill="#7f8794" font-size="10">${d1}</text>`;
    }

    return `
      <svg width="${w}" height="${H}" viewBox="0 0 ${w} ${H}">
        <defs>
          <linearGradient id="g-${id}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${color}" stop-opacity="0.35"/>
            <stop offset="1" stop-color="${color}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${grid}
        ${area ? `<path d="${area}" fill="url(#g-${id})"/>` : ''}
        ${line ? `<path d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" style="filter: drop-shadow(0 0 6px ${color})"/>` : ''}
        ${dots}
        ${labels}
      </svg>`;
  }

  // ----- DRAW PAGE -----
  function render() {
    const presets = DB.load('presets', []);
    const exercises = chosenExercises(presets);
    const history = demo ? demoHistory(exercises) : DB.load('history', []);
    const byEx = entriesByExercise(history);
    const metric = METRICS[sel.metric];
    const range = RANGES[sel.range];
    const charts = [];
    let html = '';

    // controls
    if (!presets.length) {
      html += '<div class="card glass empty-note">No presets yet. Build one on the Presets page first.</div>';
      root.innerHTML = html;
      return;
    }

    html += `
      <div class="card glass">
        <div class="section-label">Load preset(s)</div>
        <div class="chips">
          ${presets.map(p => `<button class="chip ${sel.presetIds.includes(p.id) ? 'on' : ''}" data-preset="${p.id}">${esc(p.name)}</button>`).join('')}
          <button class="chip demo ${demo ? 'on' : ''}" data-demo="1">Demo data</button>
        </div>

        <div class="section-label pg-gap">Time range</div>
        <div class="chips">
          ${Object.keys(RANGES).map(k => `<button class="chip ${sel.range === k ? 'on' : ''}" data-range="${k}">${RANGES[k].label}</button>`).join('')}
        </div>

        <div class="section-label pg-gap">Measure</div>
        <div class="chips">
          ${Object.keys(METRICS).map(k => `<button class="chip ${sel.metric === k ? 'on' : ''}" data-metric="${k}">${METRICS[k].label}</button>`).join('')}
        </div>
      </div>`;

    if (demo) html += '<div class="demo-banner">Showing demo data. These are not your real workouts.</div>';

    if (!exercises.length) {
      html += '<div class="hint">Tap a preset above to see its progress graphs.</div>';
      root.innerHTML = html;
      return;
    }

    // one card per exercise
    html += '<div class="pg-grid">';
    exercises.forEach(e => {
      const entries = byEx[e.id] || [];
      const points = seriesFor(entries, sel.metric, range.days);
      const t = trend(points);
      const dir = t ? t.dir : 'none';

      let body;
      if (!entries.length) {
        body = '<div class="pg-empty">No sessions logged yet. Finish a workout on the Workout page.</div>';
      } else if (!points.length) {
        body = `<div class="pg-empty">No sessions in the last ${range.label.toLowerCase()}.</div>`;
      } else {
        body = `<div class="pg-chart" data-idx="${charts.length}"></div>`;
        charts.push({ id: e.id, points: points, color: COLORS[dir] || COLORS.flat });
      }

      const badges = Object.keys(RANGES).map(k => {
        const bt = trend(seriesFor(entries, sel.metric, RANGES[k].days));
        return `<span class="badge ${bt ? bt.dir : 'none'}"><b>${RANGES[k].short}</b> ${verdictText(bt, true)}</span>`;
      }).join('');

            const lastPt = points[points.length - 1];
      const stats = points.length
        ? `${points.length} session${points.length > 1 ? 's' : ''} · first ${fmt(points[0].v)} ${metric.unit} → latest ${fmt(lastPt.v)} ${metric.unit}` +
          `<br>Latest kg per set: ${lastPt.sets.map(s => fmt(s.kg)).join(' / ')}`
        : '';

      html += `
        <div class="card glass pg-card">
          <div class="pg-head">
            <h2>${esc(e.name)}</h2>
            <span class="verdict ${dir}">${verdictText(t, false)}</span>
          </div>
          ${body}
          <div class="pg-stats">${stats}</div>
          <div class="badges">${badges}</div>
        </div>`;
    });
    html += '</div>';

    root.innerHTML = html;

    // draw graphs now that the cards exist (so we know their real width)
    root.querySelectorAll('.pg-chart').forEach(el => {
      const c = charts[Number(el.dataset.idx)];
      el.innerHTML = chartSVG(c.points, c.color, Math.max(220, el.clientWidth), c.id);
    });
  }

  // ----- CLICKS -----
  root.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;

    if (chip.dataset.preset) {
      const id = chip.dataset.preset;
      sel.presetIds = sel.presetIds.includes(id) ? sel.presetIds.filter(x => x !== id) : sel.presetIds.concat(id);
    } else if (chip.dataset.range) {
      sel.range = chip.dataset.range;
    } else if (chip.dataset.metric) {
      sel.metric = chip.dataset.metric;
    } else if (chip.dataset.demo) {
      demo = !demo;
    }
    save();
    render();
  });

  document.addEventListener('pagechange', e => { if (e.detail === 'progress') render(); });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (document.getElementById('page-progress').classList.contains('active')) render();
    }, 150);
  });
})();