# Kurulum Rehberi

Site üç parçadan oluşur; her biri kendi hesabında, hiçbiri için ödeme yok:

| Parça | Nerede | Ne yapar |
|---|---|---|
| **Arayüz** (bu repo) | GitHub → GitHub Pages | HTML/JS dosyalarını sunar. `git push` = yayın. |
| **Veri + fotoğraf** | Senin Google hesabın: bir Google Sheets + Apps Script + Drive klasörü | Biletler, yazılar ve fotoğraflar. |
| **Alan adı** | Squarespace | `rabialiberk.com` → GitHub Pages'e yönlendirme (yalnızca DNS kaydı). |

Toplam süre: ~40 dakika. Sırayla git; her adımın sonunda ne görmen gerektiği yazıyor.

---

## 1. Google Sheets — veri dosyası ✅ (yapıldı)

Drive'ındaki **"Data"** tablosu hazır: `README`, `tickets` (59 satır), `places` (6), `entries` (8), `photos` (boş).
İstersen adını **Rabialiberk Veri** yap ve **Paylaş** ile Rabia'ya **Düzenleyen** yetkisi ver (tablodan elle düzeltme yapmak isterse; site için şart değil).

> Sayfa adlarını ve sütun başlıklarını değiştirme. Satırları elle düzenlemek, silmek, eklemek serbest — site her açılışta ham veriyi okuyup hesaplar.
> Bu tablo **gerçek veridir** ve repoya girmez; repodaki `data/seed.json` yalnızca uydurma demo verisidir.

## 2. Google Cloud — "Google ile giriş" kimliği ✅ (yapıldı)

İstemci kimliği `src/config.js`'e yazıldı. Aşağısı yalnızca ileride yeniden kurman gerekirse.

Site, şifre yerine Google hesabınızla giriş yaptırır. Bunun için Google'dan ücretsiz bir "istemci kimliği" alınır.

1. [console.cloud.google.com](https://console.cloud.google.com) → üstteki proje seçiciden **Yeni Proje** → ad: `rabialiberk` → Oluştur. Projeyi seç.
2. Sol menü **API'ler ve Hizmetler → OAuth izin ekranı** (yeni arayüzde "Google Auth Platform → Branding"):
   - Uygulama adı: `Rabialiberk Seyahat Günlükleri`
   - Kullanıcı türü: **Harici (External)**
   - Destek e-postası ve geliştirici e-postası: kendi adresin
   - Kaydet. Kapsam (scope) eklemene gerek yok; hassas yetki istemiyoruz.
   - **Hedef kitle / Audience** bölümünde uygulamayı **Üretim (In production)** durumuna al ("Publish app"). Yalnızca e-posta/profil istendiği için doğrulama gerektirmez.
3. **Kimlik bilgileri (Credentials) → + Kimlik bilgisi oluştur → OAuth istemci kimliği**
   - Uygulama türü: **Web uygulaması**
   - Ad: `rabialiberk-web`
   - **Yetkili JavaScript kaynakları**: şunları tek tek ekle
     - `https://rabialiberk.com`
     - `https://www.rabialiberk.com`
     - `https://KULLANICIADIN.github.io` (GitHub Pages'in geçici adresi; kullanıcı adını yaz)
     - `http://localhost:8080` (bilgisayarında denemek için)
   - Yönlendirme URI'si gerekmez. **Oluştur**.
4. Çıkan **İstemci Kimliği**'ni kopyala (`....apps.googleusercontent.com` ile biter). İki yerde kullanacağız.

## 3. Apps Script — sunucu tarafı

1. 1. adımdaki Google Sheets'i aç → **Uzantılar → Apps Script**.
2. Açılan editörde `Kod.gs` içindekileri sil; bu repodaki `apps-script/Code.gs` dosyasının tamamını yapıştır.
3. Soldaki **Proje Ayarları (dişli)** → **"appsscript.json" manifest dosyasını düzenleyicide göster** işaretle.
   Editöre dön, `appsscript.json` sekmesini aç ve içeriğini bu repodaki `apps-script/appsscript.json` ile değiştir.
4. Yine **Proje Ayarları → Komut Dosyası Özellikleri (Script Properties) → Özellik ekle**:

   | Özellik | Değer |
   |---|---|
   | `CLIENT_ID` | 2. adımdaki istemci kimliği |
   | `ALLOWED` | `{"ali@gmail.com":"abf","rabia@gmail.com":"rkf"}` — kendi Google adreslerinizi yaz, küçük harfle. `abf` = Ali Berk, `rkf` = Rabia. |
   | `DECK_PASSWORD` | (isteğe bağlı) Güverte parolası. Yazarsan Google girişine **ek olarak** bu parola da istenir; cihaz başına bir kez girilir. Değiştirince herkes yeniden girer. 8 yanlış denemede 15 dk kilit. |

   **Erişimi tamamen sen yönetirsin:** `ALLOWED`'dan bir e-postayı silmek o kişinin erişimini anında keser; `DECK_PASSWORD`'ü değiştirmek herkesi yeniden parola girmeye zorlar. Şifre sıfırlama, hesap açma gibi şeyler yok — Google hesabı + senin listen.

   Kaydet.
5. Editörde üstteki fonksiyon listesinden **`setup`** seç → **Çalıştır**. İlk seferde yetki ister:
   "İzinleri incele" → hesabını seç → "Gelişmiş → (güvenli olmayan) sayfaya git" → İzin ver.
   (Uyarı, uygulamayı Google'a doğrulatmadığımız için çıkar; script senin, Drive'ın senin.)
   Yürütme günlüğünde `Kurulum tamam. Fotoğraf klasörü: ...` görmelisin. Drive'ında **Rabialiberk Fotoğraflar** klasörü oluştu.
6. **Dağıt → Yeni dağıtım** → dişli → **Web uygulaması**:
   - Açıklama: `v2`
   - Şu kimlikle yürüt: **Ben**
   - Erişimi olanlar: **Herkes** (kimlik denetimini kodun kendisi yapıyor; URL'yi bilen biri bile giriş yapmadan veri alamaz)
   - **Dağıt** → çıkan **Web uygulaması URL'si**'ni kopyala (`https://script.google.com/macros/s/.../exec`).

> Kodu ileride güncellersen: **Dağıt → Dağıtımları yönet → kalem → Sürüm: Yeni sürüm → Dağıt**. URL değişmez.

## 4. Siteyi ayarla

Repoda `src/config.js` dosyasını aç; `clientId` zaten yazılı, `apiUrl` alanına 3. adımdaki web uygulaması adresini yaz:

```js
apiUrl: 'https://script.google.com/macros/s/.../exec',
```

İsteğe bağlı: `geocoder.email` alanına e-postanı yaz (yer ararken OpenStreetMap'in nezaket kuralı).

Değişikliği commit'leyip push'la (aşağıda).

## 5. GitHub Pages — yayın

1. Repo GitHub'da (`KULLANICIADIN/rabialiberk`). **Settings → Pages**:
   - Source: **Deploy from a branch**
   - Branch: **main**, klasör: **/ (root)** → Save.
   - Bir dakika içinde `https://KULLANICIADIN.github.io/rabialiberk/` adresinde site açılır (Google girişi çalışmaz çünkü bu adres 2. adımdaki kaynaklar listesinde yok — sorun değil, asıl adres alan adı).
2. Aynı sayfada **Custom domain**: `rabialiberk.com` yaz → Save. (Repoda `CNAME` dosyası zaten var; GitHub bunu doğrular.)
3. DNS ayarı bitince (6. adım) **Enforce HTTPS** kutusunu işaretle.

## 6. Squarespace — alan adını yönlendir

Alan adı Squarespace'te kalır; yalnızca "bu adres nereye gitsin" kaydı değişir.

1. Squarespace → **Domains → rabialiberk.com → DNS Settings** (ya da "Advanced DNS").
2. Squarespace'in kendi sitesine giden mevcut **A** ve **CNAME** kayıtlarını (`@` ve `www` için) sil. Netlify'a giden kayıtlar da varsa onları da sil.
3. Şu kayıtları ekle:

   | Tür | Host | Değer |
   |---|---|---|
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | CNAME | `www` | `KULLANICIADIN.github.io` |

4. 10 dk – birkaç saat içinde `https://rabialiberk.com` GitHub Pages'ten açılır. GitHub Pages ayarında "DNS check successful" görünce **Enforce HTTPS**'i işaretle.
5. Netlify'daki eski siteyi silebilirsin (Site settings → Delete site). Netlify Identity'deki kullanıcıların artık bir önemi yok.

## Gizlilik notları

- **Arama motorları:** `robots.txt` (Disallow: /) + her sayfada `noindex, nofollow`. Veri zaten giriş olmadan okunamaz; Google'ın görebileceği tek şey giriş ekranı.
- **Repo herkese açık** (GitHub Pages ücretsiz planda şart). İçinde gizli bir şey yok: istemci kimliği zaten herkese açık bir değerdir, Apps Script adresi kimlik doğrulamadan veri vermez, gerçek veri (`private/`, `*.xlsx`) repoya girmez. Yalnızca piksel avatar/sprite görselleri repoda durur — eski sitede de herkese açık sunuluyorlardı. İstemezsen GitHub Pro ile repo özel yapılabilir.
- **Fotoğraflar** Drive'da yalnızca senin erişebildiğin klasörde; siteye giriş yapmış kaptanlara Apps Script üzerinden servis edilir, dışarıdan link yok.
- **client_secret** dosyası bu kurulumda kullanılmaz; indirdiysen sil, Cloud Console'dan "Reset secret" yapabilirsin.

## 7. İlk giriş

`https://rabialiberk.com` → **Google ile giriş yap** → `ALLOWED` listesindeki hesaplardan biriyle gir. Güverte açılır, Türkiye haritası boyanmış gelir.

Bir şey ters giderse:

| Belirti | Sebep / çözüm |
|---|---|
| Giriş butonu çıkmıyor | `src/config.js` içinde `clientId` boş → site demo moda düşer. Doldur, push'la. |
| "Bu hesabın güverteye erişimi yok" | `ALLOWED` içinde o e-posta yok ya da büyük harfle yazılmış. |
| "Bu uygulama için verilmemiş kimlik" | Apps Script'teki `CLIENT_ID` ile `config.js`'teki `clientId` farklı. |
| Giriş penceresi "origin not allowed" diyor | 2. adımdaki Yetkili JavaScript kaynaklarına tam adresi (https ile) ekle. |
| "Sunucu kurulumu eksik" | Script Properties'te `CLIENT_ID`/`ALLOWED` yok. |
| Sürekli "Güverte parolası" soruyor | `DECK_PASSWORD` ile yazdığın farklı; ya da tarayıcı localStorage'ı temizleniyor. |
| Veri geliyor ama fotoğraf yüklenmiyor | `setup` çalıştırılmamış (klasör yok) ya da Drive yetkisi verilmemiş. `setup`'ı tekrar çalıştır. |
| Haritada şehir boyanmıyor | Biletteki `to_place` kimliği katalogla uyuşmuyor; Biletler sayfasında o bileti düzenle. |

---

## Günlük kullanım

- **Sefer eklemek:** Güverte → "Sefer ekle" ya da Biletler → "Yeni sefer". "Kim" alanında **Birlikte** seçersen tek bilet ikinize de işlenir. "Kaydet + dönüş ekle" dönüş biletini yönleri çevrilmiş olarak hazırlar.
- **Gelecek tarihli bilet:** Rahatça gir. Tarihi gelene kadar hesaba katılmaz; Zaman ve Biletler'de **PLANLI** rozetiyle, Güverte'de "Yaklaşan seferler"de görünür. Tarih gelince kendiliğinden işlenir.
- **Aynı gün birden çok bilet:** Sorun değil. Sıra tarih → saat → giriş sırasına göre kurulur; aradaki şehirde 0 gün kalınmış sayılır ama yer yine de "gidildi" diye boyanır. Sıra önemliyse **Saat** alanını doldur.
- **Hikâyenin başı:** Her kişi için bir tane `start` (Başlangıç noktası) bileti vardır (17 Mayıs 2025). Gün sayımı oradan başlar; silme.
- **Yeni yer:** Herhangi bir yer alanında "Yeni yer ekle" → adı yaz → "Haritada bul" koordinatı ve bağlı olduğu ili/ülkeyi doldurur. Yurt dışı şehirler **Şehir**, il/şehir içindeki yerler **Nokta** türündedir. Noktalar haritada iğne olur ve günleri bağlı oldukları ile/ülkeye de sayılır.
- **Fotoğraf:** Bir yazının altındaki "Fotoğraf ekle" ya da Yer sayfasındaki buton. Tarayıcı fotoğrafı 1600 px'e küçültür, Drive'daki özel klasöre yazar. Fotoğraflar yalnızca giriş yapmış kaptanlara gösterilir.
- **Tutarsızlık uyarısı (Biletler sayfası):** Kişinin "nereden" yeri, bir önceki biletine göre bulunduğu yerle uyuşmuyorsa listelenir — genelde arada girilmemiş bir bilet vardır.
- **Elle düzeltme:** Google Sheets'te satırları doğrudan düzenleyebilirsin; siteyi yenilemek yeterli.

## Kodu değiştirmek

Derleme adımı yok; dosyalar tarayıcıda olduğu gibi çalışır.

```bash
git clone https://github.com/KULLANICIADIN/rabialiberk.git
cd rabialiberk
python3 -m http.server 8080      # http://localhost:8080  (giriş için 2. adımdaki localhost kaynağı gerekir)
# ya da örnek veriyle, giriş olmadan:  http://localhost:8080/?demo
```

Değişiklik yapınca:

```bash
git add -A
git commit -m "Ne değişti"
git push
```

Bir dakika içinde yayında. Yanlış bir şey olursa `git log` ile eski sürüme dönmek bir komut.

## Yedek

Veri Google Sheets'te, fotoğraflar Drive'da — ikisi de Google One yedeğinin içinde. Yine de arada **Dosya → İndir → Excel** ile tabloyu indirip repoya `data/` altına koymak iyi alışkanlık.

## Ek: dizi.rabialiberk.com (Dizi Takip)

- Arayüz: ayrı repo `aliberkf/dizi` (GitHub Pages, `dizi.rabialiberk.com`). Ana siteden link verilmez, arama motorlarına kapalı.
- Arka uç: bu repodaki `apps-script/Dizi.gs`. Apps Script editöründe `Kod.gs` dosyasının sonuna eklenmiş durumda (tek dosya). Güncellerken `Code.gs` + `Dizi.gs` içeriğini birlikte yapıştır, sonra **Dağıt → Dağıtımları yönet → Yeni sürüm**.
- Kurulum bir kez yapıldı (`setupDizi`): Drive'da "Dizi Takip" tablosu, Google Takvim'de "📺 Dizi Takvimi", 6 saatte bir güncelleme tetikleyicisi.
- Erişim: Script Properties → `DIZI_ALLOWED` = `["abf"]` (yalnızca Ali Berk). Rabia'yı eklemek için `["abf","rkf"]`.
- DNS: Squarespace'te `CNAME dizi → aliberkf.github.io`. Google OAuth yetkili kaynaklarında `https://dizi.rabialiberk.com` var.

## Ek: gitar.rabialiberk.com (Akor Defteri)

- Arayüz: ayrı repo `aliberkf/gitar` (GitHub Pages, `gitar.rabialiberk.com`). Arka uç: `apps-script/Akor.gs` (Kod.gs'in sonuna eklenmiş halde).
- Kurulum (`setupAkor`): Drive'da "Akor Defteri" tablosu, sekme `Sarkilar`. Erişim: `AKOR_ALLOWED` = `["abf"]`.
- Linkten içe aktarma: Ultimate Guitar (sayfadaki js-store verisi) , akorlar.com ve repertuarim.com gibi `<pre>` kullanan siteler. Site Apps Script'i engellerse (403) arayüz "Yapıştır"ı önerir.
- Ton, kapo ve kaydırma hızı değiştiği anda otomatik kaydedilir.
