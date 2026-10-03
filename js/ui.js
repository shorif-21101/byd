// ===== UI: styled pop-ups (replace the browser's confirm / alert / prompt) =====
//   UI.confirm({ title, message, okText, cancelText, tone, requireText })  -> Promise<true/false>
//   UI.alert({ title, message, okText })                                   -> Promise
//   UI.prompt({ title, message, value, placeholder, okText })              -> Promise<text or null>

const UI = (function () {
  const ICON_WARN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
  const ICON_INFO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function dialog(cfg) {
    return new Promise(resolve => {
      const needInput = !!(cfg.requireText || cfg.input);
      const ov = document.createElement('div');
      ov.className = 'dlg-overlay';
      ov.innerHTML = `
        <div class="dlg ${cfg.tone || 'danger'}" role="dialog" aria-modal="true">
          <div class="dlg-icon">${cfg.tone === 'info' ? ICON_INFO : ICON_WARN}</div>
          <div class="dlg-title">${esc(cfg.title || 'Are you sure?')}</div>
          ${cfg.message ? `<div class="dlg-msg">${esc(cfg.message)}</div>` : ''}
          ${cfg.requireText ? `<div class="dlg-hint">Type <b>${esc(cfg.requireText)}</b> to confirm</div>` : ''}
          ${needInput ? `<input class="input dlg-input" type="text" autocomplete="off" spellcheck="false" placeholder="${esc(cfg.placeholder || '')}" value="${esc(cfg.value || '')}">` : ''}
          <div class="dlg-actions">
            ${cfg.noCancel ? '' : `<button class="btn" data-dlg="cancel">${esc(cfg.cancelText || 'Cancel')}</button>`}
            <button class="btn dlg-ok" data-dlg="ok">${esc(cfg.okText || 'OK')}</button>
          </div>
        </div>`;
      document.body.appendChild(ov);
            if (window.SFX) SFX.play(cfg.tone === 'info' ? 'info' : 'warn');

      const ok = ov.querySelector('.dlg-ok');
      const input = ov.querySelector('.dlg-input');

      function valid() {
        if (cfg.requireText) return input.value.trim().toLowerCase() === String(cfg.requireText).toLowerCase();
        return true;
      }
      function sync() { ok.disabled = !valid(); }

      function close(result) {
        document.removeEventListener('keydown', onKey, true);
        ov.classList.add('closing');
        setTimeout(() => ov.remove(), 170);
        resolve(result);
      }

      function onKey(e) {
        if (e.key === 'Escape') {
          e.preventDefault(); e.stopPropagation();
          close({ ok: false, value: null });
        } else if (e.key === 'Enter') {
          if (e.target && e.target.dataset && e.target.dataset.dlg === 'cancel') return;   // let the Cancel button do its own click
          e.preventDefault(); e.stopPropagation();
          if (!ok.disabled) close({ ok: true, value: input ? input.value : '' });
        }
      }

      ov.addEventListener('click', e => {
        if (e.target === ov) { close({ ok: false, value: null }); return; }
        const b = e.target.closest('[data-dlg]');
        if (!b) return;
        if (b.dataset.dlg === 'cancel') close({ ok: false, value: null });
        if (b.dataset.dlg === 'ok' && !ok.disabled) close({ ok: true, value: input ? input.value : '' });
      });

      if (input) input.addEventListener('input', sync);
      sync();
      document.addEventListener('keydown', onKey, true);
      setTimeout(() => { (input || ok).focus(); if (input && !cfg.requireText) input.select(); }, 30);
    });
  }

  return {
    confirm: cfg => dialog(cfg).then(r => r.ok),
    alert:   cfg => dialog(Object.assign({ tone: 'info', noCancel: true, title: 'Heads up', okText: 'Got it' }, cfg)).then(() => undefined),
    prompt:  cfg => dialog(Object.assign({ tone: 'info', input: true, okText: 'Save' }, cfg)).then(r => (r.ok ? r.value : null))
  };
})();