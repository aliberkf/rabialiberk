"""Build src/data/catalog.js: countries (ISO2 → tr/en name, centroid) and TR provinces.
Centroids come from each SVG path's bounding box, inverse-projected (Mercator)."""
import re, json, math, sys

ROOT = '.'

TR_NAMES = {
 'AD':'Andorra','AE':'Birleşik Arap Emirlikleri','AF':'Afganistan','AG':'Antigua ve Barbuda','AI':'Anguilla','AL':'Arnavutluk','AM':'Ermenistan','AO':'Angola','AQ':'Antarktika','AR':'Arjantin','AS':'Amerikan Samoası','AT':'Avusturya','AU':'Avustralya','AW':'Aruba','AX':'Åland Adaları','AZ':'Azerbaycan','BA':'Bosna-Hersek','BB':'Barbados','BD':'Bangladeş','BE':'Belçika','BF':'Burkina Faso','BG':'Bulgaristan','BH':'Bahreyn','BI':'Burundi','BJ':'Benin','BL':'Saint-Barthélemy','BN':'Brunei','BO':'Bolivya','BM':'Bermuda','BQ':'Karayip Hollandası','BR':'Brezilya','BS':'Bahamalar','BT':'Butan','BV':'Bouvet Adası','BW':'Botsvana','BY':'Belarus','BZ':'Belize','CA':'Kanada','CC':'Cocos Adaları','CD':'Kongo Demokratik Cumhuriyeti','CF':'Orta Afrika Cumhuriyeti','CG':'Kongo Cumhuriyeti','CH':'İsviçre','CI':'Fildişi Sahili','CK':'Cook Adaları','CL':'Şili','CM':'Kamerun','CN':'Çin','CO':'Kolombiya','CR':'Kosta Rika','CU':'Küba','CV':'Yeşil Burun Adaları','CW':'Curaçao','CX':'Christmas Adası','CY':'Kıbrıs','CZ':'Çekya','DE':'Almanya','DJ':'Cibuti','DK':'Danimarka','DM':'Dominika','DO':'Dominik Cumhuriyeti','DZ':'Cezayir','EC':'Ekvador','EE':'Estonya','EG':'Mısır','EH':'Batı Sahra','ER':'Eritre','ES':'İspanya','ET':'Etiyopya','FI':'Finlandiya','FJ':'Fiji','FK':'Falkland Adaları','FM':'Mikronezya','FO':'Faroe Adaları','FR':'Fransa','GA':'Gabon','GB':'Birleşik Krallık','GD':'Grenada','GE':'Gürcistan','GF':'Fransız Guyanası','GG':'Guernsey','GH':'Gana','GI':'Cebelitarık','GL':'Grönland','GM':'Gambiya','GN':'Gine','GO':'Glorioso Adaları','GP':'Guadeloupe','GQ':'Ekvator Ginesi','GR':'Yunanistan','GS':'Güney Georgia','GT':'Guatemala','GU':'Guam','GW':'Gine-Bissau','GY':'Guyana','HK':'Hong Kong','HM':'Heard ve McDonald Adaları','HN':'Honduras','HR':'Hırvatistan','HT':'Haiti','HU':'Macaristan','ID':'Endonezya','IE':'İrlanda','IL':'İsrail','IM':'Man Adası','IN':'Hindistan','IO':'Britanya Hint Okyanusu Toprakları','IQ':'Irak','IR':'İran','IS':'İzlanda','IT':'İtalya','JE':'Jersey','JM':'Jamaika','JO':'Ürdün','JP':'Japonya','JU':'Juan de Nova Adası','KE':'Kenya','KG':'Kırgızistan','KH':'Kamboçya','KI':'Kiribati','KM':'Komorlar','KN':'Saint Kitts ve Nevis','KP':'Kuzey Kore','KR':'Güney Kore','XK':'Kosova','KW':'Kuveyt','KY':'Cayman Adaları','KZ':'Kazakistan','LA':'Laos','LB':'Lübnan','LC':'Saint Lucia','LI':'Lihtenştayn','LK':'Sri Lanka','LR':'Liberya','LS':'Lesotho','LT':'Litvanya','LU':'Lüksemburg','LV':'Letonya','LY':'Libya','MA':'Fas','MC':'Monako','MD':'Moldova','ME':'Karadağ','MF':'Saint-Martin','MG':'Madagaskar','MH':'Marshall Adaları','MK':'Kuzey Makedonya','ML':'Mali','MM':'Myanmar','MN':'Moğolistan','MO':'Makao','MP':'Kuzey Mariana Adaları','MQ':'Martinik','MR':'Moritanya','MS':'Montserrat','MT':'Malta','MU':'Mauritius','MV':'Maldivler','MW':'Malavi','MX':'Meksika','MY':'Malezya','MZ':'Mozambik','NA':'Namibya','NC':'Yeni Kaledonya','NE':'Nijer','NF':'Norfolk Adası','NG':'Nijerya','NI':'Nikaragua','NL':'Hollanda','NO':'Norveç','NP':'Nepal','NR':'Nauru','NU':'Niue','NZ':'Yeni Zelanda','OM':'Umman','PA':'Panama','PE':'Peru','PF':'Fransız Polinezyası','PG':'Papua Yeni Gine','PH':'Filipinler','PK':'Pakistan','PL':'Polonya','PM':'Saint-Pierre ve Miquelon','PN':'Pitcairn Adaları','PR':'Porto Riko','PS':'Filistin','PT':'Portekiz','PW':'Palau','PY':'Paraguay','QA':'Katar','RE':'Réunion','RO':'Romanya','RS':'Sırbistan','RU':'Rusya','RW':'Ruanda','SA':'Suudi Arabistan','SB':'Solomon Adaları','SC':'Seyşeller','SD':'Sudan','SE':'İsveç','SG':'Singapur','SH':'Saint Helena','SI':'Slovenya','SJ':'Svalbard ve Jan Mayen','SK':'Slovakya','SL':'Sierra Leone','SM':'San Marino','SN':'Senegal','SO':'Somali','SR':'Surinam','SS':'Güney Sudan','ST':'São Tomé ve Príncipe','SV':'El Salvador','SX':'Sint Maarten','SY':'Suriye','SZ':'Esvatini','TC':'Turks ve Caicos Adaları','TD':'Çad','TF':'Fransız Güney Toprakları','TG':'Togo','TH':'Tayland','TJ':'Tacikistan','TK':'Tokelau','TL':'Doğu Timor','TM':'Türkmenistan','TN':'Tunus','TO':'Tonga','TR':'Türkiye','TT':'Trinidad ve Tobago','TV':'Tuvalu','TW':'Tayvan','TZ':'Tanzanya','UA':'Ukrayna','UG':'Uganda','UM-DQ':'Jarvis Adası','UM-FQ':'Baker Adası','UM-HQ':'Howland Adası','UM-JQ':'Johnston Atolü','UM-MQ':'Midway Adaları','UM-WQ':'Wake Adası','US':'Amerika Birleşik Devletleri','UY':'Uruguay','UZ':'Özbekistan','VA':'Vatikan','VC':'Saint Vincent ve Grenadinler','VE':'Venezuela','VG':'Britanya Virjin Adaları','VI':'ABD Virjin Adaları','VN':'Vietnam','VU':'Vanuatu','WF':'Wallis ve Futuna','WS':'Samoa','YE':'Yemen','YT':'Mayotte','ZA':'Güney Afrika','ZM':'Zambiya','ZW':'Zimbabve',
}

# Province plate codes → names (official spelling)
PROVINCES = {
 1:'Adana',2:'Adıyaman',3:'Afyonkarahisar',4:'Ağrı',5:'Amasya',6:'Ankara',7:'Antalya',8:'Artvin',9:'Aydın',10:'Balıkesir',
 11:'Bilecik',12:'Bingöl',13:'Bitlis',14:'Bolu',15:'Burdur',16:'Bursa',17:'Çanakkale',18:'Çankırı',19:'Çorum',20:'Denizli',
 21:'Diyarbakır',22:'Edirne',23:'Elazığ',24:'Erzincan',25:'Erzurum',26:'Eskişehir',27:'Gaziantep',28:'Giresun',29:'Gümüşhane',30:'Hakkâri',
 31:'Hatay',32:'Isparta',33:'Mersin',34:'İstanbul',35:'İzmir',36:'Kars',37:'Kastamonu',38:'Kayseri',39:'Kırklareli',40:'Kırşehir',
 41:'Kocaeli',42:'Konya',43:'Kütahya',44:'Malatya',45:'Manisa',46:'Kahramanmaraş',47:'Mardin',48:'Muğla',49:'Muş',50:'Nevşehir',
 51:'Niğde',52:'Ordu',53:'Rize',54:'Sakarya',55:'Samsun',56:'Siirt',57:'Sinop',58:'Sivas',59:'Tekirdağ',60:'Tokat',
 61:'Trabzon',62:'Tunceli',63:'Şanlıurfa',64:'Uşak',65:'Van',66:'Yozgat',67:'Zonguldak',68:'Aksaray',69:'Bayburt',70:'Karaman',
 71:'Kırıkkale',72:'Batman',73:'Şırnak',74:'Bartın',75:'Ardahan',76:'Iğdır',77:'Yalova',78:'Karabük',79:'Kilis',80:'Osmaniye',81:'Düzce',
}

def merc(lat):
    return math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))

def load(svg_path, override=None):
    txt = open(svg_path, encoding='utf-8').read()
    head = re.search(r'<svg[^>]*>', txt).group(0)
    g = lambda k: float(re.search(k + r'="([-\d.]+)"', head).group(1))
    left, top, right, bottom = override or (g('data-left'), g('data-top'), g('data-right'), g('data-bottom'))
    vb = [float(v) for v in re.search(r'viewBox="([^"]*)"', head).group(1).split()]
    W, H = vb[2], vb[3]
    def inv(x, y):
        lng = left + (x / W) * (right - left)
        my = merc(top) - (y / H) * (merc(top) - merc(bottom))
        lat = math.degrees(2 * math.atan(math.exp(my)) - math.pi / 2)
        return round(lat, 3), round(lng, 3)
    out = {}
    for m in re.finditer(r'<path id="([^"]*)"(?: title="([^"]*)")? d="([^"]*)"', txt):
        pid, title, d = m.group(1), m.group(2), m.group(3)
        x = y = 0.0; xs = []; ys = []
        for mm in re.finditer(r'([MLl])(-?[\d.]+),(-?[\d.]+)', d):
            c, a, b = mm.group(1), float(mm.group(2)), float(mm.group(3))
            if c == 'l': x += a; y += b
            else: x, y = a, b
            xs.append(x); ys.append(y)
        # use the bbox centre of the largest sub-path (avoids far-flung islands skewing e.g. FR/US)
        subs = re.split(r'(?=M)', d)
        best = None
        for s in subs:
            if not s.startswith('M'): continue
            sx = sy = 0.0; bx = []; by = []
            for mm in re.finditer(r'([MLl])(-?[\d.]+),(-?[\d.]+)', s):
                c, a, b = mm.group(1), float(mm.group(2)), float(mm.group(3))
                if c == 'l': sx += a; sy += b
                else: sx, sy = a, b
                bx.append(sx); by.append(sy)
            if not bx: continue
            area = (max(bx) - min(bx)) * (max(by) - min(by))
            if best is None or area > best[0]:
                best = (area, (min(bx) + max(bx)) / 2, (min(by) + max(by)) / 2)
        cx, cy = best[1], best[2]
        out[pid] = {'title': title, 'center': inv(cx, cy)}
    return out, (left, top, right, bottom, W, H)

# amcharts' declared bottomLatitude excludes Antarctica; calibrated against known territories (<1px residual)
WORLD_BOUNDS = (-169.453, 83.641, 190.606, -85.263)
world, wmeta = load(f'{ROOT}/assets/maps/world.svg', WORLD_BOUNDS)
tr, tmeta = load(f'{ROOT}/assets/maps/turkiye.svg')

missing = [k for k in world if k not in TR_NAMES]
assert not missing, missing

countries = []
for code, info in sorted(world.items(), key=lambda kv: TR_NAMES[kv[0]]):
    countries.append({'id': code, 'name': TR_NAMES[code], 'en': info['title'], 'lat': info['center'][0], 'lng': info['center'][1]})

provinces = []
for code, info in tr.items():
    n = int(code.split('-')[1])
    provinces.append({'id': code, 'name': PROVINCES[n], 'plate': n, 'lat': info['center'][0], 'lng': info['center'][1]})
provinces.sort(key=lambda p: p['plate'])
assert len(provinces) == 81

# sanity: İstanbul & İzmir centres
print({p['name']: (p['lat'], p['lng']) for p in provinces if p['plate'] in (34, 35, 6, 31)})
print({c['id']: (c['lat'], c['lng']) for c in countries if c['id'] in ('ES', 'BA', 'TR', 'FR', 'US')})

js = ('// Otomatik üretildi: tools/build_catalog.py — elle düzenleme.\n'
      '// Ülke merkezleri SVG yollarının ana parçasının kutu merkezidir (pin konumu için yeterli).\n'
      'export const COUNTRIES = ' + json.dumps(countries, ensure_ascii=False, separators=(',', ':')) + ';\n'
      'export const PROVINCES = ' + json.dumps(provinces, ensure_ascii=False, separators=(',', ':')) + ';\n'
      'export const MAP_META = {\n'
      f'  world: {{ left: {wmeta[0]}, top: {wmeta[1]}, right: {wmeta[2]}, bottom: {wmeta[3]}, width: {wmeta[4]}, height: {wmeta[5]} }},\n'
      f'  turkiye: {{ left: {tmeta[0]}, top: {tmeta[1]}, right: {tmeta[2]}, bottom: {tmeta[3]}, width: {tmeta[4]}, height: {tmeta[5]} }},\n'
      '};\n')
import os
os.makedirs(f'{ROOT}/src/data', exist_ok=True)
open(f'{ROOT}/src/data/catalog.js', 'w', encoding='utf-8').write(js)
print('wrote catalog.js', len(countries), 'countries')
