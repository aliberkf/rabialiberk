/**
 * 🎸 AKOR DEFTERİ modülü — gitar.rabialiberk.com'un arka ucu
 * ------------------------------------------------------------
 * Code.gs'teki web uygulamasının içinde çalışır; kimlik doğrulama orada yapılır.
 * Veritabanı: ayrı bir "Akor Defteri" E-Tablosu (setupAkor oluşturur), sekme: "Sarkilar".
 * Linkten içe aktarma: Ultimate Guitar (js-store JSON), akorlar.com, repertuarim.com ve <pre> kullanan diğer siteler.
 *
 * Kurulum: editörde bir kez "setupAkor" çalıştır.
 * Erişim: Script Properties → AKOR_ALLOWED = ["abf"] (varsayılan yalnızca Ali Berk).
 */

function setupAkor() { return Akor.setup(); }
/** Editörden içe aktarmayı denemek için: URL'yi değiştirip çalıştır, sonucu günlükte gör. */
function akorTestImport() {
  const r = Akor.importUrl('https://akorlar.com/duman-kufi');
  Logger.log(JSON.stringify({ title: r.title, artist: r.artist, source: r.source, len: r.text.length, head: r.text.slice(0, 120) }));
}

var Akor = (function () {
  const SHEET = 'Sarkilar';
  const COLS = ['id', 'title', 'artist', 'tags', 'text', 'transpose', 'accidentals', 'capo', 'scroll_speed',
    'source_url', 'created_at', 'updated_at'];
  const P_SS = 'AKOR_SS_ID', P_ALLOWED = 'AKOR_ALLOWED';
  const props = function () { return PropertiesService.getScriptProperties(); };

  /* ───────────── Kurulum ───────────── */

  function setup() {
    const p = props();
    let ss = null;
    const id = p.getProperty(P_SS);
    if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
    if (!ss) { ss = SpreadsheetApp.create('Akor Defteri'); p.setProperty(P_SS, ss.getId()); }
    sheet_();
    ['Sayfa1', 'Sheet1'].forEach(function (n) {
      const sh = ss.getSheetByName(n);
      if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
    });
    if (!p.getProperty(P_ALLOWED)) p.setProperty(P_ALLOWED, JSON.stringify(['abf']));
    Logger.log('Akor kurulumu tamam. Tablo: ' + ss.getUrl());
    return { ok: true, sheet: ss.getUrl() };
  }

  function requireAccess(me) {
    const allowed = JSON.parse(props().getProperty(P_ALLOWED) || '["abf"]');
    if (allowed.indexOf(me.who) < 0) { const e = new Error('Bu bölüme erişimin yok.'); e.code = 'forbidden'; throw e; }
    if (!props().getProperty(P_SS)) throw new Error('Akor modülü kurulmamış: editörde setupAkor çalıştır.');
  }

  /* ───────────── Tablo ───────────── */

  function sheet_() {
    const ss = SpreadsheetApp.openById(props().getProperty(P_SS));
    let sh = ss.getSheetByName(SHEET);
    if (!sh) sh = ss.insertSheet(SHEET);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, COLS.length).setValues([COLS]).setFontWeight('bold').setBackground('#f1f3f4');
      sh.setFrozenRows(1);
      sh.getRange('A:Z').setNumberFormat('@');           // her şey metin: tarih/sayı dönüşümü yok
      sh.setColumnWidth(5, 420);
    }
    return sh;
  }

  // "=" ile başlayan hücreler formül sanılmasın: başına ' koy, okurken çıkar
  const safe_ = function (v) { v = String(v == null ? '' : v); return /^[=+]/.test(v) ? "'" + v : v; };
  const unsafe_ = function (v) { v = String(v == null ? '' : v); return /^'[=+]/.test(v) ? v.slice(1) : v; };

  function toRec_(row) {
    const o = {};
    COLS.forEach(function (c, i) { o[c] = unsafe_(row[i]); });
    return {
      id: o.id, title: o.title, artist: o.artist,
      tags: o.tags ? o.tags.split('|').filter(String) : [],
      text: o.text, transpose: Number(o.transpose) || 0, accidentals: o.accidentals || 'auto',
      capo: Number(o.capo) || 0, scrollSpeed: Number(o.scroll_speed) || 3, sourceUrl: o.source_url,
      createdAt: o.created_at, updatedAt: o.updated_at
    };
  }
  function toRow_(r) {
    return [r.id, safe_(r.title), safe_(r.artist), safe_((r.tags || []).join('|')), safe_(r.text),
      String(r.transpose || 0), r.accidentals || 'auto', String(r.capo || 0), String(r.scrollSpeed || 3),
      r.sourceUrl || '', r.createdAt || '', r.updatedAt || ''];
  }
  function all_() {
    const sh = sheet_();
    const n = sh.getLastRow() - 1;
    if (n < 1) return [];
    return sh.getRange(2, 1, n, COLS.length).getValues().filter(function (r) { return r[0]; }).map(toRec_);
  }
  function findRow_(sh, id) {
    const n = sh.getLastRow() - 1;
    if (n < 1) return -1;
    const ids = sh.getRange(2, 1, n, 1).getValues();
    for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
    return -1;
  }

  /* ───────────── API ───────────── */

  function list() { return all_(); }

  function save(song) {
    if (!song || !String(song.text || '').trim()) throw new Error('Akor metni boş.');
    if (String(song.text).length > 45000) throw new Error('Metin çok uzun (en fazla 45.000 karakter).');
    return withLock_(function () {
      const sh = sheet_();
      const now = new Date().toISOString();
      const rec = {
        id: song.id || ('S' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
        title: String(song.title || '').slice(0, 200), artist: String(song.artist || '').slice(0, 200),
        tags: (song.tags || []).map(String).slice(0, 20), text: String(song.text),
        transpose: Number(song.transpose) || 0, accidentals: song.accidentals || 'auto',
        capo: Number(song.capo) || 0, scrollSpeed: Number(song.scrollSpeed) || 3,
        sourceUrl: String(song.sourceUrl || ''), createdAt: song.createdAt || now, updatedAt: now
      };
      const row = song.id ? findRow_(sh, song.id) : -1;
      if (row > 0) sh.getRange(row, 1, 1, COLS.length).setValues([toRow_(rec)]);
      else sh.appendRow(toRow_(rec));
      return rec;
    });
  }

  /** Yalnızca ton/kapo/hız — her transpozede otomatik çağrılır, hafif tutulur. */
  function settings(id, s) {
    return withLock_(function () {
      const sh = sheet_();
      const row = findRow_(sh, id);
      if (row < 0) throw new Error('Şarkı bulunamadı.');
      const c = function (name) { return COLS.indexOf(name) + 1; };
      sh.getRange(row, c('transpose'), 1, 4).setValues([[String(Number(s.transpose) || 0), s.accidentals || 'auto',
        String(Number(s.capo) || 0), String(Number(s.scrollSpeed) || 3)]]);
      sh.getRange(row, c('updated_at')).setValue(new Date().toISOString());
      return { ok: true };
    });
  }

  function remove(id) {
    return withLock_(function () {
      const sh = sheet_();
      const row = findRow_(sh, id);
      if (row > 0) sh.deleteRow(row);
      return { ok: true };
    });
  }

  /* ───────────── Linkten içe aktarma ───────────── */

  function importUrl(url) {
    url = String(url || '').trim();
    if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new Error('Geçerli bir link değil.');
    const res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true, followRedirects: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
      }
    });
    const code = res.getResponseCode();
    if (code === 403 || code === 429 || code === 503) {
      throw new Error('Site otomatik erişimi engelledi (' + code + '). Sayfadaki akorları kopyalayıp "Yapıştır" ile ekleyebilirsin.');
    }
    if (code !== 200) throw new Error('Sayfa açılamadı (' + code + ').');
    const html = res.getContentText();

    if (/ultimate-guitar\.com/i.test(url)) {
      const ug = parseUG_(html);
      if (ug) { ug.sourceUrl = url; ug.source = 'Ultimate Guitar'; return ug; }
    }
    const gen = parseGeneric_(html);
    if (!gen) throw new Error('Bu sayfada akor bulunamadı. Akorları kopyalayıp "Yapıştır" ile ekleyebilirsin.');
    gen.sourceUrl = url;
    gen.source = url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
    return gen;
  }

  function parseUG_(html) {
    const m = html.match(/class="js-store"\s+data-content="([^"]+)"/);
    if (!m) return null;
    let store;
    try { store = JSON.parse(decodeEntities_(m[1])); } catch (e) { return null; }
    const data = store && store.store && store.store.page && store.store.page.data;
    const content = data && data.tab_view && data.tab_view.wiki_tab && data.tab_view.wiki_tab.content;
    if (!content) return null;
    const tab = data.tab || {};
    const meta = (data.tab_view && data.tab_view.meta) || {};
    const text = String(content)
      .replace(/\r\n?/g, '\n')
      .replace(/\[\/?tab\]/g, '')
      .replace(/\[ch\]([^\[]*?)\[\/ch\]/g, '$1');
    let capo = 0;
    if (meta.capo) capo = Number(meta.capo) || 0;
    return { title: tab.song_name || '', artist: tab.artist_name || '', text: tidy_(text), capo: capo, tags: [] };
  }

  function parseGeneric_(html) {
    // En uzun <pre> bloğu (akorlar.com: <pre id="akor" class="chords">)
    const pres = [];
    const re = /<pre\b[^>]*>([\s\S]*?)<\/pre>/gi;
    let m;
    while ((m = re.exec(html))) pres.push(m[1]);
    if (!pres.length) return null;
    pres.sort(function (a, b) { return b.length - a.length; });
    const text = tidy_(decodeEntities_(pres[0].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')));
    if (text.replace(/\s/g, '').length < 20) return null;

    let title = '', artist = '';
    const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    const og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i);
    const raw = decodeEntities_((h1 ? h1[1] : (og ? og[1] : '')).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    const cleaned = raw.replace(/\s*[-–|]\s*(akor|akorları|chords?|tab).*$/i, '').replace(/\s*\(.*?\)\s*$/, '').trim();
    const parts = cleaned.split(/\s+[-–]\s+/);
    if (parts.length >= 2) { artist = parts[0]; title = parts.slice(1).join(' - '); } else title = cleaned;
    return { title: title, artist: artist, text: text, capo: 0, tags: [] };
  }

  function tidy_(t) {
    const lines = String(t).replace(/ /g, ' ').split('\n').map(function (l) { return l.replace(/\s+$/, ''); });
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return lines.join('\n').replace(/\n{4,}/g, '\n\n\n');
  }

  function decodeEntities_(s) {
    return String(s)
      .replace(/&quot;/g, '"').replace(/&#039;|&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); })
      .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); })
      .replace(/&amp;/g, '&');
  }

  function withLock_(fn) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try { return fn(); } finally { lock.releaseLock(); }
  }

  /* ───────────── Code.gs bağlantısı ───────────── */

  const FNS = { list: list, save: save, settings: settings, remove: remove, importUrl: importUrl };
  function handle(p, me) {
    requireAccess(me);
    const fn = FNS[p && p.fn];
    if (!fn) throw new Error('Bilinmeyen akor işlemi: ' + (p && p.fn));
    return fn.apply(null, (p && p.args) || []);
  }

  return { setup: setup, handle: handle, importUrl: importUrl };
})();
