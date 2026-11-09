// Giriş noktası: oturum kapısı → veri yükle → sayfa yönlendirici
import { CONFIG, DEMO } from './config.js';
import { currentSession, renderButton, signOut } from './auth.js';
import { state, load, subscribe } from './store.js';
import { h, clear, toast, openModal } from './ui/dom.js';
import { ApiError, setPasswordPrompt, deckPass } from './api.js';

import { renderDeck } from './pages/deck.js';
import { renderMap } from './pages/map.js';
import { renderTimeline } from './pages/timeline.js';
import { renderTickets } from './pages/tickets.js';
import { renderDiary } from './pages/diary.js';
import { renderStats } from './pages/stats.js';
import { renderPlace } from './pages/place.js';

const app = document.getElementById('app');

const ROUTES = [
  { path: '', title: 'Güverte', icon: '⚓', render: renderDeck, nav: true },
  { path: 'harita', title: 'Harita', icon: '🗺️', render: renderMap, nav: true },
  { path: 'zaman', title: 'Zaman', icon: '🕰️', render: renderTimeline, nav: true },
  { path: 'biletler', title: 'Biletler', icon: '🎫', render: renderTickets, nav: true },
  { path: 'defter', title: 'Defter', icon: '📖', render: renderDiary, nav: true },
  { path: 'istatistik', title: 'İstatistik', icon: '📊', render: renderStats, nav: true },
  { path: 'yer', title: 'Yer', icon: '📍', render: renderPlace, nav: false },
];

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, query = ''] = raw.split('?');
  const segs = pathPart.split('/').filter(Boolean);
  return { path: segs[0] || '', param: segs[1] ? decodeURIComponent(segs[1]) : null, query: new URLSearchParams(query) };
}

export function navigate(path, param) {
  location.hash = '#/' + path + (param ? '/' + encodeURIComponent(param) : '');
}

// ---------------------------------------------------------------------------
// Kabuk (başlık + gezinme)
// ---------------------------------------------------------------------------
let pageEl = null;
function renderShell() {
  clear(app);
  const me = state.me ? CONFIG.people[state.me.who] : null;
  const nav = h('nav', { class: 'nav', 'aria-label': 'Ana menü' },
    ROUTES.filter(r => r.nav).map(r => h('a', { href: '#/' + r.path, class: 'nav-item', dataset: { path: r.path } },
      h('span', { class: 'nav-icon' }, r.icon), h('span', { class: 'nav-label' }, r.title))));
  const header = h('header', { class: 'topbar' },
    h('a', { href: '#/', class: 'brand' }, h('img', { src: 'assets/img/favicon-64.png', alt: '', class: 'brand-icon' }), h('span', { class: 'brand-text' }, 'RABIALIBERK')),
    nav,
    h('div', { class: 'me' },
      DEMO ? h('span', { class: 'badge badge-demo', title: 'Örnek veriyle çalışıyor; değişiklikler bu tarayıcıda kalır' }, 'DEMO') : null,
      me ? h('img', { src: me.avatar, alt: me.name, class: 'me-avatar', style: { borderColor: me.color }, title: state.me.email }) : null,
      h('button', { class: 'btn-icon', title: 'Çıkış yap', 'aria-label': 'Çıkış yap', onClick: doSignOut }, '⏻')));
  pageEl = h('main', { class: 'page', id: 'page' });
  app.append(header, pageEl);
}

function setActiveNav(path) {
  document.querySelectorAll('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.path === path));
}

let currentCleanup = null;
function route() {
  const { path, param, query } = parseHash();
  const r = ROUTES.find(x => x.path === path) || ROUTES[0];
  if (currentCleanup) { try { currentCleanup(); } catch {} currentCleanup = null; }
  clear(pageEl);
  pageEl.className = 'page page-' + (r.path || 'deck');
  document.title = (r.path ? r.title + ' | ' : '') + 'Rabialiberk Seyahat Günlükleri';
  setActiveNav(r.path);
  window.scrollTo(0, 0);
  try {
    currentCleanup = r.render(pageEl, { param, query, navigate }) || null;
  } catch (err) {
    console.error(err);
    pageEl.append(h('div', { class: 'panel error-panel' }, h('h2', {}, 'Bir şeyler ters gitti'), h('pre', {}, String(err?.stack || err))));
  }
}

// ---------------------------------------------------------------------------
// Giriş ekranı
// ---------------------------------------------------------------------------
function renderLogin(message) {
  clear(app);
  const btn = h('div', { class: 'gsi-button' });
  app.append(h('div', { class: 'login' },
    h('div', { class: 'login-card panel' },
      h('div', { class: 'login-sprites' },
        h('img', { src: CONFIG.people.rkf.sprite, alt: 'Rabia', class: 'sprite' }),
        h('img', { src: CONFIG.people.abf.sprite, alt: 'Ali Berk', class: 'sprite' })),
      h('h1', { class: 'title' }, 'RABIALIBERK', h('br'), 'SEYAHAT GÜNLÜKLERİ'),
      h('div', { class: 'login-sub' }, 'ERİŞİM KORUMALI GÜVERTE'),
      message ? h('div', { class: 'login-msg' }, message) : null,
      DEMO
        ? h('div', { class: 'login-demo' },
          h('p', {}, 'Demo modu: örnek veriyle geziniyorsun. Kaptan seç:'),
          h('div', { class: 'demo-pick' },
            ...['rkf', 'abf'].map(who => h('button', { class: 'btn btn-primary', onClick: () => { sessionStorage.setItem('demo.who', who); boot(); } },
              h('img', { src: CONFIG.people[who].avatar, alt: '' }), CONFIG.people[who].name))))
        : btn,
      h('div', { class: 'login-foot' }, DEMO ? 'Kurulum için docs/KURULUM.md' : 'Sadece kaptanların Google hesapları girebilir.'))));
  if (!DEMO) renderButton(btn);
}

// Güverte parolası penceresi (Apps Script'te DECK_PASSWORD ayarlıysa)
setPasswordPrompt((message) => new Promise((resolve) => {
  const input = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Güverte parolası', autofocus: true });
  const form = h('form', { class: 'form', onSubmit: (e) => { e.preventDefault(); if (input.value) { resolve(input.value); m.close(); } } },
    message && message !== 'Güverte parolası gerekli.' ? h('div', { class: 'login-msg' }, message) : null,
    h('p', { class: 'muted small' }, 'Google girişine ek olarak kaptanların belirlediği parola.'),
    input);
  const m = openModal({ title: 'GÜVERTE PAROLASI', content: form,
    actions: [{ label: 'Giriş', kind: 'btn-primary', close: false, onClick: () => { if (input.value) { resolve(input.value); m.close(); } return false; } }],
    onClose: () => resolve(null) });
  setTimeout(() => input.focus(), 50);
}));

function doSignOut() {
  signOut();
  deckPass.set('');
  state.ready = false; state.me = null;
  renderLogin();
}

// ---------------------------------------------------------------------------
// Açılış
// ---------------------------------------------------------------------------
async function boot() {
  if (!DEMO && !currentSession()) { renderLogin(); return; }
  if (DEMO && !sessionStorage.getItem('demo.who')) { renderLogin(); return; }
  try {
    clear(app);
    app.append(h('div', { class: 'boot' }, h('div', { class: 'boot-title' }, 'RABIALIBERK', h('br'), 'SEYAHAT GÜNLÜKLERİ'), h('div', { class: 'boot-sub blink' }, 'VERİLER UYDUDAN ÇEKİLİYOR...')));
    await load();
    renderShell();
    route();
  } catch (err) {
    console.error(err);
    if (err instanceof ApiError && err.code === 'auth' || err?.code === 'auth') {
      signOut();
      renderLogin(err.message);
    } else {
      renderLogin('Veri yüklenemedi: ' + (err.message || err));
    }
  }
}

window.addEventListener('hashchange', () => { if (state.ready) route(); });
window.addEventListener('auth:changed', () => { if (!state.ready) boot(); });
subscribe(() => { /* sayfalar kendi aboneliklerini kurar */ });

boot();
