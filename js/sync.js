// ===== CLOUD SYNC (Supabase, no login) =====
// Local-first: the app always works from this device's storage.
// Everything is copied to Supabase under your secret sync code; other devices pick it up within seconds.

const Sync = (function () {
  const KEYS = ['presets', 'history', 'session', 'activityGoal'];
  const TABLE = 'byd_sync';
  const POLL_MS = 10000;
  const cfg = window.BYD_CONFIG || {};

  let client = null, code = '';
  let status = 'local';            // local | nocode | syncing | online | error
  let lastSync = null;
  let pollTimer = null, notifyTimer = null, busy = false, hiddenAt = 0;
  const timers = {};

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const tsOf = key => Number(localStorage.getItem('byd_ts_' + key)) || 0;
  function currentPage() { return localStorage.getItem('byd_last_page') || 'workout'; }
  function cfgOk() {
    return cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && cfg.SUPABASE_URL.indexOf('YOUR-') === -1 && window.supabase;
  }
  function getCode() {
    const c = (cfg.SYNC_CODE || '').trim();
    if (c && c.indexOf('PASTE-') === -1) return c;
    return localStorage.getItem('byd_sync_code') || '';
  }
  function makeCode() {
    const a = new Uint8Array(32);
    crypto.getRandomValues(a);
    return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  }

  // ---------- cloud button (top-right, left of the speaker) ----------
  const CLOUD_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>';
  const STATUS_TEXT = {
    local: 'Cloud sync is not set up',
    nocode: 'Not connected (this device only)',
    syncing: 'Syncing…',
    online: 'Synced',
    error: 'Cannot reach the cloud (will retry)'
  };
  const cloudBtn = document.createElement('button');
  cloudBtn.className = 'cloud-btn';
  cloudBtn.setAttribute('aria-label', 'Cloud sync');
  cloudBtn.innerHTML = CLOUD_ICON + '<i class="dot"></i>';
  cloudBtn.addEventListener('click', openPanel);
  document.body.appendChild(cloudBtn);

  function setStatus(s) {
    status = s;
    cloudBtn.dataset.status = s;
    cloudBtn.title = STATUS_TEXT[s] || '';
  }
  setStatus('local');

  // ---------- keep the pages up to date ----------
  function refreshPages() {
    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => {
      document.dispatchEvent(new CustomEvent('pagechange', { detail: currentPage() }));
    }, 120);
  }

  function applyRemote(key, value, ts) {
    localStorage.setItem('byd_' + key, JSON.stringify(value));
    localStorage.setItem('byd_ts_' + key, String(ts));
  }

  // ---------- upload ----------
  async function push(key) {
    if (!client || !code) return;
    const raw = localStorage.getItem('byd_' + key);
    if (raw === null) return;
    let ts = tsOf(key);
    if (!ts) { ts = Date.now(); localStorage.setItem('byd_ts_' + key, String(ts)); }
    const { error } = await client.from(TABLE).upsert(
      { sync_id: code, key: key, value: JSON.parse(raw), updated_at: new Date(ts).toISOString() },
      { onConflict: 'sync_id,key' }
    );
    if (error) throw error;
  }

  function queuePush(key) {
    if (!client || !code || !KEYS.includes(key)) return;
    clearTimeout(timers[key]);
    setStatus('syncing');
    timers[key] = setTimeout(async () => {
      try { await push(key); lastSync = Date.now(); setStatus('online'); }
      catch (e) { console.warn('Sync upload failed:', key, e); setStatus('error'); }
    }, 600);
  }

  // ---------- download / reconcile ----------
  async function fetchRow(key) {
    const { data, error } = await client.from(TABLE).select('value, updated_at')
      .eq('sync_id', code).eq('key', key).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function pullAll(quiet) {
    if (!client || !code || busy) return;
    busy = true;
    if (!quiet) setStatus('syncing');
    try {
      // cheap look first: which keys exist in the cloud, and when did they last change?
      const { data: meta, error } = await client.from(TABLE).select('key, updated_at').eq('sync_id', code);
      if (error) throw error;
      const cloud = {};
      (meta || []).forEach(r => { cloud[r.key] = Date.parse(r.updated_at); });

      const firstLink = localStorage.getItem('byd_linked') !== code;   // first time this device meets this code
      let changed = false;

      for (const key of KEYS) {
        const cloudTs = cloud[key];                         // undefined = nothing in the cloud yet
        const localRaw = localStorage.getItem('byd_' + key);
        const localTs = tsOf(key);

        if (cloudTs === undefined) {                        // upload what this device has
          if (localRaw !== null) await push(key);
          continue;
        }

        if (localRaw === null || firstLink) {               // empty device, or first link: the cloud copy wins
          const row = await fetchRow(key);
          if (!row) continue;
          const same = localRaw !== null && DB.canon(JSON.parse(localRaw)) === DB.canon(row.value);
          if (localRaw !== null && !same) localStorage.setItem('byd_bak_' + key, localRaw);   // keep a backup of what this device had
          if (!same) { applyRemote(key, row.value, cloudTs); changed = true; }
          else localStorage.setItem('byd_ts_' + key, String(cloudTs));
        } else if (cloudTs > localTs + 500) {               // the cloud is newer
          const row = await fetchRow(key);
          if (row) { applyRemote(key, row.value, Date.parse(row.updated_at)); changed = true; }
        } else if (localTs > cloudTs + 500) {               // this device is newer
          await push(key);
        }
      }

      localStorage.setItem('byd_linked', code);
      lastSync = Date.now();
      setStatus('online');
      if (changed) refreshPages();
    } catch (e) {
      console.warn('Sync failed:', e);
      setStatus('error');
    } finally {
      busy = false;
    }
  }

  // ---------- start / stop ----------
  async function startSync() {
    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      global: { headers: { 'x-byd-code': code } },          // the secret code travels with every request
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    await pullAll();
    DB.hooks.saved = key => queuePush(key);
    clearInterval(pollTimer);
    pollTimer = setInterval(() => { if (!document.hidden) pullAll(true); }, POLL_MS);
  }

  function stopSync() {
    DB.hooks.saved = null;
    clearInterval(pollTimer);
    Object.keys(timers).forEach(k => clearTimeout(timers[k]));
    client = null;
  }

  // ---------- ask for the code (only when config.js has none) ----------
  async function askForCode() {
    if (code) return;
    const v = await UI.prompt({
      title: 'Connect this device',
      message: 'Paste your sync code from your other device. Leave it empty to create a new code.',
      placeholder: 'Sync code',
      okText: 'Connect'
    });
    if (v === null) return;                                 // cancelled: stays on this device only
    const c = v.trim() || makeCode();
    if (c.length < 20) {
      UI.alert({ title: 'Code too short', message: 'A sync code has at least 20 characters. Paste the full code, or leave it empty to create a new one.' });
      return;
    }
    localStorage.setItem('byd_sync_code', c);
    code = c;
    await startSync();
    if (!v.trim()) openPanel();                             // brand-new code: show it so you can copy it to your other devices
  }

  // ---------- sync panel ----------
  function openPanel() {
    if (!cfgOk()) {
      window.UI && UI.alert({ title: 'Cloud sync is not set up', message: 'Add your Supabase URL and key to js/config.js, then refresh.' });
      return;
    }
    if (!code) { askForCode(); return; }

    const fromConfig = !!(cfg.SYNC_CODE && cfg.SYNC_CODE.trim() && cfg.SYNC_CODE.indexOf('PASTE-') === -1);
    const ov = document.createElement('div');
    ov.className = 'pm-overlay opening';
    const when = () => lastSync ? new Date(lastSync).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '–';
    ov.innerHTML = `
      <div class="pm-panel" style="width:min(440px,100%)">
        <div class="pm-top">
          <div>
            <div class="tile-date">Cloud sync</div>
            <div class="pm-day" style="font-size:1.25rem;font-family:'Space Grotesk',sans-serif">${esc(STATUS_TEXT[status])}</div>
            <div class="pm-sub" id="sync-when">Last sync ${when()}</div>
          </div>
          <button class="pm-close" data-x="close" aria-label="Close">×</button>
        </div>

        <div class="section-label">Your sync code</div>
        <input class="input" id="sync-code" readonly value="${esc(code)}" style="width:100%;font-size:13px">
        <div class="pm-sub" style="margin-top:8px;font-size:.8rem">
          ${fromConfig ? 'This code comes from js/config.js, so every device that loads your site connects automatically.' : 'Enter this code on your other devices to connect them.'}
          Keep it private: anyone with it can read your data.
        </div>

        <div class="pm-actions">
          <button class="btn" data-x="sync">Sync now</button>
          <button class="btn" data-x="copy">Copy code</button>
          ${fromConfig ? '' : '<button class="btn danger" data-x="off">Disconnect</button>'}
        </div>
      </div>`;
    document.body.appendChild(ov);

    const input = ov.querySelector('#sync-code');
    input.addEventListener('focus', () => input.select());

    ov.addEventListener('click', async e => {
      if (e.target === ov) { ov.remove(); return; }
      const b = e.target.closest('[data-x]');
      if (!b) return;
      const act = b.dataset.x;

      if (act === 'close') ov.remove();

      if (act === 'sync') {
        await pullAll();
        const el = ov.querySelector('#sync-when');
        if (el) el.textContent = 'Last sync ' + when();
      }

      if (act === 'copy') {
        try { await navigator.clipboard.writeText(code); b.textContent = 'Copied ✓'; }
        catch (err) { input.focus(); input.select(); b.textContent = 'Select & copy'; }
        setTimeout(() => { b.textContent = 'Copy code'; }, 1600);
      }

      if (act === 'off') {
        const yes = await UI.confirm({
          title: 'Disconnect this device?',
          message: 'Your data stays on this device and in the cloud. This device just stops syncing until you enter the code again.',
          okText: 'Disconnect'
        });
        if (!yes) return;
        localStorage.removeItem('byd_sync_code');
        localStorage.removeItem('byd_linked');
        stopSync();
        code = '';
        setStatus('nocode');
        ov.remove();
      }
    });
  }

  // ---------- go ----------
  async function init() {
    if (!cfgOk()) { setStatus('local'); return; }           // not configured: the app simply stays local-only
    code = getCode();
    if (code) { await startSync(); return; }
    setStatus('nocode');
    setTimeout(askForCode, 600);
  }

  // catch up when the connection returns or you come back to the app
  window.addEventListener('online', () => { if (client) pullAll(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (client && hiddenAt && Date.now() - hiddenAt > 5000) pullAll(true);
  });

  init();
  return { pullAll: pullAll, openPanel: openPanel };
})();