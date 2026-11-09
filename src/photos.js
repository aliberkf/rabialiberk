// Fotoğraf işleri: tarayıcıda küçültme, yükleme, özel görsellerin önbellekli çekilmesi.
import { CONFIG } from './config.js';
import { api } from './api.js';
import { actions } from './store.js';

// --- küçültme ---------------------------------------------------------------
async function loadImage(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {}
  }
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = rej; img.src = url;
  });
}

function drawScaled(img, max, quality) {
  const w = img.width, h = img.height;
  const scale = Math.min(1, max / Math.max(w, h));
  const cw = Math.round(w * scale), ch = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, cw, ch);
  return { dataUrl: canvas.toDataURL('image/jpeg', quality), width: cw, height: ch };
}

export async function prepareImage(file) {
  const img = await loadImage(file);
  const web = drawScaled(img, CONFIG.photo.webMax, CONFIG.photo.quality);
  const thumb = drawScaled(img, CONFIG.photo.thumbMax, 0.8);
  const takenAt = file.lastModified ? new Date(file.lastModified).toISOString().slice(0, 16) : '';
  return { web: web.dataUrl, thumb: thumb.dataUrl, width: web.width, height: web.height, taken_at: takenAt };
}

/** Birden çok dosyayı sırayla yükler; onProgress(i, n, name). */
export async function uploadFiles(files, { entry_id = '', place_id = '', onProgress } = {}) {
  const out = [];
  const list = [...files];
  for (let i = 0; i < list.length; i++) {
    onProgress?.(i, list.length, list[i].name);
    const prepared = await prepareImage(list[i]);
    const rec = await actions.uploadPhoto({ ...prepared, entry_id, place_id, caption: '' });
    putCache(rec.thumb_id, prepared.thumb); putCache(rec.id, prepared.web);
    out.push(rec);
  }
  onProgress?.(list.length, list.length, '');
  return out;
}

// --- önbellekli çekme --------------------------------------------------------
const mem = new Map();
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open('rabialiberk-cache', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('img');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}
async function idbGet(k) {
  const d = await db(); if (!d) return null;
  return new Promise((res) => { const r = d.transaction('img').objectStore('img').get(k); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); });
}
async function idbPut(k, v) {
  const d = await db(); if (!d) return;
  try { d.transaction('img', 'readwrite').objectStore('img').put(v, k); } catch {}
}
function putCache(id, dataUrl) { if (id && dataUrl) { mem.set(id, dataUrl); idbPut(id, dataUrl); } }

let queue = new Map(); // id → [resolve]
let timer = null;

/** Drive dosya kimliğinden data URL döndürür (toplu, önbellekli). */
export function getImage(id) {
  if (!id) return Promise.resolve(null);
  if (mem.has(id)) return Promise.resolve(mem.get(id));
  return new Promise(async (resolve) => {
    const cached = await idbGet(id);
    if (cached) { mem.set(id, cached); return resolve(cached); }
    if (!queue.has(id)) queue.set(id, []);
    queue.get(id).push(resolve);
    clearTimeout(timer);
    timer = setTimeout(flush, 40);
  });
}

async function flush() {
  const batch = queue; queue = new Map();
  const ids = [...batch.keys()];
  for (let i = 0; i < ids.length; i += 24) {
    const chunk = ids.slice(i, i + 24);
    let data = {};
    try { data = (await api.call('getPhotos', { ids: chunk })).data || {}; } catch (e) { console.warn('getPhotos', e); }
    for (const id of chunk) {
      const url = data[id] || null;
      if (url) putCache(id, url);
      for (const r of batch.get(id)) r(url);
    }
  }
}

/** <img> öğesi: yüklenene kadar iskelet, sonra görsel. */
export function imgEl(id, { alt = '', className = '' } = {}) {
  const el = document.createElement('img');
  el.alt = alt; el.className = `photo-img loading ${className}`; el.loading = 'lazy'; el.decoding = 'async';
  getImage(id).then((url) => {
    if (url) { el.src = url; el.classList.remove('loading'); }
    else { el.classList.add('broken'); el.classList.remove('loading'); }
  });
  return el;
}
