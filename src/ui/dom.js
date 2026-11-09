// Küçük DOM yardımcıları — framework yok.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string' && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}
export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- toast -----------------------------------------------------------------
export function toast(message, kind = 'info', ms = 3200) {
  const root = document.getElementById('toast-root');
  const el = h('div', { class: `toast toast-${kind}` }, message);
  root.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}

// --- modal -----------------------------------------------------------------
export function openModal({ title, content, actions = [], wide = false, onClose }) {
  const root = document.getElementById('modal-root');
  const close = () => { overlay.remove(); document.body.classList.remove('modal-open'); onClose?.(); };
  const box = h('div', { class: `modal ${wide ? 'modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'modal-head' },
      h('div', { class: 'modal-title' }, title),
      h('button', { class: 'btn-x', 'aria-label': 'Kapat', onClick: close }, '✕')),
    h('div', { class: 'modal-body' }, content),
    actions.length ? h('div', { class: 'modal-actions' }, actions.map(a =>
      h('button', { class: `btn ${a.kind || ''}`, type: 'button', onClick: async (e) => {
        const btn = e.currentTarget;
        if (a.onClick) { btn.disabled = true; try { const r = await a.onClick(close); if (r !== false && a.close !== false) close(); } finally { btn.disabled = false; } }
        else close();
      } }, a.label))) : null);
  const overlay = h('div', { class: 'modal-overlay', onClick: (e) => { if (e.target === overlay) close(); } }, box);
  root.append(overlay);
  document.body.classList.add('modal-open');
  const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  return { close, box };
}

export function confirmDialog(message, { ok = 'Evet', cancel = 'Vazgeç', danger = true } = {}) {
  return new Promise((resolve) => {
    openModal({
      title: 'Emin misin?',
      content: h('p', { class: 'confirm-text' }, message),
      actions: [
        { label: cancel, kind: 'btn-ghost', onClick: () => resolve(false) },
        { label: ok, kind: danger ? 'btn-danger' : 'btn-primary', onClick: () => resolve(true) },
      ],
      onClose: () => resolve(false),
    });
  });
}

// --- form helpers ------------------------------------------------------------
export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'field-hint' }, hint) : null);
}
export function select(options, value, attrs = {}) {
  const el = h('select', attrs);
  for (const o of options) {
    const opt = h('option', { value: o.value }, o.label);
    if (o.value === value) opt.selected = true;
    if (o.disabled) opt.disabled = true;
    el.append(opt);
  }
  return el;
}
export function formData(form) {
  const out = {};
  for (const [k, v] of new FormData(form)) out[k] = typeof v === 'string' ? v.trim() : v;
  return out;
}

// --- misc ---------------------------------------------------------------------
export function debounce(fn, ms = 250) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
export function pluralDays(n) { return `${n} gün`; }
