// Güverte: sayaç, kaptanlar nerede, kısa özet, hızlı işlemler
import { CONFIG } from '../config.js';
import { state, subscribe } from '../store.js';
import { h, append } from '../ui/dom.js';
import { formatDays, formatDate, placeLabel, upcomingTickets, MODES } from '../engine.js';
import { openTicketForm, openEntryForm, ownerBadge, placeLink, entryCard } from '../ui/components.js';

export function renderDeck(root) {
  const since = new Date(CONFIG.togetherSince).getTime();
  const timer = h('div', { class: 'timer' });
  const tick = () => {
    const diff = Math.max(0, Date.now() - since);
    const d = Math.floor(diff / 86400000), hh = Math.floor((diff % 86400000) / 3600000), mm = Math.floor((diff % 3600000) / 60000), ss = Math.floor((diff % 60000) / 1000);
    timer.innerHTML = `<span class="timer-days">${d}</span><span class="timer-unit">GÜN</span><br><span class="timer-small">${hh} SAAT ${mm} DAKİKA <span class="hl">${ss} SANİYE</span></span>`;
  };
  tick();
  const iv = setInterval(tick, 1000);

  const body = h('div', { class: 'deck-body' });
  const draw = () => {
    body.innerHTML = '';
    const { stats, stays, entries } = state;
    const captain = (who) => {
      const p = CONFIG.people[who];
      const cur = stays[who].find(s => s.open);
      const st = stats.per[who];
      return h('div', { class: 'captain panel', style: { '--c': p.color } },
        h('img', { src: p.sprite, alt: p.name, class: 'captain-sprite' }),
        h('div', { class: 'captain-info' },
          h('div', { class: 'captain-name' }, p.name.toUpperCase()),
          cur ? h('div', { class: 'captain-where' }, '📍 ', placeLink(cur.place), h('span', { class: 'muted' }, ` · ${formatDays(cur.days)}dır burada`)) : h('div', { class: 'captain-where muted' }, 'Konum bilinmiyor'),
          h('div', { class: 'captain-stats' },
            h('span', {}, h('b', {}, st.trips), ' sefer'), h('span', {}, h('b', {}, st.provinces.length), ' il'),
            h('span', {}, h('b', {}, st.countries.length), ' ülke'), h('span', {}, h('b', {}, st.km.toLocaleString('tr-TR')), ' km'))));
    };
    const latest = [...entries].sort((a, b) => b.date.localeCompare(a.date))[0];
    const upcoming = upcomingTickets(state.tickets, state.today).slice(0, 4);
    append(body, [
      h('section', { class: 'captains' }, captain('rkf'), captain('abf')),
      h('section', { class: 'panel quick' },
        h('div', { class: 'panel-title' }, 'HIZLI İŞLEM'),
        h('div', { class: 'quick-btns' },
          h('button', { class: 'btn btn-primary', onClick: () => openTicketForm({}) }, '🎫 Sefer ekle'),
          h('button', { class: 'btn btn-gold', onClick: () => openEntryForm({}) }, '✍️ Deftere yaz'),
          h('a', { class: 'btn btn-ghost', href: '#/harita' }, '🗺️ Haritaya git')),
        h('div', { class: 'quick-stats' },
          h('div', { class: 'qs' }, h('b', {}, stats.bothTrips), h('span', {}, 'birlikte sefer')),
          h('div', { class: 'qs' }, h('b', {}, formatDays(stats.togetherDays)), h('span', {}, 'aynı yerde')),
          h('div', { class: 'qs' }, h('b', {}, state.tickets.filter(t => t.mode !== 'start').length), h('span', {}, 'toplam bilet')),
          h('div', { class: 'qs' }, h('b', {}, entries.length), h('span', {}, 'defter yazısı')))),
      upcoming.length ? h('section', { class: 'panel upcoming' },
        h('div', { class: 'panel-title' }, 'YAKLAŞAN SEFERLER'),
        h('ul', { class: 'plain-list' }, upcoming.map(t => h('li', {},
          h('span', {}, `${MODES[t.mode]?.icon || ''} `, ownerBadge(t.owner, { small: true }), ' ', placeLink(t.from_place), ' → ', placeLink(t.to_place)),
          h('b', {}, formatDate(t.date, { day: 'numeric', month: 'short' }) + (t.time ? ' ' + t.time : '')))))) : null,
      latest ? h('section', { class: 'deck-latest' }, h('div', { class: 'section-title' }, 'DEFTERDEKİ SON YAZI'), entryCard(latest, { compact: true, editable: false })) : null,
    ]);
  };
  draw();
  const unsub = subscribe(draw);

  root.append(
    h('section', { class: 'hero panel' },
      h('h1', { class: 'title' }, 'RABIALIBERK', h('br'), 'SEYAHAT GÜNLÜKLERİ'),
      h('div', { class: 'hero-sub' }, 'BİRLİKTE GEÇEN ZAMAN'),
      timer,
      h('div', { class: 'hero-since' }, formatDate(CONFIG.togetherSince.slice(0, 10)) + ' · 20:15')),
    body,
  );
  return () => { clearInterval(iv); unsub(); };
}
