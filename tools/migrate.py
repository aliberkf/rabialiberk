"""Migrate the old workbook (abf_Biletler / rkf_Biletler / SeyirDefteri) into the new schema.
Outputs: data/seed.json (demo mode) and data/rabialiberk-veri.xlsx (import into Google Sheets)."""
import sys, json, datetime as dt, re, unicodedata
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

SRC = sys.argv[1]
ROOT = '.'
sys.path.insert(0, './tools')

wb = openpyxl.load_workbook(SRC, data_only=True)

# ---- place name → catalog id -------------------------------------------------
import importlib.util
spec = importlib.util.spec_from_file_location('bc', './tools/build_catalog.py')
# reuse the name tables without re-running the builder's main body: parse the JS instead
cat = open(f'{ROOT}/src/data/catalog.js', encoding='utf-8').read()
COUNTRIES = json.loads(re.search(r'COUNTRIES = (\[.*?\]);', cat, re.S).group(1))
PROVINCES = json.loads(re.search(r'PROVINCES = (\[.*?\]);', cat, re.S).group(1))
by_en = {c['en']: c['id'] for c in COUNTRIES}
by_tr = {c['name']: c['id'] for c in COUNTRIES}
by_prov = {p['name']: p['id'] for p in PROVINCES}
by_prov.update({'Hakkari': 'TR-30', 'Afyon': 'TR-03', 'Içel': 'TR-33', 'Urfa': 'TR-63', 'Maraş': 'TR-46', 'Antep': 'TR-27'})

def place_id(name):
    name = name.strip()
    if name in by_prov: return by_prov[name]
    if name in by_en: return by_en[name]
    if name in by_tr: return by_tr[name]
    raise KeyError(name)

MODE = {'havayolu': 'plane', 'karayolu': 'road', 'demiryolu': 'train', 'denizyolu': 'ship'}

def iso(d):
    if isinstance(d, dt.datetime): return d.date().isoformat()
    if isinstance(d, dt.date): return d.isoformat()
    return str(d)

# ---- tickets -----------------------------------------------------------------
raw = []
for sheet, owner in (('abf_Biletler', 'abf'), ('rkf_Biletler', 'rkf')):
    ws = wb[sheet]
    for i, r in enumerate(ws.iter_rows(min_row=2, values_only=True)):
        if not r[0]: continue
        frm, to, typ, date = r[0], r[1], r[2], r[3]
        raw.append({'owner': owner, 'from': place_id(frm), 'to': place_id(to), 'mode': MODE[typ], 'date': iso(date), 'order': i})

# merge identical trips taken by both → owner 'both'
merged = {}
for t in raw:
    key = (t['from'], t['to'], t['mode'], t['date'])
    if key in merged:
        merged[key]['owner'] = 'both'
    else:
        merged[key] = dict(t)
tickets = sorted(merged.values(), key=lambda t: (t['date'], t['order']))

# the first row of each sheet was an anchor ("İstanbul→İstanbul", "İzmir→İzmir" on 17 May 2025)
for t in tickets:
    if t['from'] == t['to'] and t['date'] == '2025-05-17':
        t['mode'] = 'start'

out_tickets = []
for n, t in enumerate(tickets, 1):
    out_tickets.append({
        'id': f'T{n:04d}', 'owner': t['owner'], 'from_place': t['from'], 'to_place': t['to'],
        'date': t['date'], 'time': '', 'mode': t['mode'], 'carrier': '', 'note': '',
        'created_at': '2026-11-09T00:00:00Z', 'created_by': 'migration',
    })

# ---- places (custom ones referenced by the diary) ----------------------------
places = [
    {'id': 'es-madrid', 'name': 'Madrid', 'kind': 'city', 'parent_id': 'ES', 'lat': 40.4168, 'lng': -3.7038, 'note': ''},
    {'id': 'tr-35-urla', 'name': 'Urla', 'kind': 'spot', 'parent_id': 'TR-35', 'lat': 38.3225, 'lng': 26.7647, 'note': ''},
    {'id': 'tr-34-heybeliada', 'name': 'Heybeliada', 'kind': 'spot', 'parent_id': 'TR-34', 'lat': 40.8767, 'lng': 29.0942, 'note': ''},
    {'id': 'tr-31-arsuz', 'name': 'Arsuz', 'kind': 'spot', 'parent_id': 'TR-31', 'lat': 36.4128, 'lng': 35.8867, 'note': ''},
    {'id': 'tr-34-ortakoy', 'name': 'Ortaköy', 'kind': 'spot', 'parent_id': 'TR-34', 'lat': 41.0475, 'lng': 29.0268, 'note': ''},
    {'id': 'tr-34-uskudar', 'name': 'Üsküdar', 'kind': 'spot', 'parent_id': 'TR-34', 'lat': 41.0256, 'lng': 29.0150, 'note': 'Evimiz'},
]
for p in places:
    p['created_at'] = '2026-11-09T00:00:00Z'

# ---- diary entries -----------------------------------------------------------
CITY_MAP = {
    'İspanya, Madrid': 'es-madrid', 'İzmir, Urla': 'tr-35-urla', 'İstanbul, Heybeliada': 'tr-34-heybeliada',
    'Hatay, Arsuz': 'tr-31-arsuz', 'Gaziantep': 'TR-27', 'Ankara': 'TR-06', 'İstanbul, Ortaköy': 'tr-34-ortakoy',
    'Üsküdar evimizin yatakodasi': 'tr-34-uskudar',
}
AUTHOR = {'Ali Berk': 'abf', 'Rabia': 'rkf'}
entries = []
ws = wb['SeyirDefteri']
for n, r in enumerate(ws.iter_rows(min_row=2, values_only=True), 1):
    if not r[0]: continue
    date, city, user, note = r
    title = 'Evimizin yatak odası' if city == 'Üsküdar evimizin yatakodasi' else ''
    entries.append({
        'id': f'E{n:04d}', 'date': iso(date), 'place_id': CITY_MAP[city], 'author': AUTHOR[user],
        'title': title, 'body': note.strip(), 'created_at': '2026-11-09T00:00:00Z', 'updated_at': '',
    })

seed = {'places': places, 'tickets': out_tickets, 'entries': entries, 'photos': []}
import os
os.makedirs(f'{ROOT}/data', exist_ok=True)
json.dump(seed, open(f'{ROOT}/data/seed.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ---- Excel for Google Sheets import ------------------------------------------
COLS = {
    'tickets': ['id', 'owner', 'from_place', 'to_place', 'date', 'time', 'mode', 'carrier', 'note', 'created_at', 'created_by'],
    'places': ['id', 'name', 'kind', 'parent_id', 'lat', 'lng', 'note', 'created_at'],
    'entries': ['id', 'date', 'place_id', 'author', 'title', 'body', 'created_at', 'updated_at'],
    'photos': ['id', 'thumb_id', 'entry_id', 'place_id', 'caption', 'taken_at', 'width', 'height', 'uploaded_by', 'created_at'],
}
README = [
    ['Rabialiberk Seyahat Günlükleri — veri dosyası'],
    [''],
    ['Bu dosya sadece HAM VERİ tutar. Gün hesapları, harita boyama ve istatistikler sitede koddan hesaplanır; formül yoktur.'],
    ['Sayfa adlarını ve sütun başlıklarını DEĞİŞTİRME; site bunlara göre okur. Satırları elle düzenlemek serbest.'],
    [''],
    ['tickets', 'Biletler / seferler. owner: abf (Ali Berk) | rkf (Rabia) | both (birlikte). mode: plane | road | train | ship | start.'],
    ['', 'from_place / to_place: yer kimliği. TR illeri "TR-34" gibi plaka kodu; ülkeler ISO kodu ("ES", "BA"); kendi eklediğiniz yerler places sayfasındaki id.'],
    ['', 'date: YYYY-AA-GG. time: SS:DD (isteğe bağlı; aynı gün birden çok sefer varsa sıralama için).'],
    ['', 'mode=start: hikâyenin başlangıç noktası (o tarihte kişi oradaydı). Her kişi için bir tane yeter.'],
    ['places', 'Katalogda olmayan yerler: yurt dışı şehirler (kind=city, parent_id=ülke kodu) ve noktalar (kind=spot, parent_id=il kodu veya şehir id).'],
    ['', 'lat/lng: ondalık derece. Site, yer eklerken bunları arama ile otomatik doldurur.'],
    ['entries', 'Seyir defteri yazıları. author: abf | rkf. place_id: yer kimliği. body: yazı (satır sonları korunur).'],
    ['photos', 'Site tarafından yönetilir. id ve thumb_id Drive dosya kimlikleridir; elle doldurmayın.'],
]

xwb = openpyxl.Workbook()
ws0 = xwb.active; ws0.title = 'README'
for row in README: ws0.append(row)
ws0['A1'].font = Font(bold=True, size=13)
ws0.column_dimensions['A'].width = 14; ws0.column_dimensions['B'].width = 120
head_fill = PatternFill('solid', fgColor='1F2A44'); head_font = Font(bold=True, color='F4D03F')
for name, cols in COLS.items():
    ws = xwb.create_sheet(name)
    ws.append(cols)
    for c in ws[1]:
        c.fill = head_fill; c.font = head_font; c.alignment = Alignment(horizontal='center')
    for rec in seed[name]:
        ws.append([rec.get(c, '') for c in cols])
    for i, c in enumerate(cols, 1):
        w = {'body': 80, 'note': 30, 'title': 28, 'name': 22, 'created_at': 22, 'id': 18, 'parent_id': 12}.get(c, 13)
        ws.column_dimensions[get_column_letter(i)].width = w
        if c in ('date', 'time', 'taken_at', 'created_at', 'updated_at'):
            for cell in ws[get_column_letter(i)][1:]:
                cell.number_format = '@'
    if name == 'entries':
        for cell in ws['F'][1:]: cell.alignment = Alignment(wrap_text=True, vertical='top')
    ws.freeze_panes = 'A2'
xwb.save(f'{ROOT}/data/rabialiberk-veri.xlsx')

print('tickets', len(out_tickets), 'both:', sum(t['owner'] == 'both' for t in out_tickets),
      'abf:', sum(t['owner'] == 'abf' for t in out_tickets), 'rkf:', sum(t['owner'] == 'rkf' for t in out_tickets))
print('entries', len(entries), 'places', len(places))
