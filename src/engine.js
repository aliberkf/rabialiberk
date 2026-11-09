// Hesaplama motoru: yerler, konaklamalar (gün sayıları), harita renkleri, istatistikler.
// Formül yok — her şey ham biletlerden türetilir.
import { COUNTRIES, PROVINCES } from './data/catalog.js';

export const PEOPLE = ['abf', 'rkf'];
export const MODES = {
  plane: { label: 'Uçak', icon: '✈️' },
  road: { label: 'Karayolu', icon: '🚌' },
  train: { label: 'Tren', icon: '🚆' },
  ship: { label: 'Gemi / Vapur', icon: '⛴️' },
  start: { label: 'Başlangıç noktası', icon: '🏁' },
};
export const KINDS = { country: 'Ülke', province: 'İl', city: 'Şehir', spot: 'Nokta' };

const DAY = 86_400_000;
export const toDate = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);

// ---------------------------------------------------------------------------
// Yer kataloğu + kullanıcı yerleri
// ---------------------------------------------------------------------------
export function buildPlaceIndex(customPlaces) {
  const idx = new Map();
  for (const c of COUNTRIES) idx.set(c.id, { id: c.id, name: c.name, en: c.en, kind: 'country', parent_id: '', lat: c.lat, lng: c.lng, country: c.id, builtin: true });
  for (const p of PROVINCES) idx.set(p.id, { id: p.id, name: p.name, plate: p.plate, kind: 'province', parent_id: 'TR', lat: p.lat, lng: p.lng, country: 'TR', province: p.id, builtin: true });
  for (const p of customPlaces || []) {
    idx.set(p.id, { ...p, lat: Number(p.lat), lng: Number(p.lng), builtin: false });
  }
  // zincir çözümle: country / province
  for (const p of idx.values()) {
    if (p.builtin) continue;
    let cur = p, guard = 0;
    while (cur && guard++ < 6) {
      if (cur.kind === 'country') { p.country = cur.id; break; }
      if (cur.kind === 'province') { p.province = cur.id; p.country = 'TR'; break; }
      cur = idx.get(cur.parent_id);
    }
  }
  return idx;
}

export function placeLabel(idx, id, { withParent = false } = {}) {
  const p = idx.get(id);
  if (!p) return id || '—';
  if (!withParent) return p.name;
  if (p.kind === 'spot' || p.kind === 'city') {
    const parent = idx.get(p.parent_id);
    return parent ? `${p.name}, ${parent.name}` : p.name;
  }
  return p.name;
}

/** Bir yerin kendisi + tüm üst yerleri (province, country) — toplama için. */
export function ancestors(idx, id) {
  const out = [];
  let cur = idx.get(id), guard = 0;
  while (cur && guard++ < 6) { out.push(cur.id); cur = idx.get(cur.parent_id); }
  return out;
}

/** İki yer aynı mı ya da biri diğerinin içinde mi (Heybeliada ⊂ İstanbul)? Ortak olan daha genel yeri döndürür. */
export function samePlace(idx, a, b) {
  if (a === b) return a;
  const chainA = ancestors(idx, a), chainB = ancestors(idx, b);
  if (chainA.includes(b)) return b;
  if (chainB.includes(a)) return a;
  return null;
}

// ---------------------------------------------------------------------------
// Konaklamalar: kişi, varış yerinde bir sonraki biletine kadar kalır
// ---------------------------------------------------------------------------
export function sortTickets(tickets) {
  return [...tickets].sort((a, b) => (a.date + (a.time || '00:00') + a.id).localeCompare(b.date + (b.time || '00:00') + b.id));
}

/**
 * @returns {Object<string, Array<{place, from, to, days, open, ticket, next}>>} kişi → konaklamalar
 */
export function computeStays(tickets, today = isoToday()) {
  const result = {};
  for (const who of PEOPLE) {
    const mine = sortTickets(tickets.filter(t => (t.owner === who || t.owner === 'both') && t.date <= today));
    const stays = [];
    for (let i = 0; i < mine.length; i++) {
      const t = mine[i], next = mine[i + 1];
      const end = next ? next.date : today;
      const days = Math.max(0, daysBetween(t.date, end));
      stays.push({ who, place: t.to_place, from: t.date, to: next ? next.date : null, days, open: !next, ticket: t, next: next || null });
    }
    result[who] = stays;
  }
  return result;
}

/** Her iki kişinin aynı yerde aynı anda geçirdiği gün sayısı (yer → gün). */
export function computeTogether(stays, idx, today = isoToday()) {
  const out = new Map();
  const A = stays.abf, B = stays.rkf;
  for (const a of A) {
    const aEnd = a.to || today;
    for (const b of B) {
      const bEnd = b.to || today;
      const start = a.from > b.from ? a.from : b.from;
      const end = aEnd < bEnd ? aEnd : bEnd;
      const overlap = daysBetween(start, end);
      if (overlap <= 0) continue;
      // aynı yer ya da biri diğerinin içinde (Heybeliada ⊂ İstanbul)
      const common = samePlace(idx, a.place, b.place);
      if (!common) continue;
      for (const id of ancestors(idx, common)) out.set(id, (out.get(id) || 0) + overlap);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Yer bazında toplamlar (kendisi + alt yerler)
// ---------------------------------------------------------------------------
export function aggregate(stays, idx, today = isoToday()) {
  const agg = new Map(); // id → { abf, rkf, visits:{abf,rkf}, both, together, color }
  const get = (id) => {
    if (!agg.has(id)) agg.set(id, { id, abf: 0, rkf: 0, visits: { abf: 0, rkf: 0 }, together: 0, stays: [] });
    return agg.get(id);
  };
  for (const who of PEOPLE) {
    for (const s of stays[who]) {
      if (s.ticket.mode === 'start' && s.days === 0) continue;
      for (const id of ancestors(idx, s.place)) {
        const a = get(id);
        a[who] += s.days;
        if (s.ticket.mode !== 'start') a.visits[who] += 1;
        a.stays.push(s);
      }
    }
  }
  const together = computeTogether(stays, idx, today);
  for (const [id, d] of together) get(id).together = d;
  for (const a of agg.values()) {
    a.both = Math.min(a.abf, a.rkf);
    a.color = a.abf > 0 && a.rkf > 0 ? 'both' : a.rkf > 0 ? 'rkf' : a.abf > 0 ? 'abf' : 'none';
    a.total = a.abf + a.rkf;
    a.stays.sort((x, y) => x.from.localeCompare(y.from));
  }
  return agg;
}

// ---------------------------------------------------------------------------
// İstatistikler
// ---------------------------------------------------------------------------
export function haversineKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return 0;
  const R = 6371, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function computeStats(tickets, stays, agg, idx, today = isoToday()) {
  const per = {};
  for (const who of PEOPLE) {
    const mine = tickets.filter(t => (t.owner === who || t.owner === 'both') && t.mode !== 'start' && t.date <= today);
    const km = mine.reduce((s, t) => s + haversineKm(idx.get(t.from_place), idx.get(t.to_place)), 0);
    const modes = {};
    for (const t of mine) modes[t.mode] = (modes[t.mode] || 0) + 1;
    const countries = new Set(), provinces = new Set();
    for (const s of stays[who]) {
      const p = idx.get(s.place);
      if (!p) continue;
      if (p.country) countries.add(p.country);
      if (p.province) provinces.add(p.province);
    }
    const longest = [...stays[who]].filter(s => s.ticket.mode !== 'start').sort((a, b) => b.days - a.days)[0] || null;
    const current = stays[who].find(s => s.open) || null;
    per[who] = { trips: mine.length, km: Math.round(km), modes, countries: [...countries], provinces: [...provinces], longest, current };
  }
  const bothTrips = tickets.filter(t => t.owner === 'both' && t.mode !== 'start' && t.date <= today).length;
  let togetherDays = 0;
  for (const a of agg.values()) if (idx.get(a.id)?.kind === 'country') togetherDays += a.together; // ülke düzeyinde toplam (çift sayım yok)
  const years = {};
  for (const t of tickets) {
    if (t.mode === 'start' || t.date > today) continue;
    const y = t.date.slice(0, 4);
    years[y] = years[y] || { trips: 0, both: 0 };
    years[y].trips += 1; if (t.owner === 'both') years[y].both += 1;
  }
  return { per, bothTrips, togetherDays, years };
}

/** Bilet tutarlılığı: kişi o tarihte "from" yerinde değilse uyarı. */
export function consistencyWarnings(tickets, idx) {
  const warnings = [];
  for (const who of PEOPLE) {
    const mine = sortTickets(tickets.filter(t => t.owner === who || t.owner === 'both'));
    for (let i = 1; i < mine.length; i++) {
      const prev = mine[i - 1], t = mine[i];
      if (t.mode === 'start') continue;
      if (!samePlace(idx, prev.to_place, t.from_place)) {
        warnings.push({ who, ticket: t, expected: prev.to_place });
      }
    }
  }
  return warnings;
}

export function formatDays(n) {
  if (n === 0) return '0 gün';
  if (n < 30) return `${n} gün`;
  const months = Math.floor(n / 30), rest = n % 30;
  return rest ? `${months} ay ${rest} gün` : `${months} ay`;
}

export function formatDate(iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
  if (!iso) return '';
  return toDate(iso).toLocaleDateString('tr-TR', { ...opts, timeZone: 'UTC' });
}
export function formatDateShort(iso) { return formatDate(iso, { day: 'numeric', month: 'short' }); }
export function monthLabel(iso) { return formatDate(iso, { month: 'long', year: 'numeric' }); }

/** Türkçe bulunma hâli eki: İstanbul'da, İzmir'de, Gaziantep'te */
export function locative(name) {
  const n = String(name || '');
  const lower = n.toLocaleLowerCase('tr');
  const vowels = 'aeıioöuü';
  let last = '';
  for (let i = lower.length - 1; i >= 0; i--) if (vowels.includes(lower[i])) { last = lower[i]; break; }
  const back = 'aıou'.includes(last);
  const hard = 'pçtksşhf'.includes(lower[lower.length - 1]);
  return `${n}'${hard ? 't' : 'd'}${back ? 'a' : 'e'}`;
}
