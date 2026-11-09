// Biletler: liste (ara/filtre), ekle, düzenle, sil, tutarlılık uyarıları
import { CONFIG } from '../config.js';
import { state, subscribe, actions } from '../store.js';
import { h, toast, confirmDialog } from '../ui/dom.js';
import { formatDate, sortTickets, placeLabel, MODES } from '../engine.js';
import { ownerBadge, modeIcon, placeLink, personColor, openTicketForm } from '../ui/components.js';

export function renderTickets(root) {
  let q = '', who = 'all';
  const search = h('input', { type: 'search', class: 'search', placeholder: 'Şehir, firma, not ara…', onInput: (e) => { q = e.target.value.trim().toLocaleLowerCase('tr'); drawList(); } });
  const chips = h('div', { class: 'chips' });
  const list = h('div', { class: 'ticket-list' });
  const warnBox = h('div', { class: 'warnings' });
  const count = h('div', { class: 'muted count' });

  root.append(
    h('div', { class: 'page-head' },
      h('h1', { class: 'title small' }, 'BİLETLER'),
      h('button', { class: 'btn btn-primary', onClick: () => openTicketForm({}) }, '＋ Yeni sefer')),
    h('div', { class: 'toolbar' }, search, chips),
    warnBox, count, list);

  const drawChips = () => {
    chips.innerHTML = '';
    const chip = (val, label) => h('button', { class: `chip ${who === val ? 'active' : ''}`, onClick: () => { who = val; drawChips(); drawList(); } }, label);
    chips.append(chip('all', 'Hepsi'), chip('both', '💞 Birlikte'), chip('rkf', CONFIG.people.rkf.name), chip('abf', CONFIG.people.abf.name));
  };

  const drawWarnings = () => {
    warnBox.innerHTML = '';
    if (!state.warnings.length) return;
    warnBox.append(h('details', { class: 'panel warn-panel' },
      h('summary', {}, `⚠️ ${state.warnings.length} tutarsızlık: kişi o tarihte başka yerde görünüyor`),
      h('ul', {}, state.warnings.map(w => h('li', {},
        ownerBadge(w.who, { small: true }), ' ',
        h('a', { href: '#', onClick: (e) => { e.preventDefault(); openTicketForm({ ticket: w.ticket }); } },
          `${formatDate(w.ticket.date)} — ${placeLabel(state.idx, w.ticket.from_place)} → ${placeLabel(state.idx, w.ticket.to_place)}`),
        h('span', { class: 'muted' }, ` (önceki bilete göre ${placeLabel(state.idx, w.expected)}'deydi — arada eksik bir bilet olabilir)`))))));
  };

  const drawList = () => {
    list.innerHTML = '';
    const rows = sortTickets(state.tickets).reverse().filter(t => {
      if (who !== 'all' && !(t.owner === who || (who !== 'both' && t.owner === 'both'))) return false;
      if (!q) return true;
      const hay = [placeLabel(state.idx, t.from_place), placeLabel(state.idx, t.to_place), t.carrier, t.note, t.date, MODES[t.mode]?.label].join(' ').toLocaleLowerCase('tr');
      return hay.includes(q);
    });
    count.textContent = `${rows.length} kayıt`;
    if (!rows.length) { list.append(h('div', { class: 'panel muted' }, 'Kayıt yok.')); return; }
    let lastYear = null;
    for (const t of rows) {
      const y = t.date.slice(0, 4);
      if (y !== lastYear) { lastYear = y; list.append(h('div', { class: 'year-sep' }, y)); }
      const planned = t.date > state.today;
      list.append(h('div', { class: `ticket panel owner-${t.owner} ${planned ? 'planned' : ''}`, style: { '--c': personColor(t.owner) } },
        h('div', { class: 'ticket-stub' }, h('span', { class: 'ticket-icon' }, modeIcon(t.mode)), h('span', { class: 'ticket-date' }, formatDate(t.date, { day: '2-digit', month: 'short' })), t.time ? h('span', { class: 'ticket-time' }, t.time) : null),
        h('div', { class: 'ticket-main' },
          h('div', { class: 'ticket-route' },
            t.mode === 'start' ? h('span', {}, '🏁 Başlangıç: ', placeLink(t.to_place)) : h('span', {}, placeLink(t.from_place, { withParent: true }), h('span', { class: 'arrow' }, ' → '), placeLink(t.to_place, { withParent: true }))),
          h('div', { class: 'ticket-meta' }, ownerBadge(t.owner, { small: true }), planned ? h('span', { class: 'badge badge-plan' }, 'PLANLI') : null, h('span', {}, MODES[t.mode]?.label), t.carrier ? h('span', {}, t.carrier) : null, t.note ? h('span', { class: 'muted' }, t.note) : null)),
        h('div', { class: 'ticket-actions' },
          h('button', { class: 'btn-icon', title: 'Düzenle', onClick: () => openTicketForm({ ticket: t }) }, '✏️'),
          h('button', { class: 'btn-icon', title: 'Dönüş ekle', onClick: () => openTicketForm({ defaults: { owner: t.owner, from_place: t.to_place, to_place: t.from_place, date: t.date, mode: t.mode } }) }, '↩︎'),
          h('button', { class: 'btn-icon danger', title: 'Sil', onClick: async () => {
            if (!(await confirmDialog(`${formatDate(t.date)} — ${placeLabel(state.idx, t.from_place)} → ${placeLabel(state.idx, t.to_place)} silinsin mi?`))) return;
            try { await actions.deleteTicket(t.id); toast('Bilet silindi', 'ok'); } catch (e) { toast(e.message, 'err'); }
          } }, '🗑'))));
    }
  };

  drawChips(); drawWarnings(); drawList();
  const unsub = subscribe(() => { drawWarnings(); drawList(); });
  return () => unsub();
}
