// =========================================================================
// VIPERCELL - CLEAN MUTATION VALIDATOR (DENGAN AUTH BOT)
// =========================================================================

const PROJECT_ID = 'vipercell-fc50e';
const API_KEY = 'AIzaSyBQGZjl7uj5CRiLWCvPQKjiK4HvIYnXSJg'; // API Key Firebase

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var judul = data.judul || data.title || "-";
    var pesan = data.pesan || data.text || data.body || "-";
    var teksNotifikasi = judul + " " + pesan;
    
    // Ekstraksi Nominal
    var regex = /(?:Rp|IDR|Dana Masuk|Transfer|Sebesar|Terima)\s*\.?\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]+)?)/i;
    var match = teksNotifikasi.match(regex);
    
    var nominalBersih = 0;
    var statusSistem = "";
    var sukses = false;
    
    if (match) {
      nominalBersih = parseInt(match[1].replace(/[^0-9]/g, ''), 10);
      
      if (nominalBersih > 0) {
        // 1. CARI PESANAN DI FIREBASE
        var pesanan = cariPesananAktif(nominalBersih);
        
        if (pesanan) {
          // 2. UPDATE STATUS KE SUCCESS (pakai akun bot, bukan API key polos)
          var updateBerhasil = updateStatus(pesanan.path, "SUCCESS");
          
          if (updateBerhasil) {
            statusSistem = "SUKSES: Invoice " + pesanan.id + " diverifikasi!";
            sukses = true;
          } else {
            statusSistem = "ERROR: Gagal update status di Firebase.";
          }
        } else {
          statusSistem = "INFO: Tidak ada order UNPAID/PENDING dengan total Rp" + nominalBersih;
        }
      } else {
        statusSistem = "ABAIKAN: Nominal Rp 0";
      }
    } else {
      statusSistem = "ABAIKAN: Bukan format mutasi pembayaran";
    }
    
    // Tetap catat ke Google Sheets untuk riwayat
    catatKeSheets(judul, pesan, nominalBersih, statusSistem);
    
    return responJSON(sukses, statusSistem);
    
  } catch (error) {
    catatKeSheets("CRITICAL ERROR", error.toString(), 0, "GAGAL EKSEKUSI");
    return responJSON(false, error.toString());
  }
}

// =========================================================================
// AUTH BOT
// Kredensial diambil dari Script Properties (Project Settings > Script
// Properties), BUKAN hardcode. Set key: BOT_EMAIL dan BOT_PASSWORD
// dengan nilai akun bot yang sudah dibuat di Firebase Authentication.
// =========================================================================
function getBotIdToken() {
  const props = PropertiesService.getScriptProperties();
  const email = props.getProperty('BOT_EMAIL');
  const password = props.getProperty('BOT_PASSWORD');
  
  if (!email || !password) {
    throw new Error('BOT_EMAIL / BOT_PASSWORD belum diset di Script Properties.');
  }
  
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
  const payload = { email: email, password: password, returnSecureToken: true };
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const res = UrlFetchApp.fetch(url, options);
  const data = JSON.parse(res.getContentText());
  if (!data.idToken) {
    throw new Error('Gagal login bot: ' + res.getContentText());
  }
  return data.idToken;
}

// =========================================================================
// FUNGSI FIREBASE
// =========================================================================
function cariPesananAktif(nominalMasuk) {
  // Query masih pakai API key saja karena rule "read" untuk orders
  // tetap "allow read, create: if true" (tidak dikunci di rules baru).
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`;
  const payload = {
    "structuredQuery": {
      "from": [{ "collectionId": "orders" }],
      "where": {
        "fieldFilter": {
          "field": { "fieldPath": "status" },
          "op": "IN",
          "value": { "arrayValue": { "values": [{ "stringValue": "UNPAID" }, { "stringValue": "PENDING" }] } }
        }
      }
    }
  };
  
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    if (!result || result.length === 0 || !result[0].document) return null;
    
    for (var i = 0; i < result.length; i++) {
      if (result[i].document && result[i].document.fields) {
        var fields = result[i].document.fields;
        var rawTotal = fields.finalTotal || fields.total_harga || fields.total;
        var dbTotal = rawTotal ? (rawTotal.integerValue || rawTotal.doubleValue || rawTotal.stringValue) : 0;
        
        if (parseInt(dbTotal, 10) === nominalMasuk) {
          var rawId = fields.id || fields.order_id || fields.orderId;
          var orderId = rawId ? (rawId.stringValue || rawId.integerValue) : "Unknown";
          return { path: result[i].document.name, id: orderId };
        }
      }
    }
  } catch (e) {}
  return null;
}

function updateStatus(pathDokumen, statusBaru) {
  // Sekarang login sebagai bot dulu supaya request.auth != null di rules.
  var idToken;
  try {
    idToken = getBotIdToken();
  } catch (e) {
    return false;
  }
  
  const url = `https://firestore.googleapis.com/v1/${pathDokumen}?updateMask.fieldPaths=status`;
  const payload = { "fields": { "status": { "stringValue": statusBaru } } };
  const options = {
    method: "patch",
    contentType: "application/json",
    headers: { "Authorization": "Bearer " + idToken },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  try { return (UrlFetchApp.fetch(url, options).getResponseCode() === 200); } catch (e) { return false; }
}

// =========================================================================
// FUNGSI PENDUKUNG
// =========================================================================
function catatKeSheets(judul, pesan, nominal, status) {
  try {
    SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().appendRow([new Date(), judul, pesan, nominal, status]);
  } catch (e) {}
}

function responJSON(sukses, info) {
  return ContentService.createTextOutput(JSON.stringify({ "sukses": sukses, "info": info })).setMimeType(ContentService.MimeType.JSON);
}