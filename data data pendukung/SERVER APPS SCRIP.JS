// =========================================================================
// VIPERCELL - CLEAN MUTATION VALIDATOR (TANPA BOT TELEGRAM)
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
          // 2. UPDATE STATUS KE SUCCESS
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
// FUNGSI FIREBASE
// =========================================================================
function cariPesananAktif(nominalMasuk) {
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
  const url = `https://firestore.googleapis.com/v1/${pathDokumen}?updateMask.fieldPaths=status&key=${API_KEY}`;
  const payload = { "fields": { "status": { "stringValue": statusBaru } } };
  const options = {
    method: "patch",
    contentType: "application/json",
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