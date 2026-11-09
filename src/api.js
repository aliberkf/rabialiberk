// API istemcisi: gerçek modda Apps Script, demo modda localStorage.
import { CONFIG, DEMO } from './config.js';
import { getIdToken, refreshToken } from './auth.js';

export class ApiError extends Error {
  constructor(message, code) { super(message); this.code = code || 'error'; }
}

async function callRemote(action, payload, retry = true) {
  const idToken = await getIdToken();
  const res = await fetch(CONFIG.apiUrl, {
    method: 'POST',
    // text/plain → CORS ön-isteği (preflight) tetiklemez; Apps Script bunu ister
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ idToken, action, payload }),
    redirect: 'follow',
  });
  if (!res.ok) throw new ApiError('Sunucuya ulaşılamadı (' + res.status + ')', 'network');
  const data = await res.json();
  if (!data.ok) {
    if (data.code === 'auth' && retry) {
      // oturum süresi dolmuş olabilir: sessizce yenile ve bir kez daha dene
      const ok = await refreshToken();
      if (ok) return callRemote(action, payload, false);
    }
    throw new ApiError(data.error || 'Bilinmeyen hata', data.code);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Demo modu: data/seed.json → localStorage; fotoğraflar IndexedDB'de
// ---------------------------------------------------------------------------
const LS_KEY = 'rabialiberk.demo.v1';

async function demoLoad() {
  const saved = localStorage.getItem(LS_KEY);
  if (saved) return JSON.parse(saved);
  const res = await fetch('data/seed.json', { cache: 'no-cache' });
  const seed = await res.json();
  localStorage.setItem(LS_KEY, JSON.stringify(seed));
  return seed;
}
function demoSave(db) { localStorage.setItem(LS_KEY, JSON.stringify(db)); }
export function demoReset() { localStorage.removeItem(LS_KEY); }

function newId(prefix) {
  return prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

// küçük bir IndexedDB sarmalayıcı (demo fotoğrafları için)
function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('rabialiberk-demo', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('photos');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(key, val) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('photos', 'readwrite'); tx.objectStore('photos').put(val, key);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise((res, rej) => {
    const r = db.transaction('photos').objectStore('photos').get(key);
    r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error);
  });
}

const demoMe = () => ({ email: 'demo@rabialiberk.com', who: sessionStorage.getItem('demo.who') || 'abf' });

async function callDemo(action, payload) {
  await new Promise(r => setTimeout(r, 120)); // küçük bir gecikme hissi
  const db = await demoLoad();
  const me = demoMe();
  const upsert = (table, rec) => { db[table].push(rec); demoSave(db); return rec; };
  const update = (table, id, patch, skip = []) => {
    const rec = db[table].find(r => r.id === id);
    if (!rec) throw new ApiError('Kayıt bulunamadı: ' + id);
    Object.keys(patch).forEach(k => { if (!skip.includes(k) && patch[k] !== undefined) rec[k] = patch[k]; });
    demoSave(db); return rec;
  };
  const remove = (table, id) => { db[table] = db[table].filter(r => r.id !== id); demoSave(db); return { id }; };

  switch (action) {
    case 'bootstrap':
      return { ok: true, me, data: { ...db, serverTime: nowIso(), version: 'demo' } };
    case 'addTicket':
      return { ok: true, me, data: upsert('tickets', { id: newId('T'), time: '', carrier: '', note: '', ...payload, created_at: nowIso(), created_by: me.who }) };
    case 'updateTicket': return { ok: true, me, data: update('tickets', payload.id, payload, ['id', 'created_at', 'created_by']) };
    case 'deleteTicket': return { ok: true, me, data: remove('tickets', payload.id) };
    case 'addPlace': {
      const id = payload.id || slug(payload.parent_id, payload.name);
      if (db.places.some(p => p.id === id)) throw new ApiError('Bu kimlikte bir yer zaten var: ' + id);
      return { ok: true, me, data: upsert('places', { note: '', ...payload, id, created_at: nowIso() }) };
    }
    case 'updatePlace': return { ok: true, me, data: update('places', payload.id, payload, ['id', 'created_at']) };
    case 'deletePlace': {
      const used = db.tickets.some(t => t.from_place === payload.id || t.to_place === payload.id) || db.entries.some(e => e.place_id === payload.id);
      if (used) throw new ApiError('Bu yer biletlerde veya yazılarda kullanılıyor; önce onları değiştir.');
      return { ok: true, me, data: remove('places', payload.id) };
    }
    case 'addEntry':
      return { ok: true, me, data: upsert('entries', { title: '', ...payload, id: newId('E'), author: me.who, created_at: nowIso(), updated_at: '' }) };
    case 'updateEntry': return { ok: true, me, data: update('entries', payload.id, { ...payload, updated_at: nowIso() }, ['id', 'author', 'created_at']) };
    case 'deleteEntry':
      db.photos = db.photos.filter(p => p.entry_id !== payload.id); demoSave(db);
      return { ok: true, me, data: remove('entries', payload.id) };
    case 'uploadPhoto': {
      const id = newId('P'), thumb_id = id + '_t';
      await idbPut(id, payload.web); await idbPut(thumb_id, payload.thumb);
      const rec = { id, thumb_id, entry_id: payload.entry_id || '', place_id: payload.place_id || '', caption: payload.caption || '',
        taken_at: payload.taken_at || '', width: payload.width || '', height: payload.height || '', uploaded_by: me.who, created_at: nowIso() };
      return { ok: true, me, data: upsert('photos', rec) };
    }
    case 'updatePhoto': return { ok: true, me, data: update('photos', payload.id, payload, ['id']) };
    case 'deletePhoto': return { ok: true, me, data: remove('photos', payload.id) };
    case 'getPhotos': {
      const out = {};
      for (const id of payload.ids) out[id] = await idbGet(id);
      return { ok: true, me, data: out };
    }
    default: throw new ApiError('Bilinmeyen işlem: ' + action);
  }
}

export function slug(parent, name) {
  const s = String(name).toLowerCase()
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/â/g, 'a')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return String(parent).toLowerCase() + '-' + s;
}

export const api = {
  call: (action, payload = {}) => (DEMO ? callDemo(action, payload) : callRemote(action, payload)),
  isDemo: DEMO,
};
