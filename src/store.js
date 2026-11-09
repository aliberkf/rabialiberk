// Uygulama durumu: veriyi yükler, türetilmiş değerleri hesaplar, değişiklikleri sunucuya yazar.
import { api } from './api.js';
import { buildPlaceIndex, computeStays, aggregate, computeStats, consistencyWarnings, isoToday } from './engine.js';

const listeners = new Set();
export const state = {
  ready: false,
  me: null,          // { email, who }
  places: [], tickets: [], entries: [], photos: [],
  idx: null, stays: null, agg: null, stats: null, warnings: [],
  today: isoToday(),
  loadedAt: null,
};

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(state); }

export function recompute() {
  state.today = isoToday();
  state.idx = buildPlaceIndex(state.places);
  state.stays = computeStays(state.tickets, state.today);
  state.agg = aggregate(state.stays, state.idx, state.today);
  state.stats = computeStats(state.tickets, state.stays, state.agg, state.idx, state.today);
  state.warnings = consistencyWarnings(state.tickets, state.idx);
  emit();
}

export async function load() {
  const res = await api.call('bootstrap');
  state.me = res.me;
  Object.assign(state, {
    places: res.data.places || [], tickets: res.data.tickets || [],
    entries: res.data.entries || [], photos: res.data.photos || [],
  });
  state.ready = true;
  state.loadedAt = Date.now();
  recompute();
  return state;
}

// --- yazma işlemleri (iyimser değil: sunucu onayladıktan sonra yerel durum güncellenir) ---
async function mutate(action, payload, apply) {
  const res = await api.call(action, payload);
  apply(res.data);
  recompute();
  return res.data;
}

export const actions = {
  addTicket: (t) => mutate('addTicket', t, (rec) => state.tickets.push(rec)),
  updateTicket: (t) => mutate('updateTicket', t, (rec) => { const i = state.tickets.findIndex(x => x.id === rec.id); if (i >= 0) state.tickets[i] = rec; }),
  deleteTicket: (id) => mutate('deleteTicket', { id }, () => { state.tickets = state.tickets.filter(x => x.id !== id); }),

  addPlace: (p) => mutate('addPlace', p, (rec) => state.places.push(rec)),
  updatePlace: (p) => mutate('updatePlace', p, (rec) => { const i = state.places.findIndex(x => x.id === rec.id); if (i >= 0) state.places[i] = rec; }),
  deletePlace: (id) => mutate('deletePlace', { id }, () => { state.places = state.places.filter(x => x.id !== id); }),

  addEntry: (e) => mutate('addEntry', e, (rec) => state.entries.push(rec)),
  updateEntry: (e) => mutate('updateEntry', e, (rec) => { const i = state.entries.findIndex(x => x.id === rec.id); if (i >= 0) state.entries[i] = rec; }),
  deleteEntry: (id) => mutate('deleteEntry', { id }, () => {
    state.entries = state.entries.filter(x => x.id !== id);
    state.photos = state.photos.filter(p => p.entry_id !== id);
  }),

  uploadPhoto: (p) => mutate('uploadPhoto', p, (rec) => state.photos.push(rec)),
  updatePhoto: (p) => mutate('updatePhoto', p, (rec) => { const i = state.photos.findIndex(x => x.id === rec.id); if (i >= 0) state.photos[i] = rec; }),
  deletePhoto: (id) => mutate('deletePhoto', { id }, () => { state.photos = state.photos.filter(x => x.id !== id); }),
};

// --- türetilmiş seçiciler ---
export const sel = {
  person: (who) => who,
  entriesAt: (placeId) => state.entries.filter(e => e.place_id === placeId || ancestorsOf(e.place_id).includes(placeId)),
  photosAt: (placeId) => state.photos.filter(p => p.place_id === placeId || ancestorsOf(p.place_id).includes(placeId)),
  photosOfEntry: (entryId) => state.photos.filter(p => p.entry_id === entryId),
  place: (id) => state.idx?.get(id),
  allPlaces: () => [...state.idx.values()],
};

function ancestorsOf(id) {
  const out = []; let cur = state.idx.get(id), g = 0;
  while (cur && g++ < 6) { out.push(cur.id); cur = state.idx.get(cur.parent_id); }
  return out;
}
