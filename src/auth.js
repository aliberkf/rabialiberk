// Google ile giriş (Google Identity Services). Şifre yok; Google'ın verdiği ID token
// Apps Script'e gönderilir, orada doğrulanır ve e-posta beyaz listeyle karşılaştırılır.
import { CONFIG, DEMO } from './config.js';

const KEY = 'rabialiberk.idtoken';
let gisReady = null;

function decodeJwt(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(payload))));
  } catch { return null; }
}

export function currentSession() {
  const token = sessionStorage.getItem(KEY) || localStorage.getItem(KEY);
  if (!token) return null;
  const claims = decodeJwt(token);
  if (!claims || !claims.exp) return null;
  return { token, email: claims.email, name: claims.name, picture: claims.picture, exp: claims.exp * 1000 };
}

function saveToken(token) {
  localStorage.setItem(KEY, token);
}

export function signOut() {
  localStorage.removeItem(KEY); sessionStorage.removeItem(KEY);
  try { window.google?.accounts.id.disableAutoSelect(); } catch {}
}

function loadGis() {
  if (gisReady) return gisReady;
  gisReady = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google.accounts.id);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = () => resolve(window.google.accounts.id);
    s.onerror = () => reject(new Error('Google giriş kütüphanesi yüklenemedi.'));
    document.head.appendChild(s);
  });
  return gisReady;
}

let pendingResolve = null;

async function init() {
  const id = await loadGis();
  id.initialize({
    client_id: CONFIG.clientId,
    callback: (resp) => {
      if (resp?.credential) {
        saveToken(resp.credential);
        if (pendingResolve) { pendingResolve(resp.credential); pendingResolve = null; }
        window.dispatchEvent(new CustomEvent('auth:changed'));
      }
    },
    auto_select: true,
    cancel_on_tap_outside: false,
    itp_support: true,
    use_fedcm_for_prompt: true,
  });
  return id;
}

/** Giriş butonunu verilen öğeye çizer. */
export async function renderButton(el) {
  const id = await init();
  id.renderButton(el, { theme: 'filled_black', size: 'large', shape: 'rectangular', text: 'signin_with', locale: 'tr', width: 280 });
}

/** Sessiz yenileme (One Tap / FedCM). Başarırsa true. */
export async function refreshToken() {
  if (DEMO) return true;
  const id = await init();
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    pendingResolve = () => done(true);
    const timer = setTimeout(() => done(false), 8000);
    try {
      id.prompt((n) => {
        if (n.isNotDisplayed?.() || n.isSkippedMoment?.() || n.isDismissedMoment?.()) {
          clearTimeout(timer); if (!settled) done(false);
        }
      });
    } catch { clearTimeout(timer); done(false); }
  });
}

/** Geçerli bir ID token döndürür; süresi dolmak üzereyse yenilemeyi dener. */
export async function getIdToken() {
  if (DEMO) return 'demo';
  const s = currentSession();
  if (s && s.exp - Date.now() > 60_000) return s.token;
  const ok = await refreshToken();
  const s2 = currentSession();
  if (ok && s2) return s2.token;
  const err = new Error('Oturum süresi doldu, yeniden giriş yap.');
  err.code = 'auth';
  throw err;
}
