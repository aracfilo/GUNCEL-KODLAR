// ===========================================================================
// İBB HALK SÜT - FİLO YÖNETİM SİSTEMİ
// SİSTEM VERSİYONU: 2.0.0
// MODÜL: Backend (Sunucu Tarafı)
// SON GÜNCELLEME: Mayıs 2026
// ===========================================================================
// MİMARİ NOTLAR:
// - Dinamik Sütun Zırhı: Veriler header isimlerine göre yazılır (sabit indeks YOK)
// - Çift Kasa: Veri önce "Saha Bildirimleri" havuzuna, sonra alt sayfaya yazılır
// - LockService: Eşzamanlı yazımlarda race condition önlenir
// - CacheService: Ayarlar 1 dakika önbellekte (saha gerçeği için kısa)
// - Sunucu Validasyonu: Plaka, kullanıcı, kategori boş gelirse reddedilir
// ===========================================================================

// =======================================================================
// GENEL KONFİGÜRASYON (Tek noktadan yönetim)
// =======================================================================
const CONFIG = {
  VERSION: "2.0.0",
  
  // ⚠️ ESKI — Mevcut foto yükleme akışı için (geriye dönük uyumluluk)
  DRIVE_KLASOR_ID: "13DiR5za-i-LWckDes6DRnetJNLtPcZZa",
  
  // === YENİ DRIVE YAPISI (AŞAMA F) ===
  DRIVE: {
    ANA_KASA:           "1zCqTd085RPXw9Ltg9leffpytKExUYjiN",
    SISTEM_SABLONLARI:  "14hdUQHLGH91lk-JGZgTjccATvhdpDYR0",
    SAHA_BILDIRIMLERI:  "13DiR5za-i-LWckDes6DRnetJNLtPcZZa",
    PERIYODIK_KONTROL:  "1Y6cSQ0jy1VdLgyc6tKhIP9ciA6FfAqVR",
    ZIMMET_SICIL:       "1ccfPiCzYyaHJ91n-tusBGbH5nL5XyTcX",
    EVRAK_KUTUPHANE:    "1lJTLzanczmgB__ZYk3GOXoFijP0uPbn9"
  },
  
  // Sheet sayfa isimleri (anayasaya göre)
  SHEET: {
    AYARLAR: "Ayarlar",
    KULLANICILAR: "Kullanıcılar",
    SAHA_BILDIRIMLERI: "Saha Bildirimleri",
    GUNLUK_SAHA: "Günlük Saha",
    ARAC_LISTESI: "Araç Listesi",
    ARAC_GUNLUK_BILGILER: "Araç Günlük Bilgiler",
    ARAC_GENEL: "ARAÇLAR - GENEL BİLGİLER",
    ZIMMET: "Zimmet İşlemleri",
    GECICI: "Geçici Kullanım",
    GIYDIRME: "Giydirme",
    KAZA: "Kaza/Hasar",
    SERVIS: "Servis Kayıt",
    ENVANTER: "Envanter",
    PERIYODIK: "Periyodik Kontrol",
    KM: "Km Bilgisi",
    SISTEM_LOGU: "SistemLogu",
    DASHBOARD_VERISI: "Dashboard_Verisi",
    ONAY_GECMISI: "Onay Geçmişi"
  },
  
  // Dış E-Tablo Bilgileri (Trigger ile veri çekilir)
  DIS_ETABLO_ID: "1v-tGJLEYxvNThGTH3cjFEwInlwzNw8qMkmOFbq0BH1E",
  EKIP_KOTA_SAYFASI: "EKİP SORUMLULARI EKİP KOTA TAKİP",
  
  // Araç Günlük Bilgiler sütun başlıkları (sabit sıra)
  ARAC_GUNLUK_BASLIKLAR: [
    "Plaka",
    "Tanımlı Şoför",
    "Tanımlı Bölge",
    "Tanımlı Ekip Sorumlusu",
    "Zimmet Belgesi Linki",
    "Güncel Şoför",
    "Güncel Bölge",
    "Güncel Ekip Sorumlusu",
    "İdp",
    "Araç Çalışma Durumu"
  ],
  
  // Cache süresi (saniye) - Anayasa: 1 dakika
  CACHE_SURE: 60,
  
  // Lock bekleme süresi (ms)
  LOCK_BEKLEME: 30000,
  
  // Maksimum dosya sayıları
  MAX_FOTO: 10,
  MAX_VIDEO: 1
};

// "Saha Bildirimleri" sayfasının başlıkları (32 sütun - Anayasaya uygun)
const SAHA_BILDIRIMLERI_BASLIKLAR = [
  "1. İşlem Zamanı",
  "2. Bildiren Kullanıcı",
  "3. Araç Plakası",
  "4. İşlem Kategorisi",
  "5. Zimmet İşlem Türü",
  "6. Zimmet Uygunluk Durumu",
  "7. Zimmet Devri Yönetici Kodu",
  "8. Geçici / Aracı Kimden Aldı?",
  "9. Yeni Hasar veya Eksik Beyanı",
  "10. Fotoğraf 1",
  "11. Fotoğraf 2",
  "12. Fotoğraf 3",
  "13. Fotoğraf 4",
  "14. Fotoğraf 5",
  "15. Araç Videosu",
  "16. Eksik Envanter Kalemleri",
  "17. Temizlik Durumu (İç/Dış)",
  "18. Kaza Tarihi ve Saati",
  "19. Kaza Zimmet Durumu",
  "20. Olay Türü (Ciddi/Hafif)",
  "21. Tutanak Tutuldu Mu?",
  "22. Tutanak Tutulmama Nedeni",
  "23. Servise Kim Götürüyor",
  "24. Servis İşlem Tipi",
  "25. Servise Gidiş Şekli / Aciliyet",
  "26. Bırakılan Servis Adı",
  "27. Servis İşlem Yönü (Bırakma/Alma)",
  "28. Araç İçi Evrak Durumu (Form/Ruhsat)",
  "29. Giydirme / Reklam Durumu",
  "30. Güncel KM / Servis Çıkış KM",
  "31. Yönetici Onay Durumu",
  "32. Onaylayan Yönetici",
  "33. Red Gerekçesi"
];

// =======================================================================
// 0. WEB UYGULAMASI GİRİŞ NOKTASI
// =======================================================================
function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate()
      .setTitle('İBB Halk Süt - Filo Yönetim Sistemi')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * HTML dosyalarını birleştirir. <?!= include('dosyaAdi') ?> ile çağrılır.
 * Modülerleştirme için anayasa madde 12 uyumlu.
 */
function include(dosyaAdi) {
  return HtmlService.createHtmlOutputFromFile(dosyaAdi).getContent();
}

// =======================================================================
// YARDIMCI FONKSİYONLAR
// =======================================================================

/**
 * Header isimlerinden dinamik index map oluşturur.
 * Sütun sırası değişse bile sistem çalışır.
 */
/**
 * ANAYASA 11. MADDE: Türkçe karakter ve harf duyarsız metin normalleştirme.
 * Tüm metin karşılaştırmalarında bu fonksiyon kullanılır.
 * "araç koordİnasyon" = "ARAÇ KOORDINASYON" = "Araç Koordinasyon" → hepsi aynı
 */
function metinNormallestir(metin) {
  if (metin === null || metin === undefined) return "";
  return metin.toString()
    .toLocaleUpperCase("tr-TR")
    .replace(/I/g, "İ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * İki metni anayasa 11. maddeye göre karşılaştırır.
 */
function metinAyniMi(a, b) {
  return metinNormallestir(a) === metinNormallestir(b);
}

/**
 * Bir metnin başka bir metni içerip içermediğini kontrol eder (anayasa 11).
 */
function metinIceriyorMu(buyukMetin, aranan) {
  return metinNormallestir(buyukMetin).indexOf(metinNormallestir(aranan)) > -1;
}

/**
 * Metin normalizer — sistem genelinde tolerans için.
 * Boşluk, büyük/küçük harf, Türkçe karakter farkları görmezden gelinir.
 * 
 * "Ehliyet  Bitiş Tarihi " → "ehliyetbitistarihi"
 * "MAYIS 2026"             → "mayis2026"
 * "egzoz emisyon bitiş"    → "egzozemisyonbitis"
 */
function metinNormalize(s) {
  if (s === null || s === undefined) return "";
  return s.toString()
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ç/g, "c")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o")
    .replace(/\s+/g, "")
    .trim();
}

/**
 * Esnek içerme kontrolü — biri diğerini içeriyor mu?
 * Boşluk, harf farkları görmezden gelinir.
 * 
 * metinIceriyorMu("MAYIS 2026", "Mayıs") → true
 * metinIceriyorMu("Egzoz Bitiş", "egzoz") → true
 */
function metinIceriyorMu(metin, aranan) {
  return metinNormalize(metin).indexOf(metinNormalize(aranan)) !== -1;
}

function getHeaderMap(sheet) {
  if (!sheet || sheet.getLastRow() === 0) return {};
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    if (h) {
      const orjinal = h.toString().trim();
      map[orjinal] = i;                          // Orijinal hali
      map[orjinal.toUpperCase()] = i;            // Büyük harf
      map[orjinal.toLocaleUpperCase("tr-TR")] = i; // Türkçe büyük harf (İ, I, Ş, Ç vb.)
    }
  });
  
  // Aranan başlıklar için akıllı eşleşme proxy'si
  return new Proxy(map, {
    get: function(target, name) {
      if (typeof name !== "string") return target[name];
      // 1. Birebir eşleşme
      if (target[name] !== undefined) return target[name];
      // 2. Büyük harf eşleşmesi
      const buyuk = name.toLocaleUpperCase("tr-TR");
      if (target[buyuk] !== undefined) return target[buyuk];
      // 3. Boşluk ve harf duyarsız tarama
      const aranan = name.toString().trim().toLocaleUpperCase("tr-TR").replace(/\s+/g, " ");
      for (const key in target) {
        if (key.toString().trim().toLocaleUpperCase("tr-TR").replace(/\s+/g, " ") === aranan) {
          return target[key];
        }
      }
      return undefined;
    }
  });
}

/**
 * Sayfanın başlıkları yoksa otomatik kurar.
 */
function sheetBaslikKur(sheet, baslikDizisi) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, baslikDizisi.length).setValues([baslikDizisi]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, baslikDizisi.length)
      .setFontWeight("bold")
      .setBackground("#1e3a8a")
      .setFontColor("#ffffff");
  }
}

/**
 * Sistem hatalarını ve önemli işlemleri loglar.
 */
function logYaz(seviye, kaynak, mesaj) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET.SISTEM_LOGU);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET.SISTEM_LOGU);
      sheetBaslikKur(sheet, ["Zaman", "Seviye", "Kaynak", "Mesaj"]);
    }
    sheet.appendRow([new Date(), seviye, kaynak, mesaj]);
  } catch (e) {
    // Log yazma başarısız olursa sessizce devam (sonsuz döngü olmasın)
  }
}

/**
 * İstanbul saati ile tarih döndürür.
 */
function istanbulZamani() {
  return Utilities.formatDate(new Date(), "Europe/Istanbul", "yyyy-MM-dd HH:mm:ss");
}

// =======================================================================
// 1. AYARLAR ÇEKME (Cache'li)
// =======================================================================

/**
 * Ayarlar sayfasını okur, kategorilere göre gruplar.
 * Cache: 1 dakika (saha gerçeği için kısa)
 */
function getAyarlar() {
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = "ayarlar_v" + CONFIG.VERSION;
    const cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET.AYARLAR);
    const ayarlarObj = {};
    if (!sheet) {
      logYaz("HATA", "getAyarlar", "Ayarlar sayfası bulunamadı");
      return ayarlarObj;
    }
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return ayarlarObj;
    
    const headers = data[0].map(h => h ? h.toString().toLowerCase().trim() : "");
    let plakaIdx = -1, altBaslikIdx = -1, bolumIdx = -1, detayIdx = -1;
    
    for (let c = 0; c < headers.length; c++) {
      const h = headers[c];
      if (plakaIdx === -1 && (h === "araç plakası" || h === "arac plakasi" || h.indexOf("plaka") !== -1)) plakaIdx = c;
      if (altBaslikIdx === -1 && (h === "alt başlık" || h === "alt baslik")) altBaslikIdx = c;
      if (bolumIdx === -1 && (h === "alt başlık bölümleri" || h === "alt baslik bolumleri")) bolumIdx = c;
      if (detayIdx === -1 && (h === "alt başlık detayı" || h === "alt baslik detayi")) detayIdx = c;
    }
    
    for (let r = 1; r < data.length; r++) {
      if (plakaIdx !== -1) {
        const plaka = data[r][plakaIdx] ? data[r][plakaIdx].toString().trim() : "";
        if (plaka !== "") {
          if (!ayarlarObj["Araç Plakası"]) ayarlarObj["Araç Plakası"] = [];
          if (ayarlarObj["Araç Plakası"].indexOf(plaka) === -1) {
            ayarlarObj["Araç Plakası"].push(plaka);
          }
        }
      }
      
      if (altBaslikIdx !== -1 && bolumIdx !== -1) {
        const kategori = data[r][altBaslikIdx] ? data[r][altBaslikIdx].toString().trim() : "";
        const secenek = data[r][bolumIdx] ? data[r][bolumIdx].toString().trim() : "";
        const detay = (detayIdx !== -1 && data[r][detayIdx]) ? data[r][detayIdx].toString().trim() : "";
        const tamSecenek = (detay.indexOf("http") === 0) ? (secenek + "|" + detay) : secenek;
        if (kategori !== "" && secenek !== "") {
          if (!ayarlarObj[kategori]) ayarlarObj[kategori] = [];
          if (ayarlarObj[kategori].indexOf(tamSecenek) === -1) {
            ayarlarObj[kategori].push(tamSecenek);
          }
        }
      }
    }
    
    cache.put(cacheKey, JSON.stringify(ayarlarObj), CONFIG.CACHE_SURE);
    return ayarlarObj;
    
  } catch (e) {
    logYaz("HATA", "getAyarlar", e.message);
    return {};
  }
}

/**
 * Cache'i manuel temizler (Yönetim Merkezi'nden çağrılır).
 */
function ayarlarCacheTemizle() {
  try {
    const cache = CacheService.getScriptCache();
    cache.remove("ayarlar_v" + CONFIG.VERSION);
    logYaz("BİLGİ", "ayarlarCacheTemizle", "Cache temizlendi");
    return { basarili: true, mesaj: "Ayarlar yenilendi" };
  } catch (e) {
    logYaz("HATA", "ayarlarCacheTemizle", e.message);
    return { basarili: false, mesaj: e.message };
  }
}

// =======================================================================
// 2. ARAÇ KÜNYESİ (Sticky panel için veri)
// =======================================================================

/**
 * Plaka için araç künye bilgilerini toplar.
 * - Araç Listesi: Zimmetli Kişi
 * - Günlük Saha: Tanımlı/Güncel Şoför, Bölge, Ekip Sorumlusu
 */
function getAracKunyesi(plaka) {
  try {
    if (!plaka || plaka.toString().trim() === "") {
      return { hata: "Plaka boş" };
    }
    
    const aramaPlaka = plaka.toString().trim().toUpperCase();
    
    // === HIZ OPTİMİZASYONU 1: CACHE KONTROLÜ ===
    // Aynı plakaya 5 dakika içinde tekrar sorulursa cache'den dön
    const cache = CacheService.getScriptCache();
    const cacheKey = "kunye_" + aramaPlaka;
    const cached = cache.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        // Cache bozuksa devam et
      }
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const kunye = {
      plaka: plaka,
      zimmetliKisi: "",
      tanimliSofor: "",
      tanimliBolge: "",
      tanimliEkipSorumlusu: "",
      guncelSofor: "",
      guncelBolge: "",
      guncelEkipSorumlusu: "",
      idp: "",
      aracCalismaDurumu: "",
      zimmetLinki: "",
      bolgeUyusmazligi: false
    };
    
    const sheet = ss.getSheetByName(CONFIG.SHEET.ARAC_GUNLUK_BILGILER);
    if (!sheet) {
      logYaz("UYARI", "getAracKunyesi", "Araç Günlük Bilgiler sayfası bulunamadı");
      return kunye;
    }
    
    const sonSatir = sheet.getLastRow();
    if (sonSatir < 2) return kunye;
    
    const headerMap = getHeaderMap(sheet);
    const plakaColIdx = headerMap["Plaka"];
    if (plakaColIdx === undefined) return kunye;
    
    // === HIZ OPTİMİZASYONU 2: SADECE PLAKA SÜTUNUNU OKU ===
    // Önce sadece plaka sütununu çek, eşleşmeyi bul
    const plakalar = sheet.getRange(2, plakaColIdx + 1, sonSatir - 1, 1).getValues();
    let bulunanSatirNo = -1;
    for (let i = 0; i < plakalar.length; i++) {
      const p = (plakalar[i][0] || "").toString().trim().toUpperCase();
      if (p === aramaPlaka) {
        bulunanSatirNo = i + 2; // +1 başlık +1 1-indexli
        break;
      }
    }
    
    if (bulunanSatirNo === -1) {
      // Plaka bulunamadı - boş künye dön, cache'leme
      return kunye;
    }
    
    // === HIZ OPTİMİZASYONU 3: SADECE BULUNAN SATIRI OKU ===
    const sutunSayisi = sheet.getLastColumn();
    const satir = sheet.getRange(bulunanSatirNo, 1, 1, sutunSayisi).getValues()[0];
    
    kunye.tanimliSofor = satir[headerMap["Tanımlı Şoför"]] || "";
    kunye.tanimliBolge = satir[headerMap["Tanımlı Bölge"]] || "";
    kunye.tanimliEkipSorumlusu = satir[headerMap["Tanımlı Ekip Sorumlusu"]] || "";
    kunye.zimmetLinki = satir[headerMap["Zimmet Belgesi Linki"]] || "";
    kunye.guncelSofor = satir[headerMap["Güncel Şoför"]] || "";
    kunye.guncelBolge = satir[headerMap["Güncel Bölge"]] || "";
    kunye.guncelEkipSorumlusu = satir[headerMap["Güncel Ekip Sorumlusu"]] || "";
    kunye.idp = satir[headerMap["İdp"]] || "";
    kunye.aracCalismaDurumu = satir[headerMap["Araç Çalışma Durumu"]] || "";
    kunye.zimmetliKisi = kunye.tanimliSofor;
    
    // Bölge uyuşmazlığı kontrolü
    if (kunye.tanimliBolge && kunye.guncelBolge && 
        kunye.tanimliBolge.toString().trim() !== kunye.guncelBolge.toString().trim()) {
      kunye.bolgeUyusmazligi = true;
    }
    
    // === CACHE'E YAZ — 5 dakika ===
    try {
      cache.put(cacheKey, JSON.stringify(kunye), 300);
    } catch (e) {
      // Cache yazılamazsa sorun değil
    }
    
    return kunye;
    
  } catch (e) {
    logYaz("HATA", "getAracKunyesi", e.message);
    return { hata: e.message };
  }
}

// =======================================================================
// TRIGGER: Günlük Veri Yükleme (Dış e-tablodan otomatik kopyalama)
// =======================================================================

/**
 * Her gün 10:30'da otomatik çalışır (trigger ile).
 * Dış e-tablodaki "EKİP SORUMLULARI EKİP KOTA TAKİP" + bugünün günlük sayfasını okur,
 * "Araç Günlük Bilgiler" sayfasına yazar.
 * "Zimmet Belgesi Linki" sütununa DOKUNMAZ (manuel doldurulan alan).
 */
function gunlukVeriYukle() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(CONFIG.LOCK_BEKLEME)) {
    logYaz("UYARI", "gunlukVeriYukle", "Lock alınamadı, başka bir trigger çalışıyor olabilir");
    return;
  }
  
  try {
    logYaz("BILGI", "gunlukVeriYukle", "Trigger başladı");
    
    // === MİMARİ B: 3 DENEME MANTIĞI ===
    // Dış e-tabloya erişim her zaman güvenilir değil; 3 kez dene
    let disEtablo = null;
    let denemeNo = 0;
    const MAX_DENEME = 3;
    let sonHata = null;
    
    while (denemeNo < MAX_DENEME && !disEtablo) {
      try {
        denemeNo++;
        disEtablo = SpreadsheetApp.openById(CONFIG.DIS_ETABLO_ID);
      } catch (e) {
        sonHata = e;
        logYaz("UYARI", "gunlukVeriYukle", "Deneme " + denemeNo + " başarısız: " + e.message);
        if (denemeNo < MAX_DENEME) {
          Utilities.sleep(30000); // 30 saniye bekle
        }
      }
    }
    
    if (!disEtablo) {
      throw new Error("Dış e-tabloya 3 denemede erişilemedi: " + (sonHata ? sonHata.message : ""));
    }
    
    // Ekip Kota Takip sayfasını oku (Tanımlı bilgiler)
    const ekipKotaSayfa = disEtablo.getSheetByName(CONFIG.EKIP_KOTA_SAYFASI);
    if (!ekipKotaSayfa) {
      throw new Error("Dış e-tabloda '" + CONFIG.EKIP_KOTA_SAYFASI + "' sayfası bulunamadı");
    }
    const tanimliSonuc = disSayfadanOku(ekipKotaSayfa, {
      "ARAÇ PLAKASI": "plaka",
      "ŞOFÖR AD & SOYAD": "sofor",
      "ÇALIŞMA BÖLGESİ": "bolge",
      "EKİP SORUMLUSU": "ekipSorumlusu"
    });
    logYaz("BILGI", "gunlukVeriYukle", "Ekip Kota'dan " + tanimliSonuc.sirali.length + " plaka okundu");
    
    // Bugünün günlük sayfasını oku (Güncel bilgiler)
    const bugunSayfaAdiStr = bugunSayfaAdi();
    const gunlukSayfa = disEtablodaSayfaBul(disEtablo, bugunSayfaAdiStr);
    let guncelSonuc = { sirali: [], harita: {} };
    if (gunlukSayfa) {
      guncelSonuc = disSayfadanOku(gunlukSayfa, {
        "ARAÇ PLAKASI": "plaka",
        "ŞOFÖR AD & SOYAD": "sofor",
        "ÇALIŞMA BÖLGESİ": "bolge",
        "EKİP SORUMLUSU": "ekipSorumlusu",
        "DESTEK PERSONELİ AD & SOYAD": "idp",
        "ARAÇ ÇALIŞMA DURUMU": "durum"
      });
      logYaz("BILGI", "gunlukVeriYukle", "Günlük sayfa '" + bugunSayfaAdiStr + "' okundu, " + guncelSonuc.sirali.length + " plaka");
    } else {
      logYaz("UYARI", "gunlukVeriYukle", "Bugünün günlük sayfası bulunamadı: " + bugunSayfaAdiStr);
    }
    
    // === MİMARİ C: VERİ SÜREKLİLİĞİ GÜVENCESİ ===
    // Eğer hiç plaka okunamadıysa, eski veriyi koru (sayfayı boşaltma)
    if (tanimliSonuc.sirali.length === 0 && guncelSonuc.sirali.length === 0) {
      logYaz("UYARI", "gunlukVeriYukle", 
        "Her iki kaynak da boş döndü - eski veri korundu, sayfa değişmedi");
      return;
    }
    
    // Hedef sayfayı hazırla (yoksa oluştur)
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let hedef = ss.getSheetByName(CONFIG.SHEET.ARAC_GUNLUK_BILGILER);
    if (!hedef) {
      hedef = ss.insertSheet(CONFIG.SHEET.ARAC_GUNLUK_BILGILER);
      hedef.appendRow(CONFIG.ARAC_GUNLUK_BASLIKLAR);
      hedef.getRange(1, 1, 1, CONFIG.ARAC_GUNLUK_BASLIKLAR.length).setFontWeight("bold");
      logYaz("BILGI", "gunlukVeriYukle", "Araç Günlük Bilgiler sayfası oluşturuldu");
    }
    
    // Mevcut "Araç Günlük Bilgiler"i oku - Zimmet Belgesi Linki için
    const hedefMap = getHeaderMap(hedef);
    const mevcutData = hedef.getDataRange().getValues();
    const mevcutZimmetLinkleri = {};
    
    if (hedefMap["Plaka"] !== undefined && hedefMap["Zimmet Belgesi Linki"] !== undefined) {
      for (let r = 1; r < mevcutData.length; r++) {
        const p = (mevcutData[r][hedefMap["Plaka"]] || "").toString().trim().toUpperCase();
        if (p) {
          mevcutZimmetLinkleri[p] = mevcutData[r][hedefMap["Zimmet Belgesi Linki"]] || "";
        }
      }
    }
    
    // Sıralama: Ekip Kota Takip'teki orijinal sırayı koru
    const sirali = [];
    const eklendi = {};
    
    tanimliSonuc.sirali.forEach(function(plaka) {
      sirali.push(plaka);
      eklendi[plaka] = true;
    });
    
    guncelSonuc.sirali.forEach(function(plaka) {
      if (!eklendi[plaka]) {
        sirali.push(plaka);
        eklendi[plaka] = true;
      }
    });
    
    // Yeni satırları hazırla
    const yeniSatirlar = [];
    sirali.forEach(function(plaka) {
      const tanimli = tanimliSonuc.harita[plaka] || {};
      const guncel = guncelSonuc.harita[plaka] || {};
      const zimmetLink = mevcutZimmetLinkleri[plaka] || "";
      
      yeniSatirlar.push([
        plaka, tanimli.sofor || "", tanimli.bolge || "",
        tanimli.ekipSorumlusu || "", zimmetLink,
        guncel.sofor || "", guncel.bolge || "",
        guncel.ekipSorumlusu || "", guncel.idp || "", guncel.durum || ""
      ]);
    });
    
    // Eski verileri temizle ve yenisini yaz (sadece yeni veri varsa)
    if (yeniSatirlar.length > 0) {
      const sonSatir = hedef.getLastRow();
      if (sonSatir > 1) {
        hedef.getRange(2, 1, sonSatir - 1, CONFIG.ARAC_GUNLUK_BASLIKLAR.length).clearContent();
      }
      hedef.getRange(2, 1, yeniSatirlar.length, CONFIG.ARAC_GUNLUK_BASLIKLAR.length).setValues(yeniSatirlar);
      
      // Renk kodlaması
      aracGunlukBilgilerRenklendir(hedef, yeniSatirlar);
    }
    
    logYaz("BASARI", "gunlukVeriYukle", yeniSatirlar.length + " araç bilgisi güncellendi");
    
  } catch (e) {
    logYaz("HATA", "gunlukVeriYukle", e.message + " | " + e.stack);
    throw e;
  } finally {
    lock.releaseLock();
  }
}

// =======================================================================
// TRIGGER KURULUMU — Manuel Çalıştırılır
// =======================================================================
/**
 * Apps Script Editor'de manuel çalıştırılır.
 * Mevcut "gunlukVeriYukle" trigger'larını siler, 3 yeni trigger kurar:
 *   - Her gün 08:00
 *   - Her gün 10:30  
 *   - Her gün 13:00
 */
function triggerKur() {
  // 1. Mevcut "gunlukVeriYukle" trigger'larını sil
  const triggers = ScriptApp.getProjectTriggers();
  let silinen = 0;
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === "gunlukVeriYukle") {
      ScriptApp.deleteTrigger(t);
      silinen++;
    }
  });
  
  // 2. 3 yeni trigger kur: 08:00, 10:30, 13:00
  ScriptApp.newTrigger("gunlukVeriYukle")
    .timeBased().everyDays(1).atHour(8).nearMinute(0).create();
  
  ScriptApp.newTrigger("gunlukVeriYukle")
    .timeBased().everyDays(1).atHour(10).nearMinute(30).create();
  
  ScriptApp.newTrigger("gunlukVeriYukle")
    .timeBased().everyDays(1).atHour(13).nearMinute(0).create();
  
  const mesaj = silinen + " eski trigger silindi, 3 yeni trigger kuruldu (08:00, 10:30, 13:00)";
  logYaz("BASARI", "triggerKur", mesaj);
  
  return mesaj;
}

/**
 * Manuel trigger silme (acil durumda kullanılır).
 */
function triggerSil() {
  const triggers = ScriptApp.getProjectTriggers();
  let silinen = 0;
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === "gunlukVeriYukle") {
      ScriptApp.deleteTrigger(t);
      silinen++;
    }
  });
  logYaz("BILGI", "triggerSil", silinen + " trigger silindi");
  return silinen + " trigger silindi";
}

/**
 * Araç Günlük Bilgiler sayfasını duruma göre renklendirir.
 */
function aracGunlukBilgilerRenklendir(hedef, satirlar) {
  if (!satirlar || satirlar.length === 0) return;
  
  // Renk paleti
  const RENK_SARI = "#fef08a";       // Araç Koordinasyon
  const RENK_KIREMIT = "#fdba74";    // Servis
  const RENK_MAVI = "#bfdbfe";       // Boşta
  const RENK_YESIL = "#bbf7d0";      // Kurumda
  const RENK_KIRMIZI = "#fecaca";    // Dış Görev
  const RENK_BEYAZ = "#ffffff";      // Varsayılan
  
  // Sütun indeksleri (CONFIG.ARAC_GUNLUK_BASLIKLAR sırasına göre)
  // 0=Plaka, 1=TanS, 2=TanB, 3=TanES, 4=ZimL, 5=GunS, 6=GunB, 7=GunES, 8=İdp, 9=Durum
  const SUT_TANIMLI_EKIP = 4;        // 1-indexed: 4. sütun (D)
  const SUT_GUNCEL_EKIP = 8;         // 1-indexed: 8. sütun (H)
  const SUT_DURUM = 10;              // 1-indexed: 10. sütun (J)
  
  const tanimliEkipRenkleri = [];
  const guncelEkipRenkleri = [];
  const durumRenkleri = [];
  
  satirlar.forEach(function(satir) {
    const tanimliEkip = satir[3];
    const guncelEkip = satir[7];
    const durum = satir[9];
    
    // Tanımlı Ekip Sorumlusu rengi (anayasa 11: Türkçe duyarsız)
    tanimliEkipRenkleri.push([
      metinIceriyorMu(tanimliEkip, "ARAÇ KOORD") ? RENK_SARI : RENK_BEYAZ
    ]);
    
    // Güncel Ekip Sorumlusu rengi
    guncelEkipRenkleri.push([
      metinIceriyorMu(guncelEkip, "ARAÇ KOORD") ? RENK_SARI : RENK_BEYAZ
    ]);
    
    // Araç Çalışma Durumu rengi
    let durumRengi = RENK_BEYAZ;
    if (metinIceriyorMu(durum, "SERVİS")) {
      durumRengi = RENK_KIREMIT;
    } else if (metinIceriyorMu(durum, "BOŞTA")) {
      durumRengi = RENK_MAVI;
    } else if (metinIceriyorMu(durum, "KURUMDA")) {
      durumRengi = RENK_YESIL;
    } else if (metinIceriyorMu(durum, "DIŞ GÖREV")) {
      durumRengi = RENK_KIRMIZI;
    }
    durumRenkleri.push([durumRengi]);
  });
  
  // Renkleri uygula (toplu işlem - hızlı)
  const satirSayisi = satirlar.length;
  hedef.getRange(2, SUT_TANIMLI_EKIP, satirSayisi, 1).setBackgrounds(tanimliEkipRenkleri);
  hedef.getRange(2, SUT_GUNCEL_EKIP, satirSayisi, 1).setBackgrounds(guncelEkipRenkleri);
  hedef.getRange(2, SUT_DURUM, satirSayisi, 1).setBackgrounds(durumRenkleri);
}

/**
 * Bugünün tarihine göre günlük sayfa adı üretir.
 * Format: "09.05.2026 CUMARTESİ"
 */
function bugunSayfaAdi() {
  const bugun = new Date();
  const tz = "Europe/Istanbul";
  const tarih = Utilities.formatDate(bugun, tz, "dd.MM.yyyy");
  const gunler = ["PAZAR", "PAZARTESİ", "SALI", "ÇARŞAMBA", "PERŞEMBE", "CUMA", "CUMARTESİ"];
  const gunAdi = gunler[bugun.getDay()];
  return tarih + " " + gunAdi;
}

/**
 * Dış e-tabloda sayfa bulur. Büyük/küçük harf duyarsız + boşluk toleranslı.
 */
function disEtablodaSayfaBul(disEtablo, aranacakAd) {
  const sayfalar = disEtablo.getSheets();
  const aranan = aranacakAd.toString().trim().toUpperCase();
  
  // Önce birebir eşleşme dene
  for (let i = 0; i < sayfalar.length; i++) {
    if (sayfalar[i].getName().toString().trim().toUpperCase() === aranan) {
      return sayfalar[i];
    }
  }
  
  // Sonra tarih bazlı eşleşme dene (sadece ilk 10 karakter "dd.MM.yyyy")
  const tarihKismi = aranan.substring(0, 10);
  for (let i = 0; i < sayfalar.length; i++) {
    if (sayfalar[i].getName().toString().trim().toUpperCase().startsWith(tarihKismi)) {
      return sayfalar[i];
    }
  }
  
  return null;
}

/**
 * Dış sayfadan başlık eşlemesine göre veri çeker.
 * baslikEsleme: { "DIŞ_BASLIK": "anahtar", ... }
 * Döner: { "PLAKA1": { anahtar1: deger, anahtar2: deger }, ... }
 * Büyük/küçük harf duyarsız, dinamik sütun arama.
 */
function disSayfadanOku(sayfa, baslikEsleme) {
  const data = sayfa.getDataRange().getValues();
  if (data.length < 2) return { sirali: [], harita: {} };
  
  // Tüm satırları tarayarak başlık satırını bul (4-5 satır üstte boş olabilir)
  let baslikSatiri = -1;
  let headerMap = {};
  const aranacakBasliklar = Object.keys(baslikEsleme).map(function(b) { 
    return b.toString().trim().toLocaleUpperCase("tr-TR"); 
  });
  
  // İlk 15 satırı tara (Ekip Kota Takip 4. satırda başlıyor)
  for (let r = 0; r < Math.min(data.length, 15); r++) {
    const olasiHeader = data[r];
    let bulunanSayisi = 0;
    const tempMap = {};
    
    for (let c = 0; c < olasiHeader.length; c++) {
      const baslik = (olasiHeader[c] || "").toString().trim().toLocaleUpperCase("tr-TR");
      if (aranacakBasliklar.indexOf(baslik) > -1) {
        tempMap[baslik] = c;
        bulunanSayisi++;
      }
    }
    
    // En az 2 başlık eşleşiyorsa bu satır başlık satırıdır
    if (bulunanSayisi >= 2) {
      baslikSatiri = r;
      headerMap = tempMap;
      break;
    }
  }
  
  if (baslikSatiri === -1) {
    logYaz("UYARI", "disSayfadanOku", sayfa.getName() + " sayfasında başlık satırı bulunamadı");
    return { sirali: [], harita: {} };
  }
  
  // Plaka sütunu zorunlu
  const plakaBaslik = "ARAÇ PLAKASI";
  if (headerMap[plakaBaslik] === undefined) {
    logYaz("UYARI", "disSayfadanOku", sayfa.getName() + " sayfasında 'ARAÇ PLAKASI' sütunu yok");
    return { sirali: [], harita: {} };
  }
  
  // Plaka format regex'i: 2-3 rakam + 1-3 harf + 2-4 rakam (örn: 34CIF093, 34DPV801)
  const plakaRegex = /^[0-9]{2,3}\s?[A-ZÇĞIİÖŞÜ]{1,3}\s?[0-9]{2,4}$/i;
  
  // ⚠️ Birleştirilmiş hücre "üstten doldur" mantığı - SADECE gruplama bilgileri için
  // Kişi bazlı bilgilerde (Şoför, İdp, Durum) ASLA taşıma
  const TASIMA_IZINLI_BASLIKLAR = ["EKİP SORUMLUSU", "ÇALIŞMA BÖLGESİ"];
  const tasinabilirSutunlar = {};
  Object.keys(baslikEsleme).forEach(function(b) {
    const bUpper = b.toString().trim().toLocaleUpperCase("tr-TR");
    const ci = headerMap[bUpper];
    if (ci !== undefined && TASIMA_IZINLI_BASLIKLAR.indexOf(bUpper) > -1) {
      tasinabilirSutunlar[ci] = "";
    }
  });
  
  // Verileri çek - Ekip Kota Takip'teki sıralamayı koru
  const sonuc = { sirali: [], harita: {} };
  let bosSayaci = 0;
  
  for (let r = baslikSatiri + 1; r < data.length; r++) {
    const ham = data[r];
    
    // Boş satır kontrolü - 3 ardışık boş satır görünce dur (çöp veri sınırı)
    let satirBosMu = true;
    for (let c = 0; c < ham.length; c++) {
      if (ham[c] && ham[c].toString().trim() !== "") {
        satirBosMu = false;
        break;
      }
    }
    if (satirBosMu) {
      bosSayaci++;
      if (bosSayaci >= 3) break;
      continue;
    } else {
      bosSayaci = 0;
    }
    
    // Birleştirilmiş hücre desteği: SADECE izinli sütunlar için "taşınabilir hafıza"yı güncelle
    Object.keys(tasinabilirSutunlar).forEach(function(ci) {
      const idx = parseInt(ci);
      const deger = (ham[idx] || "").toString().trim();
      if (deger !== "") {
        tasinabilirSutunlar[idx] = deger;
      }
    });
    
    // Plaka oku
    const plakaHam = (ham[headerMap[plakaBaslik]] || "").toString().trim();
    
    // Plaka boşsa atla (ekip sorumlusu satırı vs.)
    if (!plakaHam) continue;
    
    // Plaka format kontrolü - "ARAÇ PLAKA", "AD SOYAD" gibi başlık benzeri satırları ele
    const plakaTemiz = plakaHam.replace(/\s+/g, "").toUpperCase();
    if (!plakaRegex.test(plakaTemiz)) continue;
    
    // Bu plaka zaten alındıysa atla (aynı plakanın 2. şoför satırı)
    if (sonuc.harita[plakaTemiz]) continue;
    
    // Satırı oluştur
    const satirObj = {};
    Object.keys(baslikEsleme).forEach(function(disBaslik) {
      const buyukBaslik = disBaslik.toString().trim().toLocaleUpperCase("tr-TR");
      const anahtar = baslikEsleme[disBaslik];
      const colIndex = headerMap[buyukBaslik];
      if (colIndex !== undefined) {
        // Önce mevcut hücreden oku
        let deger = (ham[colIndex] || "").toString().trim();
        // Boşsa ve bu sütun "taşınabilir" listesinde ise üst değerden al (sadece grup bilgileri)
        if (deger === "" && tasinabilirSutunlar[colIndex] !== undefined) {
          deger = tasinabilirSutunlar[colIndex];
        }
        satirObj[anahtar] = deger;
      } else {
        satirObj[anahtar] = "";
      }
    });
    
    sonuc.harita[plakaTemiz] = satirObj;
    sonuc.sirali.push(plakaTemiz);
  }
  
  return sonuc;
}

// =======================================================================
// 3. FOTOĞRAF YÜKLEME
// =======================================================================

// Drive klasörü cache'i (her foto için tekrar çağrılmasın diye)
let _driveKlasorCache = null;

function getDriveKlasor() {
  if (_driveKlasorCache === null) {
    _driveKlasorCache = DriveApp.getFolderById(CONFIG.DRIVE_KLASOR_ID);
  }
  return _driveKlasorCache;
}

/**
 * Base64 fotoğrafı Drive'a yükler, paylaşımlı link döndürür.
 */
function fotografYukle(base64Data, dosyaAdi, mimeType) {
  try {
    // AŞAMA F: Akıllı yönlendirme — dosyaAdi PLAKA_KONU_xxx formundaysa akıllı moda
    if (dosyaAdi && dosyaAdi.indexOf("_") !== -1) {
      const parcalar = dosyaAdi.split("_");
      if (parcalar.length >= 2) {
        const plaka = parcalar[0];
        const konu = parcalar[1].replace(/\.(jpg|jpeg|png)$/i, "");
        if (/^\d{2}[A-Z]+\d+$/i.test(plaka.replace(/\s/g, ""))) {
          const sonuc = fotografYukleAkilli(base64Data, plaka, konu, mimeType);
          if (sonuc.basarili) return sonuc.url;
        }
      }
    }
    
    // ESKI mantık — geriye dönük uyum
    const klasor = getDriveKlasor();
    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      mimeType || "image/jpeg",
      dosyaAdi
    );
    const dosya = klasor.createFile(blob);
    dosya.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return dosya.getUrl();
  } catch (e) {
    logYaz("HATA", "fotografYukle", e.message);
    return "HATA: " + e.message;
  }
}


/**
 * AŞAMA F — AKILLI FOTOĞRAF YÜKLEME
 * Plaka + konu + tarih ile otomatik adlandırır, doğru klasöre koyar, sıra numarası ekler.
 * @param {string} base64Data - Foto verisi
 * @param {string} plaka      - Araç plakası
 * @param {string} konu       - "KAZA", "HASAR", "GECICI", "ENVANTER", "PERIYODIK", "ZIMMET" gibi
 * @param {string} mimeType   - "image/jpeg" varsayılan
 */
function fotografYukleAkilli(base64Data, plaka, konu, mimeType) {
  try {
    if (!plaka || !konu) {
      return { basarili: false, mesaj: "Plaka veya konu boş" };
    }
    
    const plakaUst = plaka.toString().trim().toUpperCase().replace(/\s+/g, "");
    const konuUst = konu.toString().trim().toUpperCase().replace(/\s+/g, "-");
    const tarih = Utilities.formatDate(new Date(), "Europe/Istanbul", "dd.MM.yyyy");
    const yil = Utilities.formatDate(new Date(), "Europe/Istanbul", "yyyy");
    
    // Hedef klasörü belirle
    let hedefKlasor;
    if (konuUst === "PERIYODIK") {
      // 03_PERIYODIK / plaka / Aktif (eski Aktif → Arşiv'e taşınır)
      const ana = DriveApp.getFolderById(CONFIG.DRIVE.PERIYODIK_KONTROL);
      const plakaKlasoru = altKlasorBulVeyaAc(ana, plakaUst);
      hedefKlasor = altKlasorBulVeyaAc(plakaKlasoru, "Aktif");
      const arsivKlasor = altKlasorBulVeyaAc(plakaKlasoru, "Arşiv");
      // Aktif'teki eski periyodik fotoları Arşiv'e taşı
      const eskiler = hedefKlasor.getFiles();
      while (eskiler.hasNext()) {
        const eski = eskiler.next();
        eski.moveTo(arsivKlasor);
      }
    } else if (konuUst === "ZIMMET") {
      // 04_ZIMMET VE SICIL / Aktif Zimmetler
      const ana = DriveApp.getFolderById(CONFIG.DRIVE.ZIMMET_SICIL);
      hedefKlasor = altKlasorBulVeyaAc(ana, "Aktif Zimmetler");
    } else {
      // 02_SAHA BILDIRIMLERI / yıl klasörü
      const ana = DriveApp.getFolderById(CONFIG.DRIVE.SAHA_BILDIRIMLERI);
      hedefKlasor = altKlasorBulVeyaAc(ana, yil);
    }
    
    // Sıra numarası bul (aynı plaka + aynı konu + aynı gün)
    const aramaPrefix = plakaUst + "_" + konuUst + "_" + tarih;
    let sayac = 1;
    const dosyalar = hedefKlasor.getFilesByName(aramaPrefix + "_01.jpg");
    if (dosyalar.hasNext()) {
      // En az 01 var, sıradakini bul
      sayac = 2;
      while (true) {
        const numStr = (sayac < 10) ? "0" + sayac : sayac.toString();
        const it = hedefKlasor.getFilesByName(aramaPrefix + "_" + numStr + ".jpg");
        if (!it.hasNext()) break;
        sayac++;
        if (sayac > 99) break; // güvenlik
      }
    }
    const sira = (sayac < 10) ? "0" + sayac : sayac.toString();
    const dosyaAdi = aramaPrefix + "_" + sira + ".jpg";
    
    // Yükle
    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      mimeType || "image/jpeg",
      dosyaAdi
    );
    const dosya = hedefKlasor.createFile(blob);
    dosya.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return { basarili: true, url: dosya.getUrl(), dosyaAdi: dosyaAdi };
  } catch (e) {
    logYaz("HATA", "fotografYukleAkilli", e.message);
    return { basarili: false, mesaj: e.message };
  }
}


/**
 * Alt klasör yoksa açar, varsa döner.
 */
function altKlasorBulVeyaAc(anaKlasor, altAd) {
  const mevcut = anaKlasor.getFoldersByName(altAd);
  if (mevcut.hasNext()) return mevcut.next();
  return anaKlasor.createFolder(altAd);
}

// =======================================================================
// 4. ANA RAPOR KAYDETME (ÇİFT KASA MİMARİSİ)
// =======================================================================

/**
 * Saha bildirimini hem ana havuza hem ilgili alt sayfaya yazar.
 * - LockService ile race condition koruması
 * - Sunucu tarafında validasyon
 * - Dinamik sütun zırhı (header bazlı yazım)
 */
/**
 * Medya sonuçlarını "alt alta başlıklı tıklanabilir link" formatına çevirir.
 * Her satır: "Başlık: URL" şeklinde. Sheet'te HYPERLINK olarak görünür.
 * 
 * Ön Foto: https://drive.google.com/...
 * Arka Foto: https://drive.google.com/...
 * Video: https://drive.google.com/...
 */
function medyaLinkleriniDuzenle(medyaResult) {
  const satirlar = [];
  
  if (medyaResult.fotoLinkler && medyaResult.fotoLinkler.length > 0) {
    medyaResult.fotoLinkler.forEach(function(link) {
      if (link && link.toString().trim() !== "") {
        satirlar.push(link.toString().trim());
      }
    });
  }
  
  if (medyaResult.videoLink && medyaResult.videoLink.toString().trim() !== "") {
    satirlar.push(medyaResult.videoLink.toString().trim());
  }
  
  return satirlar.join("\n");
}

/**
 * Sheet'teki bir hücreye, çoklu satırlı "Başlık: URL" formatlı metni
 * tıklanabilir HYPERLINK formülü ile yazar.
 */
function medyaHucresineYaz(sheet, satirNo, sutunNo, medyaResult) {
  const linkler = [];
  
  if (medyaResult.fotoLinkler && medyaResult.fotoLinkler.length > 0) {
    medyaResult.fotoLinkler.forEach(function(link) {
      if (link && link.toString().trim() !== "") {
        linkler.push(link.toString().trim());
      }
    });
  }
  
  if (medyaResult.videoLink && medyaResult.videoLink.toString().trim() !== "") {
    linkler.push(medyaResult.videoLink.toString().trim());
  }
  
  if (linkler.length === 0) return;
  
  // Tek hücre içinde alt alta yaz, satır arası enter ile ayır
  const cell = sheet.getRange(satirNo, sutunNo);
  const richTextBuilder = SpreadsheetApp.newRichTextValue();
  
  // "Ön Foto: URL\nArka Foto: URL" formatında metin oluştur
  let tamMetin = "";
  const linkPozisyonlari = [];
  
  linkler.forEach(function(satir, idx) {
    if (idx > 0) tamMetin += "\n";
    
    // "Etiket: URL" formatını parçala
    const colonIdx = satir.indexOf(":");
    if (colonIdx > -1) {
      const baslik = satir.substring(0, colonIdx + 1).trim();
      const url = satir.substring(colonIdx + 1).trim();
      
      const baslikStart = tamMetin.length;
      tamMetin += baslik + " ";
      const urlStart = tamMetin.length;
      tamMetin += url;
      
      linkPozisyonlari.push({
        start: urlStart,
        end: tamMetin.length,
        url: url
      });
    } else {
      tamMetin += satir;
    }
  });
  
  let builder = SpreadsheetApp.newRichTextValue().setText(tamMetin);
  
  // Her URL için tıklanabilir link ekle
  linkPozisyonlari.forEach(function(pos) {
    builder = builder.setLinkUrl(pos.start, pos.end, pos.url);
  });
  
  cell.setRichTextValue(builder.build());
  cell.setWrap(true);
}

function raporuKaydet(payload) {
  const lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(CONFIG.LOCK_BEKLEME);
    
    // === SUNUCU VALİDASYONU ===
    const validasyon = payloadDogrula(payload);
    if (!validasyon.gecerli) {
      logYaz("HATA", "raporuKaydet", "Validasyon hatası: " + validasyon.mesaj);
      return { basarili: false, mesaj: validasyon.mesaj };
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // === FOTOĞRAFLARI YÜKLE ===
    const medyaResult = medyalariIsle(payload);
    
    // === 1. KASA: ANA HAVUZ (Saha Bildirimleri) ===
    let anaSheet = ss.getSheetByName(CONFIG.SHEET.SAHA_BILDIRIMLERI);
    if (!anaSheet) {
      anaSheet = ss.insertSheet(CONFIG.SHEET.SAHA_BILDIRIMLERI);
    }
    sheetBaslikKur(anaSheet, SAHA_BILDIRIMLERI_BASLIKLAR);
    
    const anaHeaderMap = getHeaderMap(anaSheet);
    const anaSatir = satirOlustur(anaHeaderMap, payload, medyaResult);
    anaSheet.appendRow(anaSatir);
    
    // === 2. KASA: ALT SAYFA (Kategoriye göre) ===
    altSayfayaYaz(ss, payload, medyaResult);
    
    logYaz("BİLGİ", "raporuKaydet",
      "Kayıt: " + payload["Araç Plakası"] + " - " + payload["İşlem Kategorisi"]);
    
    return { basarili: true, mesaj: "Rapor başarıyla kaydedildi" };
    
  } catch (e) {
    logYaz("HATA", "raporuKaydet", e.message);
    return { basarili: false, mesaj: "Sistem hatası: " + e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Payload'u sunucu tarafında doğrular.
 */
function payloadDogrula(payload) {
  if (!payload) {
    return { gecerli: false, mesaj: "Veri boş gönderildi" };
  }
  
  if (!payload["Araç Plakası"] || payload["Araç Plakası"].toString().trim() === "") {
    return { gecerli: false, mesaj: "Plaka boş olamaz" };
  }
  
  if (!payload["Bildiren Kullanıcı"] || payload["Bildiren Kullanıcı"].toString().trim().length < 3) {
    return { gecerli: false, mesaj: "Kullanıcı adı en az 3 karakter olmalı" };
  }
  
  if (!payload["İşlem Kategorisi"] || payload["İşlem Kategorisi"].toString().trim() === "") {
    return { gecerli: false, mesaj: "İşlem kategorisi belirtilmemiş" };
  }
  
  // Fotoğraf sayı kontrolü
  if (payload.fotograflar && payload.fotograflar.length > (CONFIG.MAX_FOTO + CONFIG.MAX_VIDEO)) {
    return { gecerli: false, mesaj: "Maksimum " + CONFIG.MAX_FOTO + " fotoğraf + " + CONFIG.MAX_VIDEO + " video yüklenebilir" };
  }
  
  return { gecerli: true };
}

/**
 * Fotoğraf ve video dizilerini Drive'a yükler.
 */
function medyalariIsle(payload) {
  // Dinamik dizi boyutu - MAX_FOTO kadar
  const sonuc = {
    fotoLinkler: new Array(CONFIG.MAX_FOTO).fill(""),
    videoLink: ""
  };
  
  if (!payload.fotograflar || payload.fotograflar.length === 0) {
    return sonuc;
  }
  
  let fotoSira = 0;
  
  for (let i = 0; i < payload.fotograflar.length; i++) {
    const medya = payload.fotograflar[i];
    if (!medya || !medya.data || medya.data.length === 0) continue;
    
    const zaman = new Date().getTime() + i;
    const plaka = (payload["Araç Plakası"] || "X").replace(/\s/g, "_");
    const isVideo = medya.mimeType && medya.mimeType.indexOf("video") !== -1;
    const etiket = medya.etiket ? medya.etiket : "FOTO";
    
    if (isVideo) {
      const videoAd = plaka + "_VIDEO_" + zaman + ".mp4";
      sonuc.videoLink = "VİDEO: " + fotografYukle(medya.data, videoAd, medya.mimeType);
    } else if (fotoSira < CONFIG.MAX_FOTO) {
      const fotoAd = plaka + "_" + etiket + "_" + zaman + "_" + (fotoSira + 1) + ".jpg";
      const link = fotografYukle(medya.data, fotoAd, medya.mimeType || "image/jpeg");
      sonuc.fotoLinkler[fotoSira] = etiket + ": " + link;
      fotoSira++;
    }
  }
  
  return sonuc;
}

/**
 * Header map'e göre satır dizisi oluşturur.
 * Sütun yeri değişse bile doğru yere yazar.
 */
function satirOlustur(headerMap, payload, medyaResult) {
  // Boş satır oluştur (header sayısı kadar)
  const maxIdx = Math.max(...Object.values(headerMap));
  const satir = new Array(maxIdx + 1).fill("");
  
  // Header isimlerine göre değer yerleştir
  const veriHaritasi = {
    "1. İşlem Zamanı": new Date(),
    "2. Bildiren Kullanıcı": payload["Bildiren Kullanıcı"] || "",
    "3. Araç Plakası": payload["Araç Plakası"] || "",
    "4. İşlem Kategorisi": payload["İşlem Kategorisi"] || "",
    "5. Zimmet İşlem Türü": payload["Zimmet İşlem Türü"] || "",
    "6. Zimmet Uygunluk Durumu": payload["Zimmet Uygunluk Durumu"] || "",
    "7. Zimmet Devri Yönetici Kodu": payload["Zimmet Devri Yönetici Kodu"] || "",
    "8. Geçici / Aracı Kimden Aldı?": payload["Geçici / Aracı Kimden Aldı?"] || "",
    "9. Yeni Hasar veya Eksik Beyanı": payload["Yeni Hasar veya Eksik Beyanı"] || "",
    "10. Fotoğraf 1": medyaResult.fotoLinkler[0],
    "11. Fotoğraf 2": medyaResult.fotoLinkler[1],
    "12. Fotoğraf 3": medyaResult.fotoLinkler[2],
    "13. Fotoğraf 4": medyaResult.fotoLinkler[3],
    "14. Fotoğraf 5": medyaResult.fotoLinkler[4],
    "15. Araç Videosu": medyaResult.videoLink,
    "16. Eksik Envanter Kalemleri": payload["Eksik Envanter Kalemleri"] || "",
    "17. Temizlik Durumu (İç/Dış)": payload["Temizlik Durumu"] || "",
    "18. Kaza Tarihi ve Saati": payload["Kaza Tarihi ve Saati"] || "",
    "19. Kaza Zimmet Durumu": payload["Kaza Zimmet Durumu"] || "",
    "20. Olay Türü (Ciddi/Hafif)": payload["Olay Türü"] || "",
    "21. Tutanak Tutuldu Mu?": payload["Tutanak Durumu"] || "",
    "22. Tutanak Tutulmama Nedeni": payload["Tutanak Tutulmama Nedeni"] || "",
    "23. Servise Kim Götürüyor": payload["Servise Kim Götürüyor"] || "",
    "24. Servis İşlem Tipi": payload["Servise Gidiş Nedeni"] || "",
    "25. Servise Gidiş Şekli / Aciliyet": payload["Gidiş Şekli"] || "",
    "26. Bırakılan Servis Adı": payload["Servis Adı"] || "",
    "27. Servis İşlem Yönü (Bırakma/Alma)": payload["İşlem Yönü"] || "",
    "28. Araç İçi Evrak Durumu (Form/Ruhsat)": payload["Evrak Durumu"] || "",
    "29. Giydirme / Reklam Durumu": payload["Giydirme Durumu"] || "",
    "30. Güncel KM / Servis Çıkış KM": payload["Güncel KM"] || "",
    "31. Yönetici Onay Durumu": "Bekliyor",
    "32. Onaylayan Yönetici": "",
    "33. Red Gerekçesi": ""
  };
  
  // Header map'e göre yerleştir
  for (const baslik in veriHaritasi) {
    if (headerMap.hasOwnProperty(baslik)) {
      satir[headerMap[baslik]] = veriHaritasi[baslik];
    }
  }
  
  return satir;
}

/**
 * ÇİFT KASA: Veriyi kategoriye göre uygun alt sayfaya da yazar.
 */
function altSayfayaYaz(ss, payload, medyaResult) {
  try {
    const kategori = (payload["İşlem Kategorisi"] || "").toUpperCase();
    
    if (kategori.indexOf("ZİMMET") !== -1) {
      altSayfa_Zimmet(ss, payload);
    } else if (kategori.indexOf("GEÇİCİ") !== -1) {
      altSayfa_Gecici(ss, payload, medyaResult);
    } else if (kategori.indexOf("KAZA") !== -1 || kategori.indexOf("HASAR") !== -1) {
      altSayfa_Kaza(ss, payload, medyaResult);
    } else if (kategori.indexOf("SERVİS") !== -1) {
      altSayfa_Servis(ss, payload, medyaResult);
    } else if (kategori.indexOf("ENVANTER") !== -1) {
      altSayfa_Envanter(ss, payload);
    } else if (kategori.indexOf("PERİYODİK") !== -1) {
      altSayfa_PeriyodikKontrol(ss, payload, medyaResult);
    } else if (kategori.indexOf("GİYDİRME") !== -1) {
      altSayfa_Giydirme(ss, payload, medyaResult);
    } else if (kategori.indexOf("KM") !== -1) {
      altSayfa_KM(ss, payload);
    }
  } catch (e) {
    logYaz("HATA", "altSayfayaYaz", e.message);
  }
}

// --- Alt sayfa yazıcıları (her biri kendi sayfasına yazar) ---

function altSayfa_Zimmet(ss, payload) {
  let sheet = ss.getSheetByName(CONFIG.SHEET.ZIMMET);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEET.ZIMMET);
  const baslik = ["SN", "Plaka", "Tarih / Saat", "İşlem Türü", "Teslim Eden", "Devir Anındaki Hasar Durumu", "Yönetici Onay Durumu", "Not", "Red Gerekçesi"];
  sheetBaslikKur(sheet, baslik);
  const sn = sheet.getLastRow();
  sheet.appendRow([
    sn, payload["Araç Plakası"], new Date(),
    payload["Zimmet İşlem Türü"] || "",
    payload["Bildiren Kullanıcı"] || "",
    payload["Zimmet Uygunluk Durumu"] || "",
    "Bekliyor", ""
  ]);
}

function altSayfa_Gecici(ss, payload, medyaResult) {
  let sheet = ss.getSheetByName(CONFIG.SHEET.GECICI);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEET.GECICI);
  const baslik = [
    "Sıra No", "TARİH", "PLAKA", "BİLDİREN KULLANICI", "İŞLEM YÖNÜ",
    "GEÇİCİ / ARACI KİMDEN ALDI?", "YENİ HASAR VEYA EKSİK BEYANI",
    "EKSİK ENVANTER VAR MI?", "EKSİK ENVANTER KALEMLERİ",
    "TEMİZLİK DURUMU", "FOTOĞRAFLAR", "Yönetici Onay Durumu", "Red Gerekçesi"
  ];
  sheetBaslikKur(sheet, baslik);
  
  // "EKSİK VAR MI?" akıllı hesaplama - kalem listesi doluysa "Evet", boşsa "Hayır"
  const eksikKalemler = (payload["Eksik Envanter Kalemleri"] || "").toString().trim();
  const eksikVarMi = eksikKalemler.length > 0 ? "Evet" : "Hayır";
  
  const sn = sheet.getLastRow();
  sheet.appendRow([
    sn, new Date(), payload["Araç Plakası"],
    payload["Bildiren Kullanıcı"], payload["İşlem Yönü"] || "",
    payload["Geçici / Aracı Kimden Aldı?"] || "",
    payload["Yeni Hasar veya Eksik Beyanı"] || "",
    eksikVarMi,
    eksikKalemler,
    payload["Temizlik Durumu"] || "",
    ""  // Medya sütunu boş, RichText ile dolduracağız
  ]);
  // FOTOĞRAFLAR sütunu artık 11. sütun
  medyaHucresineYaz(sheet, sheet.getLastRow(), 11, medyaResult);
}

function altSayfa_Kaza(ss, payload, medyaResult) {
  let sheet = ss.getSheetByName(CONFIG.SHEET.KAZA);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEET.KAZA);
  const baslik = ["Sıra No", "Plaka", "Olay Tarihi ve Saati", "Kullanan Şoför", "Olay Türü", "Hasar Detayı", "Tutanak Durumu", "Kaza ve Tutanak Medyaları", "Yönetici Notu", "Yönetici Onay Durumu", "Red Gerekçesi"];
  sheetBaslikKur(sheet, baslik);
  const sn = sheet.getLastRow();
  sheet.appendRow([
    sn, payload["Araç Plakası"],
    payload["Kaza Tarihi ve Saati"] || "",
    payload["Bildiren Kullanıcı"],
    payload["Olay Türü"] || "",
    payload["Yeni Hasar veya Eksik Beyanı"] || "",
    payload["Tutanak Durumu"] || "",
    "",  // Medya sütunu boş, RichText ile dolduracağız
    payload["Tutanak Tutulmama Nedeni"] || ""
  ]);
  // 8. sütun = Kaza ve Tutanak Medyaları
  medyaHucresineYaz(sheet, sheet.getLastRow(), 8, medyaResult);
}

function altSayfa_Servis(ss, payload, medyaResult) {
  let sheet = ss.getSheetByName(CONFIG.SHEET.SERVIS);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEET.SERVIS);
  const baslik = ["Sıra No", "Plakalar", "Servis Adı / Yeri", "Servis Giriş Tarihi ve Saati", "Servis Çıkış Tarihi ve Saati", "Servise Gidiş Şekli", "Servise Gidiş Nedeni", "Araç İçi Evrak Durumu", "Yapılan Onarımlar", "Çıkış KM", "İkame Araç Plakası", "Servis Medyaları", "Yönetici Onay Durumu", "Red Gerekçesi"];
  sheetBaslikKur(sheet, baslik);
  const sn = sheet.getLastRow();
  const isBirakma = (payload["İşlem Yönü"] || "").indexOf("Bırakma") !== -1;
  sheet.appendRow([
    sn, payload["Araç Plakası"],
    payload["Servis Adı"] || "",
    isBirakma ? new Date() : "",
    !isBirakma ? new Date() : "",
    payload["Gidiş Şekli"] || "",
    payload["Servise Gidiş Nedeni"] || "",
    payload["Evrak Durumu"] || "",
    payload["Yapılan Onarımlar"] || "",
    payload["Güncel KM"] || "",
    "",
    ""  // Medya sütunu boş, RichText ile dolduracağız
  ]);
  // 12. sütun = Servis Medyaları
  medyaHucresineYaz(sheet, sheet.getLastRow(), 12, medyaResult);
}

function altSayfa_Envanter(ss, payload) {
  let sheet = ss.getSheetByName(CONFIG.SHEET.ENVANTER);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEET.ENVANTER);
  const baslik = ["Sıra No", "Plaka", "Son Kontrol Tarihi", "İşlem Türü", "Eksik Olanlar", "Temin Edilenler", "Bildiren Kullanıcı", "Tutanak Durumu", "Yönetici Onay Durumu", "Red Gerekçesi"];
  sheetBaslikKur(sheet, baslik);
  const sn = sheet.getLastRow();
  
  const islemYonu = payload["İşlem Yönü"] || "Eksik Bildirimi";
  const isTemin = (islemYonu.indexOf("Temin") !== -1);
  
  sheet.appendRow([
    sn,
    payload["Araç Plakası"],
    new Date(),
    islemYonu,
    isTemin ? "" : (payload["Eksik Envanter Kalemleri"] || ""),
    isTemin ? (payload["Temin Edilenler"] || payload["Eksik Envanter Kalemleri"] || "") : "",
    payload["Bildiren Kullanıcı"],
    isTemin ? "" : (payload["Tutanak Durumu"] || "")
  ]);
}

function altSayfa_Giydirme(ss, payload, medyaResult) {
  let sheet = ss.getSheetByName(CONFIG.SHEET.GIYDIRME);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEET.GIYDIRME);
  const baslik = ["Plaka", "Giydirme Türü / Kategorisi", "Son Giydirme Tarihi", "Güncel Durum", "Son Kontrol Tarihi", "Saha Notu / Eksiklik", "ACİLLİYET", "Son Kontrol Medyaları", "Yönetici Onay Durumu", "Red Gerekçesi"];
  sheetBaslikKur(sheet, baslik);
  sheet.appendRow([
    payload["Araç Plakası"], "", "",
    payload["Giydirme Durumu"] || "",
    new Date(), "", "",
    ""  // Medya sütunu boş, RichText ile dolduracağız
  ]);
  // 8. sütun = Son Kontrol Medyaları
  medyaHucresineYaz(sheet, sheet.getLastRow(), 8, medyaResult);
}

function altSayfa_PeriyodikKontrol(ss, payload, medyaResult) {
  let sheet = ss.getSheetByName(CONFIG.SHEET.PERIYODIK);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEET.PERIYODIK);
  
  // 23 sütun başlık (üst grup başlık YOK, sade)
  const baslik = [
    // Genel Bilgiler (4)
    "Sıra No", "Plaka", "Tarih", "Bildiren Kullanıcı",
    // Giydirme (5)
    "Giydirme Durumu", "Giydirme Son 1 Ay Yıpranma",
    "Giydirme Fotoları", "Video Linki", "Giydirme Notu",
    // Kaporta (6)
    "Kaporta Durumu", "Kaporta Son 1 Ay Yıpranma",
    "Ön/Arka Cephe Fotoları", "Sağ/Sol Yan Fotoları", "Aynalar Fotoları", "Kaporta Notu",
    // Mekanik (7)
    "Lastik Durumu", "Cam Durumu", "Lamba Durumu",
    "Klima Durumu", "Akü Durumu", "Genel Mekanik", "Mekanik Notu",
    // Yönetici (2)
    "Yönetici Onayı", "Red Gerekçesi"
  ];
  sheetBaslikKur(sheet, baslik);
  
  const sn = sheet.getLastRow();
  sheet.appendRow([
    sn, payload["Araç Plakası"], new Date(), payload["Bildiren Kullanıcı"],
    payload["Giydirme Durumu"] || "",
    payload["Giydirme Son 1 Ay"] || "",
    "",  // Giydirme Fotoları - RichText ile yazılacak
    "",  // Video Linki - RichText ile yazılacak
    payload["Giydirme Notu"] || "",
    payload["Kaporta Durumu"] || "",
    payload["Kaporta Son 1 Ay"] || "",
    "",  // Ön/Arka Cephe - RichText
    "",  // Sağ/Sol Yan - RichText
    "",  // Aynalar - RichText
    payload["Kaporta Notu"] || "",
    payload["Lastik Durumu"] || "",
    payload["Cam Durumu"] || "",
    payload["Lamba Durumu"] || "",
    payload["Klima Durumu"] || "",
    payload["Akü Durumu"] || "",
    payload["Genel Mekanik"] || "",
    payload["Mekanik Notu"] || "",
    "Bekliyor", ""
  ]);
  
  // === FOTOLARI ETİKETİNE GÖRE GRUPLAYIP RICHTEXT İLE YAZ ===
  const grupluMedya = periyodikMedyaGrupla(medyaResult);
  const sonSatir = sheet.getLastRow();
  
  // 7. sütun = Giydirme Fotoları
  if (grupluMedya.giydirme.fotoLinkler.length > 0) {
    medyaHucresineYaz(sheet, sonSatir, 7, grupluMedya.giydirme);
  }
  // 8. sütun = Video Linki
  if (grupluMedya.video.videoLink) {
    medyaHucresineYaz(sheet, sonSatir, 8, grupluMedya.video);
  }
  // 12. sütun = Ön/Arka Cephe Fotoları
  if (grupluMedya.onArka.fotoLinkler.length > 0) {
    medyaHucresineYaz(sheet, sonSatir, 12, grupluMedya.onArka);
  }
  // 13. sütun = Sağ/Sol Yan Fotoları
  if (grupluMedya.sagSol.fotoLinkler.length > 0) {
    medyaHucresineYaz(sheet, sonSatir, 13, grupluMedya.sagSol);
  }
  // 14. sütun = Aynalar Fotoları
  if (grupluMedya.aynalar.fotoLinkler.length > 0) {
    medyaHucresineYaz(sheet, sonSatir, 14, grupluMedya.aynalar);
  }
}

/**
 * Periyodik bildirimdeki fotoları etiketine göre 5 gruba ayırır:
 * giydirme, onArka, sagSol, aynalar, video
 * Her grupta medyaResult formatı vardır: { fotoLinkler: [...], videoLink: "" }
 */
function periyodikMedyaGrupla(medyaResult) {
  const sonuc = {
    giydirme: { fotoLinkler: [], videoLink: "" },
    onArka:   { fotoLinkler: [], videoLink: "" },
    sagSol:   { fotoLinkler: [], videoLink: "" },
    aynalar:  { fotoLinkler: [], videoLink: "" },
    video:    { fotoLinkler: [], videoLink: "" }
  };
  
  // fotoLinkler her elemanı "ETIKET: link" formatında
  if (medyaResult.fotoLinkler) {
    medyaResult.fotoLinkler.forEach(function(link) {
      if (!link || link.toString().trim() === "") return;
      const linkUpper = link.toString().toLocaleUpperCase("tr-TR");
      
      if (linkUpper.indexOf("GİYDİRME") > -1 || linkUpper.indexOf("GIYDIRME") > -1) {
        sonuc.giydirme.fotoLinkler.push(link);
      } else if (linkUpper.indexOf("ÖN") > -1 || linkUpper.indexOf("ARKA") > -1 || 
                 linkUpper.indexOf("ON CEPHE") > -1 || linkUpper.indexOf("ARKA CEPHE") > -1) {
        sonuc.onArka.fotoLinkler.push(link);
      } else if (linkUpper.indexOf("SAĞ YAN") > -1 || linkUpper.indexOf("SOL YAN") > -1 ||
                 linkUpper.indexOf("SAG YAN") > -1) {
        sonuc.sagSol.fotoLinkler.push(link);
      } else if (linkUpper.indexOf("AYNA") > -1) {
        sonuc.aynalar.fotoLinkler.push(link);
      }
    });
  }
  
  if (medyaResult.videoLink) {
    sonuc.video.videoLink = medyaResult.videoLink;
  }
  
  return sonuc;
}

function altSayfa_KM(ss, payload) {
  let sheet = ss.getSheetByName(CONFIG.SHEET.KM);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEET.KM);
  
  // KM sayfasının yıllık 12 ay sütunu var
  const yil = new Date().getFullYear();
  const aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  const baslik = ["Sıra No", "Plaka"].concat(aylar.map(a => a + " " + yil)).concat(["Toplam"]);
  sheetBaslikKur(sheet, baslik);
  
  // Plakaya göre satır bul, yoksa ekle
  const headerMap = getHeaderMap(sheet);
  const data = sheet.getDataRange().getValues();
  const plakaIdx = headerMap["Plaka"];
  const ay = new Date().getMonth();
  const ayBasligi = aylar[ay] + " " + yil;
  const ayIdx = headerMap[ayBasligi];
  
  let satirNo = -1;
  for (let r = 1; r < data.length; r++) {
    if ((data[r][plakaIdx] || "").toString().trim() === payload["Araç Plakası"].toString().trim()) {
      satirNo = r + 1;
      break;
    }
  }
  
  if (satirNo === -1) {
    // Yeni satır
    const yeniSatir = new Array(baslik.length).fill("");
    yeniSatir[headerMap["Sıra No"]] = data.length;
    yeniSatir[plakaIdx] = payload["Araç Plakası"];
    if (ayIdx !== undefined) yeniSatir[ayIdx] = payload["Güncel KM"];
    sheet.appendRow(yeniSatir);
  } else {
    // Mevcut satırı güncelle
    if (ayIdx !== undefined) {
      sheet.getRange(satirNo, ayIdx + 1).setValue(payload["Güncel KM"]);
    }
  }
}

// =======================================================================
// 5. YÖNETİCİ GİRİŞ VE PANEL
// =======================================================================

/**
 * Yönetici şifresini doğrular.
 * Kullanıcılar sayfasındaki PIN/Şifre + "SİSTEME GİRİŞ İZNİ = EVET" kontrolü.
 */
function yoneticiGirisYap(sifre) {
  try {
    if (!sifre || sifre.toString().trim() === "") {
      return { basarili: false, mesaj: "Şifre boş olamaz" };
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET.KULLANICILAR);
    
    if (!sheet) {
      logYaz("HATA", "yoneticiGirisYap", "Kullanıcılar sayfası yok");
      return { basarili: false, mesaj: "Sistem yapılandırması eksik" };
    }
    
    const headerMap = getHeaderMap(sheet);
    const data = sheet.getDataRange().getValues();
    
    // Esnek başlık eşleştirme
    const sifreIdx = headerMap["Şifre"] !== undefined ? headerMap["Şifre"] : headerMap["PIN"];
    const isimIdx = headerMap["Ad Soyad"] !== undefined ? headerMap["Ad Soyad"] : headerMap["İsim"];
    const yetkiIdx = headerMap["Yetki"] !== undefined ? headerMap["Yetki"] : headerMap["Rol"];
    const izinIdx = headerMap["SİSTEME GİRİŞ İZNİ"];
    
    for (let r = 1; r < data.length; r++) {
      const satirSifre = (data[r][sifreIdx] || "").toString();
      const satirYetki = (data[r][yetkiIdx] || "").toString().toUpperCase();
      const satirIzin = (data[r][izinIdx] || "").toString().toUpperCase();
      
      if (satirSifre === sifre.toString() && 
          satirYetki.indexOf("YÖNETİCİ") !== -1 &&
          satirIzin === "EVET") {
        const isim = data[r][isimIdx] || "Yönetici";
        logYaz("BİLGİ", "yoneticiGirisYap", "Giriş: " + isim);
        return { basarili: true, isim: isim };
      }
    }
    
    logYaz("UYARI", "yoneticiGirisYap", "Başarısız giriş denemesi");
    return { basarili: false, mesaj: "Şifre hatalı veya giriş izniniz yok" };
    
  } catch (e) {
    logYaz("HATA", "yoneticiGirisYap", e.message);
    return { basarili: false, mesaj: "Sistem hatası" };
  }
}

/**
 * Yönetici paneli için özet veriler.
 */
function getYoneticiVerileri() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET.SAHA_BILDIRIMLERI);
    const sonuc = {
      ozet: { bugun: 0, toplam: 0, bekleyen: 0 },
      grafik: {},
      veriler: []
    };
    
    if (!sheet || sheet.getLastRow() < 2) return sonuc;
    
    const headerMap = getHeaderMap(sheet);
    const data = sheet.getDataRange().getValues();
    const bugunTarih = new Date().toLocaleDateString('tr-TR');
    
    // Header indeksleri (dinamik)
    const idxZaman = headerMap["1. İşlem Zamanı"];
    const idxKullanici = headerMap["2. Bildiren Kullanıcı"];
    const idxPlaka = headerMap["3. Araç Plakası"];
    const idxKategori = headerMap["4. İşlem Kategorisi"];
    const idxOnay = headerMap["31. Yönetici Onay Durumu"];
    const idxOnaylayan = headerMap["32. Onaylayan Yönetici"];
    
    // Fotoğraf sütunları
    const fotoIdxList = [];
    for (let i = 1; i <= 5; i++) {
      const idx = headerMap[(9 + i) + ". Fotoğraf " + i];
      if (idx !== undefined) fotoIdxList.push(idx);
    }
    
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      const islemTarihiObj = new Date(row[idxZaman]);
      const kisaTarih = !isNaN(islemTarihiObj) ? islemTarihiObj.toLocaleDateString('tr-TR') : "Belirsiz";
      const saat = !isNaN(islemTarihiObj) ? islemTarihiObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : "";
      
      sonuc.ozet.toplam++;
      if (kisaTarih === bugunTarih) sonuc.ozet.bugun++;
      
      const onayDurumu = row[idxOnay];
      if (onayDurumu === "Bekliyor" || !onayDurumu) sonuc.ozet.bekleyen++;
      
      const kategori = row[idxKategori];
      if (kategori) sonuc.grafik[kategori] = (sonuc.grafik[kategori] || 0) + 1;
      
      const fotograflar = [];
      fotoIdxList.forEach(idx => {
        if (row[idx] && row[idx].toString().trim() !== "") fotograflar.push(row[idx]);
      });
      
      sonuc.veriler.push({
        satirNo: i + 1,
        kisaTarih: kisaTarih,
        saat: saat,
        kullanici: row[idxKullanici],
        plaka: row[idxPlaka],
        modul: kategori,
        fotograflar: fotograflar,
        onayBekliyor: (onayDurumu === "Bekliyor" || !onayDurumu),
        onayMetni: (onayDurumu === "Onaylandı" ? "✅ " + (row[idxOnaylayan] || "") + " Onayladı" : "")
      });
    }
    
    return sonuc;
    
  } catch (e) {
    logYaz("HATA", "getYoneticiVerileri", e.message);
    return { ozet: { bugun: 0, toplam: 0, bekleyen: 0 }, grafik: {}, veriler: [], hata: e.message };
  }
}

// =======================================================================
// AŞAMA 1.5 — BEKLEYEN ONAYLAR YÖNETİMİ
// =======================================================================

/**
 * Saha Bildirimleri'ndeki onayı bekleyen kayıtları döndürür.
 * Liste: en yeni en üstte, max 50 kayıt.
 * Her kayıt: satırNo, plaka, kategori, bildiren, zaman, özet, fotoLinkler
 */
function bekleyenOnaylariGetir() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET.SAHA_BILDIRIMLERI);
    if (!sheet || sheet.getLastRow() < 2) {
      return { basarili: true, liste: [] };
    }
    
    const headerMap = getHeaderMap(sheet);
    const data = sheet.getDataRange().getValues();
    
    // Header indeksleri (dinamik)
    const idxZaman = headerMap["1. İşlem Zamanı"];
    const idxKullanici = headerMap["2. Bildiren Kullanıcı"];
    const idxPlaka = headerMap["3. Araç Plakası"];
    const idxKategori = headerMap["4. İşlem Kategorisi"];
    const idxOnay = headerMap["31. Yönetici Onay Durumu"];
    
    // Detay alanları (özet için)
    const idxZimmetTur = headerMap["5. Zimmet İşlem Türü"];
    const idxZimmetUygun = headerMap["6. Zimmet Uygunluk Durumu"];
    const idxAraciKimden = headerMap["8. Geçici / Aracı Kimden Aldı?"];
    const idxHasarBeyan = headerMap["9. Yeni Hasar veya Eksik Beyanı"];
    const idxEksikEnv = headerMap["16. Eksik Envanter Kalemleri"];
    const idxTemizlik = headerMap["17. Temizlik Durumu (İç/Dış)"];
    const idxKazaZaman = headerMap["18. Kaza Tarihi ve Saati"];
    const idxOlayTuru = headerMap["20. Olay Türü (Ciddi/Hafif)"];
    const idxTutanak = headerMap["21. Tutanak Tutuldu Mu?"];
    const idxServisAd = headerMap["26. Bırakılan Servis Adı"];
    const idxKM = headerMap["30. Güncel KM / Servis Çıkış KM"];
    
    // Fotoğraf sütunları
    const fotoIdxList = [];
    for (let i = 1; i <= 5; i++) {
      const idx = headerMap[(9 + i) + ". Fotoğraf " + i];
      if (idx !== undefined) fotoIdxList.push(idx);
    }
    const idxVideo = headerMap["15. Araç Videosu"];
    
    const liste = [];
    
    // Sondan başa tara (en yeni üstte)
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      const onayDurumu = row[idxOnay];
      
      // Sadece "Bekliyor" veya boş olanlar
      if (onayDurumu !== "Bekliyor" && onayDurumu !== "" && onayDurumu !== null && onayDurumu !== undefined) {
        continue;
      }
      
      // Tarih
      const zamanObj = new Date(row[idxZaman]);
      const tarih = !isNaN(zamanObj) ? Utilities.formatDate(zamanObj, "Europe/Istanbul", "dd.MM.yyyy") : "";
      const saat = !isNaN(zamanObj) ? Utilities.formatDate(zamanObj, "Europe/Istanbul", "HH:mm") : "";
      
      // Detay özeti (kategoriye göre)
      const kategori = (row[idxKategori] || "").toString();
      const detaylar = [];
      
      if (kategori.indexOf("ZİMMET") !== -1) {
        if (row[idxZimmetTur]) detaylar.push("Tür: " + row[idxZimmetTur]);
        if (row[idxZimmetUygun]) detaylar.push("Durum: " + row[idxZimmetUygun]);
      } else if (kategori.indexOf("GEÇİCİ") !== -1) {
        if (row[idxAraciKimden]) detaylar.push("Kişi: " + row[idxAraciKimden]);
        if (row[idxHasarBeyan]) detaylar.push(row[idxHasarBeyan]);
        if (row[idxTemizlik]) detaylar.push("Temizlik: " + row[idxTemizlik]);
      } else if (kategori.indexOf("KAZA") !== -1 || kategori.indexOf("HASAR") !== -1) {
        if (row[idxOlayTuru]) detaylar.push("Olay: " + row[idxOlayTuru]);
        if (row[idxTutanak]) detaylar.push("Tutanak: " + row[idxTutanak]);
        if (row[idxHasarBeyan]) detaylar.push(row[idxHasarBeyan]);
      } else if (kategori.indexOf("SERVİS") !== -1) {
        if (row[idxServisAd]) detaylar.push("Servis: " + row[idxServisAd]);
        if (row[idxKM]) detaylar.push("KM: " + row[idxKM]);
      } else if (kategori.indexOf("ENVANTER") !== -1) {
        if (row[idxEksikEnv]) detaylar.push("Eksik: " + row[idxEksikEnv]);
      } else if (kategori.indexOf("KM") !== -1) {
        if (row[idxKM]) detaylar.push("KM: " + row[idxKM]);
      }
      
      // Fotoğraflar (var/yok)
      const fotoLinkler = [];
      fotoIdxList.forEach(function(idx) {
        const v = row[idx];
        if (v && v.toString().trim() !== "") fotoLinkler.push(v.toString());
      });
      const videoLink = (idxVideo !== undefined && row[idxVideo]) ? row[idxVideo].toString() : "";
      
      // Medya linklerini detaylara ekle (LİNKİ AÇ olacak)
      fotoLinkler.forEach(function(fl) {
        detaylar.push("📷 " + fl);
      });
      if (videoLink) detaylar.push("🎥 " + videoLink);
      
      liste.push({
        satirNo: i + 1,
        plaka: row[idxPlaka] || "",
        kategori: kategori,
        bildiren: row[idxKullanici] || "",
        tarih: tarih,
        saat: saat,
        detaylar: detaylar,
        fotoSayisi: fotoLinkler.length,
        videoVar: videoLink !== ""
      });
      
      // Max 50 kayıt (performans)
      if (liste.length >= 50) break;
    }
    
    return { basarili: true, liste: liste, toplam: liste.length };
    
  } catch (e) {
    logYaz("HATA", "bekleyenOnaylariGetir", e.message);
    return { basarili: false, mesaj: e.message, liste: [] };
  }
}

/**
 * Bekleyen kaydı ONAYLAR (çift kasa - hem ana havuza hem alt sayfaya).
 */
function onayVer(satirNo, yoneticiAdi) {
  const lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(CONFIG.LOCK_BEKLEME);
    
    if (!satirNo || satirNo < 2) {
      return { basarili: false, mesaj: "Geçersiz satır numarası" };
    }
    if (!yoneticiAdi || yoneticiAdi.toString().trim() === "") {
      return { basarili: false, mesaj: "Yönetici adı boş olamaz" };
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET.SAHA_BILDIRIMLERI);
    if (!sheet) return { basarili: false, mesaj: "Saha Bildirimleri sayfası bulunamadı" };
    
    const headerMap = getHeaderMap(sheet);
    const onayCol = headerMap["31. Yönetici Onay Durumu"];
    const onaylayanCol = headerMap["32. Onaylayan Yönetici"];
    const plakaCol = headerMap["3. Araç Plakası"];
    const kategoriCol = headerMap["4. İşlem Kategorisi"];
    const zamanCol = headerMap["1. İşlem Zamanı"];
    
    if (onayCol === undefined || onaylayanCol === undefined) {
      return { basarili: false, mesaj: "Onay sütunları bulunamadı" };
    }
    
    // Ana havuza yaz
    sheet.getRange(satirNo, onayCol + 1).setValue("Onaylandı");
    sheet.getRange(satirNo, onaylayanCol + 1).setValue(yoneticiAdi);
    
    // Alt sayfaya yansıt (çift kasa)
    const row = sheet.getRange(satirNo, 1, 1, sheet.getLastColumn()).getValues()[0];
    const plaka = row[plakaCol];
    const kategori = row[kategoriCol];
    const zaman = row[zamanCol];
    const bildiren = row[headerMap["2. Bildiren Kullanıcı"]] || "";
    altSayfayaOnayYansit(ss, kategori, plaka, zaman, "Onaylandı", yoneticiAdi, "");
    
    // AŞAMA 1.6: Onay Geçmişi'ne log
    onayGecmisineYaz(yoneticiAdi, "Onaylandı", plaka, kategori, bildiren, zaman, "");
    
    logYaz("BİLGİ", "onayVer", "Satır " + satirNo + " onaylandı: " + yoneticiAdi + " (" + plaka + " - " + kategori + ")");
    
    return { basarili: true };
    
  } catch (e) {
    logYaz("HATA", "onayVer", e.message);
    return { basarili: false, mesaj: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Bekleyen kaydı REDDEDER (çift kasa + gerekçe zorunlu).
 */
function onayReddet(satirNo, yoneticiAdi, gerekce) {
  const lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(CONFIG.LOCK_BEKLEME);
    
    if (!satirNo || satirNo < 2) {
      return { basarili: false, mesaj: "Geçersiz satır numarası" };
    }
    if (!yoneticiAdi || yoneticiAdi.toString().trim() === "") {
      return { basarili: false, mesaj: "Yönetici adı boş olamaz" };
    }
    if (!gerekce || gerekce.toString().trim().length < 5) {
      return { basarili: false, mesaj: "Red gerekçesi en az 5 karakter olmalı" };
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET.SAHA_BILDIRIMLERI);
    if (!sheet) return { basarili: false, mesaj: "Saha Bildirimleri sayfası bulunamadı" };
    
    const headerMap = getHeaderMap(sheet);
    const onayCol = headerMap["31. Yönetici Onay Durumu"];
    const onaylayanCol = headerMap["32. Onaylayan Yönetici"];
    const gerekceCol = headerMap["33. Red Gerekçesi"];
    const plakaCol = headerMap["3. Araç Plakası"];
    const kategoriCol = headerMap["4. İşlem Kategorisi"];
    const zamanCol = headerMap["1. İşlem Zamanı"];
    
    if (onayCol === undefined || onaylayanCol === undefined) {
      return { basarili: false, mesaj: "Onay sütunları bulunamadı" };
    }
    
    // Ana havuza yaz
    sheet.getRange(satirNo, onayCol + 1).setValue("Reddedildi");
    sheet.getRange(satirNo, onaylayanCol + 1).setValue(yoneticiAdi);
    if (gerekceCol !== undefined) {
      sheet.getRange(satirNo, gerekceCol + 1).setValue(gerekce.toString().trim());
    }
    
    // Alt sayfaya yansıt (çift kasa)
    const row = sheet.getRange(satirNo, 1, 1, sheet.getLastColumn()).getValues()[0];
    const plaka = row[plakaCol];
    const kategori = row[kategoriCol];
    const zaman = row[zamanCol];
    const bildiren = row[headerMap["2. Bildiren Kullanıcı"]] || "";
    const gerekceTemiz = gerekce.toString().trim();
    altSayfayaOnayYansit(ss, kategori, plaka, zaman, "Reddedildi", yoneticiAdi, gerekceTemiz);
    
    // AŞAMA 1.6: Onay Geçmişi'ne log
    onayGecmisineYaz(yoneticiAdi, "Reddedildi", plaka, kategori, bildiren, zaman, gerekceTemiz);
    
    logYaz("BİLGİ", "onayReddet", "Satır " + satirNo + " reddedildi: " + yoneticiAdi + " - " + gerekce);
    
    return { basarili: true };
    
  } catch (e) {
    logYaz("HATA", "onayReddet", e.message);
    return { basarili: false, mesaj: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Onay/Red kararını ilgili alt sayfaya yansıtır (çift kasa).
 * Plaka + Zaman eşleşmesiyle satırı bulur.
 * Onay sütunu olmayan KM sayfası atlanır.
 */
function altSayfayaOnayYansit(ss, kategori, plaka, zaman, durum, yoneticiAdi, gerekce) {
  try {
    if (!kategori || !plaka) return;
    
    const katUpper = kategori.toString().toUpperCase();
    let sayfaAdi = "";
    
    if (katUpper.indexOf("ZİMMET") !== -1) sayfaAdi = CONFIG.SHEET.ZIMMET;
    else if (katUpper.indexOf("GEÇİCİ") !== -1) sayfaAdi = CONFIG.SHEET.GECICI;
    else if (katUpper.indexOf("KAZA") !== -1 || katUpper.indexOf("HASAR") !== -1) sayfaAdi = CONFIG.SHEET.KAZA;
    else if (katUpper.indexOf("SERVİS") !== -1) sayfaAdi = CONFIG.SHEET.SERVIS;
    else if (katUpper.indexOf("ENVANTER") !== -1) sayfaAdi = CONFIG.SHEET.ENVANTER;
    else if (katUpper.indexOf("PERİYODİK") !== -1) sayfaAdi = CONFIG.SHEET.PERIYODIK;
    else if (katUpper.indexOf("GİYDİRME") !== -1) sayfaAdi = CONFIG.SHEET.GIYDIRME;
    else return; // KM ve diğerleri atla
    
    const sheet = ss.getSheetByName(sayfaAdi);
    if (!sheet || sheet.getLastRow() < 2) return;
    
    const headerMap = getHeaderMap(sheet);
    const plakaCol = headerMap["Plaka"] !== undefined ? headerMap["Plaka"] : 
                     (headerMap["PLAKA"] !== undefined ? headerMap["PLAKA"] : headerMap["Plakalar"]);
    
    // Tarih sütunu — farklı isimler olabilir
    let tarihCol = headerMap["Tarih"];
    if (tarihCol === undefined) tarihCol = headerMap["Tarih / Saat"];
    if (tarihCol === undefined) tarihCol = headerMap["TARİH"];
    if (tarihCol === undefined) tarihCol = headerMap["Son Kontrol Tarihi"];
    if (tarihCol === undefined) tarihCol = headerMap["Olay Tarihi ve Saati"];
    if (tarihCol === undefined) tarihCol = headerMap["Servis Giriş Tarihi ve Saati"];
    
    // Onay sütunları
    const onayCol = headerMap["Yönetici Onay Durumu"] !== undefined ? headerMap["Yönetici Onay Durumu"] : headerMap["Yönetici Onayı"];
    const gerekceCol = headerMap["Red Gerekçesi"];
    
    if (plakaCol === undefined || onayCol === undefined) {
      logYaz("UYARI", "altSayfayaOnayYansit", sayfaAdi + " sayfasında plaka/onay sütunu eksik");
      return;
    }
    
    // Plaka + (varsa) tarih eşleşmesiyle son satırı bul
    const data = sheet.getDataRange().getValues();
    const aramaPlaka = plaka.toString().trim().toUpperCase();
    const aramaZamanMs = (zaman instanceof Date) ? zaman.getTime() : 0;
    
    let bulunanSatir = -1;
    let enYakinFark = Number.MAX_SAFE_INTEGER;
    
    for (let i = data.length - 1; i >= 1; i--) {
      const p = (data[i][plakaCol] || "").toString().trim().toUpperCase();
      if (p !== aramaPlaka) continue;
      
      if (tarihCol !== undefined && aramaZamanMs > 0) {
        const t = data[i][tarihCol];
        if (t instanceof Date) {
          const fark = Math.abs(t.getTime() - aramaZamanMs);
          // 5 dakika içindeki en yakın eşleşme
          if (fark < 5 * 60 * 1000 && fark < enYakinFark) {
            enYakinFark = fark;
            bulunanSatir = i + 1;
          }
        }
      } else {
        // Tarih sütunu yoksa en son plaka eşleşmesini al
        bulunanSatir = i + 1;
        break;
      }
    }
    
    if (bulunanSatir === -1) {
      logYaz("UYARI", "altSayfayaOnayYansit", sayfaAdi + " sayfasında eşleşme bulunamadı: " + plaka);
      return;
    }
    
    // Yaz
    sheet.getRange(bulunanSatir, onayCol + 1).setValue(durum);
    if (gerekceCol !== undefined && gerekce) {
      sheet.getRange(bulunanSatir, gerekceCol + 1).setValue(gerekce);
    }
    
  } catch (e) {
    logYaz("HATA", "altSayfayaOnayYansit", e.message);
  }
}


// =======================================================================
// AŞAMA 1.6 — ONAY GEÇMİŞİ LOG
// =======================================================================

// Onay Geçmişi sayfası başlıkları
const ONAY_GECMISI_BASLIKLAR = [
  "İşlem Zamanı",
  "Yönetici",
  "Karar",
  "Plaka",
  "Kategori",
  "Bildiren Kullanıcı",
  "Orijinal Bildirim Zamanı",
  "Red Gerekçesi"
];

/**
 * Onay/red işlemini "Onay Geçmişi" sayfasına yazar.
 * onayVer ve onayReddet fonksiyonlarından çağrılır.
 */
function onayGecmisineYaz(yoneticiAdi, karar, plaka, kategori, bildiren, orijinalZaman, gerekce) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET.ONAY_GECMISI);
    
    // Sayfa yoksa oluştur
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET.ONAY_GECMISI);
    }
    sheetBaslikKur(sheet, ONAY_GECMISI_BASLIKLAR);
    
    // Karar rengine göre satır renklendirme
    const yeniSatir = [
      new Date(),
      yoneticiAdi || "",
      karar || "",
      plaka || "",
      kategori || "",
      bildiren || "",
      orijinalZaman || "",
      gerekce || ""
    ];
    
    sheet.appendRow(yeniSatir);
    
    // Yeni satırı renklendir (yeşil=onay, kırmızı=red)
    const sonSatir = sheet.getLastRow();
    const renk = (karar === "Onaylandı") ? "#dcfce7" : "#fee2e2";
    sheet.getRange(sonSatir, 1, 1, ONAY_GECMISI_BASLIKLAR.length).setBackground(renk);
    
  } catch (e) {
    logYaz("HATA", "onayGecmisineYaz", e.message);
    // Log yazılamasa bile ana akış durmasın
  }
}

/**
 * Onay Geçmişi'nden son N kaydı getirir, filtre ve arama destekli.
 * @param {object} parametreler - {filtre: "tum"|"onay"|"red", arama: "", limit: 10}
 */
function onayGecmisiGetir(parametreler) {
  try {
    const params = parametreler || {};
    const filtre = (params.filtre || "tum").toLowerCase();
    const arama = (params.arama || "").toString().trim();
    const limit = parseInt(params.limit) || 10;
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET.ONAY_GECMISI);
    
    if (!sheet || sheet.getLastRow() < 2) {
      return { basarili: true, liste: [], toplam: 0 };
    }
    
    const headerMap = getHeaderMap(sheet);
    const data = sheet.getDataRange().getValues();
    
    const idxZaman = headerMap["İşlem Zamanı"];
    const idxYonetici = headerMap["Yönetici"];
    const idxKarar = headerMap["Karar"];
    const idxPlaka = headerMap["Plaka"];
    const idxKategori = headerMap["Kategori"];
    const idxBildiren = headerMap["Bildiren Kullanıcı"];
    const idxOrijZaman = headerMap["Orijinal Bildirim Zamanı"];
    const idxGerekce = headerMap["Red Gerekçesi"];
    
    const liste = [];
    const aramaNormal = arama ? metinNormallestir(arama) : "";
    
    // Sondan başa tara (en yeni en üstte)
    for (let i = data.length - 1; i >= 1; i--) {
      const row = data[i];
      const karar = (row[idxKarar] || "").toString();
      
      // Filtre kontrolü
      if (filtre === "onay" && karar !== "Onaylandı") continue;
      if (filtre === "red" && karar !== "Reddedildi") continue;
      
      // Arama kontrolü (plaka, yönetici, bildiren)
      if (aramaNormal) {
        const plaka = (row[idxPlaka] || "").toString();
        const yonetici = (row[idxYonetici] || "").toString();
        const bildiren = (row[idxBildiren] || "").toString();
        
        if (!metinIceriyorMu(plaka, arama) && 
            !metinIceriyorMu(yonetici, arama) && 
            !metinIceriyorMu(bildiren, arama)) {
          continue;
        }
      }
      
      // Zaman formatla
      const zamanObj = new Date(row[idxZaman]);
      const tarih = !isNaN(zamanObj) ? Utilities.formatDate(zamanObj, "Europe/Istanbul", "dd.MM.yyyy") : "";
      const saat = !isNaN(zamanObj) ? Utilities.formatDate(zamanObj, "Europe/Istanbul", "HH:mm") : "";
      
      liste.push({
        tarih: tarih,
        saat: saat,
        yonetici: row[idxYonetici] || "",
        karar: karar,
        plaka: row[idxPlaka] || "",
        kategori: row[idxKategori] || "",
        bildiren: row[idxBildiren] || "",
        gerekce: row[idxGerekce] || ""
      });
      
      if (liste.length >= limit) break;
    }
    
    return { basarili: true, liste: liste, toplam: liste.length };
    
  } catch (e) {
    logYaz("HATA", "onayGecmisiGetir", e.message);
    return { basarili: false, mesaj: e.message, liste: [] };
  }
}


// =======================================================================
// AŞAMA 1.7 — DETAY RAPORLAR
// =======================================================================

/**
 * Generic detay rapor fonksiyonu. 7 modülü tek noktadan besler.
 */
function detayRaporGetir(params) {
  try {
    const p = params || {};
    const modul = p.modul || "";
    const filtre = (p.filtre || "tumu").toLowerCase();
    const arama = (p.arama || "").toString().trim();
    const sayfa = Math.max(1, parseInt(p.sayfa) || 1);
    const sayfaBoyutu = parseInt(p.sayfaBoyutu) || 20;
    
    const sayfaMap = {
      "Zimmet İşlemleri": CONFIG.SHEET.ZIMMET,
      "Geçici Kullanım": CONFIG.SHEET.GECICI,
      "Kaza/Hasar": CONFIG.SHEET.KAZA,
      "Servis Kayıt": CONFIG.SHEET.SERVIS,
      "Envanter": CONFIG.SHEET.ENVANTER,
      "Periyodik Kontrol": CONFIG.SHEET.PERIYODIK,
      "Km Bilgisi": CONFIG.SHEET.KM
    };
    
    const sayfaAdi = sayfaMap[modul];
    if (!sayfaAdi) {
      return { basarili: false, mesaj: "Bilinmeyen modül: " + modul, liste: [] };
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sayfaAdi);
    if (!sheet || sheet.getLastRow() < 2) {
      return { basarili: true, liste: [], toplamKayit: 0, toplamSayfa: 0, mevcutSayfa: sayfa };
    }
    
    const headerMap = getHeaderMap(sheet);
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    
    // Plaka — esnek arama
    let plakaIdx = headerMap["Plaka"];
    if (plakaIdx === undefined) plakaIdx = headerMap["PLAKA"];
    if (plakaIdx === undefined) plakaIdx = headerMap["Plakalar"];
    
    // Tarih — modüle göre farklı isimler
    let tarihIdx = headerMap["Tarih"];
    if (tarihIdx === undefined) tarihIdx = headerMap["TARİH"];
    if (tarihIdx === undefined) tarihIdx = headerMap["Tarih / Saat"];
    if (tarihIdx === undefined) tarihIdx = headerMap["Son Kontrol Tarihi"];
    if (tarihIdx === undefined) tarihIdx = headerMap["Olay Tarihi ve Saati"];
    if (tarihIdx === undefined) tarihIdx = headerMap["Servis Giriş Tarihi ve Saati"];
    if (tarihIdx === undefined) tarihIdx = headerMap["Bildirim Tarihi"];
    
    // Onay
    let onayIdx = headerMap["Yönetici Onay Durumu"];
    if (onayIdx === undefined) onayIdx = headerMap["Yönetici Onayı"];
    
    // Kullanıcı
    let kullaniciIdx = headerMap["Bildiren Kullanıcı"];
    if (kullaniciIdx === undefined) kullaniciIdx = headerMap["BİLDİREN KULLANICI"];
    if (kullaniciIdx === undefined) kullaniciIdx = headerMap["Kullanan Şoför"];
    
    const tumKayitlar = [];
    
    for (let i = data.length - 1; i >= 0; i--) {
      const row = data[i];
      const plaka = (plakaIdx !== undefined ? row[plakaIdx] : "").toString().trim();
      
      if (!plaka) continue;
      
const onayDurumu = onayIdx !== undefined ? (row[onayIdx] || "").toString() : "";
      if (filtre === "onayli" && onayDurumu !== "Onaylandı") continue;
      if (filtre === "reddedildi" && onayDurumu !== "Reddedildi") continue;
      if (filtre === "bekleyen" && onayDurumu !== "" && onayDurumu !== "Bekliyor") continue;
      
      // AŞAMA 1.7 YENİ — Bu ay filtresi
      if (filtre === "buay") {
        const tObj = tarihIdx !== undefined ? row[tarihIdx] : null;
        const aySimdi = new Date();
        const buAyBas = new Date(aySimdi.getFullYear(), aySimdi.getMonth(), 1).getTime();
        if (!(tObj instanceof Date) || tObj.getTime() < buAyBas) continue;
      }      if (filtre === "onayli" && onayDurumu !== "Onaylandı") continue;
      if (filtre === "reddedildi" && onayDurumu !== "Reddedildi") continue;
      if (filtre === "bekleyen" && onayDurumu !== "" && onayDurumu !== "Bekliyor") continue;
      
      if (arama) {
        const kullanici = kullaniciIdx !== undefined ? (row[kullaniciIdx] || "").toString() : "";
        if (!metinIceriyorMu(plaka, arama) && !metinIceriyorMu(kullanici, arama)) continue;
      }
      
      const tarihObj = tarihIdx !== undefined ? row[tarihIdx] : null;
      const tarih = (tarihObj instanceof Date) ? 
        Utilities.formatDate(tarihObj, "Europe/Istanbul", "dd.MM.yyyy") : "";
      const saat = (tarihObj instanceof Date) ? 
        Utilities.formatDate(tarihObj, "Europe/Istanbul", "HH:mm") : "";
      const tarihMs = (tarihObj instanceof Date) ? tarihObj.getTime() : 0;
      
      const kart = {
        plaka: plaka,
        kullanici: kullaniciIdx !== undefined ? (row[kullaniciIdx] || "") : "",
        tarih: tarih,
        saat: saat,
        tarihMs: tarihMs,
        onayDurumu: onayDurumu || "Bekliyor",
        detaylar: detayKartiAlanlar(modul, headerMap, row)
      };
      
      tumKayitlar.push(kart);
    }
    
    tumKayitlar.sort(function(a, b) { return b.tarihMs - a.tarihMs; });
    
    const toplamKayit = tumKayitlar.length;
    const toplamSayfa = Math.max(1, Math.ceil(toplamKayit / sayfaBoyutu));
    const baslangic = (sayfa - 1) * sayfaBoyutu;
    const liste = tumKayitlar.slice(baslangic, baslangic + sayfaBoyutu);
    
    liste.forEach(function(k) { delete k.tarihMs; });
    
    // AŞAMA 1.7 YENİ — İstatistikleri hesapla (5 sayı)
    const istatistik = {
      toplam: 0,
      buAy: 0,
      bekleyen: 0,
      onayli: 0,
      reddedildi: 0
    };
    
    const simdi = new Date();
    const buAyBaslangic = new Date(simdi.getFullYear(), simdi.getMonth(), 1).getTime();
    
    // Tüm satırları döngüye al (istatistikler filtreden bağımsız)
    for (let j = 0; j < data.length; j++) {
      const r = data[j];
      const p = (plakaIdx !== undefined ? r[plakaIdx] : "").toString().trim();
      if (!p) continue;
      
      istatistik.toplam++;
      
      // Onay sayıları
      const od = onayIdx !== undefined ? (r[onayIdx] || "").toString() : "";
      if (od === "Onaylandı") istatistik.onayli++;
      else if (od === "Reddedildi") istatistik.reddedildi++;
      else istatistik.bekleyen++; // Boş, "Bekliyor" → bekleyen
      
      // Bu ay
      const tObj = tarihIdx !== undefined ? r[tarihIdx] : null;
      if (tObj instanceof Date && tObj.getTime() >= buAyBaslangic) {
        istatistik.buAy++;
      }
    }
    
    return {
      basarili: true,
      modul: modul,
      liste: liste,
      toplamKayit: toplamKayit,
      toplamSayfa: toplamSayfa,
      mevcutSayfa: sayfa,
      sayfaBoyutu: sayfaBoyutu,
      istatistik: istatistik
    };
    
  } catch (e) {
    logYaz("HATA", "detayRaporGetir", e.message);
    return { basarili: false, mesaj: e.message, liste: [] };
  }
}

/**
 * AŞAMA B1 — GÜNLÜK ARAÇ DURUMU
 * "Araç Günlük Bilgiler" sayfasından "Araç Çalışma Durumu" sütununu okur,
 * akıllı gruplama yapar: ana durum + bölge.
 * 
 * Dinamik: Yeni durum/bölge gelirse otomatik DİĞER kategorisine düşer.
 * Config-driven: DURUM_KONFIG ve BOLGE_KONFIG ile yönetilir.
 * 
 * Döner: {
 *   basarili: true,
 *   toplamArac: 79,
 *   durumlar: [
 *     { ad: "SAHADA", ikon: "🚐", toplam: 17, avrupa: 9, anadolu: 8, genel: 0 },
 *     { ad: "SERVİSTE", ikon: "🔧", toplam: 3, avrupa: 2, anadolu: 1, genel: 0 },
 *     ...
 *   ],
 *   sonGuncelleme: "18.05.2026 14:30"
 * }
 */
function gunlukDurumGetir() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Araç Günlük Bilgiler");
    
    if (!sheet) {
      return { basarili: false, mesaj: "Sayfa bulunamadı: Araç Günlük Bilgiler" };
    }
    
    if (sheet.getLastRow() < 2) {
      return { basarili: true, toplamArac: 0, durumlar: [], sonGuncelleme: "" };
    }
    
    // Header'dan "Araç Çalışma Durumu" sütununu bul
    const headerMap = getHeaderMap(sheet);
    const durumIdx = headerMap["Araç Çalışma Durumu"];
    
    if (durumIdx === undefined) {
      return { basarili: false, mesaj: "Sütun bulunamadı: Araç Çalışma Durumu" };
    }
    
    // Tüm "Araç Çalışma Durumu" değerlerini oku
    const data = sheet.getRange(2, durumIdx + 1, sheet.getLastRow() - 1, 1).getValues();
    
    // === KONFIG: ANA KATEGORİLER (birleştirilir + bölge ayrımı yapılır) ===
    // Bu listedekiler "ana grup" sayılır, AVR/AND ek satırı altta gösterilir.
    const ANA_KATEGORI = [
      { ad: "SAHADA",     ikon: "🚐", sinif: "sahada",  anahtarlar: ["HALKSUT", "HALKSÜT", "HALK SUT", "HALK SÜT", "SAHADA"] },
      { ad: "SERVİSTE",   ikon: "🔧", sinif: "servis",  anahtarlar: ["SERVIS", "SERVİS"] },
      { ad: "BOŞTA",      ikon: "🛑", sinif: "bosta",   anahtarlar: ["BOSTA", "BOŞTA"] },
      { ad: "DIŞ GÖREV",  ikon: "🌍", sinif: "dis",     anahtarlar: ["DIS GOREV", "DIŞ GÖREV", "DIS GÖREV", "DIŞ GOREV"] },
      { ad: "MUAYENE",    ikon: "📋", sinif: "muayene", anahtarlar: ["MUAYENE"] },
      { ad: "GÖREVLİ",    ikon: "🏢", sinif: "gorevli", anahtarlar: ["GOREVLI", "GÖREVLİ"] }
    ];
    
    // === KONFIG: ÖZEL ETIKETLER (birebir gösterilir, bölge ayrımı YOK) ===
    const OZEL_ETIKET = [
      { anahtar: "KURUM İÇİ",     ikon: "🏛️", sinif: "kurum"   },
      { anahtar: "KURUM ICI",     ikon: "🏛️", sinif: "kurum"   },
      { anahtar: "RAMAZAN",       ikon: "🎁", sinif: "ramazan" },
      { anahtar: "KART DAĞITIM",  ikon: "💳", sinif: "kart"    },
      { anahtar: "KART DAGITIM",  ikon: "💳", sinif: "kart"    }
    ];
    
    // === KONFIG: BÖLGE TANIMI ===
    const BOLGE_ANAHTAR = [
      { bolge: "avr", anahtarlar: ["AVRUPA", "AVR."] },
      { bolge: "and", anahtarlar: ["ANADOLU", "ANA.", "AND."] }
    ];
    
    /**
     * Bir değerin hangi ana kategoriye ait olduğunu bulur.
     */
    function anaKategoriBul(dgrUst) {
      for (let i = 0; i < ANA_KATEGORI.length; i++) {
        const k = ANA_KATEGORI[i];
        for (let j = 0; j < k.anahtarlar.length; j++) {
          if (dgrUst.indexOf(k.anahtarlar[j]) !== -1) return k;
        }
      }
      return null;
    }
    
    /**
     * Bir değerin bölgesini bulur (avr / and / genel).
     */
    function bolgeBul(dgrUst) {
      for (let i = 0; i < BOLGE_ANAHTAR.length; i++) {
        const b = BOLGE_ANAHTAR[i];
        for (let j = 0; j < b.anahtarlar.length; j++) {
          if (dgrUst.indexOf(b.anahtarlar[j]) !== -1) return b.bolge;
        }
      }
      return "genel";
    }
    
    /**
     * Özel etiket eşleşmesi (ramazan, kart, kurum).
     */
    function ozelEtiketBul(dgrUst) {
      for (let i = 0; i < OZEL_ETIKET.length; i++) {
        if (dgrUst.indexOf(OZEL_ETIKET[i].anahtar) !== -1) return OZEL_ETIKET[i];
      }
      return null;
    }
    
    // Sayım nesnesi
    const sayim = {};
    
    // Her satırı işle
    data.forEach(function(row) {
      const ham = (row[0] || "").toString().trim();
      if (!ham) return;
      
      const dgrUst = ham.toLocaleUpperCase("tr-TR");
      
      // 1) ANA KATEGORİ mi? (birleştirme + bölge ayrımı)
      const anaKat = anaKategoriBul(dgrUst);
      if (anaKat) {
        if (!sayim[anaKat.ad]) {
          sayim[anaKat.ad] = {
            ad: anaKat.ad, ikon: anaKat.ikon, sinif: anaKat.sinif,
            toplam: 0, avr: 0, and: 0, genel: 0
          };
        }
        const bolge = bolgeBul(dgrUst);
        sayim[anaKat.ad].toplam++;
        sayim[anaKat.ad][bolge]++;
        return;
      }
      
      // 2) ÖZEL ETIKET mi? (birebir, bölge yok)
      const ozel = ozelEtiketBul(dgrUst);
      const ikonBilgi = ozel || { ikon: "📌", sinif: "diger" };
      
      // Birebir ad ile sayılır
      if (!sayim[ham]) {
        sayim[ham] = { ad: ham, ikon: ikonBilgi.ikon, sinif: ikonBilgi.sinif, toplam: 0 };
      }
      sayim[ham].toplam++;
    });
    
    // Sonucu sırayla dön: önce ana kategoriler (konfig sırası), sonra özel/diğer (alfabetik)
    const sonuc = [];
    ANA_KATEGORI.forEach(function(k) {
      if (sayim[k.ad]) sonuc.push(sayim[k.ad]);
    });
    const kalan = Object.keys(sayim)
      .filter(function(k) { return !ANA_KATEGORI.some(function(x) { return x.ad === k; }); })
      .sort()
      .map(function(k) { return sayim[k]; });
    kalan.forEach(function(x) { sonuc.push(x); });
    
    // Toplam araç sayısı
    const toplamArac = sonuc.reduce(function(s, x) { return s + x.toplam; }, 0);
    
    // Son güncelleme
    const simdi = new Date();
    const sonGuncelleme = Utilities.formatDate(simdi, "Europe/Istanbul", "dd.MM.yyyy HH:mm");
    
    return {
      basarili: true,
      toplamArac: toplamArac,
      durumlar: sonuc,
      sonGuncelleme: sonGuncelleme
    };
    
  } catch (e) {
    logYaz("HATA", "gunlukDurumGetir", e.message);
    return { basarili: false, mesaj: e.message };
  }
}

/**
 * Personel listesini döner.
 * Öncelik 1: Ayarlar sayfasında "Personel Listesi" sütunu varsa onu kullan
 * Öncelik 2: Yoksa "Personel Evrakları" sayfasından otomatik al
 */
function personelListesiGetir() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // ÖNCELIK 1: Ayarlar sayfası
    try {
      const ayarlar = getAyarlar();
      if (ayarlar && ayarlar["Personel Listesi"] && ayarlar["Personel Listesi"].length > 0) {
        return ayarlar["Personel Listesi"];
      }
    } catch (e) {
      // Ayarlar yüklenemedi, yedeğe geç
    }
    
    // ÖNCELIK 2: Personel Evrakları'ndan otomatik
    const sheet = ss.getSheetByName("Personel Evrakları");
    if (!sheet || sheet.getLastRow() < 2) return [];
    
    const headerMap = getHeaderMap(sheet);
    const idx = headerMap["Ad Soyad"];
    if (idx === undefined) return [];
    
    const data = sheet.getRange(2, idx + 1, sheet.getLastRow() - 1, 1).getValues();
    const liste = [];
    data.forEach(function(row) {
      const ad = (row[0] || "").toString().trim();
      if (ad && liste.indexOf(ad) === -1) liste.push(ad);
    });
    
    liste.sort();
    return liste;
    
  } catch (e) {
    logYaz("HATA", "personelListesiGetir", e.message);
    return [];
  }
}

/**
 * AŞAMA 1.7 PARÇA 2 — GENERIC SİCİL KARTI
 * Tip: "arac" → plaka bazlı | "personel" → kullanıcı bazlı
 * Tüm modüller + statik belge sayfaları taranır.
 */
function sicilKartiGetir(tip, deger) {
  try {
    if (!tip || !deger) return { basarili: false, mesaj: "Tip veya değer boş" };
    
    // === CACHE KONTROL (5 dakika) ===
    const cacheAnahtar = "sicil_" + tip + "_" + deger.toString().trim().toUpperCase();
    const cache = CacheService.getScriptCache();
    const cacheVeri = cache.get(cacheAnahtar);
    if (cacheVeri) {
      try { return JSON.parse(cacheVeri); } catch(e) { /* bozuksa devam et */ }
    }
    
    const degerNormal = deger.toString().trim().toUpperCase();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const SON_N = 3;
    
    // Araç ise künye al
    let kunye = null;
    if (tip === "arac") {
      kunye = getAracKunyesi(degerNormal);
    }
    /**
 * AŞAMA C1 — SİCİL AKILLI ÖZETİ
 * Sicil kartı için akıllı özet hesaplar.
 * 
 * @param {string} tip - "arac" veya "personel"
 * @param {string} deger - plaka veya ad soyad
 * @param {Array} bolumler - sicilKartiGetir'in topladığı bölümler
 * 
 * Döner:
 *  {
 *    belgeler: [
 *      { ad: "Muayene",  tarih: "12.08.2026", durum: "gecerli/yakin/gecti/yok", gunFark: 45 },
 *      ...
 *    ],
 *    trafik: { toplamCeza: 6, toplamTutar: 12500, odenmemisTutar: 4200, plakalar: ["34 ABC", "34 DEF"] },
 *    servis: { toplam: 8, enSikNeden: "Lastik", enSikSayi: 5 },
 *    envanter: { aktifEksik: ["Stepne", "Cihaz"] },
 *    km: { guncelKm: 124500, sonGuncelleme: "15.05.2026" }
 *  }
 */
function sicilOzetHesapla(tip, deger, bolumler) {
  const ozet = {};
  
  // === BELGELER (Tarih Bazlı Durum) ===
  try {
    ozet.belgeler = belgeDurumlariHesapla(tip, deger);
  } catch (e) {
    logYaz("HATA", "sicilOzetHesapla:belgeler", e.message);
    ozet.belgeler = [];
  }
  
  // === TRAFİK CEZALARI ===
  try {
    const trafikBolum = bolumler.find(function(b) { return b.modul === "Trafik Cezaları"; });
    ozet.trafik = trafikOzetHesapla(trafikBolum, tip);
  } catch (e) {
    logYaz("HATA", "sicilOzetHesapla:trafik", e.message);
    ozet.trafik = null;
  }
  
  // === SERVİS PERFORMANSI ===
  try {
    const servisBolum = bolumler.find(function(b) { return b.modul === "Servis Kayıt"; });
    ozet.servis = servisOzetHesapla(servisBolum);
  } catch (e) {
    logYaz("HATA", "sicilOzetHesapla:servis", e.message);
    ozet.servis = null;
  }
  
  // === ENVANTER AKTİF EKSİK ===
  try {
    const envanterBolum = bolumler.find(function(b) { return b.modul === "Envanter"; });
    ozet.envanter = envanterOzetHesapla(envanterBolum);
  } catch (e) {
    logYaz("HATA", "sicilOzetHesapla:envanter", e.message);
    ozet.envanter = null;
  }
  
  // === KM BİLGİSİ (sadece araç) ===
  if (tip === "arac") {
    try {
      const kmBolum = bolumler.find(function(b) { return b.modul === "Km Bilgisi"; });
      ozet.km = kmOzetHesapla(kmBolum);
    } catch (e) {
      logYaz("HATA", "sicilOzetHesapla:km", e.message);
      ozet.km = null;
    }
  }
  
  return ozet;
}


/**
 * Belge durumlarını hesaplar (tarih analizi + renk ikonu).
 */
function belgeDurumlariHesapla(tip, deger) {
  // Belge konfig — tip bazlı
  const KONFIG_ARAC = [
    { ad: "Muayene",  sayfa: "Bakım Genel",        keySutun: "Plaka",   tarihSutun: "Muayene Bitiş Tarihi" },
    { ad: "Sigorta",  sayfa: "Bakım Genel",        keySutun: "Plaka",   tarihSutun: "Trafik Sigortası Bitiş Tarihi" },
    { ad: "Egzoz",    sayfa: "Bakım Genel",        keySutun: "Plaka",   tarihSutun: "Egzoz Emisyon Bitiş Tarihi" },
    { ad: "Kasko",    sayfa: "Bakım Genel",        keySutun: "Plaka",   tarihSutun: "Kasko Bitiş Tarihi" }
  ];
  
  const KONFIG_PERSONEL = [
    { ad: "Ehliyet",     sayfa: "Personel Evrakları", keySutun: "Ad Soyad", tarihSutun: "Ehliyet Bitiş Tarihi" },
    { ad: "Psikoteknik", sayfa: "Personel Evrakları", keySutun: "Ad Soyad", tarihSutun: "Psikoteknik Bitiş Tarihi" },
    { ad: "SRC",         sayfa: "Personel Evrakları", keySutun: "Ad Soyad", tarihSutun: "Src Yeterlilik Durumu", tipi: "metin" }
  ];
  
  const konfig = (tip === "arac") ? KONFIG_ARAC : KONFIG_PERSONEL;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sonuc = [];
  
  konfig.forEach(function(k) {
    try {
      const sheet = ss.getSheetByName(k.sayfa);
      if (!sheet || sheet.getLastRow() < 2) return;
      
      const headerMap = getHeaderMap(sheet);
      const keyIdx = headerMap[k.keySutun];
      const tarihIdx = headerMap[k.tarihSutun];
      if (keyIdx === undefined || tarihIdx === undefined) return;
      
      // İlgili satırı bul
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
      const degerNormal = deger.toString().trim().toLocaleUpperCase("tr-TR");
      
      let bulunan = null;
      for (let i = 0; i < data.length; i++) {
        const hucre = (data[i][keyIdx] || "").toString().trim().toLocaleUpperCase("tr-TR");
        if (hucre === degerNormal) {
          bulunan = data[i][tarihIdx];
          break;
        }
      }
      
      if (!bulunan) {
        sonuc.push({ ad: k.ad, tarih: "", durum: "yok", gunFark: null });
        return;
      }
      
      // METİN TİPİ (tarih değil, durum metni — örn. SRC "TAM/EKSİK")
      if (k.tipi === "metin") {
        const metin = bulunan.toString().trim();
        let durumMetin = "yok";
        const metinUst = metin.toLocaleUpperCase("tr-TR");
        if (metinUst === "TAM" || metinUst === "VAR" || metinUst === "GEÇERLİ") {
          durumMetin = "gecerli";
        } else if (metinUst === "EKSİK" || metinUst === "YOK" || metinUst === "GEÇTİ") {
          durumMetin = "gecti";
        } else if (metin) {
          durumMetin = "gecerli"; // başka bir değer varsa olumlu say
        }
        sonuc.push({ ad: k.ad, tarih: metin, durum: durumMetin, gunFark: null, tipi: "metin" });
        return;
      }
      
      // TARİH ANALİZ
      const tarihStr = formatTarih(bulunan);
      const gunFark = gunFarkHesapla(bulunan);
      
      let durum = "gecerli";
      if (gunFark === null)      durum = "yok";
      else if (gunFark < 0)      durum = "gecti";
      else if (gunFark <= 30)    durum = "yakin";
      
      sonuc.push({ ad: k.ad, tarih: tarihStr, durum: durum, gunFark: gunFark, tipi: "tarih" });
      
    } catch (e) {
      logYaz("HATA", "belgeDurumlariHesapla:" + k.ad, e.message);
    }
  });
  
  return sonuc;
}


/**
 * Trafik cezaları özetini hesaplar.
 */
function trafikOzetHesapla(trafikBolum, tip) {
  if (!trafikBolum || !trafikBolum.kayitlar || trafikBolum.kayitlar.length === 0) {
    return null;
  }
  
  let toplamTutar = 0;
  let odenmemisTutar = 0;
  const plakalar = {};
  
  trafikBolum.kayitlar.forEach(function(k) {
    if (!k.detaylar) return;
    
    let tutar = 0;
    let odenmemis = false;
    let plaka = "";
    
    k.detaylar.forEach(function(d) {
      // Tutar
      if ((d.label === "Güncel Tutar" || d.label === "Tutar") && tutar === 0) {
        const sayi = parseFloat(d.deger.toString().replace(/[^\d,.]/g, "").replace(",", "."));
        if (!isNaN(sayi)) tutar = sayi;
      }
      // Ödeme durumu
      if (d.label === "Ödeme") {
        const dgr = d.deger.toString();
        if (metinIceriyorMu(dgr, "Ödenmemiş") || metinIceriyorMu(dgr, "Beklemede")) {
          odenmemis = true;
        }
      }
      // Plaka (personel için "Plaka", araç için zaten plaka)
      if (d.label === "Plaka" && d.deger) {
        plaka = d.deger.toString().trim();
      }
    });
    
    toplamTutar += tutar;
    if (odenmemis) odenmemisTutar += tutar;
    if (plaka) plakalar[plaka] = (plakalar[plaka] || 0) + 1;
  });
  
  return {
    toplamCeza: trafikBolum.kayitlar.length,
    toplamTutar: toplamTutar,
    odenmemisTutar: odenmemisTutar,
    plakalar: Object.keys(plakalar).sort()
  };
}


/**
 * Servis özetini hesaplar (en sık neden).
 */
function servisOzetHesapla(servisBolum) {
  if (!servisBolum || !servisBolum.kayitlar || servisBolum.kayitlar.length === 0) {
    return null;
  }
  
  const nedenSayim = {};
  const gidisSayim = {};
  
  servisBolum.kayitlar.forEach(function(k) {
    if (!k.detaylar) return;
    k.detaylar.forEach(function(d) {
      if (!d.label) return;
      const lblNorm = metinNormalize(d.label);
      const dgr = (d.deger || "").toString().trim();
      if (!dgr) return;
      
      if (lblNorm === metinNormalize("Servis Nedeni")) {
        nedenSayim[dgr] = (nedenSayim[dgr] || 0) + 1;
      }
      if (lblNorm === metinNormalize("Gidiş Şekli")) {
        gidisSayim[dgr] = (gidisSayim[dgr] || 0) + 1;
      }
    });
  });
  
  function enSikBul(say) {
    let ad = "", sayi = 0;
    Object.keys(say).forEach(function(n) {
      if (say[n] > sayi) { sayi = say[n]; ad = n; }
    });
    return { ad: ad, sayi: sayi };
  }
  
  const enNeden = enSikBul(nedenSayim);
  const enGidis = enSikBul(gidisSayim);
  
  return {
    toplam: servisBolum.kayitlar.length,
    enSikNeden: enNeden.ad,
    enSikNedenSayi: enNeden.sayi,
    enSikGidis: enGidis.ad,
    enSikGidisSayi: enGidis.sayi
  };
}

/**
 * Envanter aktif eksiklerini AKILLI hesaplar.
 * - Eksik Bildirimi → kalemler aktif sete eklenir
 * - Temin Bildirimi → kalemler aktif setten çıkarılır
 * - Sadece ONAYLANMIŞ kayıtlar işlenir
 * - Tarihe göre eskiden yeniye sıralanır
 /**
 * Envanter sayım özetini hesaplar (basit mod).
 * AŞAMA F'de saha modülü düzeltilince akıllı eşleştirme yapılacak.
 */
function envanterOzetHesapla(envanterBolum) {
  if (!envanterBolum || !envanterBolum.kayitlar || envanterBolum.kayitlar.length === 0) {
    return null;
  }
  
  const sonTarih = envanterBolum.kayitlar[0].tarih || "";
  
  return {
    toplamBildirim: envanterBolum.kayitlar.length,
    sonBildirim: sonTarih
  };
}


/**
 * KM özetini hesaplar (sadece araç).
 * KM Bilgisi sayfası aylık matris yapısı:
 * "Ocak 2026", "Şubat 2026", ..., "Aralık 2026" sütunları.
 * En son dolu ayın değerini "Güncel KM" olarak döner.
 */
function kmOzetHesapla(kmBolum) {
  if (!kmBolum || !kmBolum.kayitlar || kmBolum.kayitlar.length === 0) {
    return null;
  }
  
  const kayit = kmBolum.kayitlar[0];
  if (!kayit || !kayit.detaylar || kayit.detaylar.length === 0) return null;
  
  // Aylık sütunları sırala — en son dolu ayı bul
  const AY_SIRALI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
                     "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  
  let guncelKm = 0;
  let sonAy = "";
  
  // AY_INGILIZCE: Date objesi başlığa dönüşmüşse "Jan", "Feb", ... arayalım
  const AY_INGILIZCE = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  for (let i = AY_SIRALI.length - 1; i >= 0; i--) {
    const ay = AY_SIRALI[i].toLocaleUpperCase("tr-TR");
    const ayIng = AY_INGILIZCE[i].toUpperCase();
    const bulunan = kayit.detaylar.find(function(d) {
      if (!d.label) return false;
      const lbl = d.label.toString().toLocaleUpperCase("tr-TR");
      return lbl.indexOf(ay) !== -1 || lbl.indexOf(ayIng) !== -1;
    });
    if (bulunan && bulunan.deger) {
      const sayi = parseFloat(bulunan.deger.toString().replace(/[^\d]/g, ""));
      if (!isNaN(sayi) && sayi > 0) {
        guncelKm = sayi;
        sonAy = bulunan.label;
        break;
      }
    }
  }
  
  if (guncelKm === 0) return null;
  
  return {
    guncelKm: guncelKm,
    sonAy: sonAy
  };
}


/**
 * Tarih formatlayıcı (Date veya string -> "dd.MM.yyyy")
 */
function formatTarih(deger) {
  if (!deger) return "";
  try {
    const t = (deger instanceof Date) ? deger : new Date(deger);
    if (isNaN(t.getTime())) return deger.toString();
    return Utilities.formatDate(t, "Europe/Istanbul", "dd.MM.yyyy");
  } catch (e) {
    return deger.toString();
  }
}


/**
 * Tarih ile bugün arası gün farkı (eksi = geçti).
 */
function gunFarkHesapla(tarih) {
  if (!tarih) return null;
  try {
    const t = (tarih instanceof Date) ? tarih : new Date(tarih);
    if (isNaN(t.getTime())) return null;
    const bugun = new Date();
    bugun.setHours(0, 0, 0, 0);
    t.setHours(0, 0, 0, 0);
    return Math.floor((t - bugun) / (24 * 60 * 60 * 1000));
  } catch (e) {
    return null;
  }
}
    
    // === KAYNAK SAYFALAR ===
    // type: "modul" → 7 sürekli modül | "statik" → belge sayfası
    const kaynaklar = [
      { ad: "Zimmet İşlemleri",  ikon: "📋", sayfa: CONFIG.SHEET.ZIMMET,    type: "modul", araclar: true, personeller: true },
      { ad: "Geçici Kullanım",   ikon: "🔄", sayfa: CONFIG.SHEET.GECICI,    type: "modul", araclar: true, personeller: true },
      { ad: "Kaza/Hasar",        ikon: "🚨", sayfa: CONFIG.SHEET.KAZA,      type: "modul", araclar: true, personeller: true },
      { ad: "Servis Kayıt",      ikon: "🔧", sayfa: CONFIG.SHEET.SERVIS,    type: "modul", araclar: true, personeller: true },
      { ad: "Envanter",          ikon: "📦", sayfa: CONFIG.SHEET.ENVANTER,  type: "modul", araclar: true, personeller: true },
      { ad: "Periyodik Kontrol", ikon: "🔍", sayfa: CONFIG.SHEET.PERIYODIK, type: "modul", araclar: true, personeller: false },
      { ad: "Km Bilgisi",        ikon: "⏲️", sayfa: CONFIG.SHEET.KM,        type: "modul", araclar: true, personeller: false },
      // Statik belge sayfaları
      { ad: "Trafik Cezaları",   ikon: "🚓", sayfa: "Trafik Cezaları",       type: "statik", araclar: true,  personeller: true,  filtreSutun: { arac: "Plaka", personel: "Kullanan Şoför" } },
      { ad: "Bakım Genel",       ikon: "🛠️", sayfa: "Bakım Genel",           type: "statik", araclar: true,  personeller: false, filtreSutun: { arac: "Plaka" } },
      { ad: "Araç Kayıt",        ikon: "📑", sayfa: "Araç Kayıt",            type: "statik", araclar: true,  personeller: false, filtreSutun: { arac: "Plaka" } },
      { ad: "Personel Evrakları",ikon: "🪪", sayfa: "Personel Evrakları",   type: "statik", araclar: false, personeller: true,  filtreSutun: { personel: "Ad Soyad" } }
    ];
    
    const bolumler = [];
    
    kaynaklar.forEach(function(k) {
      // Bu kaynak bu tip için geçerli mi?
      if (tip === "arac" && !k.araclar) return;
      if (tip === "personel" && !k.personeller) return;
      
      const sheet = ss.getSheetByName(k.sayfa);
      if (!sheet || sheet.getLastRow() < 2) {
        bolumler.push({ modul: k.ad, ikon: k.ikon, type: k.type, kayitlar: [], toplam: 0 });
        return;
      }
      
      const headerMap = getHeaderMap(sheet);
      
      // Filtre sütununu bul
      let filtreIdx;
      if (k.type === "modul") {
        // Modül sayfaları için plaka veya kullanıcı sütunu
        if (tip === "arac") {
          filtreIdx = headerMap["Plaka"];
          if (filtreIdx === undefined) filtreIdx = headerMap["PLAKA"];
          if (filtreIdx === undefined) filtreIdx = headerMap["Plakalar"];
        } else {
          filtreIdx = headerMap["Bildiren Kullanıcı"];
          if (filtreIdx === undefined) filtreIdx = headerMap["BİLDİREN KULLANICI"];
          if (filtreIdx === undefined) filtreIdx = headerMap["Kullanan Şoför"];
        }
      } else {
        // Statik sayfa için kaynaktan al
        const sutunAdi = k.filtreSutun && k.filtreSutun[tip];
        if (sutunAdi) filtreIdx = headerMap[sutunAdi];
      }
      
      if (filtreIdx === undefined) {
        bolumler.push({ modul: k.ad, ikon: k.ikon, type: k.type, kayitlar: [], toplam: 0 });
        return;
      }
      
      // Tarih sütunu (varsa)
      let tarihIdx = headerMap["Tarih"];
      if (tarihIdx === undefined) tarihIdx = headerMap["TARİH"];
      if (tarihIdx === undefined) tarihIdx = headerMap["Olay Tarihi ve Saati"];
      if (tarihIdx === undefined) tarihIdx = headerMap["Servis Giriş Tarihi ve Saati"];
      if (tarihIdx === undefined) tarihIdx = headerMap["Bildirim Tarihi"];
      if (tarihIdx === undefined) tarihIdx = headerMap["Tebliğ Tarihi"];
      if (tarihIdx === undefined) tarihIdx = headerMap["İşlem Tarihi"];
      
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
      
      // Filtreye uyan kayıtları topla
      const eslesenler = [];
      data.forEach(function(row) {
        const hucre = (row[filtreIdx] || "").toString().trim().toUpperCase();
        if (!hucre) return;
        if (hucre !== degerNormal) return;
        
        // AŞAMA F: tarih boşsa alternatif sütunları dene
        let tObj = tarihIdx !== undefined ? row[tarihIdx] : null;
        if (!(tObj instanceof Date)) {
          const altTarihler = ["Son Kontrol Tarihi", "Olay Tarihi ve Saati", "Servis Giriş Tarihi ve Saati", "Bildirim Tarihi", "Tarih / Saat", "TARİH", "Tarih"];
          for (let ai = 0; ai < altTarihler.length; ai++) {
            const altIdx = headerMap[altTarihler[ai]];
            if (altIdx !== undefined && row[altIdx] instanceof Date) {
              tObj = row[altIdx];
              break;
            }
          }
        }
        const tarih = (tObj instanceof Date) ? 
          Utilities.formatDate(tObj, "Europe/Istanbul", "dd.MM.yyyy") : "";
        const saat = (tObj instanceof Date) ? 
          Utilities.formatDate(tObj, "Europe/Istanbul", "HH:mm") : "";
        const tarihMs = (tObj instanceof Date) ? tObj.getTime() : 0;
        
        eslesenler.push({
          tarih: tarih,
          saat: saat,
          tarihMs: tarihMs,
          detaylar: sicilDetayAlanlar(k.ad, k.type, headerMap, row)
        });
      });
      
      // Yeniden eskiye sırala
      eslesenler.sort(function(a, b) { return b.tarihMs - a.tarihMs; });
      eslesenler.forEach(function(k2) { delete k2.tarihMs; });
      
      bolumler.push({
        modul: k.ad,
        ikon: k.ikon,
        type: k.type,
        kayitlar: eslesenler, // TÜMÜNÜ döner, frontend ilk 3 gösterir
        toplam: eslesenler.length
      });
    });
    
    // === AŞAMA C1: AKILLI ÖZET HESABI ===
    const ozet = sicilOzetHesapla(tip, degerNormal, bolumler);
    
    const sonuc = {
      basarili: true,
      tip: tip,
      deger: degerNormal,
      kunye: kunye,
      bolumler: bolumler,
      ozet: ozet
    };
    
    // === CACHE'E YAZ (5 dakika = 300 sn) ===
    try {
      cache.put(cacheAnahtar, JSON.stringify(sonuc), 300);
    } catch(e) { /* cache dolu olabilir, sessizce geç */ }
    
    return sonuc;
    
  } catch (e) {
    logYaz("HATA", "sicilKartiGetir", e.message);
    return { basarili: false, mesaj: e.message };
  }
}

/**
 * Sicil kartı için detay alanlarını döner.
 * Statik sayfalar için tüm sütunları gösterir.
 */
function sicilDetayAlanlar(modul, type, headerMap, row) {
  const detaylar = [];
  
  function ekle(label, sutunAdi) {
    const idx = headerMap[sutunAdi];
    if (idx !== undefined && row[idx]) {
      let deger = row[idx];
      if (deger instanceof Date) {
        deger = Utilities.formatDate(deger, "Europe/Istanbul", "dd.MM.yyyy");
      }
      const dStr = deger.toString().trim();
      if (dStr) detaylar.push({ label: label, deger: dStr });
    }
  }
  
  // === STATİK BELGE SAYFALARI ===
  if (type === "statik") {
    if (modul === "Trafik Cezaları") {
      ekle("Plaka", "Plaka");
      ekle("Tarih", "Tebliğ Tarihi");
      ekle("Tutar", "Ceza Tutarı");
      ekle("Güncel Tutar", "GÜNCEL TUTAR");
      ekle("Şoför", "Kullanan Şoför");
      ekle("Rücu", "Rücu Durumu");
      ekle("Ödeme", "Ödeme Durumu");
    } else if (modul === "Bakım Genel") {
      ekle("Güncel KM", "Güncel Km");
      ekle("Sonraki Bakım", "Sonraki Bakım Tarihi");
      ekle("Sonraki Bakım KM", "Sonraki Bakım KM Sınırı");
      ekle("Muayene Bitiş", "Muayene Bitiş Tarihi");
      ekle("Egzoz Bitiş", "Egzoz Emisyon Bitiş Tarihi");
      ekle("Trafik Sigortası", "Trafik Sigortası Bitiş Tarihi");
      ekle("Kasko Bitiş", "Kasko Bitiş Tarihi");
      ekle("Lastik", "Mevcut Lastik Durumu");
    } else if (modul === "Araç Kayıt") {
      ekle("İşlem Türü", "İŞLEM TÜRÜ");
      ekle("Nereden", "Nereden / Hangi Birimden Geldi?");
      ekle("Nereye", "Nereye / Hangi Birime Gitti?");
      ekle("Yapan", "İşlemi Yapan / Onaylayan");
      ekle("Not", "Açıklama / Not");
    } else if (modul === "Personel Evrakları") {
      ekle("Kadro/Birim", "Kadro / Birim");
      ekle("Ehliyet Sınıfı", "Ehliyet Sınıfı Ve Bitiş Tarihi");
      ekle("Ehliyet Bitiş", "Ehliyet Bitiş Tarihi");
      ekle("Psikoteknik", "Psikoteknik Durumu (Var/Yok)");
      ekle("Psikoteknik Bitiş", "Psikoteknik Bitiş Tarihi");
      ekle("SRC Sınıfı", "Src Sınıfı");
      ekle("SRC Yeterlilik", "Src Yeterlilik Durumu");
      ekle("Evrak Durumu", "Evrak Eksik/Pasif");
    }
    return detaylar;
  }
  
  // === MODÜL SAYFALARI (eski detayKartiAlanlar mantığı) ===
  return detayKartiAlanlar(modul, headerMap, row);
}

/**
 * AŞAMA 1.7 PARÇA 2 — Plaka bazlı çapraz görünüm.
 * Bir plakanın TÜM modüllerdeki son N kaydını döner.
 */
function aracKartiGetir(plaka) {
  try {
    if (!plaka) return { basarili: false, mesaj: "Plaka boş" };
    
    const plakaUpper = plaka.toString().trim().toUpperCase();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const SON_N = 3; // Her modülden son N kayıt
    
    // Önce araç künyesini al
    const kunye = getAracKunyesi(plakaUpper);
    
    // 7 modül için döngü
    const moduller = [
      { ad: "Zimmet İşlemleri",  ikon: "📋", sayfa: CONFIG.SHEET.ZIMMET },
      { ad: "Geçici Kullanım",   ikon: "🔄", sayfa: CONFIG.SHEET.GECICI },
      { ad: "Kaza/Hasar",        ikon: "🚨", sayfa: CONFIG.SHEET.KAZA },
      { ad: "Servis Kayıt",      ikon: "🔧", sayfa: CONFIG.SHEET.SERVIS },
      { ad: "Envanter",          ikon: "📦", sayfa: CONFIG.SHEET.ENVANTER },
      { ad: "Periyodik Kontrol", ikon: "🔍", sayfa: CONFIG.SHEET.PERIYODIK },
      { ad: "Km Bilgisi",        ikon: "⏲️", sayfa: CONFIG.SHEET.KM }
    ];
    
    const bolumler = [];
    
    moduller.forEach(function(mod) {
      const sheet = ss.getSheetByName(mod.sayfa);
      if (!sheet || sheet.getLastRow() < 2) {
        bolumler.push({ modul: mod.ad, ikon: mod.ikon, kayitlar: [], toplam: 0 });
        return;
      }
      
      const headerMap = getHeaderMap(sheet);
      
      // Plaka sütunu
      let plakaIdx = headerMap["Plaka"];
      if (plakaIdx === undefined) plakaIdx = headerMap["PLAKA"];
      if (plakaIdx === undefined) plakaIdx = headerMap["Plakalar"];
      if (plakaIdx === undefined) {
        bolumler.push({ modul: mod.ad, ikon: mod.ikon, kayitlar: [], toplam: 0 });
        return;
      }
      
      // Tarih sütunu
      let tarihIdx = headerMap["Tarih"];
      if (tarihIdx === undefined) tarihIdx = headerMap["TARİH"];
      if (tarihIdx === undefined) tarihIdx = headerMap["Olay Tarihi ve Saati"];
      if (tarihIdx === undefined) tarihIdx = headerMap["Servis Giriş Tarihi ve Saati"];
      if (tarihIdx === undefined) tarihIdx = headerMap["Bildirim Tarihi"];
      
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
      
      // Bu plakanın kayıtlarını topla
      const plakaKayitlari = [];
      data.forEach(function(row) {
        const p = (row[plakaIdx] || "").toString().trim().toUpperCase();
        if (p !== plakaUpper) return;
        
        const tObj = tarihIdx !== undefined ? row[tarihIdx] : null;
        const tarih = (tObj instanceof Date) ? 
          Utilities.formatDate(tObj, "Europe/Istanbul", "dd.MM.yyyy") : "";
        const saat = (tObj instanceof Date) ? 
          Utilities.formatDate(tObj, "Europe/Istanbul", "HH:mm") : "";
        const tarihMs = (tObj instanceof Date) ? tObj.getTime() : 0;
        
        plakaKayitlari.push({
          tarih: tarih,
          saat: saat,
          tarihMs: tarihMs,
          detaylar: detayKartiAlanlar(mod.ad, headerMap, row)
        });
      });
      
      // Yeniden eskiye sırala
      plakaKayitlari.sort(function(a, b) { return b.tarihMs - a.tarihMs; });
      
      // Son N
      const sonN = plakaKayitlari.slice(0, SON_N);
      sonN.forEach(function(k) { delete k.tarihMs; });
      
      bolumler.push({
        modul: mod.ad,
        ikon: mod.ikon,
        kayitlar: sonN,
        toplam: plakaKayitlari.length
      });
    });
    
    return {
      basarili: true,
      plaka: plakaUpper,
      kunye: kunye,
      bolumler: bolumler
    };
    
  } catch (e) {
    logYaz("HATA", "aracKartiGetir", e.message);
    return { basarili: false, mesaj: e.message };
  }
}

/**
 * Bir kayıt için modül-özel detay alanlarını döndürür.
 */
function detayKartiAlanlar(modul, headerMap, row) {
  const detaylar = [];
  
  function ekle(label, sutunAdi) {
    const idx = headerMap[sutunAdi];
    if (idx !== undefined && row[idx]) {
      let deger;
      if (row[idx] instanceof Date) {
        deger = Utilities.formatDate(row[idx], "Europe/Istanbul", "dd.MM.yyyy HH:mm");
      } else {
        deger = row[idx].toString().trim();
      }
      if (deger) detaylar.push({ label: label, deger: deger });
    }
  }
  
  if (modul === "Zimmet İşlemleri") {
    ekle("İşlem Türü", "İşlem Türü (Zimmet Alma / Zimmet Devri / Emanet Verme)");
    ekle("Teslim Eden", "Teslim Eden (Aracı bırakan)");
    ekle("Uygunluk", "Devir Anındaki Hasar Durumu (Tam / Eksik Var)");
    ekle("Red Gerekçesi", "Red Gerekçesi");
  } else if (modul === "Geçici Kullanım") {
    ekle("İşlem Yönü", "İŞLEM YÖNÜ");
    ekle("Kimden/Kime", "GEÇİCİ / ARACI KİMDEN ALDI?");
    ekle("Hasar/Eksik Beyanı", "YENİ HASAR VEYA EKSİK BEYANI");
    ekle("Eksik Kalemler", "EKSİK ENVANTER KALEMLERİ");
    ekle("Temizlik", "TEMİZLİK DURUMU");
    ekle("Red Gerekçesi", "Red Gerekçesi");
  } else if (modul === "Kaza/Hasar") {
    ekle("Olay Türü", "Olay Türü");
    ekle("Hasar Detayı", "Hasar Detayı");
    ekle("Tutanak", "Tutanak Durumu");
    ekle("Onay Durumu", "Yönetici Onay Durumu");
    ekle("Red Gerekçesi", "Red Gerekçesi");
    ekle("Medyalar", "Kaza ve Tutanak Medyaları (Linkler)");
  } else if (modul === "Servis Kayıt") {
    ekle("Bildiren Kullanıcı", "Bildiren Kullanıcı");
    ekle("Servis Adı", "Servis Adı");
    ekle("Giriş Tarihi", "Servis Giriş Tarihi ve Saati");
    ekle("Çıkış Tarihi", "Servis Çıkış Tarihi ve Saati");
    ekle("Gidiş Şekli", "Servise Gidiş Şekli");
    ekle("Servis Nedeni", "Servis Nedeni");
    ekle("Evrak Durumu", "Araç İçi Evrak Durumu");
    ekle("Yapılan Onarımlar", "Yapılan Onarımlar");
    ekle("Çıkış KM", "Çıkış KM");
    ekle("İkame Araç", "İkame Araç Plakası");
    ekle("Onay Durumu", "Yönetici Onay Durumu");
    ekle("Red Gerekçesi", "Red Gerekçesi");
  } else if (modul === "Envanter") {
    ekle("İşlem Türü", "İşlem Türü");
    ekle("Eksik Olanlar", "Eksik Olanlar");
    ekle("Temin Edilenler", "Temin Edilenler");
    ekle("Tutanak Durumu", "Tutanak Durumu");
    ekle("İlk Yardım", "İlk Yardım Çantası");
    ekle("Reflektör", "Reflektör");
    ekle("Kriko", "Kriko");
    ekle("Bijon", "Bijon Anahtarı");
    ekle("Ampul", "Yedek Ampul Seti");
    ekle("Pense", "Pense & Tornavida");
    ekle("El Feneri", "Seyyar Lamba / El Feneri");
    ekle("Patinaj", "Patinaj Zinciri");
    ekle("Çekme", "Çekme Halatı");
    ekle("Stepne", "Stepne");
    ekle("Kart Okuma", "Kart Okuma Cihazı");
    ekle("Arka Sensör", "Arka Sensör");
    ekle("Onay", "Yönetici Onayı");
    ekle("Onay Durumu", "Yönetici Onay Durumu");
    ekle("Red Gerekçesi", "Red Gerekçesi");
  } else if (modul === "Periyodik Kontrol") {
    ekle("Giydirme", "Giydirme Durumu");
    ekle("Kaporta", "Kaporta Durumu");
    ekle("Lastik", "Lastik Durumu");
    ekle("Cam", "Cam Durumu");
    ekle("Lamba", "Lamba Durumu");
    ekle("Klima", "Klima Durumu");
    ekle("Akü", "Akü Durumu");
    ekle("Genel Mekanik", "Genel Mekanik");
    ekle("Red Gerekçesi", "Red Gerekçesi");
  } else if (modul === "Km Bilgisi") {
  const eklendi = {}; // tekrar önleyici
  Object.keys(headerMap).forEach(function(baslik) {
    if (baslik.indexOf("20") === -1) return;
    const idx = headerMap[baslik];
    if (eklendi[idx]) return;          // bu sütun zaten eklendi
    if (!row[idx]) return;
    
    // Date objesi ise → güzel formatla
    let etiket = baslik;
    let deger = row[idx];
    
    // Eğer label tarih ise → "Ocak 2026" formatına çevir
    if (baslik.indexOf("GMT") !== -1 || baslik.indexOf("Jan") !== -1 || baslik.indexOf("Feb") !== -1) {
      try {
        const d = new Date(baslik);
        if (!isNaN(d.getTime())) {
          const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
                         "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
          etiket = AYLAR[d.getMonth()] + " " + d.getFullYear();
        }
      } catch (e) {}
    }
    
    // Değer Date ise → sayıya çevir
    if (deger instanceof Date) {
      deger = deger.getTime();
    }
    
    detaylar.push({ label: etiket, deger: deger.toString() });
    eklendi[idx] = true;
  });
}
  
  return detaylar;
}


/**
 * Bir kaydı yönetici onayı ile işaretler.
 */
function islemOnayla(satirNo, yoneticiAdi) {
  const lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(CONFIG.LOCK_BEKLEME);
    
    if (!satirNo || satirNo < 2) {
      return { basarili: false, mesaj: "Geçersiz satır numarası" };
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET.SAHA_BILDIRIMLERI);
    if (!sheet) return { basarili: false, mesaj: "Sayfa bulunamadı" };
    
    const headerMap = getHeaderMap(sheet);
    const onayCol = headerMap["31. Yönetici Onay Durumu"] + 1;
    const onaylayanCol = headerMap["32. Onaylayan Yönetici"] + 1;
    
    sheet.getRange(satirNo, onayCol).setValue("Onaylandı");
    sheet.getRange(satirNo, onaylayanCol).setValue(yoneticiAdi);
    
    logYaz("BİLGİ", "islemOnayla", "Satır " + satirNo + " onaylandı: " + yoneticiAdi);
    
    return { basarili: true };
    
  } catch (e) {
    logYaz("HATA", "islemOnayla", e.message);
    return { basarili: false, mesaj: e.message };
  } finally {
    lock.releaseLock();
  }
}

// =======================================================================
// 6. SİSTEM YETKİLENDİRMESİ
// =======================================================================

/**
 * Drive ve Sheet izinlerini ilk kullanımda kabul ettirmek için.
 * Manuel çalıştırılır.
 */
function yetkiVer() {
  try {
    SpreadsheetApp.getActiveSpreadsheet();
    DriveApp.getFolderById(CONFIG.DRIVE_KLASOR_ID);
    Logger.log("Yetkiler başarıyla verildi - Sistem v" + CONFIG.VERSION);
    return "OK";
  } catch (e) {
    Logger.log("Yetki hatası: " + e.message);
    return "HATA: " + e.message;
  }
}

// =======================================================================
// YETKİ SİSTEMİ (V1) — Kullanıcı Doğrulama + Rol Yönetimi
// =======================================================================

/**
 * Şifreyi SHA-256 ile hash'ler.
 * Aynı şifre → her zaman aynı hash → karşılaştırma için kullanılır.
 */
function sifreHashle(sifre) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    sifre.toString(),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) {
    return ('0' + (b & 0xff).toString(16)).slice(-2);
  }).join('');
}

/**
 * Kullanıcılar sayfasını okur. Yoksa oluşturur.
 * Başlıklar: Kullanıcı Adı | Ad Soyad | Rol | Bölge | Şifre | Aktif
 */
function kullanicilarSayfasiAl() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET.KULLANICILAR);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET.KULLANICILAR);
    const basliklar = ["Kullanıcı Adı", "Ad Soyad", "Rol", "Bölge", "Şifre (Hash)", "Aktif"];
    sheet.getRange(1, 1, 1, basliklar.length).setValues([basliklar]).setFontWeight("bold");
    sheet.setFrozenRows(1);
    
    // Açıklama satırı (kullanıcıya yardımcı olacak)
    const aciklama = [
      ["yakup", "YAKUP SOYAD", "Admin", "Hepsi", "(şifre buraya yazdığında otomatik şifrelenir)", "Evet"]
    ];
    sheet.getRange(2, 1, 1, 6).setValues(aciklama);
    sheet.getRange("A2:F2").setBackground("#fef9c3");
    sheet.getRange("E2").setNote("Buraya açık şifre yazınca sistem otomatik şifreleyecek.\nNot: Bu örnek satır. Gerçek kullanım için bu satırı silip kendinizinkini ekleyin.");
    
    logYaz("BILGI", "kullanicilarSayfasiAl", "Kullanıcılar sayfası oluşturuldu");
  }
  return sheet;
}

/**
 * Kullanıcılar sayfasında açık şifre varsa otomatik hash'ler.
 * Bu fonksiyon onEdit benzeri çalışır, sen kullanıcı eklediğinde otomatik tetiklenir.
 * Manuel de çalıştırılabilir.
 */
function sifreleriOtomatikHashle() {
  try {
    const sheet = kullanicilarSayfasiAl();
    const sonSatir = sheet.getLastRow();
    if (sonSatir < 2) return;
    
    const sifreCol = 5; // E sütunu
    const range = sheet.getRange(2, sifreCol, sonSatir - 1, 1);
    const sifreler = range.getValues();
    let degisiklikSayisi = 0;
    
    for (let i = 0; i < sifreler.length; i++) {
      const sifre = (sifreler[i][0] || "").toString().trim();
      // 64 karakter = SHA-256 hash uzunluğu. Daha kısa ise açık şifredir.
      if (sifre && sifre.length !== 64 && !sifre.startsWith("(")) {
        sifreler[i][0] = sifreHashle(sifre);
        degisiklikSayisi++;
      }
    }
    
    if (degisiklikSayisi > 0) {
      range.setValues(sifreler);
      logYaz("BILGI", "sifreleriOtomatikHashle", degisiklikSayisi + " şifre hash'lendi");
    }
    
    return degisiklikSayisi + " şifre hash'lendi";
  } catch (e) {
    logYaz("HATA", "sifreleriOtomatikHashle", e.message);
    return "HATA: " + e.message;
  }
}

/**
 * Kullanıcı adı + şifre ile doğrulama.
 * Başarılı ise kullanıcı bilgisini döner, başarısız ise hata mesajı.
 */
function kullaniciDogrula(kullaniciAdi, sifre) {
  try {
    if (!kullaniciAdi || !sifre) {
      return { basarili: false, hata: "Kullanıcı adı ve şifre gerekli." };
    }
    
    const sheet = kullanicilarSayfasiAl();
    const sonSatir = sheet.getLastRow();
    if (sonSatir < 2) {
      return { basarili: false, hata: "Sistemde hiç kullanıcı tanımlanmamış." };
    }
    
    // Önce şifreleri hash'le (yeni eklenmiş açık şifreler varsa)
    sifreleriOtomatikHashle();
    
    const data = sheet.getRange(2, 1, sonSatir - 1, 6).getValues();
    const aramaAdi = kullaniciAdi.toString().trim().toLowerCase();
    const aramaSifreHash = sifreHashle(sifre);
    
    for (let i = 0; i < data.length; i++) {
      const k = (data[i][0] || "").toString().trim().toLowerCase();
      const s = (data[i][4] || "").toString().trim();
      const aktif = (data[i][5] || "").toString().trim().toLowerCase();
      
      if (k === aramaAdi) {
        // Aktif değilse reddet
        if (aktif !== "evet" && aktif !== "true" && aktif !== "✅") {
          return { basarili: false, hata: "Bu kullanıcı pasif durumda." };
        }
        // Şifre kontrolü
        if (s === aramaSifreHash) {
          const kullanici = {
            basarili: true,
            kullaniciAdi: data[i][0],
            adSoyad: data[i][1] || data[i][0],
            rol: data[i][2] || "Servis-Bakım",
            bolge: data[i][3] || "Hepsi"
          };
          logYaz("BILGI", "kullaniciDogrula", "Giriş başarılı: " + kullanici.kullaniciAdi);
          return kullanici;
        } else {
          logYaz("UYARI", "kullaniciDogrula", "Yanlış şifre denemesi: " + kullaniciAdi);
          return { basarili: false, hata: "Şifre yanlış." };
        }
      }
    }
    
    return { basarili: false, hata: "Kullanıcı bulunamadı." };
    
  } catch (e) {
    logYaz("HATA", "kullaniciDogrula", e.message);
    return { basarili: false, hata: "Sistem hatası: " + e.message };
  }
}


// =======================================================================
// GECE VARDİYASI — Dashboard Verisi Önbelleğe Al
// =======================================================================
// Her gece 04:00'te çalışır, dashboard kartlarını önceden hesaplar.
// Yönetici sabah açtığında 0.1 saniyede yüklenir.
// =======================================================================

/**
 * AŞAMA 1.6.1 — Acil durum tespit yardımcısı.
 * Bir satırı analiz eder, acil durum varsa nesne döner, yoksa null.
 * seviye: "kirmizi" (anında müdahale) | "sari" (yakın takip)
 */
function acilDurumTespit(modulAd, headerMap, satir, plakaIdx, tarihIdx) {
  const plaka = plakaIdx !== -1 ? satir[plakaIdx] : "";
  const tarih = tarihIdx !== -1 ? satir[tarihIdx] : "";
  
  // === KAZA / HASAR MODÜLÜ ===
  if (modulAd === "Kaza/Hasar") {
    const olayTuru = (satir[headerMap["Olay Türü"]] || "").toString();
    const tutanak = (satir[headerMap["Tutanak Durumu"]] || "").toString();
    
    // a) Ciddi kaza → KIRMIZI
    if (metinIceriyorMu(olayTuru, "Ciddi")) {
      return { plaka: plaka, modul: modulAd, aciklama: "🚨 Ciddi Kaza", seviye: "kirmizi", tarih: tarih };
    }
    // c) Tutanak tutulamayan kaza → KIRMIZI
    if (metinAyniMi(tutanak, "Hayir") || metinAyniMi(tutanak, "Hayır")) {
      return { plaka: plaka, modul: modulAd, aciklama: "Tutanak Tutulamadı", seviye: "kirmizi", tarih: tarih };
    }
  }
  
  // === ENVANTER MODÜLÜ ===
  if (modulAd === "Envanter") {
    const eksikler = (satir[headerMap["Eksik Olanlar"]] || "").toString();
    const eksiklerUpper = eksikler.toLocaleUpperCase("tr-TR");
    
    // b) Stepne/Anten/Kart çalınması → KIRMIZI (tutanak gerekli)
    if (eksiklerUpper.indexOf("STEPNE") !== -1 || 
        eksiklerUpper.indexOf("ANTEN") !== -1 || 
        eksiklerUpper.indexOf("KART") !== -1) {
      return { plaka: plaka, modul: modulAd, aciklama: "Tutanak Gerekli Envanter Kaybı", seviye: "kirmizi", tarih: tarih };
    }
  }
  
  // === PERİYODİK KONTROL ===
  if (modulAd === "Periyodik Kontrol") {
    const mekanik = (satir[headerMap["Genel Mekanik"]] || "").toString();
    const lastik = (satir[headerMap["Lastik Durumu"]] || "").toString();
    const cam = (satir[headerMap["Cam Durumu"]] || "").toString();
    const aku = (satir[headerMap["Akü Durumu"]] || "").toString();
    const kaporta = (satir[headerMap["Kaporta Durumu"]] || "").toString();
    const lamba = (satir[headerMap["Lamba Durumu"]] || "").toString();
    
    // e1) Mekanik servise gitmeli → KIRMIZI
    if (metinIceriyorMu(mekanik, "Servise Gitmesi")) {
      return { plaka: plaka, modul: modulAd, aciklama: "Mekanik: Servise Gitmesi Gerekiyor", seviye: "kirmizi", tarih: tarih };
    }
    // e2) Cam kırık → KIRMIZI
    if (metinIceriyorMu(cam, "Kırık")) {
      return { plaka: plaka, modul: modulAd, aciklama: "Cam Kırık", seviye: "kirmizi", tarih: tarih };
    }
    // e3) Kaporta ciddi hasarlı → KIRMIZI
    if (metinIceriyorMu(kaporta, "Ciddi")) {
      return { plaka: plaka, modul: modulAd, aciklama: "Kaporta: Ciddi Hasarlı", seviye: "kirmizi", tarih: tarih };
    }
    // e4) Lastik değişmeli → SARI
    if (metinIceriyorMu(lastik, "Değişmeli")) {
      return { plaka: plaka, modul: modulAd, aciklama: "Lastik: Değişmeli", seviye: "sari", tarih: tarih };
    }
    // e5) Akü zayıf → SARI
    if (metinIceriyorMu(aku, "Zayıf")) {
      return { plaka: plaka, modul: modulAd, aciklama: "Akü: Zayıf", seviye: "sari", tarih: tarih };
    }
    // e6) Far/Sinyal eksik → SARI
    if (metinIceriyorMu(lamba, "Eksik")) {
      return { plaka: plaka, modul: modulAd, aciklama: "Far/Sinyal: Eksik Var", seviye: "sari", tarih: tarih };
    }
  }
  
  // === GEÇİCİ KULLANIM (1.6.2 - d) ===
  if (modulAd === "Geçici Kullanım") {
    const yeniHasar = (satir[headerMap["YENİ HASAR VEYA EKSİK BEYANI"]] || "").toString();
    
    // d) Yeni hasar veya yeni eksik beyanı varsa → KIRMIZI
    if (metinIceriyorMu(yeniHasar, "Yeni Hasar") || metinIceriyorMu(yeniHasar, "Yeni Eksik")) {
      return { plaka: plaka, modul: modulAd, aciklama: "Geçici Kullanımda Yeni Hasar/Eksik", seviye: "kirmizi", tarih: tarih };
    }
  }
  
  // === SERVİS KAYIT (1.6.2 - g) ===
  if (modulAd === "Servis Kayıt") {
    const girisTarihi = satir[headerMap["Servis Giriş Tarihi ve Saati"]];
    const cikisTarihi = satir[headerMap["Servis Çıkış Tarihi ve Saati"]];
    const evrakDurumu = (satir[headerMap["Araç İçi Evrak Durumu"]] || "").toString();
    const yapilanlar = (satir[headerMap["Yapılan Onarımlar"]] || "").toString();
    
    // g1) Servise bırakıldı ama "Form: Eksik" → SARI
    if (girisTarihi && !cikisTarihi && metinIceriyorMu(evrakDurumu, "Form:Eksik")) {
      return { plaka: plaka, modul: modulAd, aciklama: "Servise Bırakıldı, Arıza-Bakım Formu Eksik", seviye: "sari", tarih: tarih };
    }
    // g2) Servisten alındı ama "Yapılan Onarımlar" boş → SARI
    if (cikisTarihi && (!yapilanlar || yapilanlar.trim() === "")) {
      return { plaka: plaka, modul: modulAd, aciklama: "Servisten Alındı, Yapılan İşlem Bilgisi Yok", seviye: "sari", tarih: tarih };
    }
  }
  
  return null;
}

/**
 * Dashboard verilerini hesaplar ve "Dashboard_Verisi" sayfasına yazar.
 * Her gece otomatik trigger ile çalışır + manuel "Verileri Yenile" ile.
 */
function dashboardVerisiHazirla() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    logYaz("UYARI", "dashboardVerisiHazirla", "Lock alınamadı");
    return { hata: "Sistem meşgul, lütfen tekrar deneyin." };
  }
  
  try {
    const baslangic = new Date().getTime();
    logYaz("BILGI", "dashboardVerisiHazirla", "Dashboard hesaplama başladı");
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const bugun = new Date();
    bugun.setHours(0, 0, 0, 0);
    const bugunMs = bugun.getTime();
    
    // === 8 MODÜLDEN VERİ TOPLA (BATCH OKUMA) ===
    const moduller = [
      { ad: "Zimmet İşlemleri", sayfa: CONFIG.SHEET.ZIMMET },
      { ad: "Geçici Kullanım",   sayfa: CONFIG.SHEET.GECICI },
      { ad: "Kaza/Hasar",        sayfa: CONFIG.SHEET.KAZA },
      { ad: "Servis Kayıt",      sayfa: CONFIG.SHEET.SERVIS },
      { ad: "Envanter",          sayfa: CONFIG.SHEET.ENVANTER },
      { ad: "Periyodik Kontrol", sayfa: CONFIG.SHEET.PERIYODIK },
      { ad: "KM Bilgisi",        sayfa: CONFIG.SHEET.KM }
    ];
    
    let toplamKayit = 0;
    let bugunKayit = 0;
    let bekleyenOnay = 0;
    let acilDurumlar = [];
    const modulOzetleri = [];
    
    moduller.forEach(function(mod) {
      const sheet = ss.getSheetByName(mod.sayfa);
      if (!sheet) {
        modulOzetleri.push({ ad: mod.ad, toplam: 0, bugun: 0, bekleyen: 0 });
        return;
      }
      
      const sonSatir = sheet.getLastRow();
      if (sonSatir < 2) {
        modulOzetleri.push({ ad: mod.ad, toplam: 0, bugun: 0, bekleyen: 0 });
        return;
      }
      
      // BATCH OKUMA — tüm veriyi tek seferde
      const headerMap = getHeaderMap(sheet);
      const data = sheet.getRange(2, 1, sonSatir - 1, sheet.getLastColumn()).getValues();
      
      let modulToplam = data.length;
      let modulBugun = 0;
      let modulBekleyen = 0;
      
      // Tarih ve onay sütun indeksleri (modüle göre farklı isimler)
      let tarihIdx = headerMap["Tarih"];
      if (tarihIdx === undefined) tarihIdx = headerMap["Bildirim Tarihi"];
      if (tarihIdx === undefined) tarihIdx = headerMap["TARİH"];
      if (tarihIdx === undefined) tarihIdx = headerMap["Tarih / Saat"];
      if (tarihIdx === undefined) tarihIdx = headerMap["Son Kontrol Tarihi"];
      if (tarihIdx === undefined) tarihIdx = headerMap["Olay Tarihi ve Saati"];
      if (tarihIdx === undefined) tarihIdx = headerMap["Servis Giriş Tarihi ve Saati"];
      if (tarihIdx === undefined) tarihIdx = -1;
      
      let onayIdx = headerMap["Yönetici Onay Durumu"];
      if (onayIdx === undefined) onayIdx = headerMap["Yönetici Onayı"];
      if (onayIdx === undefined) onayIdx = headerMap["Onay Durumu"];
      if (onayIdx === undefined) onayIdx = -1;
      
      const plakaIdx = headerMap["Plaka"] !== undefined ? headerMap["Plaka"] : -1;
      
      for (let i = 0; i < data.length; i++) {
        // Bugün gelen mi?
        if (tarihIdx !== -1) {
          const tarih = data[i][tarihIdx];
          if (tarih instanceof Date) {
            const t = new Date(tarih);
            t.setHours(0,0,0,0);
            if (t.getTime() === bugunMs) modulBugun++;
          }
        }
        // Bekleyen onay mı?
        if (onayIdx !== -1) {
          const onay = (data[i][onayIdx] || "").toString().trim().toLowerCase();
          if (onay === "" || onay === "beklemede" || onay === "bekliyor") {
            modulBekleyen++;
            
            // AŞAMA 1.6.1: Genişletilmiş acil durum tespiti
            const acil = acilDurumTespit(mod.ad, headerMap, data[i], plakaIdx, tarihIdx);
            if (acil) {
              acilDurumlar.push(acil);
            }
          }
        }
      }
      
      toplamKayit += modulToplam;
      bugunKayit += modulBugun;
      bekleyenOnay += modulBekleyen;
      
      modulOzetleri.push({
        ad: mod.ad,
        toplam: modulToplam,
        bugun: modulBugun,
        bekleyen: modulBekleyen
      });
    });
    
    // === SERVİSTEKİ ARAÇ TESPİTİ ===
    // Servis modülünde "A: Servise Bırakıyorum" kaydı olan ve sonrasında 
    // "B: Servisten Alıyorum" kaydı olmayan plakalar = halen serviste
    let servistekiArac = 0;
    const servisSheet = ss.getSheetByName(CONFIG.SHEET.SERVIS);
    if (servisSheet && servisSheet.getLastRow() > 1) {
      const sHeader = getHeaderMap(servisSheet);
      const sPlakaIdx = sHeader["Plaka"];
      const sIslemIdx = sHeader["İşlem Tipi"] !== undefined ? sHeader["İşlem Tipi"] : 
                        (sHeader["Tip"] !== undefined ? sHeader["Tip"] : -1);
      const sTarihIdx = sHeader["Tarih"] !== undefined ? sHeader["Tarih"] : sHeader["Bildirim Tarihi"];
      
      if (sPlakaIdx !== undefined) {
        const sData = servisSheet.getRange(2, 1, servisSheet.getLastRow() - 1, servisSheet.getLastColumn()).getValues();
        const plakaDurum = {}; // her plaka için son işlem türü
        
        // Tarihe göre sıralanmış değil, tüm kayıtları gez, en son tarih hangisiyse o
        for (let i = 0; i < sData.length; i++) {
          const plaka = (sData[i][sPlakaIdx] || "").toString().trim().toUpperCase();
          if (!plaka) continue;
          
          let islem = "";
          if (sIslemIdx !== -1) {
            islem = (sData[i][sIslemIdx] || "").toString().trim().toLowerCase();
          } else {
            // İşlem tipi sütunu yoksa, satırı tara
            const satir = sData[i].join(" ").toLowerCase();
            if (satir.indexOf("bırakı") !== -1 || satir.indexOf("girdi") !== -1) islem = "a";
            else if (satir.indexOf("alıyor") !== -1 || satir.indexOf("çıktı") !== -1) islem = "b";
          }
          
          const tarih = sTarihIdx !== undefined ? sData[i][sTarihIdx] : null;
          const tarihMs = (tarih instanceof Date) ? tarih.getTime() : 0;
          
          if (!plakaDurum[plaka] || tarihMs >= plakaDurum[plaka].tarihMs) {
            plakaDurum[plaka] = { islem: islem, tarihMs: tarihMs };
          }
        }
        
        // Son işlemi "A" (bırakıyorum) olan plakalar serviste demektir
        Object.keys(plakaDurum).forEach(function(plaka) {
          const son = plakaDurum[plaka];
          if (son.islem === "a" || son.islem.indexOf("bırakı") !== -1 || son.islem.indexOf("girdi") !== -1) {
            servistekiArac++;
          }
        });
      }
    }
    
    // === SESSİZ ARAÇ TESPİTİ (30+ gün bildirim yok) ===
    let sessizArac = 0;
    let toplamArac = 0;
    const aracSheet = ss.getSheetByName(CONFIG.SHEET.ARAC_GUNLUK_BILGILER);
    if (aracSheet && aracSheet.getLastRow() > 1) {
      const aracHeader = getHeaderMap(aracSheet);
      const plakaCol = aracHeader["Plaka"];
      if (plakaCol !== undefined) {
        const plakalar = aracSheet.getRange(2, plakaCol + 1, aracSheet.getLastRow() - 1, 1).getValues();
        toplamArac = plakalar.filter(function(p) { return (p[0] || "").toString().trim() !== ""; }).length;
        const otuzGunOnce = new Date();
        otuzGunOnce.setDate(otuzGunOnce.getDate() - 30);
        
        // Her plaka için son bildirim tarihini bul
        const plakaSonBildirim = {};
        moduller.forEach(function(mod) {
          const s = ss.getSheetByName(mod.sayfa);
          if (!s || s.getLastRow() < 2) return;
          const hMap = getHeaderMap(s);
          const pIdx = hMap["Plaka"];
          const tIdx = hMap["Tarih"] !== undefined ? hMap["Tarih"] : hMap["Bildirim Tarihi"];
          if (pIdx === undefined || tIdx === undefined) return;
          
          const d = s.getRange(2, 1, s.getLastRow() - 1, s.getLastColumn()).getValues();
          for (let i = 0; i < d.length; i++) {
            const p = (d[i][pIdx] || "").toString().trim().toUpperCase();
            const t = d[i][tIdx];
            if (p && t instanceof Date) {
              if (!plakaSonBildirim[p] || t.getTime() > plakaSonBildirim[p]) {
                plakaSonBildirim[p] = t.getTime();
              }
            }
          }
        });
        
        for (let i = 0; i < plakalar.length; i++) {
          const p = (plakalar[i][0] || "").toString().trim().toUpperCase();
          if (!p) continue;
          const sonBildirim = plakaSonBildirim[p] || 0;
          if (sonBildirim < otuzGunOnce.getTime()) {
            sessizArac++;
          }
        }
      }
    }
    
    // AŞAMA 1.6.1: Acil durumları seviyeye göre sırala (kırmızı önce, sarı sonra)
    acilDurumlar.sort(function(a, b) {
      if (a.seviye === "kirmizi" && b.seviye !== "kirmizi") return -1;
      if (a.seviye !== "kirmizi" && b.seviye === "kirmizi") return 1;
      return 0;
    });
    
    // === SONUÇLARI Dashboard_Verisi SAYFASINA YAZ ===
    let hedef = ss.getSheetByName(CONFIG.SHEET.DASHBOARD_VERISI);
    if (!hedef) {
      hedef = ss.insertSheet(CONFIG.SHEET.DASHBOARD_VERISI);
    }
    hedef.clear();
    
    const now = new Date();
    const veriler = [
      ["Anahtar", "Değer"],
      ["sonGuncelleme", Utilities.formatDate(now, Session.getScriptTimeZone(), "dd.MM.yyyy HH:mm")],
      ["toplamArac", toplamArac],
      ["toplamKayit", toplamKayit],
      ["bugunKayit", bugunKayit],
      ["bekleyenOnay", bekleyenOnay],
      ["servistekiArac", servistekiArac],
      ["sessizArac", sessizArac],
      ["acilDurumSayisi", acilDurumlar.length],
      ["acilDurumlarJSON", JSON.stringify(acilDurumlar.slice(0, 10))], // ilk 10
      ["modulOzetleriJSON", JSON.stringify(modulOzetleri)]
    ];
    hedef.getRange(1, 1, veriler.length, 2).setValues(veriler);
    hedef.getRange(1, 1, 1, 2).setFontWeight("bold");
    hedef.setColumnWidth(1, 180);
    hedef.setColumnWidth(2, 400);
    
    const sure = (new Date().getTime() - baslangic) / 1000;
    logYaz("BASARI", "dashboardVerisiHazirla", 
           "Dashboard hesaplandı (" + sure + " sn). Toplam: " + toplamKayit + 
           ", Bugün: " + bugunKayit + ", Bekleyen: " + bekleyenOnay);
    
    return { 
      basarili: true,
      sure: sure,
      toplamArac: toplamArac,
      toplamKayit: toplamKayit,
      bugunKayit: bugunKayit,
      bekleyenOnay: bekleyenOnay,
      servistekiArac: servistekiArac,
      sessizArac: sessizArac,
      acilDurumSayisi: acilDurumlar.length
    };
    
  } catch (e) {
    logYaz("HATA", "dashboardVerisiHazirla", e.message);
    return { hata: e.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Yönetim Merkezi açıldığında dashboard verisini Dashboard_Verisi sayfasından çeker.
 * Önceden hesaplandığı için 0.1 saniyede döner.
 */
function dashboardVerisiOku() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET.DASHBOARD_VERISI);
    
    // Sayfa yoksa veya boşsa, hızlıca hesapla
    if (!sheet || sheet.getLastRow() < 2) {
      const sonuc = dashboardVerisiHazirla();
      sheet = ss.getSheetByName(CONFIG.SHEET.DASHBOARD_VERISI);
    }
    
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    const veri = {};
    data.forEach(function(row) {
      veri[row[0]] = row[1];
    });
    
    // JSON alanları parse et
    try { veri.acilDurumlar = JSON.parse(veri.acilDurumlarJSON || "[]"); } catch(e) { veri.acilDurumlar = []; }
    try { veri.modulOzetleri = JSON.parse(veri.modulOzetleriJSON || "[]"); } catch(e) { veri.modulOzetleri = []; }
    delete veri.acilDurumlarJSON;
    delete veri.modulOzetleriJSON;
    
    // KRİTİK FIX: Date objelerini metne çevir (frontend bozulmasın)
    if (veri.sonGuncelleme instanceof Date) {
      veri.sonGuncelleme = Utilities.formatDate(veri.sonGuncelleme, "Europe/Istanbul", "dd.MM.yyyy HH:mm");
    }
    
    // Acil durumlardaki tarihleri de string'e çevir
    if (veri.acilDurumlar && Array.isArray(veri.acilDurumlar)) {
      veri.acilDurumlar.forEach(function(item) {
        if (item.tarih instanceof Date) {
          item.tarih = Utilities.formatDate(new Date(item.tarih), "Europe/Istanbul", "dd.MM.yyyy");
        } else if (typeof item.tarih === "string" && item.tarih.indexOf("T") !== -1) {
          // ISO string formatındaysa Date'e çevir, sonra düzgün metne
          try {
            item.tarih = Utilities.formatDate(new Date(item.tarih), "Europe/Istanbul", "dd.MM.yyyy");
          } catch(e) { /* zaten metin */ }
        }
      });
    }
    
    return veri;
    
  } catch (e) {
    logYaz("HATA", "dashboardVerisiOku", e.message);
    return { hata: e.message };
  }
}

/**
 * Gece vardiyası trigger'ını kurar.
 * Her gece 04:00'te dashboardVerisiHazirla çalışır.
 */
function dashboardTriggerKur() {
  // Eski trigger'ları sil
  const triggers = ScriptApp.getProjectTriggers();
  let silinen = 0;
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === "dashboardVerisiHazirla") {
      ScriptApp.deleteTrigger(t);
      silinen++;
    }
  });
  
  // Yeni trigger: Her gece 04:00
  ScriptApp.newTrigger("dashboardVerisiHazirla")
    .timeBased().everyDays(1).atHour(4).nearMinute(0).create();
  
  const mesaj = silinen + " eski silindi, gece 04:00 trigger kuruldu";
  logYaz("BASARI", "dashboardTriggerKur", mesaj);
  return mesaj;
}
function basliklariYenile() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET.SAHA_BILDIRIMLERI);
  if (!sheet) {
    Logger.log("HATA: Saha Bildirimleri sayfası bulunamadı");
    return;
  }
  if (sheet.getLastRow() === 0) {
    sheetBaslikKur(sheet, SAHA_BILDIRIMLERI_BASLIKLAR);
    Logger.log("✅ Başlıklar kuruldu: 33 sütun");
  } else {
    // Sayfa dolu - sadece 33. sütunu ekle
    const sonSutun = sheet.getLastColumn();
    if (sonSutun < 33) {
      sheet.getRange(1, 33).setValue("33. Red Gerekçesi");
      sheet.getRange(1, 33).setFontWeight("bold").setBackground("#1e3a8a").setFontColor("#ffffff");
      Logger.log("✅ 33. sütun 'Red Gerekçesi' eklendi");
    } else {
      Logger.log("ℹ️ Sayfada zaten " + sonSutun + " sütun var");
    }
  }
}
/**
 * Mini-Tur B: Tüm alt sayfalara "Red Gerekçesi" başlığını ekler.
 * Manuel olarak bir kez çalıştırılır.
 */
function altSayfalaraRedGerekcesiEkle() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Onay yansıması olan sayfalar
  const sayfalar = [
    { ad: CONFIG.SHEET.ZIMMET,    onaySutun: "Yönetici Onay Durumu" },
    { ad: CONFIG.SHEET.GECICI,    onaySutun: "Yönetici Onay Durumu" },
    { ad: CONFIG.SHEET.KAZA,      onaySutun: "Yönetici Onay Durumu" },
    { ad: CONFIG.SHEET.SERVIS,    onaySutun: "Yönetici Onay Durumu" },
    { ad: CONFIG.SHEET.ENVANTER,  onaySutun: "Yönetici Onay Durumu" },
    { ad: CONFIG.SHEET.PERIYODIK, onaySutun: "Yönetici Onayı" },
    { ad: CONFIG.SHEET.GIYDIRME,  onaySutun: "Yönetici Onay Durumu" }
  ];
  
  let sonuc = [];
  
  sayfalar.forEach(function(s) {
    try {
      const sheet = ss.getSheetByName(s.ad);
      if (!sheet) {
        sonuc.push(s.ad + ": Sayfa yok (atlandı)");
        return;
      }
      
      if (sheet.getLastRow() === 0) {
        sonuc.push(s.ad + ": Boş sayfa (otomatik kurulacak)");
        return;
      }
      
      const headerMap = getHeaderMap(sheet);
      
      // Zaten "Red Gerekçesi" var mı?
      if (headerMap["Red Gerekçesi"] !== undefined) {
        sonuc.push(s.ad + ": Zaten mevcut ✓");
        return;
      }
      
      // Onay sütunu var mı? Eğer yoksa onu da eklemek lazım
      let onayCol = headerMap[s.onaySutun];
      
      // Yeni sütun en sona eklenecek
      const yeniSutunNo = sheet.getLastColumn() + 1;
      
      // Onay sütunu da yoksa, onu da ekle
      if (onayCol === undefined) {
        sheet.getRange(1, yeniSutunNo).setValue(s.onaySutun);
        sheet.getRange(1, yeniSutunNo).setFontWeight("bold").setBackground("#1e3a8a").setFontColor("#ffffff");
        sheet.getRange(1, yeniSutunNo + 1).setValue("Red Gerekçesi");
        sheet.getRange(1, yeniSutunNo + 1).setFontWeight("bold").setBackground("#1e3a8a").setFontColor("#ffffff");
        sonuc.push(s.ad + ": Onay + Red Gerekçesi eklendi ✅");
      } else {
        sheet.getRange(1, yeniSutunNo).setValue("Red Gerekçesi");
        sheet.getRange(1, yeniSutunNo).setFontWeight("bold").setBackground("#1e3a8a").setFontColor("#ffffff");
        sonuc.push(s.ad + ": Red Gerekçesi eklendi ✅");
      }
      
    } catch (e) {
      sonuc.push(s.ad + ": HATA - " + e.message);
    }
  });
  
  const ozet = sonuc.join("\n");
  Logger.log(ozet);
  logYaz("BASARI", "altSayfalaraRedGerekcesiEkle", ozet);
  return ozet;
}
function onayGecmisiSayfasiniOlustur() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET.ONAY_GECMISI);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET.ONAY_GECMISI);
    sheetBaslikKur(sheet, ONAY_GECMISI_BASLIKLAR);
    Logger.log("✅ Onay Geçmişi sayfası oluşturuldu");
  } else {
    Logger.log("ℹ️ Onay Geçmişi sayfası zaten var");
  }
}
function debugDashboardOku() {
  const sonuc = dashboardVerisiOku();
  Logger.log("===== DASHBOARD VERİSİ =====");
  Logger.log(JSON.stringify(sonuc, null, 2));
}

/**
 * AŞAMA C4 — SİCİL EXCEL OLUŞTUR (A — Tek Sayfa)
 * Sicil verisini tek sayfada Excel olarak üretir, indirme URL'i döner.
 */
function sicilExcelOlustur(tip, deger) {
  try {
    const sonuc = sicilKartiGetir(tip, deger);
    if (!sonuc || !sonuc.basarili) {
      return { basarili: false, mesaj: "Sicil verisi alınamadı" };
    }
    
    const tarih = Utilities.formatDate(new Date(), "Europe/Istanbul", "dd.MM.yyyy HH:mm");
    const tarihDosya = Utilities.formatDate(new Date(), "Europe/Istanbul", "yyyy-MM-dd");
    const tipAd = (tip === "arac") ? "Arac" : "Personel";
    const dosyaAd = "Sicil_" + tipAd + "_" + deger.toString().replace(/\s+/g, "_") + "_" + tarihDosya;
    
    const ss = SpreadsheetApp.create(dosyaAd);
    const sheet = ss.getSheets()[0];
    sheet.setName("Sicil");
    
    let r = 1;
    
    // BAŞLIK
    sheet.getRange(r, 1).setValue("SİCİL KARTI").setFontSize(16).setFontWeight("bold");
    sheet.getRange(r, 3).setValue("Tarih: " + tarih);
    r += 2;
    
    sheet.getRange(r, 1).setValue(tip === "arac" ? "Plaka:" : "Personel:").setFontWeight("bold");
    sheet.getRange(r, 2).setValue(deger);
    r += 2;
    
    // KÜNYE
    if (sonuc.kunye) {
      sheet.getRange(r, 1, 1, 3).merge().setValue("ARAÇ KÜNYESİ")
        .setFontSize(13).setFontWeight("bold").setBackground("#fef3c7");
      r++;
      Object.keys(sonuc.kunye).forEach(function(k) {
        sheet.getRange(r, 1).setValue(k).setFontWeight("bold");
        sheet.getRange(r, 2, 1, 2).merge().setValue(sonuc.kunye[k]);
        r++;
      });
      r++;
    }
    
    // AKILLI ÖZET
    if (sonuc.ozet) {
      sheet.getRange(r, 1, 1, 3).merge().setValue("AKILLI ÖZET")
        .setFontSize(13).setFontWeight("bold").setBackground("#dbeafe");
      r++;
      
      if (sonuc.ozet.belgeler && sonuc.ozet.belgeler.length > 0) {
        sonuc.ozet.belgeler.forEach(function(b) {
          sheet.getRange(r, 1).setValue("📁 " + b.ad).setFontWeight("bold");
          sheet.getRange(r, 2).setValue(b.tarih || "-");
          sheet.getRange(r, 3).setValue((b.durum || "").toString().toUpperCase());
          r++;
        });
      }
      if (sonuc.ozet.trafik && sonuc.ozet.trafik.toplamCeza > 0) {
        sheet.getRange(r, 1).setValue("🚓 Trafik").setFontWeight("bold");
        sheet.getRange(r, 2).setValue(sonuc.ozet.trafik.toplamCeza + " ceza");
        sheet.getRange(r, 3).setValue("Ödenmemiş: " + sonuc.ozet.trafik.odenmemisTutar + " TL");
        r++;
      }
      if (sonuc.ozet.servis && sonuc.ozet.servis.toplam > 0) {
        sheet.getRange(r, 1).setValue("🔧 Servis").setFontWeight("bold");
        sheet.getRange(r, 2).setValue(sonuc.ozet.servis.toplam + " kayıt");
        sheet.getRange(r, 3).setValue(sonuc.ozet.servis.enSikNeden || "");
        r++;
      }
      if (sonuc.ozet.km && sonuc.ozet.km.guncelKm) {
        sheet.getRange(r, 1).setValue("⏲️ Güncel KM").setFontWeight("bold");
        sheet.getRange(r, 2).setValue(sonuc.ozet.km.guncelKm + " km");
        r++;
      }
      r++;
    }
    
    // BÖLÜMLER
    if (sonuc.bolumler && sonuc.bolumler.length > 0) {
      sonuc.bolumler.forEach(function(b) {
        if (!b.kayitlar || b.kayitlar.length === 0) return;
        
        sheet.getRange(r, 1, 1, 3).merge()
          .setValue(b.modul.toUpperCase() + " (" + b.toplam + " kayıt)")
          .setFontSize(13).setFontWeight("bold").setBackground("#e0e7ff");
        r++;
        
        b.kayitlar.forEach(function(k, idx) {
          sheet.getRange(r, 1).setValue("#" + (idx + 1) + " - " + (k.tarih || "") + " " + (k.saat || ""))
            .setFontWeight("bold").setBackground("#f3f4f6");
          r++;
          if (k.detaylar && k.detaylar.length > 0) {
            k.detaylar.forEach(function(d) {
              sheet.getRange(r, 1).setValue(d.label).setFontWeight("bold");
              sheet.getRange(r, 2, 1, 2).merge().setValue(d.deger);
              r++;
            });
          }
          r++;
        });
      });
    }
    
    sheet.setColumnWidth(1, 180);
    sheet.setColumnWidth(2, 280);
    sheet.setColumnWidth(3, 200);
    
    DriveApp.getFileById(ss.getId()).setSharing(
      DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW
    );
    
    return {
      basarili: true,
      url: "https://docs.google.com/spreadsheets/d/" + ss.getId() + "/export?format=xlsx",
      dosyaAd: dosyaAd + ".xlsx"
    };
    
  } catch (e) {
    logYaz("HATA", "sicilExcelOlustur", e.message);
    return { basarili: false, mesaj: e.message };
  }
}
function driveTesti() {
  const adlar = Object.keys(CONFIG.DRIVE);
  adlar.forEach(function(ad) {
    const id = CONFIG.DRIVE[ad];
    try {
      const klasor = DriveApp.getFolderById(id);
      Logger.log("✅ " + ad + " → " + klasor.getName());
    } catch (e) {
      Logger.log("🔴 " + ad + " → HATA: " + e.message);
    }
  });
}
function fotoYuklemeTesti() {
  // 1x1 piksel kırmızı JPG (test için minik foto)
  const ufakFoto = "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB/9sAQwEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB/8AAEQgAAQABAwEiAAIRAQMRAf/EABUAAQEAAAAAAAAAAAAAAAAAAAAJ/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/v//Z";
  
  Logger.log("=== Test 1: KAZA (02 klasörüne gitmeli) ===");
  const t1 = fotografYukleAkilli(ufakFoto, "34TEST01", "KAZA", "image/jpeg");
  Logger.log(JSON.stringify(t1));
  
  Logger.log("=== Test 2: PERIYODIK (03/plaka klasörüne) ===");
  const t2 = fotografYukleAkilli(ufakFoto, "34TEST01", "PERIYODIK", "image/jpeg");
  Logger.log(JSON.stringify(t2));
  
  Logger.log("=== Test 3: ZIMMET (04/Aktif Zimmetler) ===");
  const t3 = fotografYukleAkilli(ufakFoto, "34TEST01", "ZIMMET", "image/jpeg");
  Logger.log(JSON.stringify(t3));
  
  Logger.log("=== Test 4: Aynı plaka+konu+gün → sıra numarası 02 olmalı ===");
  const t4 = fotografYukleAkilli(ufakFoto, "34TEST01", "KAZA", "image/jpeg");
  Logger.log(JSON.stringify(t4));
}
/**
 * AŞAMA F — Önceki ay KM bilgisini getirir.
 * Frontend KM formu için.
 */
function oncekiAyKMGetir(plaka) {
  try {
    const plakaUst = plaka.toString().trim().toUpperCase().replace(/\s+/g, "");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Km Bilgisi");
    if (!sheet) return 0;
    
    const lr = sheet.getLastRow();
    if (lr < 2) return 0;
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const data = sheet.getRange(2, 1, lr - 1, sheet.getLastColumn()).getValues();
    
    // Plaka sütunu bul
    let plakaIdx = -1;
    for (let i = 0; i < headers.length; i++) {
      if (headers[i].toString().trim().toUpperCase() === "PLAKA") { plakaIdx = i; break; }
    }
    if (plakaIdx === -1) return 0;
    
    // Plakanın satırını bul
    let satir = null;
    for (let i = 0; i < data.length; i++) {
      const p = (data[i][plakaIdx] || "").toString().trim().toUpperCase().replace(/\s+/g, "");
      if (p === plakaUst) { satir = data[i]; break; }
    }
    if (!satir) return 0;
    
    // Önceki ayın sütununu bul
    const simdi = new Date();
    const oncekiAy = (simdi.getMonth() === 0) ? 11 : simdi.getMonth() - 1;
    const oncekiYil = (simdi.getMonth() === 0) ? simdi.getFullYear() - 1 : simdi.getFullYear();
    const AYLAR = ["OCAK","ŞUBAT","MART","NİSAN","MAYIS","HAZİRAN","TEMMUZ","AĞUSTOS","EYLÜL","EKİM","KASIM","ARALIK"];
    const hedefAy = AYLAR[oncekiAy] + " " + oncekiYil;
    
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i].toString().trim().toUpperCase();
      if (h === hedefAy || h.indexOf(AYLAR[oncekiAy]) !== -1 && h.indexOf(oncekiYil.toString()) !== -1) {
        const deger = satir[i];
        return (deger && !isNaN(parseInt(deger))) ? parseInt(deger) : 0;
      }
    }
    
    return 0;
  } catch (e) {
    logYaz("HATA", "oncekiAyKMGetir", e.message);
    return 0;
  }
}
/**
 * AŞAMA F — EVRAK YÜKLEME (Yönetici)
 * Plaka + Evrak Tipi'ne göre doğru klasöre yükler.
 * Yıllık yenilenen evraklar için: eski Aktif → Arşiv'e taşınır, yeni Aktif'e konur.
 * 
 * evrakTipi: "Trafik Poliçesi", "Kasko Poliçesi", "Muayene", "Egzoz Emisyon",
 *            "Ruhsat", "Personel Evrakları", "Zimmet Tutanağı", "Genel Evrak"
 */
function evrakYukleAkilli(plaka, evrakTipi, base64, dosyaUzanti, mimeType) {
  try {
    if (!plaka || !evrakTipi || !base64) {
      return { basarili: false, mesaj: "Plaka, evrak tipi veya dosya boş" };
    }
    
    const plakaUst = plaka.toString().trim().toUpperCase().replace(/\s+/g, "");
    const tarih = Utilities.formatDate(new Date(), "Europe/Istanbul", "dd.MM.yyyy");
    const tarihDosya = Utilities.formatDate(new Date(), "Europe/Istanbul", "yyyyMMdd");
    const uzanti = (dosyaUzanti || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "");
    
    // Hedef klasör ve dosya adı belirleme
    let hedefKlasor;
    let dosyaAdi;
    const aktifArsivEvraklar = ["Trafik Poliçesi", "Kasko Poliçesi", "Muayene", "Egzoz Emisyon"];
    const yillikYenilenen = aktifArsivEvraklar.indexOf(evrakTipi) !== -1;
    
    if (evrakTipi === "Zimmet Tutanağı") {
      // 04_ZIMMET / Aktif Zimmetler
      const ana = DriveApp.getFolderById(CONFIG.DRIVE.ZIMMET_SICIL);
      hedefKlasor = altKlasorBulVeyaAc(ana, "Aktif Zimmetler");
      dosyaAdi = plakaUst + "_ZIMMET_" + tarihDosya + "." + uzanti;
    } else {
      // 05_EVRAK_KUTUPHANE / [Evrak Tipi]
      const ana = DriveApp.getFolderById(CONFIG.DRIVE.EVRAK_KUTUPHANE);
      let tipKlasor;
      if (evrakTipi === "Trafik Poliçesi") tipKlasor = altKlasorBulVeyaAc(ana, "Trafik Poliçeleri");
      else if (evrakTipi === "Kasko Poliçesi") tipKlasor = altKlasorBulVeyaAc(ana, "Kasko Poliçeleri");
      else if (evrakTipi === "Muayene") tipKlasor = altKlasorBulVeyaAc(ana, "Muayeneler");
      else if (evrakTipi === "Egzoz Emisyon") tipKlasor = altKlasorBulVeyaAc(ana, "Egzoz Emisyon");
      else if (evrakTipi === "Ruhsat") tipKlasor = altKlasorBulVeyaAc(ana, "Ruhsatlar");
      else if (evrakTipi === "Personel Evrakları") tipKlasor = altKlasorBulVeyaAc(ana, "Personel Evrakları");
      else tipKlasor = altKlasorBulVeyaAc(ana, "Genel Evrak");
      
      if (yillikYenilenen) {
        hedefKlasor = altKlasorBulVeyaAc(tipKlasor, "Aktif");
        const arsivKlasor = altKlasorBulVeyaAc(tipKlasor, "Arşiv");
        // Bu plakanın eski Aktif evraklarını Arşiv'e taşı
        const eskiler = hedefKlasor.getFiles();
        while (eskiler.hasNext()) {
          const eski = eskiler.next();
          if (eski.getName().toUpperCase().indexOf(plakaUst) === 0) {
            eski.moveTo(arsivKlasor);
          }
        }
      } else {
        hedefKlasor = tipKlasor;
      }
      
      const tipKisa = evrakTipi.toUpperCase().replace(/\s+/g, "-").replace(/Ç|Ğ|İ|Ö|Ş|Ü/g, function(c){
        return {"Ç":"C","Ğ":"G","İ":"I","Ö":"O","Ş":"S","Ü":"U"}[c];
      });
      dosyaAdi = plakaUst + "_" + tipKisa + "_" + tarihDosya + "." + uzanti;
    }
    
    // Yükle
    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64),
      mimeType || "application/pdf",
      dosyaAdi
    );
    const dosya = hedefKlasor.createFile(blob);
    dosya.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    logYaz("BASARI", "evrakYukleAkilli", plakaUst + " " + evrakTipi + " yüklendi: " + dosyaAdi);
    
    return {
      basarili: true,
      url: dosya.getUrl(),
      dosyaAdi: dosyaAdi,
      mesaj: "✅ Evrak başarıyla yüklendi: " + dosyaAdi
    };
    
  } catch (e) {
    logYaz("HATA", "evrakYukleAkilli", e.message);
    return { basarili: false, mesaj: e.message };
  }
}
/**
 * AŞAMA RAPORLAMA v3 — FİLO BİLGİSİ KARTI
 * ARAÇLAR - GENEL BİLGİLER sheet'inden filo özet bilgisi üretir.
 * Aktif araçlar (Durum = Aktif) baz alınır.
 */
function filoBilgisiGetir() {
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = "filoBilgisi_v" + CONFIG.VERSION;
    const cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET.ARAC_GENEL);
    if (!sheet || sheet.getLastRow() < 2) {
      return { basarili: false, mesaj: "Sheet bulunamadı veya boş" };
    }
    
    const headerMap = getHeaderMap(sheet);
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    
    // Sütun indeksleri (esnek — büyük/küçük harf ve boşluk toleranslı)
    function idxEsnek(adlar) {
      const keys = Object.keys(headerMap);
      for (var a = 0; a < adlar.length; a++) {
        var hedef = adlar[a].toLocaleLowerCase("tr-TR").replace(/\s+/g, "");
        for (var k = 0; k < keys.length; k++) {
          if (keys[k].toLocaleLowerCase("tr-TR").replace(/\s+/g, "") === hedef) return headerMap[keys[k]];
        }
      }
      return undefined;
    }
    const idxPlaka = idxEsnek(["Plaka"]);
    const idxMudurluk = idxEsnek(["Müdürlük", "Mudurluk"]);
    const idxModel = idxEsnek(["Model"]);
    const idxStatu = idxEsnek(["Araç Statüsü", "Arac Statusu", "Statü", "Statu"]);
    const idxYil = idxEsnek(["Model Yili", "Model Yılı"]);
    const idxDurum = idxEsnek(["Durum (Aktif/Pasif)", "Durum"]);
    
    let toplamAktif = 0;
    const mudurlukGrup = {}; // { "İsper": { toplam, alt:{ "Ana Kademe":x, "İKAME":y, "Geçici":z } } }
    const modelYilSayim = {}; // { "Custom 2021": 12, ... }
    const yilSayim = { "2015 ve oncesi": 0, "2016-2019": 0, "2020-2022": 0, "2023+": 0 };
    
    data.forEach(function(row) {
      // Aktif kontrol
      const durum = (idxDurum !== undefined && row[idxDurum]) ? row[idxDurum].toString().trim().toLowerCase() : "";
      if (durum && durum.indexOf("pasif") !== -1) return; // pasifse geç
      
      // Plaka boşsa gerçek araç değil — atla
      const plakaKontrol = (idxPlaka !== undefined && row[idxPlaka]) ? row[idxPlaka].toString().trim() : "";
      if (!plakaKontrol) return;
      
      toplamAktif++;
      
      // Statü (Ana Kademe / İKAME / Geçici)
      let statu = "Belirsiz";
      if (idxStatu !== undefined && row[idxStatu]) {
        const s = row[idxStatu].toString().trim();
        if (s) statu = s;
      }
      
      // Müdürlük — ana grup + statü kırılımı
      if (idxMudurluk !== undefined && row[idxMudurluk]) {
        const m = row[idxMudurluk].toString().trim();
        if (m) {
          let anaGrup;
          const mUpper = m.toLocaleUpperCase("tr-TR");
          if (mUpper.indexOf("İSPER") !== -1 || mUpper.indexOf("ISPER") !== -1) {
            anaGrup = "İsper";
          } else if (mUpper.indexOf("DESTEK") !== -1) {
            anaGrup = "Destek Hizmetleri";
          } else {
            anaGrup = "Diğer / Sınıflandırılmamış";
          }
          if (!mudurlukGrup[anaGrup]) mudurlukGrup[anaGrup] = { toplam: 0, modeller: {}, birim: {} };
          mudurlukGrup[anaGrup].toplam++;
          // Alt birim (İsper - Çocuk Hizm. → "Çocuk Hizm.")
          var altBirim = "Genel";
          if (m.indexOf("-") !== -1) {
            altBirim = m.split("-").slice(1).join("-").trim() || "Genel";
          }
          mudurlukGrup[anaGrup].birim[altBirim] = (mudurlukGrup[anaGrup].birim[altBirim] || 0) + 1;
          // müdürlük → model → { toplam, statu:{}, yil:{} }
          const mdl = (idxModel !== undefined && row[idxModel]) ? row[idxModel].toString().trim() : "Belirsiz";
          const mdlKey = mdl || "Belirsiz";
          if (!mudurlukGrup[anaGrup].modeller[mdlKey]) {
            mudurlukGrup[anaGrup].modeller[mdlKey] = { toplam: 0, statu: {}, yil: {} };
          }
          const mObj = mudurlukGrup[anaGrup].modeller[mdlKey];
          mObj.toplam++;
          mObj.statu[statu] = (mObj.statu[statu] || 0) + 1;
          const ylStr = (idxYil !== undefined && row[idxYil]) ? row[idxYil].toString().trim() : "—";
          if (ylStr && ylStr !== "—") mObj.yil[ylStr] = (mObj.yil[ylStr] || 0) + 1;
        }
      }
      
      // Model + Yıl birleşik ("Custom 2021") + statü kırılımı
      if (idxModel !== undefined && row[idxModel]) {
        const md = row[idxModel].toString().trim();
        const yl = (idxYil !== undefined && row[idxYil]) ? row[idxYil].toString().trim() : "";
        if (md) {
          const anahtar = (md + " " + yl).trim();
          if (!modelYilSayim[anahtar]) modelYilSayim[anahtar] = { toplam: 0, statu: {} };
          modelYilSayim[anahtar].toplam++;
          modelYilSayim[anahtar].statu[statu] = (modelYilSayim[anahtar].statu[statu] || 0) + 1;
        }
      }
      
      // Yıl aralığı
      if (idxYil !== undefined && row[idxYil]) {
        const yil = parseInt(row[idxYil]);
        if (!isNaN(yil)) {
          if (yil <= 2015) yilSayim["2015 ve oncesi"]++;
          else if (yil <= 2019) yilSayim["2016-2019"]++;
          else if (yil <= 2022) yilSayim["2020-2022"]++;
          else yilSayim["2023+"]++;
        }
      }
    });
    
    const sonuc = {
      basarili: true,
      toplamAktif: toplamAktif,
      mudurlukGrup: mudurlukGrup
    };
    
    cache.put(cacheKey, JSON.stringify(sonuc), 3600); // 1 saat cache
    return sonuc;
    
  } catch (e) {
    logYaz("HATA", "filoBilgisiGetir", e.message);
    return { basarili: false, mesaj: e.message };
  }
}
/**
 * AŞAMA YÖNETİM v3 — AKILLI UYARILAR MOTORU
 * 4 uyarı tipi döner: belge, periyodik, KM bildirmeyenler, yetkisiz kullanım
 */
function akilliUyarilarGetir() {
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = "akilliUyarilar_v" + CONFIG.VERSION;
    const cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const bugun = new Date();
    bugun.setHours(0, 0, 0, 0);
    
    const sonuc = {
      basarili: true,
      belge: [],
      periyodik: [],
      kmBildirmeyenler: [],
      yetkisizKullanim: []
    };
    
    // ============================================================
    // 1. BELGE YAKLAŞAN (Muayene/Egzoz/Trafik/Kasko 30 gün içinde)
    // ============================================================
    try {
      const bakim = ss.getSheetByName("Bakım Genel");
      if (bakim && bakim.getLastRow() > 1) {
        const headers = bakim.getRange(1, 1, 1, bakim.getLastColumn()).getValues()[0];
        const data = bakim.getRange(2, 1, bakim.getLastRow() - 1, bakim.getLastColumn()).getValues();
        
        function idxBul(arananKismi) {
          for (let i = 0; i < headers.length; i++) {
            const h = (headers[i] || "").toString().toLowerCase();
            if (h.indexOf(arananKismi.toLowerCase()) !== -1) return i;
          }
          return -1;
        }
        
        const idxPlaka = idxBul("plaka");
        const belgeTipleri = [
          { ad: "Muayene", idx: idxBul("muayene bitiş") },
          { ad: "Egzoz", idx: idxBul("egzoz") },
          { ad: "Trafik Sigortası", idx: idxBul("trafik sigorta") },
          { ad: "Kasko", idx: idxBul("kasko") }
        ];
        
        data.forEach(function(row) {
          const plaka = row[idxPlaka] ? row[idxPlaka].toString().trim() : "";
          if (!plaka) return;
          
          belgeTipleri.forEach(function(b) {
            if (b.idx === -1) return;
            const tarih = row[b.idx];
            if (!(tarih instanceof Date)) return;
            
            const tarihMs = new Date(tarih);
            tarihMs.setHours(0, 0, 0, 0);
            const gunFark = Math.floor((tarihMs - bugun) / (24 * 60 * 60 * 1000));
            
            if (gunFark < 0) {
              sonuc.belge.push({
                plaka: plaka,
                tip: b.ad,
                gunFark: gunFark,
                tarih: Utilities.formatDate(tarih, "Europe/Istanbul", "dd.MM.yyyy"),
                durum: "gecmis",
                metin: plaka + " — " + b.ad + " " + Math.abs(gunFark) + " gün önce bitti 🔴"
              });
            } else if (gunFark <= 30) {
              sonuc.belge.push({
                plaka: plaka,
                tip: b.ad,
                gunFark: gunFark,
                tarih: Utilities.formatDate(tarih, "Europe/Istanbul", "dd.MM.yyyy"),
                durum: "yaklasiyor",
                metin: plaka + " — " + b.ad + " " + gunFark + " gün sonra (" + Utilities.formatDate(tarih, "Europe/Istanbul", "dd.MM.yyyy") + ")"
              });
            }
          });
        });
        
        // Geçmiş önce, sonra en yakın yaklaşan
        sonuc.belge.sort(function(a, b) { return a.gunFark - b.gunFark; });
      }
    } catch (e) { logYaz("HATA", "akilliUyarilarGetir:belge", e.message); }
    
    // ============================================================
    // 2. PERİYODİK GECİKMİŞ (her plaka için son periyodik 30+ gün önce)
    // ============================================================
    try {
      const per = ss.getSheetByName(CONFIG.SHEET.PERIYODIK);
      if (per && per.getLastRow() > 1) {
        const headers = per.getRange(1, 1, 1, per.getLastColumn()).getValues()[0];
        const data = per.getRange(2, 1, per.getLastRow() - 1, per.getLastColumn()).getValues();
        
        let idxPlaka = -1, idxTarih = -1;
        for (let i = 0; i < headers.length; i++) {
          const h = (headers[i] || "").toString().toLowerCase();
          if (idxPlaka === -1 && h.indexOf("plaka") !== -1) idxPlaka = i;
          if (idxTarih === -1 && h === "tarih") idxTarih = i;
        }
        
        // Plaka başına son tarihi bul
        const sonPeriyodik = {};
        data.forEach(function(row) {
          const plaka = row[idxPlaka] ? row[idxPlaka].toString().trim().toUpperCase() : "";
          const tarih = row[idxTarih];
          if (!plaka || !(tarih instanceof Date)) return;
          if (!sonPeriyodik[plaka] || tarih > sonPeriyodik[plaka]) {
            sonPeriyodik[plaka] = tarih;
          }
        });
        
        // ARAÇLAR - GENEL BİLGİLER'den aktif plaka listesi
        const arac = ss.getSheetByName(CONFIG.SHEET.ARAC_GENEL);
        if (arac && arac.getLastRow() > 1) {
          const aBaslik = getHeaderMap(arac);
          const aData = arac.getRange(2, 1, arac.getLastRow() - 1, arac.getLastColumn()).getValues();
          const aPlakaIdx = aBaslik["Plaka"];
          const aDurumIdx = aBaslik["Durum (Aktif/Pasif)"] !== undefined ? aBaslik["Durum (Aktif/Pasif)"] : aBaslik["Durum"];
          
          aData.forEach(function(row) {
            const plaka = row[aPlakaIdx] ? row[aPlakaIdx].toString().trim().toUpperCase() : "";
            const durum = (aDurumIdx !== undefined && row[aDurumIdx]) ? row[aDurumIdx].toString().toLowerCase() : "";
            if (!plaka || durum.indexOf("pasif") !== -1) return;
            
            const sonTarih = sonPeriyodik[plaka];
            if (!sonTarih) {
              sonuc.periyodik.push({
                plaka: plaka,
                durum: "yok",
                metin: plaka + " — Periyodik bildirim hiç yok ⚠️"
              });
            } else {
              const t = new Date(sonTarih);
              t.setHours(0, 0, 0, 0);
              const gunFark = Math.floor((bugun - t) / (24 * 60 * 60 * 1000));
              if (gunFark > 30) {
                sonuc.periyodik.push({
                  plaka: plaka,
                  durum: "gecikmis",
                  gunFark: gunFark,
                  sonTarih: Utilities.formatDate(sonTarih, "Europe/Istanbul", "dd.MM.yyyy"),
                  metin: plaka + " — Son periyodik " + gunFark + " gün önce (" + Utilities.formatDate(sonTarih, "Europe/Istanbul", "dd.MM.yyyy") + ")"
                });
              }
            }
          });
          
          sonuc.periyodik.sort(function(a, b) { return (b.gunFark || 999) - (a.gunFark || 999); });
        }
      }
    } catch (e) { logYaz("HATA", "akilliUyarilarGetir:periyodik", e.message); }
    
    // ============================================================
    // 3. KM BİLDİRMEYENLER (bu ay)
    // ============================================================
    try {
      const km = ss.getSheetByName(CONFIG.SHEET.KM);
      if (km && km.getLastRow() > 0) {
        const aylar = ["OCAK","ŞUBAT","MART","NİSAN","MAYIS","HAZİRAN","TEMMUZ","AĞUSTOS","EYLÜL","EKİM","KASIM","ARALIK"];
        const buAy = aylar[bugun.getMonth()] + " " + bugun.getFullYear();
        const headers = km.getRange(1, 1, 1, km.getLastColumn()).getValues()[0];
        
        let aySutunIdx = -1;
        for (let i = 0; i < headers.length; i++) {
          const h = (headers[i] || "").toString().toUpperCase().trim();
          if (h === buAy || (h.indexOf(aylar[bugun.getMonth()]) !== -1 && h.indexOf(bugun.getFullYear().toString()) !== -1)) {
            aySutunIdx = i;
            break;
          }
        }
        
        if (aySutunIdx !== -1 && km.getLastRow() > 1) {
          const data = km.getRange(2, 1, km.getLastRow() - 1, km.getLastColumn()).getValues();
          let plakaIdx = -1;
          for (let i = 0; i < headers.length; i++) {
            if ((headers[i] || "").toString().toUpperCase().trim() === "PLAKA") { plakaIdx = i; break; }
          }
          
          if (plakaIdx !== -1) {
            data.forEach(function(row) {
              const plaka = row[plakaIdx] ? row[plakaIdx].toString().trim() : "";
              const aDeger = row[aySutunIdx];
              if (plaka && (!aDeger || aDeger === "" || isNaN(parseInt(aDeger)))) {
                sonuc.kmBildirmeyenler.push(plaka);
              }
            });
          }
        }
      }
    } catch (e) { logYaz("HATA", "akilliUyarilarGetir:km", e.message); }
    
    // ============================================================
    // 4. YETKİSİZ KULLANIM (geçici kullanım bildirimsiz)
    // ============================================================
    try {
      const arac = ss.getSheetByName(CONFIG.SHEET.ARAC_GENEL);
      const gunluk = ss.getSheetByName(CONFIG.SHEET.ARAC_GUNLUK_BILGILER);
      
      if (arac && gunluk && arac.getLastRow() > 1 && gunluk.getLastRow() > 1) {
        // Zimmetli şoför haritası
        const aHeader = getHeaderMap(arac);
        const aData = arac.getRange(2, 1, arac.getLastRow() - 1, arac.getLastColumn()).getValues();
        const aPlakaIdx = aHeader["Plaka"];
        const aEkipIdx = aHeader["Ekip Sorumlusu"];
        
        const zimmetli = {};
        aData.forEach(function(row) {
          const p = row[aPlakaIdx] ? row[aPlakaIdx].toString().trim().toUpperCase() : "";
          const e = (aEkipIdx !== undefined && row[aEkipIdx]) ? row[aEkipIdx].toString().trim().toUpperCase() : "";
          if (p) zimmetli[p] = e;
        });
        
        // Bugünkü saha kullanıcısı (Günlük sheet'in son satırı bugünkü olabilir)
        // Bu kontrolü basit yapacağız - sheet yapısını bilmeden tahmin yürütemem
        // İlerleyen sprintte detaylandırılır
      }
    } catch (e) { logYaz("HATA", "akilliUyarilarGetir:yetkisiz", e.message); }
    
    cache.put(cacheKey, JSON.stringify(sonuc), 1800); // 30 dk cache
    return sonuc;
    
  } catch (e) {
    logYaz("HATA", "akilliUyarilarGetir", e.message);
    return { basarili: false, mesaj: e.message };
  }
}
function bekleyenOnayKisa() {
  const sonuc = bekleyenOnaylariGetir();
  if (!sonuc.liste) return { basarili: false };
  return {
    basarili: true,
    son5: sonuc.liste.slice(0, 5).map(b => ({
      saat: b.saat,
      bildiren: b.bildiren,
      plaka: b.plaka,
      kategori: (b.kategori || '').replace(' BİLDİRİMİ','')
    }))
  };
}
/**
 * AŞAMA YÖNETİM v3 — ÇAPRAZ KONTROL MOTORU
 * 6 kontrol döner:
 * 1. Bildirimsiz emanet kullanım
 * 2. KM çelişkisi (geri sayım)
 * 3. Kayıp KM bildirimi
 * 4. Bildirimsiz kaza/hasar (Geçici Kullanım'da "yeni hasar" + kaza bildirimi yok)
 * 5. Yetkisiz şoför (ehliyet/SRC eksik/bitmiş ama araç kullanıyor)
 * 6. Servis çelişkisi (Araç Günlük "serviste" ama saha bildirimi yok)
 */
function caprazKontroller() {
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = "caprazKontrol_v" + CONFIG.VERSION;
    const cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sonuc = {
      basarili: true,
      bildirimsizEmanet: [],
      kmCeliski: [],
      bildirimsizKaza: [],
      yetkisizSofor: [],
      servisCelisi: []
    };
    
    // --- 1. BİLDİRİMSİZ EMANET KULLANIM ---
    // Araç Günlük Bilgiler'de "Tanımlı Şoför" ≠ "Güncel Şoför" AMA Geçici Kullanım'da kayıt YOK
    try {
      const gunluk = ss.getSheetByName("Araç Günlük Bilgiler");
      const gecici = ss.getSheetByName("Geçici Kullanım");
      
      if (gunluk && gunluk.getLastRow() > 1) {
        const gH = getHeaderMap(gunluk);
        const gData = gunluk.getRange(2, 1, gunluk.getLastRow()-1, gunluk.getLastColumn()).getValues();
        
        // Geçici Kullanım'da onaylı plakaları topla (son 7 gün)
        const geciciPlakalar = {};
        if (gecici && gecici.getLastRow() > 1) {
          const gcH = getHeaderMap(gecici);
          const gcData = gecici.getRange(2, 1, gecici.getLastRow()-1, gecici.getLastColumn()).getValues();
          const idxPl = gcH["PLAKA"];
          const idxTar = gcH["TARİH"];
          const yedi = new Date(); yedi.setDate(yedi.getDate()-7);
          gcData.forEach(function(r) {
            const p = (r[idxPl] || "").toString().trim().toUpperCase();
            const t = r[idxTar];
            if (p && (t instanceof Date) && t >= yedi) geciciPlakalar[p] = true;
          });
        }
        
        gData.forEach(function(r) {
          const plaka = (r[gH["Plaka"]] || "").toString().trim().toUpperCase();
          const tanimliSofor = (r[gH["Tanımlı Şoför"]] || "").toString().trim().toUpperCase();
          const guncelSofor = (r[gH["Güncel Şoför"]] || "").toString().trim().toUpperCase();
          if (!plaka || !tanimliSofor || !guncelSofor) return;
          if (tanimliSofor !== guncelSofor && !geciciPlakalar[plaka]) {
            sonuc.bildirimsizEmanet.push({
              plaka: plaka,
              tanimli: tanimliSofor,
              guncel: guncelSofor,
              metin: '<strong style="color:#ffd700;">' + plaka + '</strong> — <strong style="color:#90caf9;">Tanımlı:</strong> ' + tanimliSofor + ' · <strong style="color:#90caf9;">Güncel:</strong> ' + guncelSofor + ' · <strong style="color:#ff5252;">Bildirim YOK</strong>'
            });
          }
        });
      }
    } catch(e) { logYaz("HATA", "caprazKontroller:emanet", e.message); }
    
    // --- 2. KM ÇELİŞKİSİ (önceki aydan düşük) ---
    try {
      const km = ss.getSheetByName("Km Bilgisi");
      if (km && km.getLastRow() > 1) {
        const headers = km.getRange(1, 1, 1, km.getLastColumn()).getValues()[0];
        const data = km.getRange(2, 1, km.getLastRow()-1, km.getLastColumn()).getValues();
        const idxPlaka = headers.indexOf("Plaka");
        
        // Ay sütunlarını bul (OCAK ... ARALIK)
        const aySutunlari = [];
        for (let i = 0; i < headers.length; i++) {
          const h = (headers[i]||"").toString().toUpperCase().trim();
          if (/^(OCAK|ŞUBAT|MART|NİSAN|MAYIS|HAZİRAN|TEMMUZ|AĞUSTOS|EYLÜL|EKİM|KASIM|ARALIK) \d{4}$/.test(h)) {
            aySutunlari.push({ idx: i, ad: h });
          }
        }
        
        data.forEach(function(r) {
          const plaka = (r[idxPlaka] || "").toString().trim();
          if (!plaka) return;
          let onceki = null;
          for (let j = 0; j < aySutunlari.length; j++) {
            const v = parseInt(r[aySutunlari[j].idx]);
            if (!isNaN(v) && v > 0) {
              if (onceki !== null && v < onceki.deger) {
                sonuc.kmCeliski.push({
                  plaka: plaka,
                  metin: '<strong style="color:#ffd700;">' + plaka + '</strong> — <strong style="color:#90caf9;">' + aySutunlari[j].ad + ':</strong> ' + v + ' < <strong style="color:#90caf9;">' + onceki.ad + ':</strong> ' + onceki.deger + ' ⚠️'
                });
                break;
              }
              onceki = { deger: v, ad: aySutunlari[j].ad };
            }
          }
        });
      }
    } catch(e) { logYaz("HATA", "caprazKontroller:km", e.message); }
    
    // --- 3. KAYIP KM BİLDİRİMİ (bu ay) — akilliUyarilarGetir zaten yapıyor, atlıyoruz
    // (KM bildirmeyenler listesi Akıllı Uyarılar'da var)
    
    // --- 4. BİLDİRİMSİZ KAZA/HASAR ---
    // Geçici Kullanım'da "YENİ HASAR VEYA EKSİK BEYANI" doluysa AMA Saha Bildirimleri'nde KAZA yoksa
    try {
      const gecici = ss.getSheetByName("Geçici Kullanım");
      const saha = ss.getSheetByName("Saha Bildirimleri");
      
      if (gecici && gecici.getLastRow() > 1 && saha && saha.getLastRow() > 1) {
        const gcH = getHeaderMap(gecici);
        const gcData = gecici.getRange(2, 1, gecici.getLastRow()-1, gecici.getLastColumn()).getValues();
        const sH = getHeaderMap(saha);
        const sData = saha.getRange(2, 1, saha.getLastRow()-1, saha.getLastColumn()).getValues();
        
        // Kaza bildirimi olan plakaları topla
        const kazaPlakalar = {};
        const idxSPl = sH["3. Araç Plakası"];
        const idxSKat = sH["4. İşlem Kategorisi"];
        sData.forEach(function(r) {
          const p = (r[idxSPl] || "").toString().trim().toUpperCase();
          const k = (r[idxSKat] || "").toString().toUpperCase();
          if (p && k.indexOf("KAZA") !== -1) kazaPlakalar[p] = true;
        });
        
        const idxGPl = gcH["PLAKA"];
        const idxHasar = gcH["YENİ HASAR VEYA EKSİK BEYANI"];
        gcData.forEach(function(r) {
          const p = (r[idxGPl] || "").toString().trim().toUpperCase();
          const h = (r[idxHasar] || "").toString().trim();
          if (p && h && h.toUpperCase() !== "YOK" && h.toUpperCase() !== "TEMİZ" && !kazaPlakalar[p]) {
            sonuc.bildirimsizKaza.push({
              plaka: p,
              hasar: h,
              metin: p + " — Geçici kullanım'da hasar bildirilmiş ama KAZA kaydı YOK: " + h + " 🔴"
            });
          }
        });
      }
    } catch(e) { logYaz("HATA", "caprazKontroller:kaza", e.message); }
    
    // --- 5. YETKİSİZ ŞOFÖR (ehliyet bitiş / eksik evrak) ---
    try {
      const per = ss.getSheetByName("Personel Evrakları");
      if (per && per.getLastRow() > 1) {
        const pH = getHeaderMap(per);
        const pData = per.getRange(2, 1, per.getLastRow()-1, per.getLastColumn()).getValues();
        const idxAd = pH["Ad Soyad"];
        const idxEhBit = pH["Ehliyet Bitiş Tarihi"];
        const idxEksik = pH["Evrak Eksik/Pasif"];
        const bugun = new Date(); bugun.setHours(0,0,0,0);
        const yarın = new Date(bugun.getTime() + 30*24*60*60*1000);
        
        const tarihliUyarilar = [];
        const eksikEvrakli = [];
        
        pData.forEach(function(r) {
          const ad = (r[idxAd] || "").toString().trim();
          if (!ad) return;
          const ehBit = r[idxEhBit];
          
          if (ehBit instanceof Date) {
            if (ehBit < bugun) {
              tarihliUyarilar.push({ ad: ad, metin: ad + " — Ehliyet " + Math.floor((bugun - ehBit)/(86400000)) + " gün önce bitti 🔴" });
            } else if (ehBit < yarın) {
              const gun = Math.floor((ehBit - bugun)/(86400000));
              tarihliUyarilar.push({ ad: ad, metin: ad + " — Ehliyet " + gun + " gün sonra bitiyor" });
            }
          } else {
            const eksik = (r[idxEksik] || "").toString().trim().toUpperCase();
            if (eksik === "EVET" || eksik === "VAR" || !ehBit) {
              eksikEvrakli.push(ad);
            }
          }
        });
        
        sonuc.yetkisizSofor = tarihliUyarilar;
        sonuc.eksikEvrakli = eksikEvrakli;
      }
    } catch(e) { logYaz("HATA", "caprazKontroller:yetkisiz", e.message); }
    
    // --- 6. SERVİS ÇELİŞKİSİ ---
    // Araç Günlük "Araç Çalışma Durumu" = "SERVİSTE" AMA Saha Bildirimleri'nde son 7 gün servis yoksa
    try {
      const gunluk = ss.getSheetByName("Araç Günlük Bilgiler");
      const saha = ss.getSheetByName("Saha Bildirimleri");
      
      if (gunluk && gunluk.getLastRow() > 1 && saha && saha.getLastRow() > 1) {
        const gH = getHeaderMap(gunluk);
        const gData = gunluk.getRange(2, 1, gunluk.getLastRow()-1, gunluk.getLastColumn()).getValues();
        const sH = getHeaderMap(saha);
        const sData = saha.getRange(2, 1, saha.getLastRow()-1, saha.getLastColumn()).getValues();
        
        // Son 7 günde servis kaydı olan plakaları topla
        const yedi = new Date(); yedi.setDate(yedi.getDate()-7);
        const servisPlakalar = {};
        const idxSPl = sH["3. Araç Plakası"];
        const idxSKat = sH["4. İşlem Kategorisi"];
        const idxSTar = sH["1. İşlem Zamanı"];
        sData.forEach(function(r) {
          const p = (r[idxSPl] || "").toString().trim().toUpperCase();
          const k = (r[idxSKat] || "").toString().toUpperCase();
          const t = r[idxSTar];
          if (p && k.indexOf("SERVİS") !== -1 && (t instanceof Date) && t >= yedi) {
            servisPlakalar[p] = true;
          }
        });
        
        const idxGPl = gH["Plaka"];
        const idxDur = gH["Araç Çalışma Durumu"];
        gData.forEach(function(r) {
          const p = (r[idxGPl] || "").toString().trim().toUpperCase();
          const d = (r[idxDur] || "").toString().toUpperCase();
          if (p && d.indexOf("SERVİS") !== -1 && !servisPlakalar[p]) {
            sonuc.servisCelisi.push({
              plaka: p,
              metin: '<strong style="color:#ffd700;">' + p + '</strong> — Sistem <strong style="color:#90caf9;">"SERVİSTE"</strong> diyor ama son 7 günde <strong style="color:#ff5252;">SERVİS BİLDİRİMİ YOK</strong> ⚠️'
            });
          }
        });
      }
    } catch(e) { logYaz("HATA", "caprazKontroller:servis", e.message); }
    
    cache.put(cacheKey, JSON.stringify(sonuc), 1800);
    return sonuc;
    
  } catch (e) {
    logYaz("HATA", "caprazKontroller", e.message);
    return { basarili: false, mesaj: e.message };
  }
}
function testU(){ const s=akilliUyarilarGetir(); Logger.log(JSON.stringify({belge:s.belge.length, periyodik:s.periyodik.length, km:s.kmBildirmeyenler.length})); }
function kmTesti() {
  const sonuc = oncekiAyKMGetir("34CIF093");
  Logger.log("Önceki ay KM: " + sonuc);
}

// =======================================================================
// BİLDİRİLMEMİŞ HASAR DEDEKTÖRÜ (FLAGSHIP)
// =======================================================================

// Durum alanları + kötülük sırası (yüksek = kötü)
const HASAR_DURUM_SIRA = {
  "Giydirme Durumu":  { "KUSURSUZ":0, "İYİ":1, "YIPRANMIŞ":2, "HASARLI":3 },
  "Kaporta Durumu":   { "KUSURSUZ":0, "İYİ":1, "HAFİF HASARLI":2, "CİDDİ HASARLI":3 },
  "Lastik Durumu":    { "KUSURSUZ":0, "İYİ":1, "YIPRANMIŞ":2, "DEĞİŞMELİ":3 },
  "Cam Durumu":       { "KUSURSUZ":0, "ÇATLAK VAR":1, "KIRIK VAR":2 },
  "Lamba Durumu":     { "TAMAMI ÇALIŞIYOR":0, "EKSİK VAR":1 },
  "Klima Durumu":     { "ÇALIŞIYOR":0, "ÇALIŞMIYOR":1 },
  "Akü Durumu":       { "TAM":0, "ZAYIF":1 },
  "Genel Mekanik":    { "NORMAL":0, "ŞÜPHELİ":1, "SERVİSE GİTMESİ GEREKİYOR":2 }
};

function hasarSeviye(alan, deger) {
  const harita = HASAR_DURUM_SIRA[alan];
  if (!harita) return -1;
  const d = (deger || "").toString().trim().toLocaleUpperCase("tr-TR");
  return (harita[d] !== undefined) ? harita[d] : -1;
}

/**
 * Bildirilmemiş Hasar Dedektörü.
 * Bir plakanın son 2 periyodiğini karşılaştırır, kötüleşme + beyan yakalar,
 * iki tarih arası kaza/servis bildirimi yoksa "BİLDİRİLMEMİŞ" uyarır.
 */
function hasarDedektoru(plaka) {
  try {
    if (!plaka) return { basarili: false, mesaj: "Plaka boş" };
    const plakaUst = plaka.toString().trim().toUpperCase().replace(/\s+/g, "");
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // === 1. Periyodik kayıtları al (bu plaka) ===
    const pSheet = ss.getSheetByName(CONFIG.SHEET.PERIYODIK);
    if (!pSheet || pSheet.getLastRow() < 2) {
      return { basarili: false, mesaj: "Periyodik kayıt yok" };
    }
    const pMap = getHeaderMap(pSheet);
    const pData = pSheet.getRange(2, 1, pSheet.getLastRow()-1, pSheet.getLastColumn()).getValues();
    const pPlakaIdx = pMap["Plaka"];
    const pTarihIdx = pMap["Tarih"];

    const kayitlar = [];
    pData.forEach(function(row) {
      const p = (row[pPlakaIdx] || "").toString().trim().toUpperCase().replace(/\s+/g, "");
      if (p !== plakaUst) return;
      const t = row[pTarihIdx];
      kayitlar.push({ row: row, tarih: (t instanceof Date) ? t : null, tarihMs: (t instanceof Date) ? t.getTime() : 0 });
    });

    if (kayitlar.length < 2) {
      return { basarili: false, mesaj: "Karşılaştırma için en az 2 periyodik gerekli (bu plakada " + kayitlar.length + " var)" };
    }

    // Tarihe göre sırala (yeni → eski), son 2'yi al
    kayitlar.sort(function(a,b){ return b.tarihMs - a.tarihMs; });
    const yeni = kayitlar[0];
    const eski = kayitlar[1];

    // === 2. Durum karşılaştır + beyan kontrol ===
    const bulgular = [];
    const alanlar = Object.keys(HASAR_DURUM_SIRA);
    alanlar.forEach(function(alan) {
      const eskiDeger = (eski.row[pMap[alan]] || "").toString().trim();
      const yeniDeger = (yeni.row[pMap[alan]] || "").toString().trim();
      const eskiSv = hasarSeviye(alan, eskiDeger);
      const yeniSv = hasarSeviye(alan, yeniDeger);
      if (eskiSv !== -1 && yeniSv !== -1 && yeniSv > eskiSv) {
        bulgular.push({ alan: alan.replace(" Durumu",""), eski: eskiDeger, yeni: yeniDeger, tur: "kotulesme" });
      }
    });

    // Beyan: "Son 1 Ay Yeni Hasar/Yıpranma = Evet"
    const beyanAlanlar = ["Giydirme Son 1 Ay Yıpranma", "Kaporta Son 1 Ay Yıpranma"];
    beyanAlanlar.forEach(function(alan) {
      const v = (yeni.row[pMap[alan]] || "").toString().trim().toLocaleUpperCase("tr-TR");
      if (v.indexOf("EVET") !== -1) {
        bulgular.push({ alan: alan.replace(" Son 1 Ay Yıpranma",""), eski: "-", yeni: "Şoför beyanı: Evet, var", tur: "beyan" });
      }
    });

    // === 3. Ara dönem bildirim taraması (kaza/servis) ===
    const bas = eski.tarihMs, son = yeni.tarihMs;
    function bildirimSay(sheetAd, tarihBaslik) {
      const s = ss.getSheetByName(sheetAd);
      if (!s || s.getLastRow() < 2) return 0;
      const m = getHeaderMap(s);
      let pIdx = m["Plaka"]; if (pIdx === undefined) pIdx = m["Plakalar"];
      const tIdx = m[tarihBaslik];
      if (pIdx === undefined || tIdx === undefined) return 0;
      const d = s.getRange(2,1,s.getLastRow()-1,s.getLastColumn()).getValues();
      let say = 0;
      d.forEach(function(r){
        const p = (r[pIdx] || "").toString().trim().toUpperCase().replace(/\s+/g,"");
        if (p !== plakaUst) return;
        const t = r[tIdx];
        if (t instanceof Date && t.getTime() >= bas && t.getTime() <= son) say++;
      });
      return say;
    }
    const kazaSayisi = bildirimSay(CONFIG.SHEET.KAZA, "Olay Tarihi ve Saati");
    const servisSayisi = bildirimSay(CONFIG.SHEET.SERVIS, "Servis Giriş Tarihi ve Saati");

    // === 4. Foto linkleri (yeni periyodik satırından) ===
    const fotoAlanlar = ["Giydirme Fotoları","Ön/Arka Cephe Fotoları","Sağ/Sol Yan Fotoları","Aynalar Fotoları"];
    const fotolar = [];
    fotoAlanlar.forEach(function(fa){
      const v = (yeni.row[pMap[fa]] || "").toString().trim();
      if (v) fotolar.push({ etiket: fa, link: v });
    });

    const tarihStr = function(d){ return d ? Utilities.formatDate(d,"Europe/Istanbul","dd.MM.yyyy") : "?"; };

    // === 5. Sonuç ===
    const bildirimVar = (kazaSayisi + servisSayisi) > 0;
    const kritik = bulgular.length > 0 && !bildirimVar;

    return {
      basarili: true,
      plaka: plakaUst,
      eskiTarih: tarihStr(eski.tarih),
      yeniTarih: tarihStr(yeni.tarih),
      bulgular: bulgular,
      kazaSayisi: kazaSayisi,
      servisSayisi: servisSayisi,
      bildirimVar: bildirimVar,
      kritik: kritik,
      fotolar: fotolar
    };

  } catch (e) {
    logYaz("HATA", "hasarDedektoru", e.message);
    return { basarili: false, mesaj: e.message };
  }
}
function pasifAraclar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET.ARAC_GENEL);
  const headerMap = getHeaderMap(sheet);
  function idxE(adlar){ const ks=Object.keys(headerMap); for(var a=0;a<adlar.length;a++){var h=adlar[a].toLocaleLowerCase("tr-TR").replace(/\s+/g,"");for(var k=0;k<ks.length;k++){if(ks[k].toLocaleLowerCase("tr-TR").replace(/\s+/g,"")===h)return headerMap[ks[k]];}}return undefined; }
  const iPlaka = idxE(["Plaka"]);
  const iMud = idxE(["Müdürlük","Mudurluk"]);
  const iDurum = idxE(["Durum (Aktif/Pasif)","Durum"]);
  const data = sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getValues();
  const pasif = [];
  data.forEach(function(row){
    const plaka = (row[iPlaka]||"").toString().trim();
    if(!plaka) return; // boş satır
    const durum = (iDurum!==undefined&&row[iDurum])?row[iDurum].toString().trim():"";
    if(durum.toLowerCase().indexOf("pasif")!==-1){
      pasif.push(plaka + "  →  durum:[" + durum + "]  müdürlük:[" + (row[iMud]||"") + "]");
    }
  });
  Logger.log("PASİF sayılan " + pasif.length + " dolu araç:\n" + pasif.join("\n"));
}

function hasarTesti() {
  Logger.log(JSON.stringify(hasarDedektoru("34CIF093"), null, 2));
}
function filoTest() {
  CacheService.getScriptCache().remove("filoBilgisi_v" + CONFIG.VERSION);
  const s = filoBilgisiGetir();
  Logger.log(JSON.stringify(s, null, 2));
}
function uyariTest() {
  Logger.log("UYARI: " + JSON.stringify(akilliUyarilarGetir()).substring(0,200));
  Logger.log("CAPRAZ: " + JSON.stringify(caprazKontroller()).substring(0,200));
  Logger.log("BEKLEYEN: " + JSON.stringify(bekleyenOnaylariGetir()).substring(0,200));
}