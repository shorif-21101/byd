// ===== PAGE 6: AI COACH =====
// Uses Google's free Gemini API (Google AI Studio key).
// - Your key is saved ONLY in this browser (localStorage). It is never put in your code or synced.
// - Every question sends a compact text summary of ALL your saved workouts, so the coach always sees fresh data.
// - Nothing is saved to your workout data by this page.

(function () {
  const root = document.getElementById('coach-root');
  if (!root) return;

  const API = 'https://generativelanguage.googleapis.com/v1beta';
  const K = { key: 'byd_coach_key', model: 'byd_coach_model', chat: 'byd_coach_chat', report: 'byd_coach_report' };

  const store = {
    get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const readJSON = (k, fallback) => { try { return JSON.parse(store.get(k)) || fallback; } catch (e) { return fallback; } };

  let chat = readJSON(K.chat, []);
  let models = [];            // free models found for this key
  let busy = false;
  let chatErr = '';
  let renderedWithKey = null;

  const el = id => document.getElementById(id);
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- tiny markdown -> safe HTML ----------
  function inline(s) {
    return s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
            .replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1<i>$2</i>');
  }
  function md(text) {
    const out = [];
    let inList = false;
    String(text).replace(/\r/g, '').split('\n').forEach(raw => {
      const line = esc(raw.trimEnd());
      let m = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (m) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push('<li>' + inline(m[1]) + '</li>');
        return;
      }
      if (inList) { out.push('</ul>'); inList = false; }
      m = line.match(/^#{1,4}\s+(.*)$/);
      if (m) out.push('<h3>' + inline(m[1]) + '</h3>');
      else if (line.trim()) out.push('<p>' + inline(line) + '</p>');
    });
    if (inList) out.push('</ul>');
    return out.join('');
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

  // ---------- prompts ----------
  const SYSTEM = [
    'You are BYD Coach, a friendly, direct strength and bodybuilding coach inside a progressive-overload tracking app.',
    'Use ONLY the workout data supplied below. Never invent numbers, dates or exercises. All weights are in kg.',
    'If there is too little data to judge something, say so plainly.',
    'Progressive overload rules of thumb: if every set reached the top of the rep range at the same weight for 2 sessions in a row, suggest adding weight (about 2.5 kg upper body, 5 kg lower body) or one more rep; if reps or weight dropped, suggest repeating the weight with cleaner effort or a small deload; if a lift has been flat for 3+ sessions, suggest a change (rep range, tempo, extra set).',
    'Be warm but not cheesy. Short paragraphs and bullets. Give no medical advice; if pain or injury comes up, suggest seeing a professional.'
  ].join('\n');

  const ASK = {
    last: 'Write a debrief of my LAST WORKOUT compared with my earlier sessions. Use exactly these markdown headings: "## Overall", "## Compared to before", "## Wins", "## Watch out", "## Next session", "## Keep going". Under "Next session" give a specific target (kg x reps) for each exercise in the last workout. Cite real numbers from the data. Keep it under 350 words.',
    month: 'Review my last 30 days. Use exactly these markdown headings: "## Consistency" (compare with my weekly goal), "## Progressing", "## Stalling or slipping", "## Plan for the next 2 weeks", "## Keep going". Cite real numbers from the data. Keep it under 350 words.'
  };

  // ---------- talking to Gemini ----------
  function apiError(status, data) {
    const msg = data && data.error && data.error.message ? data.error.message : '';
    let text;
    if (status === 400 && /api key/i.test(msg)) text = 'Google rejected this key. Check that you pasted the whole key.';
    else if (status === 401 || status === 403) text = 'This key is not allowed to use Gemini. Create a new one at aistudio.google.com/apikey.';
    else if (status === 429) text = 'Free limit reached for now. Wait a minute and try again. Daily limits reset at midnight Pacific time.';
    else if (status >= 500) text = 'Google\'s AI is busy right now. Try again in a moment.';
    else text = msg || ('Request failed (' + status + ').');
    const e = new Error(text);
    e.status = status;
    return e;
  }

  async function call(url, options) {
    let res;
    try { res = await fetch(url, options); }
    catch (e) { throw new Error('Cannot reach Google. Check your internet connection.'); }
    const data = await res.json().catch(() => ({}));
    return { res: res, data: data };
  }

  // newest free Flash model first (stable beats preview, full beats lite)
  function score(n) {
    const v = parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [0, 0])[1]);
    let s = v * 100;
    if (/lite/.test(n)) s -= 30;
    if (/preview|exp/.test(n)) s -= 120;
    return s;
  }
  async function listModels(key) {
    const { res, data } = await call(API + '/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
    if (!res.ok) throw apiError(res.status, data);
    const names = (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => String(m.name).replace(/^models\//, ''))
      .filter(n => /^gemini-.*flash/.test(n) && !/(image|tts|audio|live|native|robotics|embedding|computer|omni|learnlm|thinking-exp)/.test(n));
    names.sort((a, b) => score(b) - score(a) || a.length - b.length);
    return names;
  }
  async function pickModel(key) {
    const names = await listModels(key);
    if (!names.length) throw new Error('No free Gemini model was found for this key.');
    models = names;
    store.set(K.model, names[0]);
    return names[0];
  }

  async function gemini(system, contents) {
    const key = store.get(K.key);
    if (!key) throw new Error('Connect your key first.');
    let model = store.get(K.model) || await pickModel(key);

    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: contents,
      generationConfig: { maxOutputTokens: 4096 }
    });
    const send = () => call(API + '/models/' + model + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: body
    });

    let r = await send();
    if (r.res.status === 404) {                         // model was retired: find a current one and retry
      store.del(K.model);
      model = await pickModel(key);
      r = await send();
    }
    if (r.res.status >= 500) {                          // busy: one more try
      await new Promise(ok => setTimeout(ok, 1500));
      r = await send();
    }
    if (!r.res.ok) throw apiError(r.res.status, r.data);

    const cand = r.data.candidates && r.data.candidates[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    const text = parts.filter(p => !p.thought).map(p => p.text || '').join('').trim();
    if (!text) {
      const why = r.data.promptFeedback && r.data.promptFeedback.blockReason;
      throw new Error(why ? 'Google blocked this answer (' + why + ').' : 'The AI sent an empty answer. Try again.');
    }
    return text;
  }

  // ---------- screens ----------
  function note(box, text, ok) {
    if (!box) return;
    box.textContent = text;
    box.classList.toggle('ok', !!ok);
  }
  function setBusy(v) { busy = v; root.classList.toggle('busy', v); }
  const typingHTML = label => '<div class="typing-line"><span>' + esc(label) + '</span><i></i><i></i><i></i></div>';

  function setupHTML() {
    return `
      <div class="module">
        <div class="mod-bar"><span>Connect your free AI</span></div>
        <div class="coach-body">
          <p>Your coach runs on Google's free Gemini AI. It reads all your saved workouts, compares them with your past sessions, and answers any question.</p>
          <ol class="coach-steps">
            <li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> and sign in with Google.</li>
            <li>Tap <b>Create API key</b> and copy it.</li>
            <li>Paste it below. It is saved only on this device.</li>
          </ol>
          <div class="row">
            <input class="input" id="coach-key" type="password" placeholder="Paste your API key" autocomplete="off" spellcheck="false">
            <button class="btn primary" data-act="connect">Connect</button>
          </div>
          <div class="coach-note" id="coach-msg"></div>
          <p class="coach-fine">Privacy: when you ask, a text summary of your workouts is sent to Google. On the free tier Google may use it to improve its products. Do this on each device you want to use.</p>
        </div>
      </div>`;
  }

  const QUICK = [
    'What should I lift next session?',
    'Which exercise is stalling?',
    'Am I training enough?',
    'Where am I getting stronger?',
    'Give me some motivation'
  ];

  function render() {
    const key = store.get(K.key);
    renderedWithKey = !!key;
    if (!key) { root.innerHTML = setupHTML(); return; }

    const model = store.get(K.model);
    const list = models.slice();
    if (model && !list.includes(model)) list.unshift(model);

    root.innerHTML = `
      <div class="module">
        <div class="mod-bar"><span>Workout debrief</span><span class="mod-count" id="coach-rep-when"></span></div>
        <div class="coach-body">
          <div class="coach-actions">
            <button class="btn primary" data-act="rep-last">Debrief last workout</button>
            <button class="btn" data-act="rep-month">Review last 30 days</button>
          </div>
          <div class="md" id="coach-report"></div>
        </div>
      </div>

      <div class="module">
        <div class="mod-bar"><span>Ask your coach</span><button class="btn small ghost" data-act="clear">Clear</button></div>
        <div class="coach-body">
          <div class="chat" id="coach-chat"></div>
          <div class="chips coach-quick">${QUICK.map(q => '<button class="chip q" data-act="quick" data-q="' + esc(q) + '">' + esc(q) + '</button>').join('')}</div>
          <div class="row">
            <input class="input" id="coach-q" placeholder="Ask anything about your training" maxlength="500" autocomplete="off">
            <button class="btn primary" data-act="send">Send</button>
          </div>
        </div>
      </div>

      <div class="module">
        <div class="mod-bar"><span>Settings</span></div>
        <div class="coach-body">
          <div class="micro" style="margin-bottom:8px">AI model (free)</div>
          <select class="input" id="coach-model">${list.map(m => '<option value="' + esc(m) + '"' + (m === model ? ' selected' : '') + '>' + esc(m) + '</option>').join('')}</select>
          <div class="coach-actions" style="margin:12px 0 0">
            <button class="btn small" data-act="refresh-models">Find free models</button>
            <button class="btn small danger" data-act="disconnect">Remove key</button>
          </div>
          <div class="coach-note" id="coach-set-msg"></div>
        </div>
      </div>`;

    const rep = readJSON(K.report, null);
    if (rep && rep.text) showReport(rep);
    else el('coach-report').innerHTML = '<p>Tap a button above and your coach will read your saved workouts and write you a report.</p>';
    drawChat();
  }

  function showReport(rep) {
    el('coach-report').innerHTML = md(rep.text);
    el('coach-rep-when').textContent = (rep.kind === 'month' ? '30 days' : 'Last workout') + ' · ' +
      new Date(rep.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function msgHTML(m) {
    return m.role === 'user'
      ? '<div class="msg me">' + esc(m.text).replace(/\n/g, '<br>') + '</div>'
      : '<div class="msg ai"><div class="md">' + md(m.text) + '</div></div>';
  }
  function drawChat() {
    const box = el('coach-chat');
    if (!box) return;
    box.innerHTML = chat.length
      ? chat.map(msgHTML).join('')
      : '<div class="chat-empty">Ask about your lifts, plateaus, recovery or what to do next. Your coach reads all your saved data every time.</div>';
    if (chatErr) box.innerHTML += '<div class="coach-note">' + esc(chatErr) + '</div>';
    box.scrollTop = box.scrollHeight;
  }

  // ---------- actions ----------
  async function connect() {
    const msg = el('coach-msg');
    const key = (el('coach-key').value || '').trim();
    if (key.length < 20) { note(msg, 'That looks too short. Paste the whole key.'); return; }
    note(msg, 'Checking your key…', true);
    setBusy(true);
    try {
      await pickModel(key);
      store.set(K.key, key);
      render();
    } catch (err) {
      note(msg, err.message);
    }
    setBusy(false);
  }

  async function runReport(kind) {
    if (busy) return;
    const box = el('coach-report');
    const d = digest();
    if (!d) { box.innerHTML = '<p>No saved workouts yet. Finish a workout first, then come back.</p>'; return; }
    setBusy(true);
    box.innerHTML = typingHTML('Reading your data');
    try {
      const text = await gemini(SYSTEM + '\n\nMY DATA:\n' + d, [{ role: 'user', parts: [{ text: ASK[kind] }] }]);
      const rep = { kind: kind, text: text, ts: Date.now() };
      store.set(K.report, JSON.stringify(rep));
      showReport(rep);
    } catch (err) {
      box.innerHTML = '<div class="coach-note">' + esc(err.message) + '</div>';
    }
    setBusy(false);
  }

  async function ask(textArg) {
    if (busy) return;
    const input = el('coach-q');
    const q = String(textArg || input.value || '').trim();
    if (!q) return;
    input.value = '';
    chatErr = '';
    chat.push({ role: 'user', text: q });
    drawChat();
    el('coach-chat').insertAdjacentHTML('beforeend', '<div class="msg ai">' + typingHTML('Thinking') + '</div>');
    el('coach-chat').scrollTop = el('coach-chat').scrollHeight;
    setBusy(true);

    try {
      const d = digest();
      const system = SYSTEM + '\nAnswer the question directly in under 200 words unless I ask for more detail. You can see all my saved data below.\n\nMY DATA:\n' + (d || 'No workouts saved yet.');
      const contents = chat.slice(-12).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
      while (contents.length && contents[0].role === 'model') contents.shift();
      const text = await gemini(system, contents);
      chat.push({ role: 'ai', text: text });
    } catch (err) {
      chat.pop();                               // keep the chat alternating
      input.value = q;
      chatErr = err.message;
    }
    chat = chat.slice(-30);
    store.set(K.chat, JSON.stringify(chat));
    setBusy(false);
    drawChat();
  }

  async function refreshModels() {
    const msg = el('coach-set-msg');
    note(msg, 'Looking for free models…', true);
    setBusy(true);
    try {
      const names = await listModels(store.get(K.key));
      if (!names.length) throw new Error('No free Gemini model was found for this key.');
      models = names;
      if (!names.includes(store.get(K.model))) store.set(K.model, names[0]);
      render();
      note(el('coach-set-msg'), names.length + ' model' + (names.length === 1 ? '' : 's') + ' found.', true);
    } catch (err) {
      note(msg, err.message);
    }
    setBusy(false);
  }

  root.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    switch (b.dataset.act) {
      case 'connect': connect(); break;
      case 'rep-last': runReport('last'); break;
      case 'rep-month': runReport('month'); break;
      case 'send': ask(); break;
      case 'quick': ask(b.dataset.q); break;
      case 'refresh-models': refreshModels(); break;
      case 'clear':
        chat = []; chatErr = ''; store.del(K.chat); drawChat();
        break;
      case 'disconnect':
        if (confirm('Remove your key from this device?')) {
          store.del(K.key); store.del(K.model); models = [];
          render();
        }
        break;
    }
  });
  root.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'coach-q') { e.preventDefault(); ask(); }
    if (e.target.id === 'coach-key') { e.preventDefault(); connect(); }
  });
  root.addEventListener('change', e => {
    if (e.target.id === 'coach-model') store.set(K.model, e.target.value);
  });

  // open the tab: only redraw if the key state changed (so typing is never wiped by a background sync)
  document.addEventListener('pagechange', e => {
    if (e.detail === 'coach' && !busy && renderedWithKey !== !!store.get(K.key)) render();
  });

  window.Coach = { digest: digest, md: md };
  render();
})();