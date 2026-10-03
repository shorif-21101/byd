// ===== DATA LAYER =====
// Every page saves and loads through this file.
// Data lives in this browser first; js/sync.js copies it to Supabase.

const DB = {
  hooks: { saved: null },          // sync.js plugs in here

  // same data = same text, whatever order the keys are in (the cloud may reorder them)
  canon(v) {
    return JSON.stringify(v, (k, x) =>
      (x && typeof x === 'object' && !Array.isArray(x))
        ? Object.keys(x).sort().reduce((o, kk) => { o[kk] = x[kk]; return o; }, {})
        : x);
  },

  load(key, fallback) {
    try {
      const v = localStorage.getItem('byd_' + key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  },

  save(key, value) {
    const old = localStorage.getItem('byd_' + key);
    if (old !== null) {
      try { if (DB.canon(JSON.parse(old)) === DB.canon(value)) return; } catch (e) {}   // nothing changed
    }
    localStorage.setItem('byd_' + key, JSON.stringify(value));
    localStorage.setItem('byd_ts_' + key, String(Date.now()));    // when this device last changed it
    if (DB.hooks.saved) { try { DB.hooks.saved(key, value); } catch (e) {} }
  },

  uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
};