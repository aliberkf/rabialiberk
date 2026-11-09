// SVG harita: yükleme, boyama, pinler, kaydırma/yakınlaştırma (fare, tekerlek, dokunma/pinch)
import { MAP_META } from '../data/catalog.js';
import { CONFIG } from '../config.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const cache = new Map();

export async function loadMapSvg(kind) {
  if (!cache.has(kind)) {
    cache.set(kind, fetch(`assets/maps/${kind === 'turkiye' ? 'turkiye' : 'world'}.svg`).then(r => r.text()));
  }
  const txt = await cache.get(kind);
  const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
  return document.importNode(doc.documentElement, true);
}

/** Enlem/boylam → SVG koordinatı (Mercator, haritanın kendi sınırlarıyla). */
export function project(kind, lat, lng) {
  const m = MAP_META[kind];
  const merc = (l) => Math.log(Math.tan(Math.PI / 4 + (l * Math.PI) / 360));
  const x = ((lng - m.left) / (m.right - m.left)) * m.width;
  const y = ((merc(m.top) - merc(lat)) / (merc(m.top) - merc(m.bottom))) * m.height;
  return { x, y };
}

const FILL = { none: '#2b3550', abf: CONFIG.people.abf.color, rkf: CONFIG.people.rkf.color, both: CONFIG.bothColor };

/**
 * @param {HTMLElement} container
 * @param {'world'|'turkiye'} kind
 * @param {{ colors: Map<string,string>, pins: Array<{id,lat,lng,label,count,kind}>, onRegion(id), onPin(id), onBackground() }} opts
 */
export async function createMap(container, kind, opts) {
  container.innerHTML = '';
  const svg = await loadMapSvg(kind);
  svg.removeAttribute('width'); svg.removeAttribute('height');
  svg.classList.add('map-svg');
  // dünya haritasında kutuplar ilgi çekici değil: görünür pencereyi 75°K–55°G arasına kırp
  if (kind === 'world') svg.setAttribute('viewBox', '0 150 1010.9 620');
  const vb = svg.getAttribute('viewBox').split(' ').map(Number);
  const X0 = vb[0], Y0 = vb[1], W = vb[2], H = vb[3];
  const CX = X0 + W / 2, CY = Y0 + H / 2;

  // tüm yolları bir <g>'ye al, dönüşümü oraya uygula
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'map-layer');
  while (svg.firstChild) g.appendChild(svg.firstChild);
  svg.appendChild(g);
  const pinLayer = document.createElementNS(SVG_NS, 'g');
  pinLayer.setAttribute('class', 'pin-layer');
  g.appendChild(pinLayer);
  container.appendChild(svg);

  if (kind === 'world') { const aq = g.querySelector('#AQ'); if (aq) aq.remove(); }

  const paths = [...g.querySelectorAll('path[id]')];
  const paint = (colors) => {
    for (const p of paths) {
      const c = colors.get(p.id) || 'none';
      p.setAttribute('fill', FILL[c]);
      p.classList.toggle('painted', c !== 'none');
      p.dataset.color = c;
    }
  };
  paint(opts.colors || new Map());

  // --- pinler ---
  let currentScale = 1;
  const drawPins = (pins) => {
    pinLayer.innerHTML = '';
    for (const pin of pins || []) {
      const { x, y } = project(kind, pin.lat, pin.lng);
      if (x < -5 || y < -5 || x > W + 5 || y > H + 5) continue;
      const gp = document.createElementNS(SVG_NS, 'g');
      gp.setAttribute('class', `pin pin-${pin.kind || 'spot'}`);
      gp.setAttribute('transform', `translate(${x} ${y})`);
      gp.dataset.id = pin.id;
      const r = Math.min(9, 4.2 + Math.sqrt(pin.count || 1) * 1.2);
      // piksel-sanat iğnesi: kare gövde + sap
      const body = document.createElementNS(SVG_NS, 'rect');
      body.setAttribute('x', -r); body.setAttribute('y', -r * 2.1); body.setAttribute('width', r * 2); body.setAttribute('height', r * 2);
      body.setAttribute('class', 'pin-body');
      const stem = document.createElementNS(SVG_NS, 'rect');
      stem.setAttribute('x', -r / 4); stem.setAttribute('y', -r * 0.2); stem.setAttribute('width', r / 2); stem.setAttribute('height', r * 0.9);
      stem.setAttribute('class', 'pin-stem');
      const dot = document.createElementNS(SVG_NS, 'rect');
      dot.setAttribute('x', -r / 2); dot.setAttribute('y', -r * 1.6); dot.setAttribute('width', r); dot.setAttribute('height', r);
      dot.setAttribute('class', 'pin-dot');
      gp.append(stem, body, dot);
      const title = document.createElementNS(SVG_NS, 'title'); title.textContent = pin.label; gp.append(title);
      pinLayer.appendChild(gp);
    }
    scalePins();
  };
  const scalePins = () => {
    // yakınlaşınca pinler aynı ekran boyutunda kalsın
    const k = 1 / Math.sqrt(currentScale);
    for (const gp of pinLayer.children) {
      const t = gp.getAttribute('transform').replace(/ scale\([^)]*\)/, '');
      gp.setAttribute('transform', `${t} scale(${k})`);
    }
    g.style.setProperty('--stroke', (0.6 / Math.sqrt(currentScale)).toFixed(3));
  };
  drawPins(opts.pins);

  // --- pan / zoom ---
  const view = { x: 0, y: 0, k: 1 };
  const minK = 1, maxK = kind === 'world' ? 24 : 8;
  const apply = () => {
    g.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
    if (Math.abs(view.k - currentScale) > 0.05) { currentScale = view.k; scalePins(); }
  };
  const clientToSvg = (cx, cy) => {
    const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
    const m = svg.getScreenCTM().inverse();
    return pt.matrixTransform(m);
  };
  const clamp = () => {
    view.k = Math.max(minK, Math.min(maxK, view.k));
    // harita kutudan tamamen çıkmasın
    // harita kutudan tamamen çıkmasın: içerik merkezi görünür pencerenin dışına taşamaz
    const lim = (size, origin) => [origin + size * 0.1 - (origin + size) * view.k, origin + size * 0.9 - origin * view.k];
    const [minX, maxX] = lim(W, X0), [minY, maxY] = lim(H, Y0);
    view.x = Math.max(minX, Math.min(maxX, view.x));
    view.y = Math.max(minY, Math.min(maxY, view.y));
  };
  const zoomAt = (factor, cx, cy) => {
    const p = clientToSvg(cx, cy);
    const k2 = Math.max(minK, Math.min(maxK, view.k * factor));
    const f = k2 / view.k;
    view.x = p.x - (p.x - view.x) * f; view.y = p.y - (p.y - view.y) * f; view.k = k2;
    clamp(); apply();
  };
  const fitTo = (bbox, pad = 0.15) => {
    const bw = bbox.width * (1 + pad * 2), bh = bbox.height * (1 + pad * 2);
    const k = Math.max(minK, Math.min(maxK, Math.min(W / bw, H / bh)));
    view.k = k;
    view.x = CX - (bbox.x + bbox.width / 2) * k; view.y = CY - (bbox.y + bbox.height / 2) * k;
    clamp(); apply();
  };

  svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX, e.clientY); }, { passive: false });

  const pointers = new Map();
  let dragStart = null, moved = false, pinchStart = null;
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) { dragStart = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; moved = false; }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const factor = (d / pinchStart.d) * pinchStart.k / view.k;
      zoomAt(factor, (a.x + b.x) / 2, (a.y + b.y) / 2);
      moved = true;
    } else if (pointers.size === 1 && dragStart) {
      const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
      if (Math.hypot(dx, dy) > 3) moved = true;
      const scale = W / svg.getBoundingClientRect().width;
      view.x = dragStart.vx + dx * scale; view.y = dragStart.vy + dy * scale;
      clamp(); apply();
    }
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size === 0) {
      if (!moved) handleTap(e);
      dragStart = null;
    } else if (pointers.size === 1) {
      const [p] = [...pointers.values()];
      dragStart = { x: p.x, y: p.y, vx: view.x, vy: view.y };
    }
  };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  let lastTap = 0;
  const handleTap = (e) => {
    const now = Date.now();
    if (now - lastTap < 300) { zoomAt(1.8, e.clientX, e.clientY); lastTap = 0; return; }
    lastTap = now;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const pin = el?.closest?.('.pin');
    if (pin) { opts.onPin?.(pin.dataset.id); return; }
    const path = el?.closest?.('path[id]');
    if (path && svg.contains(path)) { opts.onRegion?.(path.id); return; }
    opts.onBackground?.();
  };
  // hover (yalnızca fare)
  svg.addEventListener('pointerover', (e) => { if (e.pointerType === 'mouse') { const p = e.target.closest?.('path[id]'); if (p) opts.onHover?.(p.id, e); } });
  svg.addEventListener('pointerout', (e) => { if (e.pointerType === 'mouse') { const p = e.target.closest?.('path[id]'); if (p) opts.onHover?.(null, e); } });

  const highlight = (id) => {
    for (const p of paths) p.classList.toggle('active', p.id === id);
  };
  const focusRegion = (id) => {
    const p = g.querySelector(`path[id="${CSS.escape(id)}"]`);
    if (p) fitTo(p.getBBox(), 0.6);
  };
  const focusPoint = (lat, lng, k = 6) => {
    const { x, y } = project(kind, lat, lng);
    view.k = Math.min(maxK, k); view.x = CX - x * view.k; view.y = CY - y * view.k; clamp(); apply();
  };
  const reset = () => { view.x = 0; view.y = 0; view.k = 1; apply(); };
  apply();

  return { svg, paint, drawPins, highlight, focusRegion, focusPoint, reset, zoomIn: () => zoomAt(1.5, ...center()), zoomOut: () => zoomAt(1 / 1.5, ...center()), project: (lat, lng) => project(kind, lat, lng) };
  function center() { const r = svg.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
}
