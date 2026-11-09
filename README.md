# Rabialiberk Seyahat Günlükleri

İki kaptanın biletlerini kaydettiği, haritanın bilet bilet boyandığı, seyir defterine yazıp fotoğraf eklediği özel bir site. Piksel ruhu korunarak sıfırdan yazıldı.

- **Arayüz:** derlemesiz vanilla JS (ES modülleri), GitHub Pages'te yayınlanır
- **Veri:** Google Sheets (yalnızca ham veri; hesaplar tarayıcıda)
- **Fotoğraf:** Google Drive'da özel klasör
- **Giriş:** Google ile giriş, Apps Script tarafında e-posta beyaz listesi
- **Harita:** amCharts kaynaklı SVG'ler (Türkiye illeri, dünya ülkeleri) yerel ve sadeleştirilmiş; kendi pan/zoom motoru

Kurulum ve günlük kullanım: **[docs/KURULUM.md](docs/KURULUM.md)**

## Klasörler

```
index.html            giriş noktası
src/
  config.js           ← kurulumda doldurulan tek dosya (clientId, apiUrl)
  main.js             oturum kapısı, yönlendirici, kabuk
  api.js              Apps Script istemcisi + demo modu (localStorage)
  auth.js             Google ile giriş
  store.js            durum, yükleme, yazma işlemleri
  engine.js           konaklama/gün hesabı, toplamlar, istatistik, tutarlılık
  photos.js           küçültme, yükleme, önbellekli çekme
  map/mapview.js      SVG harita, projeksiyon, pinler, pan/zoom
  ui/                 DOM yardımcıları ve paylaşılan bileşenler (formlar, kartlar)
  pages/              güverte, harita, zaman, biletler, defter, istatistik, yer
  data/catalog.js     81 il + 257 ülke (ad, kod, merkez) — otomatik üretilir
styles/app.css
assets/img            sprite'lar, avatarlar, arkaplan (webp)
assets/maps           turkiye.svg, world.svg
apps-script/          Code.gs + appsscript.json (Google Sheets'e bağlı script)
data/                 seed.json (demo), rabialiberk-veri.xlsx (Sheets'e yüklenecek)
tools/                harita sadeleştirme, katalog üretimi, eski veriden göç betikleri
docs/KURULUM.md
```

## Veri modeli

| Sayfa | Alanlar |
|---|---|
| `tickets` | id, owner (`abf`/`rkf`/`both`), from_place, to_place, date, time, mode (`plane`/`road`/`train`/`ship`/`start`), carrier, note |
| `places` | id, name, kind (`city`/`spot`), parent_id, lat, lng, note — iller ve ülkeler katalogda, burada yalnızca eklenen yerler |
| `entries` | id, date, place_id, author, title, body |
| `photos` | id (Drive), thumb_id (Drive), entry_id, place_id, caption, taken_at, width, height |

**Gün kuralı:** kişi, biletin varış yerinde bir sonraki biletine kadar kalır (son bilet → bugüne kadar). Noktada geçen günler bağlı olduğu ile ve ülkeye de sayılır. "Aynı anda" = iki kişinin aynı yerde kesişen günleri.

## Yerel çalıştırma

```bash
python3 -m http.server 8080
# http://localhost:8080/?demo   → örnek veriyle, giriş gerektirmez
```
