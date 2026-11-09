// Seyir defteri: parşömen yazılar + fotoğraflar; yeni not; tek yazı görünümü (#/defter/ID)
import { CONFIG } from '../config.js';
import { state, subscribe } from '../store.js';
import { h } from '../ui/dom.js';
import { entryCard, openEntryForm } from '../ui/components.js';

export function renderDiary(root, { param }) {
  let who = 'all';
  const chips = h('div', { class: 'chips' });
  const list = h('div', { class: 'diary-list' });

  const head = h('div', { class: 'panel diary-head' },
    h('h1', { class: 'title small' }, 'SEYİR DEFTERİ'),
    h('div', { class: 'diary-sub' }, 'KAPTANLARIN NOTLARI'),
    h('div', { class: 'diary-actions' },
      h('button', { class: 'btn btn-gold', onClick: () => openEntryForm({}) }, '✍️ Yeni not'),
      chips));
  root.append(head, list);

  const drawChips = () => {
    chips.innerHTML = '';
    const chip = (val, label) => h('button', { class: `chip ${who === val ? 'active' : ''}`, onClick: () => { who = val; drawChips(); draw(); } }, label);
    chips.append(chip('all', 'Hepsi'), chip('rkf', CONFIG.people.rkf.name), chip('abf', CONFIG.people.abf.name));
  };

  const draw = () => {
    list.innerHTML = '';
    let entries = [...state.entries].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
    if (param) {
      const one = entries.find(e => e.id === param);
      list.append(h('a', { href: '#/defter', class: 'back' }, '‹ Tüm yazılar'));
      if (one) list.append(entryCard(one, { onChanged: draw }));
      else list.append(h('div', { class: 'panel muted' }, 'Yazı bulunamadı.'));
      return;
    }
    if (who !== 'all') entries = entries.filter(e => e.author === who);
    if (!entries.length) { list.append(h('div', { class: 'panel muted' }, 'Henüz bir anı yazılmamış.')); return; }
    list.append(h('div', { class: 'diary-hint muted' }, 'Yazılar yeniden eskiye sıralı; başlangıcı okumak için en alta in.'));
    for (const e of entries) list.append(entryCard(e, { onChanged: draw }));
  };

  drawChips(); draw();
  const unsub = subscribe(draw);
  return () => unsub();
}
