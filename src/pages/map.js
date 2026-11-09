// Harita sayfası: dünya / Türkiye, boyama, pinler, yan panel
import { CONFIG } from '../config.js';
import { state, subscribe, sel } from '../store.js';
import { h, clear, append, num } from '../ui/dom.js';
import { createMap } from '../map/mapview.js';
import { formatDays, formatDate, placeLabel, ancestors } from '../engine.js';
import { placeSummary, photoGrid, ownerBadge, modeIcon, placeLink, personColor } from '../ui/components.js';

export function renderMap(root, { query, navigate }) {
  let kind = sessionStorage.getItem('map.kind') || 'turkiye';
  let map = null, selectedId = null;

  const stage = h('div', { class: 'map-stage' });
  const side = h('aside', { class: 'map-side', hidden: true });
  const tabs = h('div', { class: 'map-tabs' },
    h('button', { class: 'tab', dataset: { k: 'turkiye' }, onClick: () => switchKind('turkiye') }, '🇹🇷 TÜRKİYE'),
    h('button', { class: 'tab', dataset: { k: 'world' }, onClick: () => switchKind('world') }, '🌍 DÜNYA'));
  const legend = h('div', { class: 'legend' },
    h('span', {}, h('i', { style: { background: CONFIG.people.rkf.color } }), CONFIG.people.rkf.name),
    h('span', {}, h('i', { style: { background: CONFIG.people.abf.color } }), CONFIG.people.abf.name),
    h('span', {}, h('i', { style: { background: CONFIG.bothColor } }), 'İkisi de'),
    h('span', {}, h('i', { class: 'legend-pin' }), 'Yazı / fotoğraf'));
  const zoom = h('div', { class: 'map-zoom' },
    h('button', { class: 'btn-icon', title: 'Yakınlaş', onClick: () => map?.zoomIn() }, '＋'),
    h('button', { class: 'btn-icon', title: 'Uzaklaş', onClick: () => map?.zoomOut() }, '－'),
    h('button', { class: 'btn-icon', title: 'Sıfırla', onClick: () => map?.reset() }, '⌂'));
  const hover = h('div', { class: 'map-hover', hidden: true });

  root.append(h('div', { class: 'map-page' },
    h('div', { class: 'map-head' }, tabs, legend),
    h('div', { class: 'map-wrap' }, h('div', { class: 'map-box' }, stage, zoom, hover), side)));

  const colorsFor = () => {
    const m = new Map();
    for (const [id, a] of state.agg) if (a.color !== 'none') m.set(id, a.color);
    return m;
  };
  const pinsFor = () => {
    // yazı/fotoğraf olan yerler → pin (iller ve ülkeler boyanıyor; onlar için pin yalnızca dünya haritasında TR dışı şehirler/noktalar)
    const counts = new Map();
    const bump = (id) => counts.set(id, (counts.get(id) || 0) + 1);
    for (const e of state.entries) bump(e.place_id);
    for (const p of state.photos) if (p.place_id && !p.entry_id) bump(p.place_id);
    const pins = [];
    for (const [id, count] of counts) {
      const p = state.idx.get(id); if (!p) continue;
      if (kind === 'turkiye' && p.country !== 'TR') continue;
      if (kind === 'world' && p.country === 'TR' && p.kind !== 'country') {
        // dünya haritasında Türkiye içi noktalar tek pin olarak Türkiye'ye toplanır
        continue;
      }
      if (p.kind === 'province' || p.kind === 'country') { pins.push({ id, lat: p.lat, lng: p.lng, label: `${p.name} · ${count}`, count, kind: 'region' }); continue; }
      pins.push({ id, lat: p.lat, lng: p.lng, label: `${p.name} · ${count}`, count, kind: p.kind });
    }
    if (kind === 'world') {
      const trCount = state.entries.filter(e => state.idx.get(e.place_id)?.country === 'TR').length;
      if (trCount) { const tr = state.idx.get('TR'); pins.push({ id: 'TR', lat: 39.0, lng: 35.2, label: `Türkiye · ${trCount}`, count: trCount, kind: 'region' }); }
    }
    return pins;
  };

  async function build() {
    stage.innerHTML = '<div class="map-loading blink">HARİTA YÜKLENİYOR...</div>';
    tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.k === kind));
    stage.parentElement.classList.toggle('kind-turkiye', kind === 'turkiye');
    map = await createMap(stage, kind, {
      colors: colorsFor(), pins: pinsFor(),
      onRegion: (id) => select(id),
      onPin: (id) => select(id, true),
      onBackground: () => { /* seçimi koru */ },
      onHover: (id, e) => {
        if (!id) { hover.hidden = true; return; }
        const a = state.agg.get(id); const p = state.idx.get(id);
        hover.innerHTML = `<b>${p?.name || id}</b>` + (a ? `<br>${CONFIG.people.rkf.short}: ${a.rkf} gün · ${CONFIG.people.abf.short}: ${a.abf} gün` : '<br><span class="muted">henüz gidilmedi</span>');
        hover.hidden = false;
        const r = stage.getBoundingClientRect();
        hover.style.left = Math.min(r.width - 220, e.clientX - r.left + 14) + 'px';
        hover.style.top = Math.max(0, e.clientY - r.top - 54) + 'px';
      },
    });
    if (selectedId) { map.highlight(regionOf(selectedId)); }
    const focus = query?.get('yer');
    if (focus && state.idx.has(focus)) select(focus, true, true);
  }

  function regionOf(id) {
    const p = state.idx.get(id); if (!p) return null;
    if (kind === 'turkiye') return p.province || null;
    return p.country || null;
  }

  function select(id, zoomTo = false, silent = false) {
    selectedId = id;
    map?.highlight(regionOf(id));
    const p = state.idx.get(id);
    if (zoomTo && p) {
      if (p.kind === 'province' || p.kind === 'country') map.focusRegion(id);
      else map.focusPoint(p.lat, p.lng, kind === 'world' ? 10 : 5);
    }
    drawSide();
  }

  function drawSide() {
    clear(side);
    if (!selectedId) { side.hidden = true; return; }
    side.hidden = false;
    const id = selectedId, p = state.idx.get(id), a = state.agg.get(id);
    const entries = sel.entriesAt(id).sort((x, y) => y.date.localeCompare(x.date));
    const photos = sel.photosAt(id);
    const staysList = a ? a.stays.filter(s => s.ticket.mode !== 'start' || s.days > 0).slice().sort((x, y) => y.from.localeCompare(x.from)).slice(0, 8) : [];
    append(side, [
      h('div', { class: 'side-head' },
        h('div', {},
          h('div', { class: 'side-kind' }, p.kind === 'province' ? 'İL' : p.kind === 'country' ? 'ÜLKE' : p.kind === 'city' ? 'ŞEHİR' : 'NOKTA'),
          h('h2', { class: 'side-title' }, p.name),
          p.parent_id && p.kind !== 'province' ? h('div', { class: 'muted' }, placeLabel(state.idx, p.parent_id)) : null),
        h('button', { class: 'btn-x', onClick: () => { selectedId = null; map?.highlight(null); drawSide(); } }, '✕')),
      a ? placeSummary(id) : h('div', { class: 'muted side-empty' }, 'Buraya henüz bilet kesilmemiş.'),
      staysList.length ? h('div', { class: 'side-section' },
        h('div', { class: 'side-sub' }, 'KONAKLAMALAR'),
        h('ul', { class: 'stay-list' }, staysList.map(s => h('li', {},
          h('span', { class: 'dot', style: { background: personColor(s.who) } }),
          h('span', {}, `${formatDate(s.from, { day: 'numeric', month: 'short', year: '2-digit' })}${s.to ? ' → ' + formatDate(s.to, { day: 'numeric', month: 'short', year: '2-digit' }) : ' → bugün'}`),
          h('b', {}, num(formatDays(s.days))))))) : null,
      photos.length ? h('div', { class: 'side-section' }, h('div', { class: 'side-sub' }, `FOTOĞRAFLAR · ${photos.length}`), photoGrid(photos)) : null,
      entries.length ? h('div', { class: 'side-section' },
        h('div', { class: 'side-sub' }, `DEFTER · ${entries.length}`),
        entries.slice(0, 5).map(e => h('a', { class: 'side-entry', href: '#/defter/' + e.id },
          h('div', { class: 'side-entry-head' }, ownerBadge(e.author, { small: true }), h('span', { class: 'muted' }, formatDate(e.date, { day: 'numeric', month: 'short', year: 'numeric' }))),
          e.title ? h('div', { class: 'side-entry-title' }, e.title) : null,
          h('div', { class: 'side-entry-body' }, e.body.length > 160 ? e.body.slice(0, 160) + '…' : e.body)))) : null,
      h('div', { class: 'side-actions' },
        h('a', { class: 'btn btn-ghost', href: '#/yer/' + encodeURIComponent(id) }, 'Yer sayfası →'))]);
  }

  function switchKind(k) {
    if (k === kind) return;
    kind = k; sessionStorage.setItem('map.kind', k);
    selectedId = null; drawSide(); build();
  }

  build();
  const unsub = subscribe(() => { if (map) { map.paint(colorsFor()); map.drawPins(pinsFor()); drawSide(); } });
  return () => unsub();
}
