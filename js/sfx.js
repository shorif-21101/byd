// ===== SFX: synthesised sound effects (Web Audio, no audio files) =====
// Minimal and professional: sounds only on important actions.
//   SFX.play('save')   SFX.play('tick', { n: 3 })   SFX.toggle()   SFX.isOn()

window.SFX = (function () {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master = null, dry = null, reverbIn = null, noiseBuf = null;
  let on = DB.load('sfxOn', true);
  let unlocked = false;
  let silent = null;

  // ---------- iPhone: stop the silent switch from muting us ----------
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}

  function silentWavUrl() {
    const rate = 8000, n = rate;                       // 1 second of silence
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, n * 2, true);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }

  function startSilentAudio() {
    try {
      if (!silent) {
        silent = new Audio(silentWavUrl());
        silent.loop = true;
        silent.preload = 'auto';
        silent.setAttribute('playsinline', '');
        silent.setAttribute('webkit-playsinline', '');
      }
      const p = silent.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }

  // ---------- audio engine ----------
  function makeImpulse(seconds, decay) {
    const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function ensure() {
    if (!AC) return false;
    if (!ctx) {
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
      master = ctx.createGain();
      master.gain.value = 1.0;                                   // overall volume
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 20; comp.ratio.value = 4;
      comp.attack.value = 0.004; comp.release.value = 0.25;
      master.connect(comp); comp.connect(ctx.destination);

      dry = ctx.createGain(); dry.connect(master);
      const conv = ctx.createConvolver();
      conv.buffer = makeImpulse(1.0, 3);                         // small, tight room
      const wet = ctx.createGain(); wet.gain.value = 0.22;
      conv.connect(wet); wet.connect(master);
      reverbIn = conv;
    }
    if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }
    return true;
  }

  function route(node, rev) {
    node.connect(dry);
    if (rev > 0) { const s = ctx.createGain(); s.gain.value = rev; node.connect(s); s.connect(reverbIn); }
  }

  // plain oscillator note / sweep
  function tone(o) {
    const t0 = ctx.currentTime + (o.t || 0);
    const d = o.d || 0.3;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + d);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.g || 0.1, t0 + (o.a || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);

    let node = osc;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.Q.value = 0.7;
      f.frequency.setValueAtTime(o.lp, t0);
      if (o.lpTo) f.frequency.exponentialRampToValueAtTime(o.lpTo, t0 + d);
      osc.connect(f); node = f;
    }
    node.connect(g);
    route(g, o.rev === undefined ? 0.1 : o.rev);
    osc.start(t0); osc.stop(t0 + d + 0.05);
  }

  // clean "tech ping": fundamental plus two quiet harmonics, tight attack, smooth decay
  function ping(f, t, d, g, rev) {
    tone({ f: f,     t: t, d: d,        g: g,        a: 0.004, rev: rev });
    tone({ f: f * 2, t: t, d: d * 0.55, g: g * 0.22, a: 0.004, rev: rev });
    tone({ f: f * 3, t: t, d: d * 0.3,  g: g * 0.07, a: 0.004, rev: rev });
  }

  // filtered noise: data-stream hiss and soft transients
  function noise(o) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = ctx.currentTime + (o.t || 0);
    const dur = o.d || 0.3;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass'; f.Q.value = o.q || 1.2;
    f.frequency.setValueAtTime(o.f, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.g || 0.03, t0 + (o.a || 0.02));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g);
    route(g, o.rev === undefined ? 0.05 : o.rev);
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
  }

  // ---------- the sounds (only these exist; anything else stays silent) ----------
  const S = {
    // tick a set: crisp confirmation, climbs the harmonic scale with each set
    tick(o) {
      const r = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 15 / 8, 2, 9 / 4];
      const f = 1046.5 * r[(((o && o.n) || 1) - 1) % r.length];
      ping(f, 0, 0.26, 0.07, 0.1);
      noise({ f: 6000, d: 0.02, g: 0.025, type: 'highpass', rev: 0 });
    },
    untick() { tone({ f: 880, to: 587, d: 0.12, g: 0.05, rev: 0.05 }); },

    // rejected action
    deny() {
      tone({ f: 233, d: 0.09, g: 0.09, type: 'triangle', rev: 0 });
      tone({ f: 233, d: 0.09, g: 0.09, t: 0.13, type: 'triangle', rev: 0 });
    },
    error() {
      tone({ f: 196, d: 0.12, g: 0.1, type: 'triangle', rev: 0 });
      tone({ f: 196, d: 0.16, g: 0.1, t: 0.16, type: 'triangle', rev: 0 });
      tone({ f: 65, to: 48, d: 0.3, g: 0.12, rev: 0 });
    },

    // exercise finished: three rising pings on a sub note
    exdone() {
      ping(783.99, 0.00, 0.40, 0.08, 0.15);
      ping(1174.66, 0.09, 0.50, 0.08, 0.15);
      ping(1567.98, 0.18, 0.70, 0.07, 0.18);
      tone({ f: 98, to: 62, d: 0.4, g: 0.12, rev: 0 });
    },

    // "Load Exercise for Today": systems initialising
    boot() {
      tone({ f: 110, to: 440, d: 0.5, g: 0.05, a: 0.2, lp: 700, lpTo: 2400, rev: 0.1 });
      noise({ f: 2000, to: 9000, d: 0.45, g: 0.012, type: 'highpass', a: 0.2, rev: 0.1 });
      ping(1318.5, 0.36, 0.5, 0.06, 0.15);
      ping(1976, 0.46, 0.55, 0.035, 0.15);
    },

    // day chosen, exercises loaded: sub swell and a rising ladder of fifths
    load() {
      tone({ f: 55, to: 98, d: 0.9, g: 0.1, a: 0.3, rev: 0 });
      noise({ f: 800, to: 6000, d: 0.7, g: 0.02, q: 1.2, a: 0.3, rev: 0.1 });
      [440, 660, 880, 1320].forEach((f, i) => ping(f, 0.28 + i * 0.13, 0.55, 0.06, 0.18));
      ping(1760, 0.8, 0.7, 0.03, 0.2);
    },

    // save: two pings a fifth apart
    save() {
      ping(880, 0, 0.35, 0.07, 0.12);
      ping(1318.5, 0.07, 0.5, 0.07, 0.15);
      tone({ f: 110, to: 70, d: 0.2, g: 0.08, rev: 0 });
    },

    // delete: dry power-down
    delete() {
      tone({ f: 440, to: 110, d: 0.45, g: 0.09, lp: 2500, lpTo: 200, rev: 0.05 });
      tone({ f: 80, to: 45, d: 0.35, g: 0.14, rev: 0 });
      noise({ f: 3000, to: 300, d: 0.25, g: 0.025, rev: 0 });
    },
    deleteAll() {
      S.delete();
      tone({ f: 660, to: 82, d: 1.0, g: 0.08, t: 0.15, lp: 2000, lpTo: 120, rev: 0.1 });
      tone({ f: 60, to: 32, d: 1.0, g: 0.22, t: 0.1, rev: 0 });
      noise({ f: 1500, to: 80, d: 0.9, g: 0.03, t: 0.1, rev: 0.1 });
    },

    // dialogs
    warn() { ping(659.25, 0, 0.3, 0.07, 0.1); ping(493.88, 0.16, 0.45, 0.07, 0.1); },
    info() { ping(1046.5, 0, 0.3, 0.06, 0.12); ping(1568, 0.06, 0.4, 0.035, 0.15); },

    // workout finished: drone, telemetry, harmonic ladder, resolved chord
    finish() {
      [55, 110, 165].forEach((f, i) => tone({ f: f, d: 2.7, g: 0.07 - i * 0.015, a: 0.7, rev: 0.12, lp: 900 }));
      [0, 0.11, 0.22].forEach(t => ping(1568, t, 0.09, 0.04, 0.05));
      [440, 660, 880, 1320, 1760].forEach((f, i) => ping(f, 0.45 + i * 0.11, 0.9, 0.07, 0.2));
      tone({ f: 55, to: 38, d: 0.6, g: 0.2, t: 0.45, rev: 0 });
      [220, 330, 440, 660, 880].forEach(f => tone({ f: f, d: 1.8, g: 0.045, t: 1.1, a: 0.25, rev: 0.25, lp: 3000 }));
      ping(2637, 1.25, 1.0, 0.03, 0.25);
      noise({ f: 3000, to: 10000, d: 1.0, g: 0.012, type: 'highpass', t: 1.1, a: 0.3, rev: 0.2 });
    }
  };

  // ---------- public ----------
  function play(name, opts) {
    if (!on || !S[name]) return;
    if (!ensure()) return;
    try { S[name](opts || {}); } catch (e) { console.warn('SFX error', name, e); }
  }

  function unlock() {
    ensure();
    startSilentAudio();
    try {
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
    } catch (e) {}
    unlocked = true;
  }

  function onGesture() {
    if (!unlocked) unlock();
    else {
      if (ctx && ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} }
      if (silent && silent.paused) startSilentAudio();
    }
  }
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev =>
    document.addEventListener(ev, onGesture, { capture: true, passive: true }));

  // keep audio healthy when you leave and come back to the page
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (silent) silent.pause(); }
    else if (unlocked) { startSilentAudio(); if (ctx) { try { ctx.resume(); } catch (e) {} } }
  });

  // ---------- speaker button (top-right on every page) ----------
  const ICON_ON  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/></svg>';
  const ICON_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>';

  const btn = document.createElement('button');
  btn.className = 'sfx-toggle';
  btn.setAttribute('aria-label', 'Sound effects on or off');
  function paint() {
    btn.innerHTML = on ? ICON_ON : ICON_OFF;
    btn.classList.toggle('off', !on);
    btn.title = on ? 'Sound on' : 'Sound off';
  }
  btn.addEventListener('click', () => {
    on = !on;
    DB.save('sfxOn', on);
    paint();
    if (on) { unlock(); play('info'); }
  });
  paint();
  document.body.appendChild(btn);

  return { play: play, unlock: unlock, isOn: () => on, toggle: () => btn.click() };
})();