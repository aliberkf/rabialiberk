/**
 * Rabialiberk Seyahat Günlükleri — Apps Script arka ucu
 * ------------------------------------------------------
 * Tek bir web uygulaması: site, JSON gövdeli POST isteği gönderir.
 *   { idToken: "<Google ID token>", action: "bootstrap", payload: {...} }
 * Kimlik Google'a doğrulatılır, e-posta beyaz listeye bakılır, işlem yapılır.
 *
 * Kurulum: docs/KURULUM.md
 *   Script Properties:
 *     CLIENT_ID        → Google Cloud OAuth istemci kimliği (sitedeki ile aynı)
 *     ALLOWED          → {"ali@gmail.com":"abf","rabia@gmail.com":"rkf"}
 *     DECK_PASSWORD    → (isteğe bağlı) güverte parolası; Google girişine EK olarak istenir.
 *                         Değiştirince herkes bir sonraki açılışta yeniden girer.
 *     PHOTO_FOLDER_ID  → (setup() otomatik oluşturur)
 *     SPREADSHEET_ID   → (yalnızca script Sheet'e bağlı değilse)
 */

var VERSION = '2.2.0';
var SHEETS = {
  tickets: ['id', 'owner', 'from_place', 'to_place', 'date', 'time', 'mode', 'carrier', 'note', 'created_at', 'created_by'],
  places: ['id', 'name', 'kind', 'parent_id', 'lat', 'lng', 'note', 'created_at'],
  entries: ['id', 'date', 'place_id', 'author', 'title', 'body', 'created_at', 'updated_at'],
  photos: ['id', 'thumb_id', 'entry_id', 'place_id', 'caption', 'taken_at', 'width', 'height', 'uploaded_by', 'created_at']
};
var DATE_COLS = { date: 'yyyy-MM-dd', time: 'HH:mm', taken_at: "yyyy-MM-dd'T'HH:mm", created_at: "yyyy-MM-dd'T'HH:mm:ss'Z'", updated_at: "yyyy-MM-dd'T'HH:mm:ss'Z'" };

// ---------------------------------------------------------------------------
// Kurulum: editörden bir kez çalıştır (yetkileri onaylatır, klasörü ve sayfaları oluşturur)
// ---------------------------------------------------------------------------
function setup() {
  var props = PropertiesService.getScriptProperties();
  var ss = getSpreadsheet_();
  Object.keys(SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.appendRow(SHEETS[name]);
      sh.setFrozenRows(1);
    }
  });
  if (!props.getProperty('PHOTO_FOLDER_ID')) {
    var folder = DriveApp.createFolder('Rabialiberk Fotoğraflar');
    props.setProperty('PHOTO_FOLDER_ID', folder.getId());
  }
  var missing = ['CLIENT_ID', 'ALLOWED'].filter(function (k) { return !props.getProperty(k); });
  Logger.log('Kurulum tamam. Fotoğraf klasörü: ' + props.getProperty('PHOTO_FOLDER_ID'));
  if (missing.length) Logger.log('EKSİK Script Properties: ' + missing.join(', '));
  else Logger.log('İzinli hesaplar: ' + props.getProperty('ALLOWED'));
}

// ---------------------------------------------------------------------------
// HTTP giriş noktaları
// ---------------------------------------------------------------------------
function doGet(e) {
  return json_({ ok: true, service: 'rabialiberk', version: VERSION, time: new Date().toISOString() });
}

function doPost(e) {
  var started = Date.now();
  try {
    var body = JSON.parse((e.postData && e.postData.contents) || '{}');
    var me = authenticate_(body);
    var action = String(body.action || '');
    var payload = body.payload || {};
    var fn = ACTIONS[action];
    if (!fn) throw new Error('Bilinmeyen işlem: ' + action);
    var result = fn(payload, me);
    return json_({ ok: true, data: result, me: me, ms: Date.now() - started });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err), code: err.code || 'error' });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// Kimlik doğrulama: Google ID token → e-posta → kişi kodu (abf | rkf)
// ---------------------------------------------------------------------------
function authenticate_(body) {
  var idToken = body.idToken;
  if (!idToken) throw authError_('Giriş gerekli.');
  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty('CLIENT_ID');
  var allowed = JSON.parse(props.getProperty('ALLOWED') || '{}');
  if (!clientId || !Object.keys(allowed).length) throw new Error('Sunucu kurulumu eksik: CLIENT_ID / ALLOWED');

  // Ön kontrol: JWT değilse, başka uygulamanınsa ya da süresi geçmişse Google'a hiç sorma (kota koruması)
  var pre = peekJwt_(idToken);
  if (!pre || pre.aud !== clientId || !pre.exp || Number(pre.exp) * 1000 < Date.now()) throw authError_('Oturum geçersiz, tekrar giriş yap.');
  if (pre.email && !allowed[String(pre.email).toLowerCase()]) throw authError_('Bu hesabın güverteye erişimi yok: ' + pre.email);

  var cache = CacheService.getScriptCache();
  var key = 'tok_' + hash_(idToken);
  var cached = cache.get(key);
  var email;
  if (cached) {
    email = cached;
  } else {
    var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw authError_('Oturum geçersiz, tekrar giriş yap.');
    var info = JSON.parse(res.getContentText());
    if (info.aud !== clientId) throw authError_('Bu uygulama için verilmemiş kimlik.');
    if (String(info.email_verified) !== 'true') throw authError_('E-posta doğrulanmamış.');
    var exp = Number(info.exp) * 1000;
    if (exp < Date.now()) throw authError_('Oturum süresi dolmuş.');
    email = String(info.email).toLowerCase();
    // token ömrü kadar (en fazla 50 dk) önbelleğe al
    var ttl = Math.max(60, Math.min(3000, Math.floor((exp - Date.now()) / 1000) - 30));
    cache.put(key, email, ttl);
  }
  var who = allowed[email];
  if (!who) throw authError_('Bu hesabın güverteye erişimi yok: ' + email);

  // İsteğe bağlı ikinci kilit: güverte parolası (Script Properties → DECK_PASSWORD)
  var deckPass = props.getProperty('DECK_PASSWORD');
  if (deckPass) {
    var given = String(body.pass || '');
    if (!given) { var e1 = new Error('Güverte parolası gerekli.'); e1.code = 'pass'; throw e1; }
    if (!rateLimitOk_(email)) { var e2 = new Error('Çok fazla yanlış deneme; 15 dakika bekle.'); e2.code = 'pass'; throw e2; }
    if (hash_(given) !== hash_(deckPass)) { noteFailure_(email); var e3 = new Error('Parola yanlış.'); e3.code = 'pass'; throw e3; }
  }
  return { email: email, who: who };
}

function rateLimitOk_(email) {
  var n = Number(CacheService.getScriptCache().get('fail_' + email) || 0);
  return n < 8;
}
function noteFailure_(email) {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get('fail_' + email) || 0) + 1;
  cache.put('fail_' + email, String(n), 900);
}

/** İmzayı DOĞRULAMADAN yükü okur — yalnızca ön eleme için; asıl doğrulama tokeninfo ile yapılır. */
function peekJwt_(token) {
  try {
    var parts = String(token).split('.');
    if (parts.length !== 3 || parts[1].length > 4000) return null;
    var json = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[1] + '==='.slice((parts[1].length + 3) % 4))).getDataAsString();
    return JSON.parse(json);
  } catch (e) { return null; }
}

function authError_(msg) { var e = new Error(msg); e.code = 'auth'; return e; }

function hash_(s) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('').slice(0, 40);
}

// ---------------------------------------------------------------------------
// İşlemler
// ---------------------------------------------------------------------------
var ACTIONS = {
  // dizi.rabialiberk.com — ayrıntılar Dizi.gs'te
  dizi: function (p, me) { return Dizi.handle(p, me); },

  bootstrap: function (p, me) {
    return {
      places: readAll_('places'),
      tickets: readAll_('tickets'),
      entries: readAll_('entries'),
      photos: readAll_('photos'),
      serverTime: new Date().toISOString(),
      version: VERSION
    };
  },

  // --- biletler ---
  addTicket: function (p, me) {
    requireFields_(p, ['owner', 'from_place', 'to_place', 'date', 'mode']);
    var rec = pick_(p, SHEETS.tickets);
    rec.id = rec.id || newId_('T');
    rec.created_at = nowIso_();
    rec.created_by = me.who;
    appendRow_('tickets', rec);
    return rec;
  },
  updateTicket: function (p, me) {
    requireFields_(p, ['id']);
    return updateRow_('tickets', p.id, pick_(p, SHEETS.tickets, ['id', 'created_at', 'created_by']));
  },
  deleteTicket: function (p, me) {
    requireFields_(p, ['id']);
    deleteRow_('tickets', p.id);
    return { id: p.id };
  },

  // --- yerler ---
  addPlace: function (p, me) {
    requireFields_(p, ['name', 'kind', 'parent_id', 'lat', 'lng']);
    var rec = pick_(p, SHEETS.places);
    rec.id = rec.id || slugId_(p.parent_id, p.name);
    rec.created_at = nowIso_();
    if (findRow_('places', rec.id)) throw new Error('Bu kimlikte bir yer zaten var: ' + rec.id);
    appendRow_('places', rec);
    return rec;
  },
  updatePlace: function (p, me) {
    requireFields_(p, ['id']);
    return updateRow_('places', p.id, pick_(p, SHEETS.places, ['id', 'created_at']));
  },
  deletePlace: function (p, me) {
    requireFields_(p, ['id']);
    var used = readAll_('tickets').some(function (t) { return t.from_place === p.id || t.to_place === p.id; }) ||
      readAll_('entries').some(function (e) { return e.place_id === p.id; });
    if (used) throw new Error('Bu yer biletlerde veya yazılarda kullanılıyor; önce onları değiştir.');
    deleteRow_('places', p.id);
    return { id: p.id };
  },

  // --- seyir defteri ---
  addEntry: function (p, me) {
    requireFields_(p, ['date', 'place_id', 'body']);
    var rec = pick_(p, SHEETS.entries);
    rec.id = rec.id || newId_('E');
    rec.author = me.who;
    rec.created_at = nowIso_();
    rec.updated_at = '';
    appendRow_('entries', rec);
    return rec;
  },
  updateEntry: function (p, me) {
    requireFields_(p, ['id']);
    var patch = pick_(p, SHEETS.entries, ['id', 'author', 'created_at']);
    patch.updated_at = nowIso_();
    return updateRow_('entries', p.id, patch);
  },
  deleteEntry: function (p, me) {
    requireFields_(p, ['id']);
    readAll_('photos').filter(function (ph) { return ph.entry_id === p.id; }).forEach(function (ph) {
      trashFile_(ph.id); trashFile_(ph.thumb_id); deleteRow_('photos', ph.id);
    });
    deleteRow_('entries', p.id);
    return { id: p.id };
  },

  // --- fotoğraflar (Drive'da özel klasör) ---
  uploadPhoto: function (p, me) {
    requireFields_(p, ['web', 'thumb']);
    var folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID'));
    var stamp = Utilities.formatDate(new Date(), 'Europe/Istanbul', 'yyyyMMdd-HHmmss');
    var base = (p.entry_id || p.place_id || 'foto') + '_' + stamp;
    var web = folder.createFile(Utilities.newBlob(Utilities.base64Decode(stripDataUrl_(p.web)), 'image/jpeg', base + '.jpg'));
    var thumb = folder.createFile(Utilities.newBlob(Utilities.base64Decode(stripDataUrl_(p.thumb)), 'image/jpeg', base + '_thumb.jpg'));
    var rec = {
      id: web.getId(), thumb_id: thumb.getId(), entry_id: p.entry_id || '', place_id: p.place_id || '',
      caption: p.caption || '', taken_at: p.taken_at || '', width: p.width || '', height: p.height || '',
      uploaded_by: me.who, created_at: nowIso_()
    };
    appendRow_('photos', rec);
    return rec;
  },
  updatePhoto: function (p, me) {
    requireFields_(p, ['id']);
    return updateRow_('photos', p.id, pick_(p, ['caption', 'taken_at', 'entry_id', 'place_id']));
  },
  deletePhoto: function (p, me) {
    requireFields_(p, ['id']);
    var row = findRow_('photos', p.id);
    if (row) { trashFile_(row.rec.id); trashFile_(row.rec.thumb_id); deleteRow_('photos', p.id); }
    return { id: p.id };
  },
  /** ids: Drive dosya kimlikleri (küçük resim ya da web boyu). Dönen: { id: "data:image/jpeg;base64,..." } */
  getPhotos: function (p, me) {
    requireFields_(p, ['ids']);
    var ids = p.ids.slice(0, 40);
    var cache = CacheService.getScriptCache();
    var out = {};
    var misses = [];
    var cached = cache.getAll(ids.map(function (id) { return 'img_' + id; }));
    ids.forEach(function (id) {
      var c = cached['img_' + id];
      if (c) out[id] = c; else misses.push(id);
    });
    var toCache = {};
    misses.forEach(function (id) {
      try {
        var blob = DriveApp.getFileById(id).getBlob();
        var dataUrl = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
        out[id] = dataUrl;
        if (dataUrl.length < 95000) toCache['img_' + id] = dataUrl; // CacheService öğe sınırı 100KB
      } catch (err) {
        out[id] = null;
      }
    });
    if (Object.keys(toCache).length) cache.putAll(toCache, 21600);
    return out;
  }
};

// ---------------------------------------------------------------------------
// Sheet yardımcıları
// ---------------------------------------------------------------------------
function getSpreadsheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID ayarlı değil.');
  return SpreadsheetApp.openById(id);
}

function sheet_(name) {
  var sh = getSpreadsheet_().getSheetByName(name);
  if (!sh) throw new Error('Sayfa bulunamadı: ' + name);
  return sh;
}

function headers_(sh) {
  var last = sh.getLastColumn();
  if (!last) return [];
  return sh.getRange(1, 1, 1, last).getValues()[0].map(function (h) { return String(h).trim(); });
}

function normalize_(col, v) {
  if (v instanceof Date) {
    var fmt = DATE_COLS[col] || 'yyyy-MM-dd';
    // Sheets tarih hücresi: saat sütunu için yalnızca saat
    if (col === 'time') return Utilities.formatDate(v, 'Europe/Istanbul', 'HH:mm');
    if (col === 'date') return Utilities.formatDate(v, 'Europe/Istanbul', 'yyyy-MM-dd');
    return Utilities.formatDate(v, 'UTC', fmt);
  }
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' && (col === 'lat' || col === 'lng' || col === 'width' || col === 'height')) return v;
  return String(v);
}

function readAll_(name) {
  var sh = sheet_(name);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var heads = headers_(sh);
  var values = sh.getRange(2, 1, lastRow - 1, heads.length).getValues();
  var out = [];
  values.forEach(function (row) {
    if (!row[0]) return;
    var rec = {};
    heads.forEach(function (h, i) { if (h) rec[h] = normalize_(h, row[i]); });
    out.push(rec);
  });
  return out;
}

function findRow_(name, id) {
  var sh = sheet_(name);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return null;
  var ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      var heads = headers_(sh);
      var row = sh.getRange(i + 2, 1, 1, heads.length).getValues()[0];
      var rec = {};
      heads.forEach(function (h, k) { if (h) rec[h] = normalize_(h, row[k]); });
      return { rowIndex: i + 2, rec: rec, heads: heads };
    }
  }
  return null;
}

function appendRow_(name, rec) {
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sh = sheet_(name);
    var heads = headers_(sh);
    var row = heads.map(function (h) { return rec[h] === undefined ? '' : rec[h]; });
    sh.appendRow(row);
    // tarih/saat sütunlarını Sheets'in sayıya çevirmesini engelle
    var r = sh.getLastRow();
    heads.forEach(function (h, i) { if (DATE_COLS[h]) sh.getRange(r, i + 1).setNumberFormat('@'); });
  } finally { lock.releaseLock(); }
}

function updateRow_(name, id, patch) {
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var found = findRow_(name, id);
    if (!found) throw new Error('Kayıt bulunamadı: ' + id);
    var rec = found.rec;
    Object.keys(patch).forEach(function (k) { if (patch[k] !== undefined) rec[k] = patch[k]; });
    var row = found.heads.map(function (h) { return rec[h] === undefined ? '' : rec[h]; });
    var range = sheet_(name).getRange(found.rowIndex, 1, 1, found.heads.length);
    found.heads.forEach(function (h, i) { if (DATE_COLS[h]) range.getCell(1, i + 1).setNumberFormat('@'); });
    range.setValues([row]);
    return rec;
  } finally { lock.releaseLock(); }
}

function deleteRow_(name, id) {
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var found = findRow_(name, id);
    if (found) sheet_(name).deleteRow(found.rowIndex);
  } finally { lock.releaseLock(); }
}

// ---------------------------------------------------------------------------
// Küçük yardımcılar
// ---------------------------------------------------------------------------
function pick_(obj, keys, exclude) {
  var out = {};
  keys.forEach(function (k) {
    if (exclude && exclude.indexOf(k) >= 0) return;
    if (obj[k] !== undefined) out[k] = obj[k];
  });
  return out;
}
function requireFields_(p, fields) {
  fields.forEach(function (f) {
    if (p[f] === undefined || p[f] === null || p[f] === '') throw new Error('Eksik alan: ' + f);
  });
}
function nowIso_() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
function newId_(prefix) {
  return prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}
function slugId_(parent, name) {
  var s = String(name).toLowerCase()
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/â/g, 'a')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return String(parent).toLowerCase() + '-' + s;
}
function stripDataUrl_(s) { return String(s).replace(/^data:[^;]+;base64,/, ''); }
function trashFile_(id) { try { if (id) DriveApp.getFileById(id).setTrashed(true); } catch (e) {} }
