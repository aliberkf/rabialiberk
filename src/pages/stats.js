// İstatistikler: kişi kartları, en çok kalınan yerler (çubuklar), ulaşım, yıllara göre
import { CONFIG } from '../config.js';
import { state, subscribe } from '../store.js';
import { h } from '../ui/dom.js';
import { formatDays, formatDate, placeLabel, MODES } from '../engine.js';
import { placeLink, personColor } from '../ui/components.js';

export function renderStats(root) {
  const body = h('div', { class: 'stats' });
  root.append(h('div', { class: 'page-head' }, h('h1', { class: 'title small' }, 'İSTATİSTİK')), body);

  const draw = () => {
    body.innerHTML = '';
    const { stats, agg, idx } = state;
    const personCard = (who) => {
      const p = CONFIG.people[who], s = stats.per[who];
      const modes = Object.entries(s.modes).sort((a, b) => b[1] - a[1]);
      return h('div', { class: 'panel person-card', style: { '--c': p.color } },
        h('div', { class: 'pc-head' }, h('img', { src: p.avatar, alt: '' }), h('div', { class: 'pc-name' }, p.name.toUpperCase())),
        h('div', { class: 'pc-grid' },
          tile(s.trips, 'sefer'), tile(s.km.toLocaleString('tr-TR'), 'km yol'),
          tile(s.provinces.length, 'il'), tile(s.countries.length, 'ülke'),
          tile(s.longest ? formatDays(s.longest.days) : '—', s.longest ? `en uzun: ${placeLabel(idx, s.longest.place)}` : 'en uzun kalış')),
        h('div', { class: 'pc-modes' }, modes.map(([m, n]) => h('span', { class: 'mode-pill' }, `${MODES[m]?.icon || ''} ${MODES[m]?.label || m}: ${n}`))));
    };

    // en çok kalınan yerler (il + yurt dışı ülke düzeyi)
    const rows = [...agg.values()].filter(a => { const p = idx.get(a.id); return p && ((p.kind === 'province') || (p.kind === 'country' && p.id !== 'TR')); })
      .filter(a => a.total > 0).sort((a, b) => b.total - a.total).slice(0, 14);
    const max = Math.max(1, ...rows.map(r => r.total));
    const bars = h('div', { class: 'panel bars' },
      h('div', { class: 'panel-title' }, 'EN ÇOK KALINAN YERLER (GÜN)'),
      rows.map(a => h('div', { class: 'bar-row' },
        h('div', { class: 'bar-label' }, placeLink(a.id)),
        h('div', { class: 'bar-track' },
          h('div', { class: 'bar-seg', style: { width: (a.rkf / max * 100) + '%', background: CONFIG.people.rkf.color }, title: `${CONFIG.people.rkf.name}: ${a.rkf} gün` }),
          h('div', { class: 'bar-seg', style: { width: (a.abf / max * 100) + '%', background: CONFIG.people.abf.color }, title: `${CONFIG.people.abf.name}: ${a.abf} gün` })),
        h('div', { class: 'bar-val' }, h('span', { style: { color: CONFIG.people.rkf.soft } }, a.rkf), ' / ', h('span', { style: { color: CONFIG.people.abf.soft } }, a.abf)))),
      h('div', { class: 'muted small' }, `${CONFIG.people.rkf.name} / ${CONFIG.people.abf.name}`));

    const together = [...agg.values()].filter(a => a.together > 0 && (idx.get(a.id)?.kind === 'province' || (idx.get(a.id)?.kind === 'country' && a.id !== 'TR')))
      .sort((a, b) => b.together - a.together).slice(0, 10);
    const togetherPanel = h('div', { class: 'panel' },
      h('div', { class: 'panel-title' }, 'AYNI ANDA AYNI YERDE'),
      h('div', { class: 'big-stat' }, h('b', {}, formatDays(stats.togetherDays)), h('span', {}, `toplam · ${stats.bothTrips} ortak sefer`)),
      h('ul', { class: 'plain-list' }, together.map(a => h('li', {}, placeLink(a.id), h('b', {}, formatDays(a.together))))));

    const years = Object.entries(stats.years).sort();
    const yearPanel = h('div', { class: 'panel' },
      h('div', { class: 'panel-title' }, 'YILLARA GÖRE'),
      h('div', { class: 'years' }, years.map(([y, v]) => h('div', { class: 'year-card' }, h('div', { class: 'year-num' }, y), h('div', {}, h('b', {}, v.trips), ' sefer'), h('div', { class: 'muted' }, `${v.both} birlikte`)))));

    const provinces = new Set([...stats.per.abf.provinces, ...stats.per.rkf.provinces]);
    const countries = new Set([...stats.per.abf.countries, ...stats.per.rkf.countries]);
    const coverage = h('div', { class: 'panel' },
      h('div', { class: 'panel-title' }, 'HARİTANIN NE KADARI BOYANDI'),
      h('div', { class: 'coverage' },
        cov(provinces.size, 81, 'il'), cov(countries.size, 195, 'ülke')));

    body.append(h('div', { class: 'stats-people' }, personCard('rkf'), personCard('abf')), h('div', { class: 'stats-grid' }, bars, h('div', { class: 'stats-col' }, togetherPanel, coverage, yearPanel)));
  };
  const tile = (v, l) => h('div', { class: 'tile' }, h('b', {}, v), h('span', {}, l));
  const cov = (n, total, label) => h('div', { class: 'cov' },
    h('div', { class: 'cov-num' }, h('b', {}, n), h('span', {}, ` / ${total} ${label}`)),
    h('div', { class: 'cov-track' }, h('div', { class: 'cov-fill', style: { width: (n / total * 100) + '%' } })));
  draw();
  const unsub = subscribe(draw);
  return () => unsub();
}
