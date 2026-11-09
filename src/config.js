// ---------------------------------------------------------------------------
// Site ayarları — kurulumda yalnızca bu dosyayı düzenlemen yeterli (docs/KURULUM.md)
// ---------------------------------------------------------------------------
export const CONFIG = {
  // Google Cloud → OAuth istemci kimliği (Apps Script'teki CLIENT_ID ile birebir aynı olmalı)
  clientId: '947980331108-14cnedb8imc8kitosimt7rp1pbrh0nov.apps.googleusercontent.com',
  // Apps Script web uygulaması adresi (…/exec ile biter)
  apiUrl: '',

  // Hikâyenin başlangıcı — "birlikte geçen zaman" sayacı buradan sayar
  togetherSince: '2025-07-10T20:15:00',

  // Kaptanlar. Kodlar (abf / rkf) veri dosyasındaki owner/author alanlarıyla eşleşir.
  people: {
    abf: { name: 'Ali Berk', short: 'Ali', color: '#c0392b', soft: '#e74c3c',
      avatar: 'assets/img/avatar_aliberk.webp', sprite: 'assets/img/aliberk_body_front.webp', side: 'assets/img/aliberk_body_side.webp' },
    rkf: { name: 'Rabia', short: 'Rabia', color: '#2471a3', soft: '#3498db',
      avatar: 'assets/img/avatar_rabia.webp', sprite: 'assets/img/rabia_body_front.webp', side: 'assets/img/rabia_body_side.webp' },
  },
  bothColor: '#8e44ad',
  bothSoft: '#9b59b6',

  // Fotoğraf boyutları (tarayıcıda küçültülür, Drive'a öyle gider)
  photo: { webMax: 1600, thumbMax: 360, quality: 0.86 },

  // Yer arama (OpenStreetMap Nominatim). Kendi e-postanı yazmak nezaket kuralı gereği.
  geocoder: { endpoint: 'https://nominatim.openstreetmap.org/search', email: '' },
};

// Demo modu: clientId yoksa ya da adreste ?demo varsa örnek veriyle (data/seed.json) çalışır,
// değişiklikler yalnızca bu tarayıcıda (localStorage) kalır.
export const DEMO = !CONFIG.clientId || !CONFIG.apiUrl || new URLSearchParams(location.search).has('demo');
