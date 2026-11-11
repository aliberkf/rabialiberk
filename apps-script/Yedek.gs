/**
 * 🗄 YEDEK modülü — haftalık otomatik veri yedeği
 * ---------------------------------------------------------------------------
 * Kod GitHub'da duruyor; burada yedeklenen şey VERİ: üç tablo
 * (Data, Dizi Takip, Akor Defteri). Her hafta Rabialiberk/Backup içinde
 * tarihli bir klasör açılır ve tablolar .xlsx olarak oraya yazılır.
 * .xlsx seçildi çünkü: Google'dan bağımsız açılabilir ve Sheet kopyalamanın
 * aksine bağlı Apps Script projesini çoğaltmaz.
 *
 * Son KEEP haftanın yedeği tutulur, eskiler çöp kutusuna gider (30 gün
 * orada kalır). Fotoğraflar kopyalanmaz: Drive alanını ikiye katlar,
 * yanlışlıkla silinen fotoğraf zaten 30 gün çöp kutusunda durur.
 *
 * Kurulum: editörden bir kez setupYedek() çalıştır (ilk yedeği de alır).
 */
function setupYedek() { return Yedek.setup(); }
function yedekAl() { return Yedek.run(); }

var Yedek = (function () {
  const P_FOLDER = 'BACKUP_FOLDER_ID';
  const KEEP = 8;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function folder_() {
    const p = PropertiesService.getScriptProperties();
    const id = p.getProperty(P_FOLDER);
    if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
    // Data tablosunun bulunduğu klasörde "Backup" ara, yoksa oluştur
    const parent = DriveApp.getFileById(getSpreadsheet_().getId()).getParents().next();
    const it = parent.getFoldersByName('Backup');
    const f = it.hasNext() ? it.next() : parent.createFolder('Backup');
    p.setProperty(P_FOLDER, f.getId());
    return f;
  }

  function sources_() {
    const p = PropertiesService.getScriptProperties();
    return [getSpreadsheet_().getId(), p.getProperty('DIZI_SS_ID'), p.getProperty('AKOR_SS_ID')]
      .filter(Boolean);
  }

  function exportXlsx_(id) {
    const url = 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx';
    const res = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) throw new Error('Dışa aktarma başarısız (' + res.getResponseCode() + '): ' + id);
    return res.getBlob().setName(DriveApp.getFileById(id).getName() + '.xlsx');
  }

  function run() {
    const root = folder_();
    const day = Utilities.formatDate(new Date(), 'Europe/Istanbul', 'yyyy-MM-dd');
    // Aynı gün tekrar çalışırsa o günün klasörünü yenile
    const same = root.getFoldersByName(day);
    while (same.hasNext()) same.next().setTrashed(true);
    const dayFolder = root.createFolder(day);
    const names = sources_().map(function (id) { return dayFolder.createFile(exportXlsx_(id)).getName(); });

    // Eski haftaları temizle (yalnızca tarih adlı klasörler)
    const all = [];
    const it = root.getFolders();
    while (it.hasNext()) { const f = it.next(); if (DATE_RE.test(f.getName())) all.push(f); }
    all.sort(function (a, b) { return a.getName() < b.getName() ? 1 : -1; });
    all.slice(KEEP).forEach(function (f) { f.setTrashed(true); });

    Logger.log('Yedek tamam → Backup/' + day + ': ' + names.join(', '));
    return { day: day, files: names };
  }

  function setup() {
    ScriptApp.getProjectTriggers()
      .filter(function (t) { return t.getHandlerFunction() === 'yedekAl'; })
      .forEach(function (t) { ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('yedekAl').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(4).create();
    folder_();
    Logger.log('Haftalık yedek kuruldu: her pazartesi 04:00, son ' + KEEP + ' hafta saklanır.');
    return run();
  }

  return { setup: setup, run: run };
})();
