// Yer sayfası: bir ilin/ülkenin/noktanın tüm hikâyesi — özet, alt yerler, konaklamalar, yazılar, fotoğraflar
import { CONFIG } from '../config.js';
import { state, subscribe, sel, actions } from '../store.js';
import { h, toast, confirmDialog, append } from '../ui/dom.js';
import { formatDate, formatDays, placeLabel, KINDS } from '../engine.js';
import { placeSummary, photoGrid, uploadButton, entryCard, openEntryForm, openTicketForm, personColor, placeLink, openPlaceCreator } from '../ui/components.js';

export function renderPlace(root, { param }) {
  const id = param;
  const box = h('div', { class: 'place-page' });
  root.append(box);
  const draw = () => {
    box.innerHTML = '';
    const p = state.idx.get(id);
    if (!p) { box.append(h('div', { class: 'panel' }, 'Yer bulunamadı: ', id)); return; }
    const a = state.agg.get(id);
    const entries = sel.entriesAt(id).sort((x, y) => y.date.localeCompare(x.date));
    const photos = sel.photosAt(id);
    const children = [...state.idx.values()].filter(x => x.parent_id === id && !x.builtin);
    const stays = a ? [...a.stays].filter(s => s.ticket.mode !== 'start' || s.days > 0).sort((x, y) => y.from.localeCompare(x.from)) : [];
    const mapKind = p.country === 'TR' && p.kind !== 'country' ? 'turkiye' : 'world';

    append(box, [
      h('div', { class: 'panel place-head' },
        h('div', {},
          h('div', { class: 'side-kind' }, KINDS[p.kind]?.toUpperCase()),
          h('h1', { class: 'title small' }, p.name),
          p.parent_id ? h('div', { class: 'crumbs' }, crumbs(p)) : null,
          p.note ? h('div', { class: 'muted' }, p.note) : null),
        h('div', { class: 'place-actions' },
          h('a', { class: 'btn btn-ghost', href: `#/harita?yer=${encodeURIComponent(id)}`, onClick: () => sessionStorage.setItem('map.kind', mapKind) }, '🗺️ Haritada göster'),
          h('button', { class: 'btn btn-ghost', onClick: () => openTicketForm({ defaults: { to_place: id } }) }, '🎫 Buraya sefer'),
          h('button', { class: 'btn btn-gold', onClick: () => openEntryForm({ defaults: { place_id: id } }) }, '✍️ Not yaz'),
          uploadButton({ place_id: id, onDone: draw }),
          !p.builtin ? h('button', { class: 'btn btn-ghost danger', onClick: async () => {
            if (!(await confirmDialog(`"${p.name}" silinsin mi? (Biletlerde ya da yazılarda kullanılıyorsa silinmez.)`))) return;
            try { await actions.deletePlace(id); toast('Yer silindi', 'ok'); location.hash = '#/harita'; } catch (e) { toast(e.message, 'err'); }
          } }, '🗑 Yeri sil') : null)),
      h('div', { class: 'place-grid' },
        h('div', { class: 'panel' }, h('div', { class: 'panel-title' }, 'KİM NE KADAR KALDI'), a ? placeSummary(id) : h('div', { class: 'muted' }, 'Henüz bilet yok.')),
        children.length ? h('div', { class: 'panel' }, h('div', { class: 'panel-title' }, 'İÇİNDEKİ YERLER'),
          h('ul', { class: 'plain-list' }, children.map(c => h('li', {}, placeLink(c.id), h('span', { class: 'muted' }, KINDS[c.kind]))))) : null,
        stays.length ? h('div', { class: 'panel' }, h('div', { class: 'panel-title' }, `KONAKLAMALAR · ${stays.length}`),
          h('ul', { class: 'stay-list' }, stays.map(s => h('li', {},
            h('span', { class: 'dot', style: { background: personColor(s.who) } }),
            h('span', {}, `${formatDate(s.from, { day: 'numeric', month: 'short', year: '2-digit' })} → ${s.to ? formatDate(s.to, { day: 'numeric', month: 'short', year: '2-digit' }) : 'bugün'}`),
            s.place !== id ? h('span', { class: 'muted' }, placeLabel(state.idx, s.place)) : null,
            h('b', {}, formatDays(s.days)))))) : null),
      photos.length ? h('div', { class: 'panel' }, h('div', { class: 'panel-title' }, `FOTOĞRAFLAR · ${photos.length}`), photoGrid(photos, { editable: true, onChanged: draw })) : null,
      entries.length ? h('div', { class: 'place-entries' }, h('div', { class: 'section-title' }, `DEFTER · ${entries.length}`), entries.map(e => entryCard(e, { onChanged: draw }))) : null,
    ]);
  };
  const crumbs = (p) => {
    const parts = []; let cur = state.idx.get(p.parent_id), g = 0;
    while (cur && g++ < 6) { parts.unshift(cur); cur = state.idx.get(cur.parent_id); }
    return parts.flatMap((x, i) => [i ? ' › ' : null, placeLink(x.id)]);
  };
  draw();
  const unsub = subscribe(draw);
  return () => unsub();
}
