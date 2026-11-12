// ===== PAGE 6: COACH (connecting link for any AI) =====
// Builds a ready-made prompt for ChatGPT / Claude / Gemini.
//  - "Copy prompt + link": the prompt holds a private link. The AI opens it and reads your workout summary.
//    (One-time Supabase setup, the page shows the code when it is needed.)
//  - "Copy prompt + data": the prompt holds the summary itself. Always works, no setup.
// Nothing here talks to any AI by itself and no AI key is needed.

(function () {
  const root = document.getElementById('coach-root');
  if (!root) return;

  const el = id => document.getElementById(id);
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function note(box, text, ok) {
    if (!box) return;
    box.textContent = text;
    box.classList.toggle('ok', !!ok);
  }

  // ---------- turn ALL saved workouts into compact text ----------
  const p2 = n => String(n).padStart(2, '0');
  function dayKey(d) {
    d = d instanceof Date ? d : new Date(d);
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }
  function parseDay(k) { const a = k.split('-'); return new Date(Number(a[0]), Number(a[1]) - 1, Number(a[2])); }
  const fmtKg = v => String(Math.round(Number(v) * 10) / 10);

  // "60kg: 8,8,7; 57.5kg: 6"
  function setsText(sets) {
    const groups = [];
    sets.forEach(s => {
      const g = groups[groups.length - 1];
      if (g && g.kg === s.kg) g.reps.push(s.reps); else groups.push({ kg: s.kg, reps: [s.reps] });
    });
    return groups.map(g => fmtKg(g.kg) + 'kg: ' + g.reps.join(',')).join('; ');
  }
  // estimated one-rep max (Epley) of the best set
  function est1rm(sets) {
    return Math.max(0, ...sets.map(s => (s.reps > 0 ? s.kg * (1 + s.reps / 30) : 0)));
  }

  function buildDigest(perEx) {
    const history = DB.load('history', []);
    if (!history.length) return null;
    const presets = DB.load('presets', []);
    const goal = Math.min(7, Math.max(1, DB.load('activityGoal', 4)));
    const presetOf = h => {
      if (h.preset) return h.preset;
      const p = presets.find(pr => pr.exercises.some(x => x.id === h.exId));
      return p ? p.name : '';
    };

    const rows = history.map(h => {
      const sets = (h.sets || []).map(s => ({ reps: Number(s.reps) || 0, kg: Number(s.kg) || 0 }));
      return {
        iso: h.date, day: dayKey(h.date), exId: h.exId, name: h.exName, preset: presetOf(h), sets: sets,
        top: Math.max(0, ...sets.map(s => s.kg)),
        vol: sets.reduce((a, s) => a + s.kg * s.reps, 0),
        e1: est1rm(sets)
      };
    }).sort((a, b) => Date.parse(a.iso) - Date.parse(b.iso));

    const now = new Date();
    const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Array.from(new Set(rows.map(r => r.day))).sort();
    const countSince = n => days.filter(d => (today0 - parseDay(d)) / 86400000 < n).length;

    const byEx = {};
    rows.forEach(r => { (byEx[r.exId] = byEx[r.exId] || []).push(r); });

    const lastIso = rows[rows.length - 1].iso;
    const lastRows = rows.filter(r => r.iso === lastIso);
    const lastPresets = Array.from(new Set(lastRows.map(r => r.preset).filter(Boolean))).join(' + ') || 'workout';

    const L = [];
    L.push('TODAY: ' + dayKey(now) + ' (' + now.toLocaleDateString('en-GB', { weekday: 'long' }) + ')');
    L.push('WEEKLY GOAL: ' + goal + ' gym days per week');
    L.push('GYM DAYS: ' + days.length + ' total; ' + countSince(7) + ' in the last 7 days; ' + countSince(30) +
           ' in the last 30 days; ' + countSince(90) + ' in the last 90 days; first logged ' + days[0] +
           '; last logged ' + days[days.length - 1]);
    L.push('');
    L.push('LAST WORKOUT (' + dayKey(lastIso) + ' | ' + lastPresets + '):');
    lastRows.forEach(r => {
      const list = byEx[r.exId];
      const prev = list.indexOf(r) > 0 ? list[list.indexOf(r) - 1] : null;
      L.push('- ' + r.name + ': ' + setsText(r.sets) + ' | volume ' + fmtKg(r.vol) + ' | est1RM ' + fmtKg(r.e1) +
        (prev ? ' | previous (' + prev.day + '): ' + setsText(prev.sets) + ' | volume ' + fmtKg(prev.vol) : ' | first time logged'));
    });
    L.push('');
    L.push('EXERCISE HISTORY (oldest to newest; each line is: date: kg: reps; ...):');
    Object.keys(byEx).forEach(id => {
      const list = byEx[id];
      const lastRow = list[list.length - 1];
      const heaviest = list.reduce((a, b) => (b.top > a.top ? b : a));
      L.push('## ' + lastRow.name + ' [' + (lastRow.preset || 'no preset') + '] sessions: ' + list.length +
             '; heaviest ever ' + fmtKg(heaviest.top) + 'kg on ' + heaviest.day +
             '; best est1RM ' + fmtKg(Math.max(...list.map(x => x.e1))));
      list.slice(-perEx).forEach(r => L.push(r.day + ': ' + setsText(r.sets) + ' (vol ' + fmtKg(r.vol) + ')'));
    });
    return L.join('\n');
  }
  function digest() {
    let t = null;
    for (const n of [20, 10, 5]) {            // shrink if someone has years of data
      t = buildDigest(n);
      if (!t || t.length < 90000) break;
    }
    return t;
  }

  // ---------- what you can ask ----------
  const RULES = 'Use ONLY my data. Never invent numbers, dates or exercises. If there is too little data to judge something, say so. Weights are kg. Progressive overload rules of thumb: if every set reached the top of the rep range at the same weight for 2 sessions in a row, suggest adding weight (about 2.5 kg upper body, 5 kg lower body) or one more rep; if reps or weight dropped, suggest repeating the weight or a small deload; if a lift has been flat for 3+ sessions, suggest a change (rep range, tempo, extra set). Be warm but direct, with short paragraphs and bullets. No medical advice.';

  const AI_TASKS = [
    { label: 'Debrief last workout', text: 'Write a debrief of my LAST WORKOUT compared with my earlier sessions. Use exactly these markdown headings: "## Overall", "## Compared to before", "## Wins", "## Watch out", "## Next session", "## Keep going". Under "Next session" give a specific target (kg x reps) for each exercise in the last workout. Cite real numbers from the data. Keep it under 350 words.' },
    { label: 'Review last 30 days', text: 'Review my last 30 days. Use exactly these markdown headings: "## Consistency" (compare with my weekly goal), "## Progressing", "## Stalling or slipping", "## Plan for the next 2 weeks", "## Keep going". Cite real numbers from the data. Keep it under 350 words.' },
    { label: 'What should I lift next session?', text: 'What should I lift next session? Give a specific kg x reps target for every exercise of my last workout.' },
    { label: 'Which exercise is stalling?', text: 'Which of my exercises is stalling or slipping? Cite the numbers and tell me what to change.' },
    { label: 'Am I training enough?', text: 'Am I training enough compared with my weekly goal? Be honest and give a simple fix if not.' },
    { label: 'Where am I getting stronger?', text: 'Where am I getting stronger? Cite the numbers.' },
    { label: 'Give me some motivation', text: 'Give me some motivation based on my real progress. Keep it short and specific.' }
  ];
  let aiPick = 0;

  // ---------- one-time Supabase setup (read-only link) ----------
  const SQL_SETUP = `create or replace function public.coach_data(t text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.value::json
       from public.byd_sync s
      where s.key = 'coach'
        and encode(sha256(convert_to(s.sync_id::text, 'UTF8')), 'hex') = t
      limit 1),
    json_build_object('error', 'No data yet. Open the Coach page in the app and tap Copy prompt + link again.')
  );
$$;

grant execute on function public.coach_data(text) to anon, authenticated;`;

  // ---------- the page ----------
  function render() {
    const chips = AI_TASKS.map((t, i) =>
      '<button class="chip q' + (i === aiPick ? ' on' : '') + '" data-act="ai-task" data-i="' + i + '">' + esc(t.label) + '</button>').join('');
    root.innerHTML = `
      <div class="module">
        <div class="mod-bar"><span>Connect any AI</span></div>
        <div class="coach-body">
          <p>Pick what you want, copy the prompt, and paste it into ChatGPT, Claude, Gemini or any AI chat. The link inside lets the AI read your latest workout data.</p>
          <div class="chips coach-quick" id="ai-chips">${chips}</div>
          <input class="input" id="ai-custom" placeholder="Or type your own question" maxlength="400" autocomplete="off" style="width:100%;flex:none;margin-bottom:12px">
          <div class="coach-actions">
            <button class="btn primary" data-act="ai-link">Copy prompt + link</button>
            <button class="btn" data-act="ai-data">Copy prompt + data</button>
          </div>
          <div class="coach-actions">
            <button class="btn small" data-act="ai-open" data-ai="chatgpt">Open ChatGPT</button>
            <button class="btn small" data-act="ai-open" data-ai="claude">Open Claude</button>
            <button class="btn small" data-act="ai-open" data-ai="gemini">Open Gemini</button>
          </div>
          <div class="coach-note" id="ai-msg"></div>
          <div id="ai-setup"></div>
          <p class="coach-fine">The link only works if your AI can open web links. If it says it can't, use "Copy prompt + data" instead. Treat the link as private: anyone who has it can read your workout summary.</p>
        </div>
      </div>`;
  }

  async function sha256Hex(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  }

  // save a fresh summary to the cloud and return the private link to it
  async function makeLink() {
    const cfg = window.BYD_CONFIG || {};
    let code = (cfg.SYNC_CODE || '').trim();
    if (!code || code.indexOf('PASTE-') !== -1) { try { code = localStorage.getItem('byd_sync_code') || ''; } catch (e) { code = ''; } }
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase || !code) throw new Error('NOSYNC');
    const text = digest();
    if (!text) throw new Error('No saved workouts yet. Finish a workout first.');

    const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      global: { headers: { 'x-byd-code': code } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const now = new Date().toISOString();
    const { error } = await client.from('byd_sync').upsert(
      { sync_id: code, key: 'coach', value: { note: 'Workout summary for my AI coach. Weights are in kg.', updated: now, lines: text.split('\n') }, updated_at: now },
      { onConflict: 'sync_id,key' }
    );
    if (error) throw new Error('Could not save the summary to the cloud: ' + error.message);

    const link = cfg.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/coach_data?t=' + await sha256Hex(code) +
                 '&apikey=' + encodeURIComponent(cfg.SUPABASE_ANON_KEY);

    // make sure the link really works
    let res, data;
    try { res = await fetch(link); data = await res.json().catch(() => ({})); }
    catch (e) { throw new Error('Cannot reach the cloud. Check your internet connection.'); }
    if (!res.ok) {
      if (res.status === 404 || (data && data.code === 'PGRST202')) throw new Error('SETUP');
      throw new Error((data && data.message) || ('The link check failed (' + res.status + ').'));
    }
    if (data && data.error) throw new Error('The link works but has no data yet. Try again.');
    return link;
  }

  function promptWithLink(link, task) {
    return 'You are my strength and bodybuilding coach.\nOpen this link and read my workout data (JSON, weights in kg; the last session is my latest workout):\n' + link +
           '\nIf you cannot open the link, tell me so and stop. Do not guess.\n\nRules: ' + RULES + '\n\nMy request: ' + task;
  }
  function promptWithData(data, task) {
    return 'You are my strength and bodybuilding coach. My workout data is below (weights in kg).\n\nRules: ' + RULES + '\n\nMy request: ' + task + '\n\nMY DATA:\n' + data;
  }
  function aiTaskText() {
    const custom = (el('ai-custom').value || '').trim();
    return custom || AI_TASKS[aiPick].text;
  }

  // copy text even when it is produced asynchronously (needed on iPhone Safari)
  async function copyText(promise) {
    let text;
    const blob = promise.then(t => { text = t; return new Blob([t], { type: 'text/plain' }); });
    blob.catch(() => {});                                      // the caller reports the error
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
        return text;
      }
    } catch (e) { /* fall through to the older way */ }
    text = await promise;
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      el('ai-setup').innerHTML = '<div class="coach-note ok">Copy this by hand:</div><textarea class="input" readonly rows="6" style="width:100%;margin-top:8px">' + esc(text) + '</textarea>';
    }
    return text;
  }

  function showSetup() {
    note(el('ai-msg'), 'The link needs a one-time setup in Supabase (about a minute).', false);
    el('ai-setup').innerHTML = `
      <ol class="coach-steps" style="margin-top:12px">
        <li>Open your Supabase project, then <b>SQL Editor</b> and <b>New query</b>.</li>
        <li>Paste the code below and press <b>Run</b>.</li>
        <li>Come back here and tap <b>Copy prompt + link</b> again.</li>
      </ol>
      <pre class="sql">${esc(SQL_SETUP)}</pre>
      <button class="btn small" data-act="ai-copysql">Copy code</button>`;
  }

  async function aiCopy(mode, keepSetup) {
    const msg = el('ai-msg');
    if (!keepSetup) el('ai-setup').innerHTML = '';
    const d = digest();
    if (!d) { note(msg, 'No saved workouts yet. Finish a workout first.'); return null; }
    const task = aiTaskText();
    note(msg, mode === 'link' ? 'Preparing your link…' : 'Copying…', true);
    try {
      const text = await copyText((async () => {
        if (mode === 'data') return promptWithData(d, task);
        return promptWithLink(await makeLink(), task);
      })());
      note(msg, mode === 'link' ? 'Copied. Paste it into any AI chat.' : 'Copied, with your data inside. Paste it into any AI chat.', true);
      return text;
    } catch (err) {
      if (err.message === 'SETUP') showSetup();
      else if (err.message === 'NOSYNC') note(msg, 'Cloud sync is not set up here. Use "Copy prompt + data" instead.');
      else note(msg, err.message);
      return null;
    }
  }

  async function aiOpen(which) {
    const w = window.open('about:blank', '_blank');            // open straight away so the browser allows it
    let text = await aiCopy('link', true);
    if (!text) text = await aiCopy('data', true);              // link not ready: fall back to the data prompt
    const bases = {
      chatgpt: ['https://chatgpt.com/?q=', 'https://chatgpt.com/'],
      claude: ['https://claude.ai/new?q=', 'https://claude.ai/new'],
      gemini: ['https://gemini.google.com/app', 'https://gemini.google.com/app']
    };
    const b = bases[which];
    const url = text && which !== 'gemini' && text.length < 6000 ? b[0] + encodeURIComponent(text) : b[1];
    if (w) w.location.href = url;
    else note(el('ai-msg'), 'Copied. Open your AI app and paste.', true);
  }

  // ---------- clicks ----------
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    switch (b.dataset.act) {
      case 'ai-task':
        aiPick = Number(b.dataset.i);
        el('ai-chips').querySelectorAll('.chip').forEach((c, i) => c.classList.toggle('on', i === aiPick));
        el('ai-custom').value = '';
        break;
      case 'ai-link': aiCopy('link'); break;
      case 'ai-data': aiCopy('data'); break;
      case 'ai-open': aiOpen(b.dataset.ai); break;
      case 'ai-copysql':
        navigator.clipboard.writeText(SQL_SETUP)
          .then(() => note(el('ai-msg'), 'Code copied. Paste it into the Supabase SQL Editor.', true))
          .catch(() => {});
        break;
    }
  });

  render();
})();