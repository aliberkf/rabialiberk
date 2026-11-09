// Paylaşılan arayüz parçaları
import { CONFIG } from '../config.js';
import { state, actions, sel } from '../store.js';
import { h, openModal, toast, field, select, debounce, escapeHtml } from './dom.js';
import { MODES, KINDS, placeLabel, formatDate, formatDays, isoToday } from '../engine.js';
import { PROVINCES } from '../data/catalog.js';
import { imgEl, uploadFiles } from '../photos.js';

export const personName = (who) => who === 'both' ? 'Birlikte' : (CONFIG.people[who]?.name || who);
export const personColor = (who) => who === 'both' ? CONFIG.bothSoft : (CONFIG.people[who]?.soft || CONFIG.people[who]?.color || '#888');

export function ownerBadge(who, { small = false } = {}) {
  if (who === 'both') {
    return h('span', { class: `owner owner-both ${small ? 'small' : ''}` },
      h('img', { src: CONFIG.people.rkf.avatar, alt: '' }), h('img', { src: CONFIG.people.abf.avatar, alt: '' }),
      h('span', {}, 'Birlikte'));
  }
  const p = CONFIG.people[who];
  if (!p) return h('span', { class: 'owner' }, who);
  return h('span', { class: `owner owner-${who} ${small ? 'small' : ''}`, style: { '--c': p.color } },
    h('img', { src: p.avatar, alt: '' }), h('span', {}, p.name));
}

export function modeIcon(mode) { return MODES[mode]?.icon || '•'; }

export function placeLink(id, opts) {
  return h('a', { href: '#/yer/' + encodeURIComponent(id), class: 'place-link' }, placeLabel(state.idx, id, opts));
}

// ---------------------------------------------------------------------------
// Yer seçici: katalog + kullanıcı yerleri üzerinde arama; "yeni yer ekle" kısayolu
// ---------------------------------------------------------------------------
const norm = (s) => String(s).toLocaleLowerCase('tr').replace(/i̇/g, 'i');

export function placePicker({ name, value = '', placeholder = 'Yer ara…', required = false, onChange, allowCreate = true }) {
  const hidden = h('input', { type: 'hidden', name, value });
  const input = h('input', { type: 'text', class: 'picker-input', placeholder, autocomplete: 'off', required: required && !value ? true : null });
  const list = h('div', { class: 'picker-list', hidden: true });
  const wrap = h('div', { class: 'picker' }, input, hidden, list);
  const setValue = (id) => {
    hidden.value = id || '';
    input.value = id ? placeLabel(state.idx, id, { withParent: true }) : '';
    input.required = required && !id;
    wrap.classList.toggle('has-value', !!id);
    onChange?.(id);
  };
  if (value) setValue(value);

  const render = (q) => {
    const all = sel.allPlaces();
    const nq = norm(q);
    const rank = (p) => {
      const n = norm(p.name);
      if (!nq) return p.kind === 'province' ? 1 : p.kind === 'country' ? 2 : 0;
      if (n === nq) return 0; if (n.startsWith(nq)) return 1; if (n.includes(nq)) return 2;
      if (p.en && norm(p.en).includes(nq)) return 3;
      return 99;
    };
    const used = new Map();
    for (const t of state.tickets) { used.set(t.to_place, (used.get(t.to_place) || 0) + 1); used.set(t.from_place, (used.get(t.from_place) || 0) + 1); }
    const items = all.map(p => ({ p, r: rank(p), u: used.get(p.id) || 0 })).filter(x => x.r < 99)
      .sort((a, b) => a.r - b.r || b.u - a.u || a.p.name.localeCompare(b.p.name, 'tr')).slice(0, 12);
    list.innerHTML = '';
    for (const { p } of items) {
      list.append(h('button', { type: 'button', class: 'picker-item', onMouseDown: (e) => { e.preventDefault(); setValue(p.id); list.hidden = true; } },
        h('span', { class: `kind kind-${p.kind}` }, KINDS[p.kind]), h('span', { class: 'picker-name' }, p.name),
        p.kind !== 'country' && p.kind !== 'province' ? h('span', { class: 'picker-parent' }, placeLabel(state.idx, p.parent_id)) : null));
    }
    if (allowCreate) {
      list.append(h('button', { type: 'button', class: 'picker-item picker-create', onMouseDown: (e) => {
        e.preventDefault(); list.hidden = true;
        openPlaceCreator({ query: q, onCreated: (rec) => setValue(rec.id) });
      } }, '＋ Yeni yer ekle', q ? h('span', { class: 'picker-parent' }, `“${q}”`) : null));
    }
    list.hidden = false;
  };
  input.addEventListener('focus', () => { if (hidden.value) { input.select(); } render(hidden.value ? '' : input.value); });
  input.addEventListener('input', () => { hidden.value = ''; wrap.classList.remove('has-value'); render(input.value); });
  input.addEventListener('blur', () => { setTimeout(() => { list.hidden = true; if (!hidden.value) input.value = ''; input.required = required && !hidden.value; }, 120); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); list.querySelector('.picker-item')?.dispatchEvent(new MouseEvent('mousedown')); }
    if (e.key === 'Escape') list.hidden = true;
  });
  wrap.setValue = setValue;
  wrap.getValue = () => hidden.value;
  return wrap;
}

// ---------------------------------------------------------------------------
// Yeni yer: OpenStreetMap'te ara → koordinat + ülke/il otomatik
// ---------------------------------------------------------------------------
async function geocode(q) {
  const u = new URL(CONFIG.geocoder.endpoint);
  u.searchParams.set('q', q); u.searchParams.set('format', 'jsonv2'); u.searchParams.set('addressdetails', '1');
  u.searchParams.set('limit', '6'); u.searchParams.set('accept-language', 'tr');
  if (CONFIG.geocoder.email) u.searchParams.set('email', CONFIG.geocoder.email);
  const res = await fetch(u.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Yer arama servisi yanıt vermedi.');
  return res.json();
}

function provinceIdByName(name) {
  if (!name) return null;
  const n = norm(name).replace(/ ili$/, '').replace(/ province$/, '');
  const alias = { 'afyon': 'Afyonkarahisar', 'hakkari': 'Hakkâri', 'içel': 'Mersin', 'icel': 'Mersin', 'maraş': 'Kahramanmaraş', 'urfa': 'Şanlıurfa', 'antep': 'Gaziantep' };
  const target = alias[n] || n;
  const p = PROVINCES.find(x => norm(x.name) === norm(target));
  return p ? p.id : null;
}

export function openPlaceCreator({ query = '', onCreated } = {}) {
  const nameIn = h('input', { type: 'text', name: 'name', required: true, value: query, placeholder: 'Örn: Heybeliada, Saraybosna, Metanet Lokantası' });
  const searchBtn = h('button', { type: 'button', class: 'btn btn-ghost' }, '🔎 Haritada bul');
  const results = h('div', { class: 'geo-results' });
  const latIn = h('input', { type: 'number', step: 'any', name: 'lat', required: true, placeholder: '41.0' });
  const lngIn = h('input', { type: 'number', step: 'any', name: 'lng', required: true, placeholder: '29.0' });
  const kindSel = select([{ value: 'spot', label: 'Nokta (ilçe, semt, mekân)' }, { value: 'city', label: 'Şehir (yurt dışı)' }], 'spot', { name: 'kind' });
  const parentPick = placePicker({ name: 'parent_id', required: true, placeholder: 'Bağlı olduğu il / ülke / şehir', allowCreate: false });
  const noteIn = h('input', { type: 'text', name: 'note', placeholder: 'İsteğe bağlı not' });

  const doSearch = async () => {
    const q = nameIn.value.trim(); if (!q) return;
    results.innerHTML = '<div class="muted">Aranıyor…</div>';
    try {
      const rows = await geocode(q);
      results.innerHTML = '';
      if (!rows.length) { results.append(h('div', { class: 'muted' }, 'Sonuç yok. Koordinatları elle girebilirsin.')); return; }
      for (const r of rows) {
        results.append(h('button', { type: 'button', class: 'geo-item', onClick: () => {
          latIn.value = Number(r.lat).toFixed(5); lngIn.value = Number(r.lon).toFixed(5);
          const cc = (r.address?.country_code || '').toUpperCase();
          if (cc === 'TR') {
            const prov = provinceIdByName(r.address?.province || r.address?.state || r.address?.city);
            kindSel.value = 'spot'; if (prov) parentPick.setValue(prov);
            if (r.address?.town || r.address?.suburb || r.address?.village || r.address?.city_district) nameIn.value = nameIn.value || r.name;
          } else if (cc) {
            // yurt dışı: şehir mi nokta mı? şehir/kasaba ise city, değilse spot — ebeveyn ülke
            const isCity = ['city', 'town', 'village', 'municipality', 'administrative'].includes(r.type) || r.addresstype === 'city' || r.addresstype === 'town';
            kindSel.value = isCity ? 'city' : 'spot';
            if (state.idx.has(cc)) parentPick.setValue(cc);
          }
          results.innerHTML = ''; results.append(h('div', { class: 'muted' }, '✓ ' + r.display_name));
        } }, h('span', { class: 'geo-name' }, r.name || r.display_name.split(',')[0]), h('span', { class: 'geo-desc' }, r.display_name)));
      }
    } catch (e) { results.innerHTML = ''; results.append(h('div', { class: 'muted' }, 'Arama başarısız: ' + e.message)); }
  };
  searchBtn.addEventListener('click', doSearch);
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });

  const form = h('form', { class: 'form' },
    field('Adı', h('div', { class: 'row' }, nameIn, searchBtn)),
    results,
    h('div', { class: 'row-2' }, field('Enlem', latIn), field('Boylam', lngIn)),
    field('Tür', kindSel, 'Şehir: yurt dışındaki şehirler (Madrid). Nokta: bir ilin ya da şehrin içindeki yer.'),
    field('Bağlı olduğu yer', parentPick),
    field('Not', noteIn));

  openModal({
    title: 'YENİ YER', content: form,
    actions: [{ label: 'Vazgeç', kind: 'btn-ghost' }, { label: 'Kaydet', kind: 'btn-primary', onClick: async () => {
      if (!form.reportValidity()) return false;
      const payload = { name: nameIn.value.trim(), kind: kindSel.value, parent_id: parentPick.getValue(), lat: Number(latIn.value), lng: Number(lngIn.value), note: noteIn.value.trim() };
      try { const rec = await actions.addPlace(payload); toast('Yer eklendi: ' + rec.name, 'ok'); onCreated?.(rec); }
      catch (e) { toast(e.message, 'err'); return false; }
    } }],
  });
  if (query) setTimeout(doSearch, 50);
}

// ---------------------------------------------------------------------------
// Bilet formu (ekle / düzenle)
// ---------------------------------------------------------------------------
export function openTicketForm({ ticket = null, defaults = {}, onSaved } = {}) {
  const me = state.me?.who || 'abf';
  const t = ticket || { owner: defaults.owner || me, from_place: defaults.from_place || currentPlaceOf(defaults.owner || me) || '', to_place: defaults.to_place || '',
    date: defaults.date || isoToday(), time: '', mode: defaults.mode || 'plane', carrier: '', note: '' };
  const ownerSel = select([
    { value: 'both', label: '💞 Birlikte' }, { value: 'rkf', label: CONFIG.people.rkf.name }, { value: 'abf', label: CONFIG.people.abf.name },
  ], t.owner, { name: 'owner' });
  const fromPick = placePicker({ name: 'from_place', value: t.from_place, required: true, placeholder: 'Nereden?' });
  const toPick = placePicker({ name: 'to_place', value: t.to_place, required: true, placeholder: 'Nereye?' });
  const dateIn = h('input', { type: 'date', name: 'date', required: true, value: t.date });
  const timeIn = h('input', { type: 'time', name: 'time', value: t.time || '' });
  const modeSel = select(Object.entries(MODES).filter(([k]) => k !== 'start' || t.mode === 'start').map(([k, v]) => ({ value: k, label: `${v.icon} ${v.label}` })), t.mode, { name: 'mode' });
  const carrierIn = h('input', { type: 'text', name: 'carrier', value: t.carrier || '', placeholder: 'THY, Pegasus, Kamil Koç…', list: 'carriers' });
  const noteIn = h('input', { type: 'text', name: 'note', value: t.note || '', placeholder: 'PNR, koltuk, hatırlatma…' });
  const swap = h('button', { type: 'button', class: 'btn btn-ghost btn-swap', title: 'Yön değiştir', onClick: () => { const a = fromPick.getValue(), b = toPick.getValue(); fromPick.setValue(b); toPick.setValue(a); } }, '⇅');
  ownerSel.addEventListener('change', () => { if (!ticket && !fromPick.getValue()) { const cur = currentPlaceOf(ownerSel.value); if (cur) fromPick.setValue(cur); } });

  const carriers = [...new Set(state.tickets.map(x => x.carrier).filter(Boolean))].concat(['THY', 'Pegasus', 'AJet', 'Kamil Koç', 'Metro Turizm', 'TCDD', 'İDO']);
  const datalist = h('datalist', { id: 'carriers' }, [...new Set(carriers)].map(c => h('option', { value: c })));

  const form = h('form', { class: 'form' },
    field('Kim', ownerSel),
    h('div', { class: 'from-to' }, field('Nereden', fromPick), swap, field('Nereye', toPick)),
    h('div', { class: 'row-2' }, field('Tarih', dateIn), field('Saat', timeIn, 'isteğe bağlı')),
    field('Ulaşım', modeSel),
    h('div', { class: 'row-2' }, field('Firma', carrierIn), field('Not', noteIn)),
    datalist);

  const save = async (close, addReturn = false) => {
    if (!form.reportValidity()) return false;
    const payload = { owner: ownerSel.value, from_place: fromPick.getValue(), to_place: toPick.getValue(), date: dateIn.value, time: timeIn.value, mode: modeSel.value, carrier: carrierIn.value.trim(), note: noteIn.value.trim() };
    if (payload.from_place === payload.to_place && payload.mode !== 'start') { toast('Nereden ve nereye aynı olamaz.', 'err'); return false; }
    try {
      const rec = ticket ? await actions.updateTicket({ id: ticket.id, ...payload }) : await actions.addTicket(payload);
      toast(ticket ? 'Bilet güncellendi' : 'Bilet eklendi ✈️', 'ok');
      onSaved?.(rec);
      if (addReturn) {
        close();
        openTicketForm({ defaults: { owner: payload.owner, from_place: payload.to_place, to_place: payload.from_place, date: payload.date, mode: payload.mode }, onSaved });
        return false;
      }
    } catch (e) { toast(e.message, 'err'); return false; }
  };

  openModal({
    title: ticket ? 'BİLETİ DÜZENLE' : 'YENİ SEFER', content: form,
    actions: [
      ...(ticket ? [{ label: '🗑 Sil', kind: 'btn-danger', close: false, onClick: async (close) => {
        if (!confirm(`${formatDate(ticket.date)} — ${placeLabel(state.idx, ticket.from_place)} → ${placeLabel(state.idx, ticket.to_place)} silinsin mi?`)) return false;
        try { await actions.deleteTicket(ticket.id); toast('Bilet silindi', 'ok'); close(); onSaved?.(null); } catch (e) { toast(e.message, 'err'); }
        return false;
      } }] : []),
      { label: 'Vazgeç', kind: 'btn-ghost' },
      ...(ticket ? [] : [{ label: 'Kaydet + dönüş ekle', kind: 'btn-ghost', close: false, onClick: (close) => save(close, true) }]),
      { label: 'Kaydet', kind: 'btn-primary', onClick: (close) => save(close, false) },
    ],
  });
}

export function currentPlaceOf(who) {
  if (who === 'both') {
    const a = state.stays?.abf.find(s => s.open)?.place, b = state.stays?.rkf.find(s => s.open)?.place;
    return a === b ? a : (a || b || '');
  }
  return state.stays?.[who]?.find(s => s.open)?.place || '';
}

// ---------------------------------------------------------------------------
// Seyir defteri yazısı formu
// ---------------------------------------------------------------------------
export function openEntryForm({ entry = null, defaults = {}, onSaved } = {}) {
  const e = entry || { date: defaults.date || isoToday(), place_id: defaults.place_id || '', title: '', body: '' };
  const dateIn = h('input', { type: 'date', name: 'date', required: true, value: e.date });
  const placePick = placePicker({ name: 'place_id', value: e.place_id, required: true, placeholder: 'Neredeydiniz?' });
  const titleIn = h('input', { type: 'text', name: 'title', value: e.title || '', placeholder: 'Başlık (isteğe bağlı)' });
  const bodyIn = h('textarea', { name: 'body', required: true, rows: 10, placeholder: 'O an ne hissetmiştin?' }, e.body || '');
  const form = h('form', { class: 'form' },
    h('div', { class: 'row-2' }, field('Tarih', dateIn), field('Yer', placePick)),
    field('Başlık', titleIn),
    field('Yazı', bodyIn));
  openModal({
    title: entry ? 'YAZIYI DÜZENLE' : 'YENİ NOT', content: form, wide: true,
    actions: [{ label: 'Vazgeç', kind: 'btn-ghost' }, { label: 'Deftere yaz', kind: 'btn-primary', onClick: async () => {
      if (!form.reportValidity()) return false;
      const payload = { date: dateIn.value, place_id: placePick.getValue(), title: titleIn.value.trim(), body: bodyIn.value.trim() };
      try {
        const rec = entry ? await actions.updateEntry({ id: entry.id, ...payload }) : await actions.addEntry(payload);
        toast(entry ? 'Yazı güncellendi' : 'Deftere yazıldı ✍️', 'ok'); onSaved?.(rec);
      } catch (err) { toast(err.message, 'err'); return false; }
    } }],
  });
}

// ---------------------------------------------------------------------------
// Fotoğraflar: ızgara + büyük görünüm + yükleme
// ---------------------------------------------------------------------------
export function photoGrid(photos, { editable = false, onChanged } = {}) {
  const grid = h('div', { class: 'photo-grid' });
  photos.forEach((p, i) => {
    const tile = h('button', { type: 'button', class: 'photo-tile', title: p.caption || '', onClick: () => openLightbox(photos, i, { editable, onChanged }) }, imgEl(p.thumb_id, { alt: p.caption || 'fotoğraf' }));
    if (p.caption) tile.append(h('span', { class: 'photo-cap' }, p.caption));
    grid.append(tile);
  });
  return grid;
}

export function openLightbox(photos, index, { editable = false, onChanged } = {}) {
  let i = index;
  const img = h('div', { class: 'lb-img' });
  const cap = h('div', { class: 'lb-cap' });
  const counter = h('div', { class: 'lb-count' });
  const show = () => {
    const p = photos[i];
    img.innerHTML = ''; img.append(imgEl(p.id, { alt: p.caption || '' }));
    cap.textContent = p.caption || '';
    counter.textContent = `${i + 1} / ${photos.length}`;
  };
  const prev = () => { i = (i - 1 + photos.length) % photos.length; show(); };
  const next = () => { i = (i + 1) % photos.length; show(); };
  const tools = editable ? h('div', { class: 'lb-tools' },
    h('button', { class: 'btn btn-ghost', onClick: async () => {
      const p = photos[i];
      const val = prompt('Fotoğraf notu:', p.caption || '');
      if (val === null) return;
      try { await actions.updatePhoto({ id: p.id, caption: val.trim() }); p.caption = val.trim(); show(); onChanged?.(); } catch (e) { toast(e.message, 'err'); }
    } }, '✏️ Not'),
    h('button', { class: 'btn btn-danger', onClick: async () => {
      const p = photos[i];
      if (!confirm('Bu fotoğraf silinsin mi?')) return;
      try { await actions.deletePhoto(p.id); photos.splice(i, 1); toast('Fotoğraf silindi', 'ok'); onChanged?.(); if (!photos.length) m.close(); else { i = Math.min(i, photos.length - 1); show(); } }
      catch (e) { toast(e.message, 'err'); }
    } }, '🗑 Sil')) : null;
  const content = h('div', { class: 'lightbox' },
    h('button', { class: 'lb-nav lb-prev', onClick: prev, 'aria-label': 'Önceki' }, '‹'),
    img,
    h('button', { class: 'lb-nav lb-next', onClick: next, 'aria-label': 'Sonraki' }, '›'),
    h('div', { class: 'lb-foot' }, counter, cap, tools));
  const m = openModal({ title: 'FOTOĞRAF', content, wide: true });
  const onKey = (e) => { if (e.key === 'ArrowLeft') prev(); if (e.key === 'ArrowRight') next(); };
  document.addEventListener('keydown', onKey);
  const obs = new MutationObserver(() => { if (!document.body.contains(content)) { document.removeEventListener('keydown', onKey); obs.disconnect(); } });
  obs.observe(document.getElementById('modal-root'), { childList: true });
  show();
}

export function uploadButton({ entry_id = '', place_id = '', onDone, label = '📷 Fotoğraf ekle' }) {
  const input = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const btn = h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => input.click() }, label);
  const wrap = h('span', { class: 'upload' }, btn, input);
  input.addEventListener('change', async () => {
    if (!input.files.length) return;
    btn.disabled = true;
    try {
      await uploadFiles(input.files, { entry_id, place_id, onProgress: (i, n) => { btn.textContent = i < n ? `Yükleniyor ${i + 1}/${n}…` : label; } });
      toast('Fotoğraflar yüklendi 📷', 'ok'); onDone?.();
    } catch (e) { toast('Yükleme hatası: ' + e.message, 'err'); }
    finally { btn.disabled = false; btn.textContent = label; input.value = ''; }
  });
  return wrap;
}

// ---------------------------------------------------------------------------
// Yazı kartı (parşömen)
// ---------------------------------------------------------------------------
export function entryCard(entry, { compact = false, editable = true, onChanged } = {}) {
  const p = CONFIG.people[entry.author];
  const photos = sel.photosOfEntry(entry.id);
  const mine = state.me?.who === entry.author;
  const card = h('article', { class: `entry ${compact ? 'compact' : ''}`, dataset: { id: entry.id }, style: { '--c': p?.color || '#c0392b' } },
    h('div', { class: 'entry-side' },
      h('img', { src: p?.avatar, alt: p?.name || '', class: 'entry-avatar', style: { borderColor: p?.color } }),
      h('div', { class: 'entry-author' }, p?.name || entry.author)),
    h('div', { class: 'entry-main' },
      h('div', { class: 'entry-head' },
        h('span', { class: 'entry-place' }, '📍 ', placeLink(entry.place_id, { withParent: true })),
        h('span', { class: 'entry-date' }, '📅 ', formatDate(entry.date))),
      entry.title ? h('h3', { class: 'entry-title' }, entry.title) : null,
      h('div', { class: 'entry-body' }, entry.body),
      photos.length ? photoGrid(photos, { editable: editable && mine, onChanged }) : null,
      editable ? h('div', { class: 'entry-tools' },
        mine ? uploadButton({ entry_id: entry.id, place_id: entry.place_id, onDone: onChanged }) : null,
        mine ? h('button', { class: 'btn btn-ghost', onClick: () => openEntryForm({ entry, onSaved: onChanged }) }, '✏️ Düzenle') : null,
        mine ? h('button', { class: 'btn btn-ghost danger', onClick: async () => {
          if (!confirm('Bu yazı ve fotoğrafları silinsin mi?')) return;
          try { await actions.deleteEntry(entry.id); toast('Yazı silindi', 'ok'); onChanged?.(); } catch (e) { toast(e.message, 'err'); }
        } }, '🗑') : null) : null));
  return card;
}

// ---------------------------------------------------------------------------
// Bir yerin özet kartı: kim kaç gün, birlikte kaç gün, ziyaretler
// ---------------------------------------------------------------------------
export function placeSummary(id) {
  const a = state.agg.get(id);
  const p = state.idx.get(id);
  if (!p) return h('div', {}, 'Bilinmeyen yer');
  const row = (who) => h('div', { class: 'stat-row' },
    h('span', { class: 'dot', style: { background: personColor(who) } }), h('span', { class: 'stat-name' }, personName(who)),
    h('span', { class: 'stat-val' }, a ? formatDays(a[who] || 0) : '0 gün'),
    a ? h('span', { class: 'stat-sub' }, `${a.visits[who]} ziyaret`) : null);
  return h('div', { class: 'place-summary' },
    row('abf'), row('rkf'),
    h('div', { class: 'stat-row together' },
      h('span', { class: 'dot', style: { background: CONFIG.bothColor } }), h('span', { class: 'stat-name' }, 'Aynı anda'),
      h('span', { class: 'stat-val' }, formatDays(a?.together || 0))));
}
