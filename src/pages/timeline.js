// Zaman çizelgesi: biletler, konaklamalar ve defter yazıları tek akışta, aya göre gruplu
import { CONFIG } from '../config.js';
import { state, subscribe, sel } from '../store.js';
import { h } from '../ui/dom.js';
import { formatDate, formatDays, monthLabel, sortTickets, placeLabel, MODES, locative } from '../engine.js';
import { ownerBadge, modeIcon, placeLink, personColor, openTicketForm, entryCard } from '../ui/components.js';

export function renderTimeline(root) {
  let filter = sessionStorage.getItem('tl.filter') || 'all'; // all | both | abf | rkf
  let year = 'all';

  const filterBar = h('div', { class: 'filter-bar' });
  const list = h('div', { class: 'timeline' });
  root.append(h('div', { class: 'page-head' }, h('h1', { class: 'title small' }, 'ZAMAN ÇİZELGESİ'), filterBar), list);

  const draw = () => {
    filterBar.innerHTML = '';
    const years = [...new Set(state.tickets.map(t => t.date.slice(0, 4)).concat(state.entries.map(e => e.date.slice(0, 4))))].sort().reverse();
    const chip = (val, label, active, onClick) => h('button', { class: `chip ${active ? 'active' : ''}`, onClick }, label);
    filterBar.append(
      h('div', { class: 'chips' },
        chip('all', 'Herkes', filter === 'all', () => { filter = 'all'; save(); draw(); }),
        chip('both', '💞 Birlikte', filter === 'both', () => { filter = 'both'; save(); draw(); }),
        chip('rkf', CONFIG.people.rkf.name, filter === 'rkf', () => { filter = 'rkf'; save(); draw(); }),
        chip('abf', CONFIG.people.abf.name, filter === 'abf', () => { filter = 'abf'; save(); draw(); })),
      h('div', { class: 'chips' }, chip('all', 'Tüm yıllar', year === 'all', () => { year = 'all'; draw(); }), years.map(y => chip(y, y, year === y, () => { year = y; draw(); }))));

    const stayByTicket = new Map();
    for (const who of ['abf', 'rkf']) for (const s of state.stays[who]) stayByTicket.set(s.ticket.id + ':' + who, s);

    const tickets = sortTickets(state.tickets).filter(t => {
      if (year !== 'all' && !t.date.startsWith(year)) return false;
      if (filter === 'all') return true;
      if (filter === 'both') return t.owner === 'both';
      return t.owner === filter || t.owner === 'both';
    });
    const entries = state.entries.filter(e => (year === 'all' || e.date.startsWith(year)) && (filter === 'all' || filter === 'both' || e.author === filter));

    const items = [
      ...tickets.map(t => ({ kind: 'ticket', date: t.date, time: t.time || '', t })),
      ...entries.map(e => ({ kind: 'entry', date: e.date, time: '99', e })),
    ].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)); // yeniden eskiye

    list.innerHTML = '';
    if (!items.length) { list.append(h('div', { class: 'panel muted' }, 'Bu filtrede kayıt yok.')); return; }
    let curMonth = null, monthEl = null;
    for (const it of items) {
      const m = it.date.slice(0, 7);
      if (m !== curMonth) {
        curMonth = m;
        monthEl = h('section', { class: 'tl-month' }, h('div', { class: 'tl-month-label' }, monthLabel(it.date)));
        list.append(monthEl);
      }
      if (it.kind === 'entry') {
        monthEl.append(h('div', { class: 'tl-item tl-entry' }, h('div', { class: 'tl-rail' }, h('span', { class: 'tl-dot entry' })), entryCard(it.e, { compact: true, editable: false })));
        continue;
      }
      const t = it.t;
      const planned = t.date > state.today;
      const who = t.owner === 'both' ? ['rkf', 'abf'] : [t.owner];
      const stayInfo = who.map(w => stayByTicket.get(t.id + ':' + w)).filter(Boolean);
      const sameStay = stayInfo.length === 2 && stayInfo[0].days === stayInfo[1].days;
      const stayText = planned ? `${daysUntil(t.date)} sonra` : t.mode === 'start'
        ? `Hikâye burada başlıyor: ${placeLabel(state.idx, t.to_place)}`
        : stayInfo.length ? (sameStay || stayInfo.length === 1
          ? `${locative(placeLabel(state.idx, t.to_place))} ${stayInfo[0].open ? 'hâlâ ' : ''}${formatDays(stayInfo[0].days)}`
          : stayInfo.map(s => `${CONFIG.people[s.who].short}: ${formatDays(s.days)}`).join(' · ')) : '';
      monthEl.append(h('div', { class: `tl-item tl-ticket owner-${t.owner} ${planned ? 'planned' : ''}`, style: { '--c': personColor(t.owner) } },
        h('div', { class: 'tl-rail' }, h('span', { class: 'tl-dot' }, modeIcon(t.mode))),
        h('div', { class: 'tl-card panel', onClick: (e) => { if (!e.target.closest('a')) openTicketForm({ ticket: t }); } },
          h('div', { class: 'tl-top' }, ownerBadge(t.owner, { small: true }), planned ? h('span', { class: 'badge badge-plan' }, 'PLANLI') : null, h('span', { class: 'tl-date' }, formatDate(t.date, { day: 'numeric', month: 'short', weekday: 'short' }) + (t.time ? ' · ' + t.time : ''))),
          t.mode === 'start'
            ? h('div', { class: 'tl-route' }, '🏁 ', placeLink(t.to_place))
            : h('div', { class: 'tl-route' }, placeLink(t.from_place), h('span', { class: 'arrow' }, ' → '), placeLink(t.to_place)),
          h('div', { class: 'tl-meta' },
            h('span', {}, `${MODES[t.mode]?.label || t.mode}${t.carrier ? ' · ' + t.carrier : ''}`),
            stayText ? h('span', { class: 'tl-stay' }, stayText) : null),
          t.note ? h('div', { class: 'tl-note' }, t.note) : null)));
    }
  };
  const save = () => sessionStorage.setItem('tl.filter', filter);
  const daysUntil = (iso) => { const n = Math.round((new Date(iso) - new Date(state.today)) / 86400000); return n === 1 ? '1 gün' : `${n} gün`; };
  draw();
  const unsub = subscribe(draw);
  return () => unsub();
}
