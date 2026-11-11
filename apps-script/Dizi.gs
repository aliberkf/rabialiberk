/**
 * 📺 DİZİ TAKİP modülü — dizi.rabialiberk.com'un arka ucu
 * ------------------------------------------------------------
 * Code.gs'teki web uygulamasının içinde çalışır; kimlik doğrulama orada yapılır.
 * Veritabanı: ayrı bir "Dizi Takip" E-Tablosu (setupDizi oluşturur, Drive'ında senin).
 *   - "Diziler"  sekmesi: takip edilen diziler
 *   - "Bolumler" sekmesi: tüm bölümler + izlendi işaretleri
 * Bölüm verisi: TVmaze açık API'si (anahtarsız). 6 saatte bir otomatik güncellenir.
 * Takvim: "Televizyon" — yeni bölümler oraya eklenir, tarih değişirse güncellenir.
 *
 * Kurulum: editörde bir kez "setupDizi" çalıştır.
 * Erişim: Script Properties → DIZI_ALLOWED = ["abf"] (varsayılan yalnızca Ali Berk).
 *
 * Her şey tek bir nesnenin (Dizi) içinde; Code.gs'teki fonksiyonlarla ad çakışması olmaz.
 */

/** Editörden bir kez çalıştır: tabloyu, takvimi ve tetikleyiciyi kurar. */
function setupDizi() { return Dizi.setup(); }
/** Tetikleyici: 6 saatte bir tüm dizileri günceller. */
function diziSyncAll() { return Dizi.syncAll(false); }
/** Tek seferlik tetikleyici: ekleme/arşivleme sonrası takvim etkinliklerini arka planda işler. */
function diziCalendarSync() { return Dizi.calendarSync(); }

var Dizi = (function () {
  const TVMAZE = 'https://api.tvmaze.com';
  const SH_SHOWS = 'Diziler';
  const SH_EPS = 'Bolumler';
  const CAL_NAME = 'Televizyon';
  const P_SS = 'DIZI_SS_ID', P_CAL = 'DIZI_CAL_ID', P_LAST = 'DIZI_LAST_SYNC', P_ALLOWED = 'DIZI_ALLOWED';

  const SHOW_COLS = ['tvmaze_id', 'imdb_id', 'ad', 'durum', 'kanal', 'baslangic_yili', 'poster',
    'tvmaze_url', 'aktif', 'eklenme', 'son_senkron'];
  const SHOW_TEXT = ['imdb_id', 'baslangic_yili', 'eklenme', 'son_senkron'];
  const SHOW_BOOL = ['aktif'];

  const EP_COLS = ['bolum_id', 'dizi_id', 'dizi_adi', 'sezon', 'bolum', 'bolum_adi', 'yayin_tarihi',
    'yayin_zamani', 'saat_belli', 'sure_dk', 'izlendi', 'izlenme_zamani', 'takvim_id', 'takvim_imza'];
  const EP_TEXT = ['bolum_adi', 'yayin_tarihi', 'yayin_zamani', 'izlenme_zamani', 'takvim_id', 'takvim_imza'];
  const EP_BOOL = ['saat_belli', 'izlendi'];

  const DAY = 24 * 3600 * 1000;
  const props = function () { return PropertiesService.getScriptProperties(); };

  /* ───────────── Kurulum ───────────── */

  function setup() {
    const p = props();
    let ss = null;
    const id = p.getProperty(P_SS);
    if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
    if (!ss) {
      ss = SpreadsheetApp.create('Dizi Takip');
      p.setProperty(P_SS, ss.getId());
    }
    showsSheet_(); epsSheet_();
    ['Sayfa1', 'Sheet1'].forEach(function (n) {
      const sh = ss.getSheetByName(n);
      if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
    });

    const existingCal = getCal_();
    if (!existingCal) {
      const cal = CalendarApp.createCalendar(CAL_NAME, {
        summary: 'Takip ettiğin dizilerin yeni bölümleri (dizi.rabialiberk.com otomatik günceller)',
        timeZone: Session.getScriptTimeZone()
      });
      p.setProperty(P_CAL, cal.getId());
    } else if (existingCal.getName() !== CAL_NAME) {
      existingCal.setName(CAL_NAME);   // ad değişikliği; kimlik aynı kalır
    }

    ScriptApp.getProjectTriggers()
      .filter(function (t) { return t.getHandlerFunction() === 'diziSyncAll'; })
      .forEach(function (t) { ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('diziSyncAll').timeBased().everyHours(6).create();

    if (!p.getProperty(P_ALLOWED)) p.setProperty(P_ALLOWED, JSON.stringify(['abf']));
    Logger.log('Dizi kurulumu tamam. Tablo: ' + ss.getUrl());
    return { ok: true, sheet: ss.getUrl() };
  }

  /* ───────────── Erişim ───────────── */

  function requireAccess(me) {
    const allowed = JSON.parse(props().getProperty(P_ALLOWED) || '["abf"]');
    if (allowed.indexOf(me.who) < 0) {
      const e = new Error('Bu bölüme erişimin yok.'); e.code = 'forbidden'; throw e;
    }
    if (!props().getProperty(P_SS)) throw new Error('Dizi modülü kurulmamış: editörde setupDizi çalıştır.');
  }

  /* ───────────── API ───────────── */

  function apiGetData() { return toClient_(loadDb_()); }

  function apiSearch(q) {
    q = String(q || '').trim();
    if (!q) return [];
    let shows = [];
    const imdb = q.match(/tt\d{6,10}/i);
    const tvm = q.match(/tvmaze\.com\/shows\/(\d+)/i);
    if (imdb) {
      const s = fetchJson_('/lookup/shows?imdb=' + imdb[0].toLowerCase());
      if (s) shows = [s];
    } else if (tvm) {
      const s = fetchJson_('/shows/' + tvm[1]);
      if (s) shows = [s];
    } else {
      shows = (fetchJson_('/search/shows?q=' + encodeURIComponent(q)) || []).map(function (r) { return r.show; });
    }
    return shows.map(function (s) {
      return {
        id: s.id, ad: s.name, yil: (s.premiered || '').slice(0, 4), durum: s.status || '',
        kanal: networkName_(s), poster: (s.image && s.image.medium) || '',
        imdb: (s.externals && s.externals.imdb) || '',
        ozet: stripHtml_(s.summary).slice(0, 240)
      };
    });
  }

  function apiAddShow(id) {
    return withLock_(function () {
      const db = loadDb_();
      const s = fetchShow_(id);
      if (!s) throw new Error('Dizi TVmaze\'de bulunamadı.');
      const existing = db.shows.find(function (x) { return x.tvmaze_id === s.id; });
      if (existing) existing.aktif = true;
      mergeShow_(db, s, null);          // takvim arka planda (hızlı cevap)
      saveDb_(db);
      scheduleCalendarSync_();
      return toClient_(db);
    });
  }

  function apiSetWatched(ids, watched) {
    return withLock_(function () {
      const sh = epsSheet_();
      const last = sh.getLastRow();
      if (last < 2) return { ok: true, changed: 0 };
      const idVals = sh.getRange(2, 1, last - 1, 1).getValues();
      const wCol = EP_COLS.indexOf('izlendi') + 1; // izlendi + izlenme_zamani yan yana
      const range = sh.getRange(2, wCol, last - 1, 2);
      const vals = range.getValues();
      const set = {};
      (ids || []).forEach(function (i) { set[Number(i)] = true; });
      const now = nowIso_();
      let changed = 0;
      idVals.forEach(function (r, i) {
        if (set[Number(r[0])] && bool_(vals[i][0]) !== !!watched) {
          vals[i][0] = !!watched;
          vals[i][1] = watched ? now : '';
          changed++;
        }
      });
      if (changed) range.setValues(vals);
      return { ok: true, changed: changed, zaman: now };
    });
  }

  function apiSetActive(showId, aktif) {
    return withLock_(function () {
      const db = loadDb_();
      const show = db.shows.find(function (x) { return x.tvmaze_id === Number(showId); });
      if (!show) throw new Error('Dizi bulunamadı.');
      show.aktif = !!aktif;
      saveDb_(db);
      scheduleCalendarSync_();
      return toClient_(db);
    });
  }

  function apiDeleteShow(showId) {
    return withLock_(function () {
      const db = loadDb_();
      const id = Number(showId);
      const cal = getCal_();
      db.eps.filter(function (e) { return e.dizi_id === id; })
        .forEach(function (e) { deleteEvent_(cal, e); });
      db.eps = db.eps.filter(function (e) { return e.dizi_id !== id; });
      db.shows = db.shows.filter(function (s) { return s.tvmaze_id !== id; });
      saveDb_(db);
      return toClient_(db);
    });
  }

  function apiSync() {
    const res = syncAll(true);
    const out = toClient_(loadDb_());
    out.syncResult = res;
    return out;
  }

  /** Bekleyen takvim işleri: aktif dizilerin gelecek bölümlerini ekler/günceller, arşivlenenleri kaldırır. */
  function calendarSync() {
    ScriptApp.getProjectTriggers()
      .filter(function (t) { return t.getHandlerFunction() === 'diziCalendarSync'; })
      .forEach(function (t) { ScriptApp.deleteTrigger(t); });
    return withLock_(function () {
      const db = loadDb_();
      const cal = getCal_();
      if (!cal) return { ok: false };
      const byId = {};
      db.shows.forEach(function (s) { byId[s.tvmaze_id] = s; });
      db.eps.forEach(function (e) { const show = byId[e.dizi_id]; if (show) syncEvent_(cal, show, e); });
      saveDb_(db);
      return { ok: true };
    });
  }

  function scheduleCalendarSync_() {
    const pending = ScriptApp.getProjectTriggers()
      .some(function (t) { return t.getHandlerFunction() === 'diziCalendarSync'; });
    if (!pending) ScriptApp.newTrigger('diziCalendarSync').timeBased().after(5 * 1000).create();
  }

  /** Code.gs'teki ACTIONS'a eklenen işlemler: { action: 'dizi', payload: { fn, args } } */
  const FNS = {
    getData: apiGetData, search: apiSearch, addShow: apiAddShow, setWatched: apiSetWatched,
    setActive: apiSetActive, deleteShow: apiDeleteShow, sync: apiSync
  };
  function handle(p, me) {
    requireAccess(me);
    const fn = FNS[p && p.fn];
    if (!fn) throw new Error('Bilinmeyen dizi işlemi: ' + (p && p.fn));
    return fn.apply(null, (p && p.args) || []);
  }

  /* ───────────── Senkronizasyon ───────────── */

  /** force=true ise bitmiş diziler de güncellenir. */
  function syncAll(force) {
    force = force === true;
    if (!props().getProperty(P_SS)) return { guncellenen: 0, hatalar: ['kurulum yok'] };
    return withLock_(function () {
      const started = Date.now();
      const db = loadDb_();
      const cal = getCal_();
      const errors = [];
      let updated = 0;
      const queue = db.shows
        .filter(function (s) { return s.aktif; })
        .sort(function (a, b) { return (Date.parse(a.son_senkron) || 0) - (Date.parse(b.son_senkron) || 0); });

      for (let i = 0; i < queue.length; i++) {
        const show = queue[i];
        if (Date.now() - started > 4.5 * 60 * 1000) break; // 6 dk sınırı; kalanlar sonraki turda
        const lastSync = Date.parse(show.son_senkron) || 0;
        if (!force && show.durum === 'Ended' && Date.now() - lastSync < 7 * DAY) continue;
        try {
          const s = fetchShow_(show.tvmaze_id);
          if (s) { mergeShow_(db, s, cal); updated++; }
        } catch (err) {
          errors.push(show.ad + ': ' + err.message);
        }
        Utilities.sleep(400); // TVmaze: 10 saniyede en fazla 20 istek
      }
      saveDb_(db);
      props().setProperty(P_LAST, nowIso_());
      if (errors.length) console.warn(errors.join('\n'));
      return { guncellenen: updated, hatalar: errors };
    });
  }

  function mergeShow_(db, s, cal) {
    let show = db.shows.find(function (x) { return x.tvmaze_id === s.id; });
    const fresh = {
      tvmaze_id: s.id,
      imdb_id: (s.externals && s.externals.imdb) || (show && show.imdb_id) || '',
      ad: s.name,
      durum: s.status || '',
      kanal: networkName_(s),
      baslangic_yili: (s.premiered || '').slice(0, 4),
      poster: (s.image && (s.image.medium || s.image.original)) || '',
      tvmaze_url: s.url || '',
      aktif: show ? show.aktif : true,
      eklenme: show ? show.eklenme : nowIso_(),
      son_senkron: nowIso_()
    };
    if (show) Object.assign(show, fresh); else { show = fresh; db.shows.push(show); }

    // Bölümler: izlendi bilgisini koruyarak birleştir
    const apiEps = ((s._embedded && s._embedded.episodes) || [])
      .filter(function (e) { return e.season != null && e.number != null; });
    const existing = db.eps.filter(function (e) { return e.dizi_id === s.id; });
    const byId = {}, byKey = {};
    existing.forEach(function (e) { byId[e.bolum_id] = e; byKey[e.sezon + 'x' + e.bolum] = e; });
    const used = new Set();
    const keep = [];

    apiEps.forEach(function (ae) {
      const rec = {
        bolum_id: ae.id, dizi_id: s.id, dizi_adi: s.name, sezon: ae.season, bolum: ae.number,
        bolum_adi: ae.name || '', yayin_tarihi: ae.airdate || '', yayin_zamani: ae.airstamp || '',
        saat_belli: !!ae.airtime, sure_dk: ae.runtime || s.averageRuntime || s.runtime || '',
        izlendi: false, izlenme_zamani: '', takvim_id: '', takvim_imza: ''
      };
      let old = byId[ae.id] || byKey[rec.sezon + 'x' + rec.bolum];
      if (old && used.has(old)) old = null;
      if (old) {
        used.add(old);
        rec.izlendi = old.izlendi;
        rec.izlenme_zamani = old.izlenme_zamani;
        rec.takvim_id = old.takvim_id;
        rec.takvim_imza = old.takvim_imza;
      }
      keep.push(rec);
    });
    // TVmaze'den kalkmış bölümler: izlenmişse geçmiş olarak sakla, değilse sil
    existing.forEach(function (o) {
      if (used.has(o)) return;
      if (o.izlendi) keep.push(o); else deleteEvent_(cal, o);
    });

    db.eps = db.eps.filter(function (e) { return e.dizi_id !== s.id; }).concat(keep);
    keep.forEach(function (e) { syncEvent_(cal, show, e); });
  }

  /* ───────────── Google Takvim ───────────── */

  function getCal_() {
    const id = props().getProperty(P_CAL);
    if (!id) return null;
    try { return CalendarApp.getCalendarById(id); } catch (e) { return null; }
  }

  function epTiming_(show, e) {
    const code = 'S' + pad_(e.sezon) + 'E' + pad_(e.bolum);
    const generic = !e.bolum_adi || /^(episode|bölüm)\s*\d+$/i.test(e.bolum_adi) || e.bolum_adi === 'TBA';
    const title = show.ad + ' ' + code + (generic ? '' : ' · ' + e.bolum_adi);
    if (e.saat_belli && e.yayin_zamani) {
      const start = new Date(e.yayin_zamani);
      const end = new Date(start.getTime() + (Number(e.sure_dk) || 60) * 60000);
      return { title: title, start: start, end: end, allDay: false };
    }
    if (!e.yayin_tarihi) return null;
    // Saat belli değilse gün boyu etkinlik. Öğlen UTC → her saat diliminde aynı gün.
    return { title: title, start: new Date(e.yayin_tarihi + 'T12:00:00Z'), end: null, allDay: true };
  }

  function syncEvent_(cal, show, e) {
    if (!cal) return;
    const t = epTiming_(show, e);
    const isFuture = t && t.start.getTime() >= Date.now() - DAY;
    try {
      if (!t || !isFuture) {
        if (!t && e.takvim_id) deleteEvent_(cal, e); // tarihi kaldırılmış bölüm
        return; // geçmiş bölümlere dokunma
      }
      if (!show.aktif) { deleteEvent_(cal, e); return; }
      const sig = [t.title, t.allDay ? e.yayin_tarihi : t.start.toISOString(), t.allDay, e.sure_dk].join('|');
      if (e.takvim_id && e.takvim_imza === sig) return;

      let ev = e.takvim_id ? cal.getEventById(e.takvim_id) : null;
      const desc = [show.kanal, show.tvmaze_url, show.imdb_id ? 'https://www.imdb.com/title/' + show.imdb_id + '/' : '']
        .filter(String).join('\n');
      if (ev) {
        if (t.allDay) ev.setAllDayDate(t.start); else ev.setTime(t.start, t.end);
        ev.setTitle(t.title);
      } else {
        ev = t.allDay ? cal.createAllDayEvent(t.title, t.start, { description: desc })
          : cal.createEvent(t.title, t.start, t.end, { description: desc });
        Utilities.sleep(150);
      }
      e.takvim_id = ev.getId();
      e.takvim_imza = sig;
    } catch (err) {
      console.warn('Takvim hatası (' + show.ad + '): ' + err.message);
    }
  }

  function deleteEvent_(cal, e) {
    if (!cal || !e.takvim_id) return;
    try {
      const ev = cal.getEventById(e.takvim_id);
      if (ev) ev.deleteEvent();
    } catch (err) { /* zaten silinmiş olabilir */ }
    e.takvim_id = '';
    e.takvim_imza = '';
  }

  /* ───────────── TVmaze ───────────── */

  function fetchShow_(id) { return fetchJson_('/shows/' + Number(id) + '?embed=episodes'); }

  function fetchJson_(path) {
    for (let i = 0; i < 5; i++) {
      const r = UrlFetchApp.fetch(TVMAZE + path, { muteHttpExceptions: true, followRedirects: true });
      const c = r.getResponseCode();
      if (c === 200) return JSON.parse(r.getContentText());
      if (c === 404) return null;
      if (c === 429 || c >= 500) { Utilities.sleep(2500 * (i + 1)); continue; }
      throw new Error('TVmaze ' + c);
    }
    throw new Error('TVmaze şu an yanıt vermiyor, sonra tekrar denenecek.');
  }

  function networkName_(s) {
    return (s.network && s.network.name) || (s.webChannel && s.webChannel.name) || '';
  }

  /* ───────────── E-Tablo veri katmanı ───────────── */

  function ss_() {
    const id = props().getProperty(P_SS);
    if (!id) throw new Error('Dizi modülü kurulmamış: editörde setupDizi çalıştır.');
    return SpreadsheetApp.openById(id);
  }

  function sheetFor_(name, cols) {
    const ss = ss_();
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#f1f3f4');
      sh.setFrozenRows(1);
    }
    return sh;
  }
  function showsSheet_() { return sheetFor_(SH_SHOWS, SHOW_COLS); }
  function epsSheet_() { return sheetFor_(SH_EPS, EP_COLS); }

  function readTable_(sh, cols) {
    const last = sh.getLastRow();
    if (last < 2) return [];
    return sh.getRange(2, 1, last - 1, cols.length).getValues()
      .filter(function (r) { return r[0] !== '' && r[0] !== null && r[0] !== false; })
      .map(function (r) { const o = {}; cols.forEach(function (c, j) { o[c] = r[j]; }); return o; });
  }

  function writeTable_(sh, cols, objs, textCols, boolCols) {
    const n = objs.length;
    const oldRows = Math.max(sh.getLastRow() - 1, 0);
    if (sh.getMaxRows() < n + 1) sh.insertRowsAfter(sh.getMaxRows(), n + 1 - sh.getMaxRows());
    if (oldRows > n) {
      const extra = sh.getRange(n + 2, 1, oldRows - n, cols.length);
      extra.clearDataValidations();
      extra.clearContent();
    }
    if (!n) return;
    textCols.forEach(function (c) { sh.getRange(2, cols.indexOf(c) + 1, n, 1).setNumberFormat('@'); });
    const values = objs.map(function (o) {
      return cols.map(function (c) {
        const v = o[c];
        if (v === undefined || v === null) return '';
        return textCols.indexOf(c) >= 0 ? String(v) : v;
      });
    });
    sh.getRange(2, 1, n, cols.length).setValues(values);
    boolCols.forEach(function (c) { sh.getRange(2, cols.indexOf(c) + 1, n, 1).insertCheckboxes(); });
  }

  function loadDb_() {
    const tz = ss_().getSpreadsheetTimeZone();
    const shows = readTable_(showsSheet_(), SHOW_COLS).map(function (o) {
      return {
        tvmaze_id: Number(o.tvmaze_id), imdb_id: str_(o.imdb_id, tz), ad: str_(o.ad, tz),
        durum: str_(o.durum, tz), kanal: str_(o.kanal, tz), baslangic_yili: str_(o.baslangic_yili, tz),
        poster: str_(o.poster, tz), tvmaze_url: str_(o.tvmaze_url, tz),
        aktif: o.aktif === '' ? true : bool_(o.aktif),
        eklenme: isoStr_(o.eklenme), son_senkron: isoStr_(o.son_senkron)
      };
    });
    const eps = readTable_(epsSheet_(), EP_COLS).map(function (o) {
      return {
        bolum_id: Number(o.bolum_id), dizi_id: Number(o.dizi_id), dizi_adi: str_(o.dizi_adi, tz),
        sezon: Number(o.sezon), bolum: Number(o.bolum), bolum_adi: str_(o.bolum_adi, tz),
        yayin_tarihi: o.yayin_tarihi instanceof Date ? Utilities.formatDate(o.yayin_tarihi, tz, 'yyyy-MM-dd') : String(o.yayin_tarihi || ''),
        yayin_zamani: isoStr_(o.yayin_zamani), saat_belli: bool_(o.saat_belli), sure_dk: o.sure_dk === '' ? '' : Number(o.sure_dk),
        izlendi: bool_(o.izlendi), izlenme_zamani: isoStr_(o.izlenme_zamani),
        takvim_id: String(o.takvim_id || ''), takvim_imza: String(o.takvim_imza || '')
      };
    });
    return { shows: shows, eps: eps };
  }

  function saveDb_(db) {
    db.shows.sort(function (a, b) { return a.ad.localeCompare(b.ad, 'tr'); });
    db.eps.sort(function (a, b) {
      return a.dizi_adi.localeCompare(b.dizi_adi, 'tr') || a.dizi_id - b.dizi_id || a.sezon - b.sezon || a.bolum - b.bolum;
    });
    writeTable_(showsSheet_(), SHOW_COLS, db.shows, SHOW_TEXT, SHOW_BOOL);
    writeTable_(epsSheet_(), EP_COLS, db.eps, EP_TEXT, EP_BOOL);
  }

  function toClient_(db) {
    return {
      shows: db.shows.map(function (s) {
        return { id: s.tvmaze_id, ad: s.ad, imdb: s.imdb_id, durum: s.durum, kanal: s.kanal, yil: s.baslangic_yili,
          poster: s.poster, url: s.tvmaze_url, aktif: s.aktif, eklenme: s.eklenme, senkron: s.son_senkron };
      }),
      eps: db.eps.map(function (e) {
        return { i: e.bolum_id, s: e.dizi_id, se: e.sezon, n: e.bolum, t: e.bolum_adi, d: e.yayin_tarihi,
          a: e.yayin_zamani, h: e.saat_belli, r: e.sure_dk, w: e.izlendi, wt: e.izlenme_zamani };
      }),
      lastSync: props().getProperty(P_LAST) || '',
      calendar: !!getCal_()
    };
  }

  /* ───────────── Yardımcılar ───────────── */

  function withLock_(fn) {
    const lock = LockService.getScriptLock();
    lock.waitLock(60000);
    try { return fn(); } finally { lock.releaseLock(); }
  }
  function nowIso_() { return new Date().toISOString(); }
  function pad_(n) { return (Number(n) < 10 ? '0' : '') + Number(n); }
  function bool_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
  function str_(v, tz) {
    if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    return v === null || v === undefined ? '' : String(v);
  }
  function isoStr_(v) {
    if (v instanceof Date) return v.toISOString();
    return v === null || v === undefined ? '' : String(v);
  }
  function stripHtml_(h) { return String(h || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); }

  return { setup: setup, syncAll: syncAll, calendarSync: calendarSync, handle: handle };
})();
