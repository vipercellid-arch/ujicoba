/* ============================================================================
 * VIPERCELL — SERVER VALIDASI PEMBAYARAN QRIS OTOMATIS v27.5
 * Nama File : SERVER_APPS_SCRIP.js
 * Arsitektur: Direct Firebase Push (MacroDroid POST JSON -> Apps Script -> Firebase)
 *             Web User & Web Admin TIDAK melakukan polling ke Apps Script!
 *
 * ============================================================================
 * PANDUAN KONFIGURASI HTTP REQUEST DI APLIKASI MACRODROID:
 * ----------------------------------------------------------------------------
 * 1. Trigger (Pemicu) : Notification Received (Notifikasi Diterima)
 *    - Pilih Aplikasi : GoPay Merchant / Dana Bisnis / ShopeePay / QRIS / Bank
 * 2. Action (Tindakan): HTTP Request (Permintaan HTTP)
 *    - Request Method : POST
 *    - URL            : Paste URL Web App Google Apps Script Anda (akhiran /exec)
 *    - Content Type   : application/json
 *    - Body (Isi Teks): Salin dan tempel format JSON di bawah ini:
 *
 * {
 *   "secret": "VIPERCELL_SECRET_2026",
 *   "app": "{not_app_name}",
 *   "title": "{not_title}",
 *   "text": "{not_text}",
 *   "big_text": "{not_big_text}"
 * }
 *
 * (Catatan: Di pengaturan bawah HTTP Request MacroDroid, centang "Follow Redirects"
 *  atau "Ikuti Pengalihan" jika opsi tersebut tersedia).
 * ============================================================================ */

const VIPERCELL_CONFIG = {
  // Project ID & Web API Key Firebase Resmi Vipercell
  FIREBASE_PROJECT_ID: 'vipercell-fc50e',
  WORKSPACE_APP_ID: 'vipercell-prod',
  FIREBASE_API_KEY: 'AIzaSyBQGZjl7uj5CRiLWCvPQKjiK4HvIYnXSJg',

  // Kredensial Admin Resmi (Sesuai rules database firebase.js & bot_info.js)
  ADMIN_EMAIL: 'vipercell.id@gmail.com',
  ADMIN_PASS: 'Melati@12',

  // Kunci Rahasia Webhook
  WEBHOOK_SECRET: 'VIPERCELL_SECRET_2026',
  LEGACY_SECRET: 'KUNCI_RAHASIA_VIPERCELL',

  // Durasi cache pencegahan duplikat notifikasi (detik)
  IDEMPOTENCY_TTL_SECONDS: 180
};

/**
 * Jalankan fungsi ini 1x di Editor Apps Script (Pilih "setupAndAuthorize" lalu klik "Jalankan / Run")
 * untuk memberikan izin akses jaringan dari Apps Script ke Firebase.
 */
function setupAndAuthorize() {
  var token = getValidFirebaseAdminToken();
  Logger.log('✅ Otorisasi Server Validasi QRIS Vipercell v27.5 Berhasil! Token Admin: ' + (token ? 'AKTIF' : 'PUBLIC REST'));
}

/**
 * Handler HTTP GET (Untuk cek status server di browser atau MacroDroid GET)
 */
function doGet(e) {
  return handleUnifiedWebhookRequest(e, 'GET');
}

/**
 * Handler HTTP POST (Jalur Utama MacroDroid POST JSON)
 */
function doPost(e) {
  return handleUnifiedWebhookRequest(e, 'POST');
}

/**
 * Router Utama Validasi Pembayaran QRIS
 */
function handleUnifiedWebhookRequest(e, method) {
  var startMs = Date.now();
  try {
    var payload = parseIncomingPayload(e);
    var projectId = String(
      payload.projectId || getScriptProp('FIREBASE_PROJECT_ID') || VIPERCELL_CONFIG.FIREBASE_PROJECT_ID
    ).trim();
    if (projectId === 'vipercell-store' || !projectId) {
      projectId = VIPERCELL_CONFIG.FIREBASE_PROJECT_ID;
    }

    var action = String(payload.action || payload.route || payload.type || '').toUpperCase().trim();

    // 1. Endpoint Ping / Tes Koneksi dari Tombol Tes di Panel Admin
    if (action === 'PING_TEST' || action === 'STATUS') {
      var tokenOk = Boolean(getValidFirebaseAdminToken());
      return buildJsonResponse({
        ok: true,
        status: 'ok',
        version: 'V27.5-DIRECT-FIREBASE',
        engine: 'VIPERCELL_QRIS_DIRECT_FIREBASE_ENGINE',
        adminAuthReady: tokenOk,
        method: method,
        projectId: projectId,
        timestamp: new Date().toISOString(),
        message: 'Server Validasi QRIS v27.5 Aktif & Terhubung Langsung ke Firebase!'
      });
    }

    // 2. Jika dibuka lewat browser (GET) tanpa parameter notifikasi/nominal
    if (
      method === 'GET' &&
      !payload.amount &&
      !payload.nominal &&
      !payload.text &&
      !payload.not_text &&
      !payload.big_text &&
      !payload.not_big_text &&
      !payload.notification &&
      !payload.title &&
      !payload.not_title &&
      !payload.message &&
      !payload.raw_body
    ) {
      return buildJsonResponse({
        ok: true,
        status: 'ok',
        version: 'V27.5-DIRECT-FIREBASE',
        engine: 'VIPERCELL_QRIS_DIRECT_FIREBASE_ENGINE',
        projectId: projectId,
        timestamp: Date.now(),
        message: 'Server Validasi QRIS Vipercell v27.5 Aktif. Siap menerima POST JSON dari MacroDroid.'
      });
    }

    // 3. Eksekusi Validasi Pembayaran QRIS dari MacroDroid -> Langsung Ubah Status di Firebase
    return handleMacroDroidPaymentWebhook(payload, projectId, startMs);

  } catch (err) {
    return buildJsonResponse({
      ok: false,
      status: 'error',
      error: 'INTERNAL_WEBHOOK_ERROR',
      message: err && err.message ? err.message : String(err)
    });
  }
}

/* ============================================================================
 * 1. PARSER PAYLOAD MACRODROID ANTI-GAGAL
 *    Sanggup membaca JSON standar, JSON dengan karakter Enter/baris baru dari
 *    notifikasi Android ({not_text}, {not_big_text}), Form-UrlEncoded, maupun teks mentah.
 * ============================================================================ */
function parseIncomingPayload(e) {
  var data = {};

  if (e && e.parameter) {
    Object.keys(e.parameter).forEach(function(k) {
      data[k] = e.parameter[k];
    });
  }

  if (e && e.postData && e.postData.contents) {
    var rawContents = String(e.postData.contents).trim();
    data.raw_body = rawContents;

    if (rawContents) {
      var parsedJson = tryParseMacroDroidJsonSafe(rawContents);
      if (parsedJson && typeof parsedJson === 'object') {
        Object.keys(parsedJson).forEach(function(k) {
          data[k] = parsedJson[k];
        });
      } else if (rawContents.indexOf('=') !== -1 && rawContents.indexOf('{') === -1) {
        var pairs = rawContents.split('&');
        for (var i = 0; i < pairs.length; i++) {
          var eqPos = pairs[i].indexOf('=');
          if (eqPos > 0) {
            var pKey = decodeURIComponent(pairs[i].substring(0, eqPos).replace(/\+/g, ' ')).trim();
            var pVal = decodeURIComponent(pairs[i].substring(eqPos + 1).replace(/\+/g, ' ')).trim();
            data[pKey] = pVal;
          }
        }
      }
    }
  }

  return data;
}

function tryParseMacroDroidJsonSafe(rawStr) {
  if (!rawStr) return null;

  // Percobaan 1: JSON.parse standar
  try {
    return JSON.parse(rawStr);
  } catch (e1) {}

  // Percobaan 2: Bersihkan karakter Enter/newline/tab di dalam string JSON MacroDroid
  try {
    var sanitized = rawStr
      .replace(/\r\n/g, ' ')
      .replace(/\n/g, ' ')
      .replace(/\r/g, ' ')
      .replace(/\t/g, ' ');
    return JSON.parse(sanitized);
  } catch (e2) {}

  // Percobaan 3: Ekstraksi Regex jika isi notifikasi mengandung tanda kutip ganda (")
  var extracted = {};
  var foundAny = false;
  var knownKeys = [
    'action', 'route', 'type', 'secret', 'key', 'token', 'projectId',
    'app', 'app_name', 'appName', 'package',
    'title', 'not_title', 'notif_title',
    'text', 'not_text', 'notif_text', 'notification_text',
    'big_text', 'not_big_text', 'bigText', 'notification',
    'message', 'pesan', 'body', 'content', 'isi', 'subText', 'ticker',
    'amount', 'nominal', 'total', 'uang', 'nilai'
  ];

  for (var i = 0; i < knownKeys.length; i++) {
    var k = knownKeys[i];
    var reg = new RegExp('"' + k + '"\\s*:\\s*(?:"([^"]*)"|([0-9]+(?:\\.[0-9]+)?)|true|false)', 'i');
    var m = reg.exec(rawStr);
    if (m) {
      extracted[k] = m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : '');
      foundAny = true;
    }
  }

  var strippedText = rawStr.replace(/[{}"\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (strippedText) {
    extracted.raw_body = rawStr;
    if (!extracted.text) extracted.text = strippedText;
    foundAny = true;
  }

  return foundAny ? extracted : null;
}

/* ============================================================================
 * 2. MESIN UTAMA VALIDASI PEMBAYARAN QRIS -> LANGSUNG UBAH UNPAID KE PAID DI FIREBASE
 * ============================================================================ */
function handleMacroDroidPaymentWebhook(payload, projectId, startMs) {
  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    hasLock = lock.tryLock(10000);
  } catch (lockErr) {}

  try {
    var appName = String(
      payload.app || payload.app_name || payload.appName || payload.package || 'MacroDroid-QRIS'
    ).trim();
    var title = String(
      payload.title || payload.not_title || payload.notif_title || ''
    ).trim();
    var text = String(
      payload.text || payload.not_text || payload.notif_text || payload.notification_text ||
      payload.message || payload.pesan || payload.body || payload.content || payload.isi || ''
    ).trim();
    var bigText = String(
      payload.big_text || payload.not_big_text || payload.bigText ||
      payload.notification || payload.subText || payload.ticker || payload.raw_body || ''
    ).trim();
    var directAmount = payload.amount || payload.nominal || payload.total || payload.uang || payload.nilai || '';

    var combinedParts = [directAmount, title, text, bigText];
    Object.keys(payload).forEach(function(k) {
      var lowK = k.toLowerCase();
      if (lowK !== 'secret' && lowK !== 'key' && lowK !== 'token' && lowK !== 'projectid' && lowK !== 'action') {
        var valStr = String(payload[k] || '').trim();
        if (valStr && combinedParts.indexOf(valStr) === -1) {
          combinedParts.push(valStr);
        }
      }
    });

    var combinedRawText = combinedParts.filter(Boolean).join(' | ');
    if (!combinedRawText) {
      return buildJsonResponse({
        ok: false,
        status: 'error',
        error: 'EMPTY_NOTIFICATION',
        message: 'Tidak ada teks notifikasi atau nominal yang dikirim.'
      });
    }

    // Ekstrak seluruh kandidat nominal uang dari teks notifikasi
    var candidateAmounts = extractSmartCurrencyAmounts(combinedRawText, directAmount);
    if (!candidateAmounts || candidateAmounts.length === 0) {
      return buildJsonResponse({
        ok: false,
        status: 'ignored',
        error: 'NO_VALID_AMOUNT_DETECTED',
        rawText: combinedRawText.substring(0, 350),
        message: 'Tidak ditemukan angka nominal pembayaran yang valid pada notifikasi.'
      });
    }

    var primaryAmount = candidateAmounts[0];
    var nowMs = Date.now();
    var nowIso = new Date(nowMs).toISOString();
    var mutationId = 'MUT-' + nowMs + '-' + Math.floor(100 + Math.random() * 900);

    var mutationDoc = {
      mutationId: mutationId,
      amount: primaryAmount,
      candidateAmounts: candidateAmounts,
      appName: appName,
      title: title,
      text: text || bigText,
      rawText: combinedRawText.substring(0, 500),
      receivedAt: nowMs,
      receivedAtIso: nowIso,
      matchedOrderId: '',
      status: 'UNMATCHED',
      source: 'MACRODROID_WEBHOOK'
    };

    // LANGSUNG MASUK KE FIREBASE & UBAH STATUS ORDER DARI UNPAID -> PAID / SUCCESS
    var matchedOrders = findAndSettleUnpaidOrdersByAmountInFirebase(projectId, candidateAmounts, mutationDoc, nowMs);

    if (matchedOrders.length > 0) {
      mutationDoc.matchedOrderId = matchedOrders.map(function(o) { return o.invoice || o.orderId; }).join(', ');
      mutationDoc.status = 'MATCHED';
    }

    // Catat juga sinyal mutasi ke settings/mainConfig & payment_mutations menggunakan Token Admin
    var adminToken = getValidFirebaseAdminToken();
    firestoreSetDocument(projectId, 'payment_mutations', mutationId, mutationDoc, adminToken);
    firestorePatchDocument(projectId, 'settings', 'mainConfig', {
      lastPaymentDetected: primaryAmount,
      lastPaymentTimestamp: nowMs,
      lastPaymentMutation: {
        mutationId: mutationId,
        amount: primaryAmount,
        candidateAmounts: candidateAmounts,
        appName: appName,
        timestamp: nowMs,
        matchedOrderIds: matchedOrders.map(function(o) { return o.invoice || o.orderId; })
      }
    }, adminToken);

    return buildJsonResponse({
      ok: true,
      status: 'ok',
      mutationId: mutationId,
      detectedAmount: primaryAmount,
      allCandidates: candidateAmounts,
      matchedOrdersCount: matchedOrders.length,
      matchedOrders: matchedOrders,
      latencyMs: Date.now() - startMs,
      timestamp: nowIso,
      message: matchedOrders.length > 0
        ? 'Pembayaran cocok! Status pesanan di Firebase berhasil diubah dari UNPAID ke PAID/SUCCESS.'
        : 'Nominal Rp' + primaryAmount + ' tercatat di Firebase (belum ada tagihan UNPAID dengan nominal tersebut).'
    });

  } finally {
    if (hasLock) {
      try { lock.releaseLock(); } catch (e) {}
    }
  }
}

/* ============================================================================
 * 3. SMART MULTI-PATTERN CURRENCY EXTRACTOR
 * ============================================================================ */
function extractSmartCurrencyAmounts(rawText, directAmount) {
  var results = [];

  function addCandidate(val) {
    var num = parseInt(val, 10);
    if (!isNaN(num) && num >= 100 && num <= 50000000 && results.indexOf(num) === -1) {
      results.push(num);
    }
  }

  if (directAmount !== undefined && directAmount !== null && String(directAmount).trim() !== '') {
    var cleanedDirect = cleanCurrencyString(String(directAmount));
    if (cleanedDirect) addCandidate(cleanedDirect);
  }

  if (!rawText) return results;

  var text = String(rawText);

  // 1. Bersihkan pola Tanggal (21/10/2026, 2026-10-21) & Jam (08:25:10, 08.25 WIB/WIT/WITA)
  text = text.replace(/\b\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}\b/g, ' ');
  text = text.replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ');
  text = text.replace(/\b\d{1,2}\.\d{2}\s*(WIB|WITA|WIT|AM|PM)\b/gi, ' ');

  // 2. Prioritas Utama: Angka yang didahului Rp / IDR / kata kunci pembayaran
  var rpRegex = /(?:Rp\.?|IDR|sebesar|senilai|masuk|diterima|pembayaran|qris|total|nominal|\+)\s*[:\.]?\s*([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{1,2})?|[0-9]{3,8}(?:[.,][0-9]{1,2})?)/gi;
  var match;
  while ((match = rpRegex.exec(text)) !== null) {
    var parsed = cleanCurrencyString(match[1]);
    if (parsed) addCandidate(parsed);
  }

  // 3. Prioritas Kedua: Angka ribuan (15.123 atau 15,123) atau angka 3-8 digit
  var genericRegex = /\b([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{1,2})?|[0-9]{3,8})\b/g;
  while ((match = genericRegex.exec(text)) !== null) {
    var rawToken = match[1];
    var parsedGen = cleanCurrencyString(rawToken);
    if (parsedGen && (parsedGen < 2020 || parsedGen > 2035 || rawToken.indexOf('.') !== -1 || rawToken.indexOf(',') !== -1)) {
      addCandidate(parsedGen);
    }
  }

  return results;
}

function cleanCurrencyString(str) {
  if (!str) return null;
  var s = String(str).trim();
  // Hapus sen desimal 2 digit di ujung (,00 atau .00 atau ,-)
  s = s.replace(/[.,]\d{2}$/, '').replace(/,-$/, '');
  var digitsOnly = s.replace(/[^0-9]/g, '');
  if (!digitsOnly) return null;
  return parseInt(digitsOnly, 10);
}

/* ============================================================================
 * 4. PENCARIAN LANGSUNG BERDASARKAN NOMINAL (`finalTotal` / `uniqueTotal`) &
 *    PERUBAHAN STATUS ORDER DARI `UNPAID` -> `PAID` (DENGAN FALLBACK `SUCCESS`)
 *
 *    Kenapa jauh lebih akurat dibanding versi lama?
 *    - Versi lama mencari `where status == 'UNPAID' limit 50`, sehingga jika ada
 *      banyak tagihan lama yang tidak dibayar, tagihan baru tertutup di urutan >50!
 *    - Versi v27.5 ini mencari LANGSUNG berdasarkan indeks nominal `finalTotal == nominal`
 *      dan `uniqueTotal == nominal`, sehingga langsung menemukan dokumen order yang
 *      tepat dalam hitungan milidetik berapapun jumlah total order di database!
 * ============================================================================ */
function findAndSettleUnpaidOrdersByAmountInFirebase(projectId, candidateAmounts, mutationDoc, nowMs) {
  var matchedList = [];
  if (!projectId || !candidateAmounts || candidateAmounts.length === 0) return matchedList;

  var baseUrl = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(projectId) + '/databases/(default)/documents';
  var wsParentUrl = baseUrl + '/artifacts/' + encodeURIComponent(VIPERCELL_CONFIG.WORKSPACE_APP_ID) + '/public/data';
  var adminToken = getValidFirebaseAdminToken();

  try {
    var candidateDocs = [];
    var seenDocNames = {};

    function collectFromQueryResponse(res, isWs) {
      if (!res || res.getResponseCode() !== 200) return;
      var rows = JSON.parse(res.getContentText() || '[]');
      if (!Array.isArray(rows)) return;
      for (var r = 0; r < rows.length; r++) {
        var docObj = rows[r] && rows[r].document;
        if (docObj && docObj.name && docObj.fields && !seenDocNames[docObj.name]) {
          seenDocNames[docObj.name] = true;
          candidateDocs.push({ doc: docObj, isWorkspace: isWs });
        }
      }
    }

    // 1. Query Spesifik Berdasarkan Nominal (finalTotal & uniqueTotal) — Bebas Tertutup Order Lama!
    var targetAmounts = candidateAmounts.slice(0, 5);
    for (var a = 0; a < targetAmounts.length; a++) {
      var amtVal = targetAmounts[a];
      var qFinalTotal = {
        structuredQuery: {
          from: [{ collectionId: 'orders' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'finalTotal' },
              op: 'EQUAL',
              value: { integerValue: String(amtVal) }
            }
          },
          limit: 25
        }
      };

      var qUniqueTotal = {
        structuredQuery: {
          from: [{ collectionId: 'orders' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'uniqueTotal' },
              op: 'EQUAL',
              value: { integerValue: String(amtVal) }
            }
          },
          limit: 25
        }
      };

      var resRootFinal = fetchFirestoreSmart(baseUrl + ':runQuery', 'post', qFinalTotal, adminToken);
      collectFromQueryResponse(resRootFinal, false);

      var resWsFinal = fetchFirestoreSmart(wsParentUrl + ':runQuery', 'post', qFinalTotal, adminToken);
      collectFromQueryResponse(resWsFinal, true);

      if (candidateDocs.length === 0) {
        var resRootUnique = fetchFirestoreSmart(baseUrl + ':runQuery', 'post', qUniqueTotal, adminToken);
        collectFromQueryResponse(resRootUnique, false);

        var resWsUnique = fetchFirestoreSmart(wsParentUrl + ':runQuery', 'post', qUniqueTotal, adminToken);
        collectFromQueryResponse(resWsUnique, true);
      }
    }

    // 2. Cadangan Tambahan: Query status == UNPAID (limit 150) jika nominal disimpan sebagai tipe lain
    if (candidateDocs.length === 0) {
      var qUnpaid = {
        structuredQuery: {
          from: [{ collectionId: 'orders' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'status' },
              op: 'EQUAL',
              value: { stringValue: 'UNPAID' }
            }
          },
          limit: 150
        }
      };
      collectFromQueryResponse(fetchFirestoreSmart(baseUrl + ':runQuery', 'post', qUnpaid, adminToken), false);
      collectFromQueryResponse(fetchFirestoreSmart(wsParentUrl + ':runQuery', 'post', qUnpaid, adminToken), true);
    }

    // 3. Periksa setiap kandidat order dan ubah status dari UNPAID -> PAID (atau SUCCESS)
    for (var i = 0; i < candidateDocs.length; i++) {
      var entry = candidateDocs[i];
      var rowDoc = entry.doc;
      var docName = rowDoc.name;
      var docId = docName.split('/').pop();
      var fields = unwrapFirestoreFields(rowDoc.fields);

      var currentStatus = String(fields.status || '').toUpperCase();
      // Hanya proses order yang masih menunggu pembayaran (UNPAID / PENDING_PAYMENT)
      if (currentStatus !== 'UNPAID' && currentStatus !== 'PENDING_PAYMENT') {
        continue;
      }

      var finalTotal = Math.round(Number(fields.finalTotal || 0));
      var uniqueTotal = Math.round(Number(fields.uniqueTotal || fields.totalPrice || fields.totalAmount || fields.amount || 0));
      var expiresAt = Number(fields.expiresAt || fields.qrisExpiresAt || 0);

      // Toleransi 10 menit jika pelanggan transfer mendekati batas waktu
      var isExpired = expiresAt > 0 && (nowMs > expiresAt + 600000);
      var isAmountMatched = !isExpired && (
        (finalTotal > 0 && candidateAmounts.indexOf(finalTotal) !== -1) ||
        (uniqueTotal > 0 && candidateAmounts.indexOf(uniqueTotal) !== -1)
      );

      if (isAmountMatched) {
        var appliedStatus = '';
        var patchedOk = false;

        // =====================================================================
        // JALUR A (PRIORITAS UTAMA SESUAI PERMINTAAN):
        // Ubah status di Firebase dari `UNPAID` menjadi `PAID` dengan Token Admin
        // sehingga Web User & Web Admin langsung menangkap status `PAID` dan
        // mengubahnya menjadi `SUCCESS` (atau `PENDING` jika produk manual)!
        // =====================================================================
        if (adminToken) {
          var paidUrl = 'https://firestore.googleapis.com/v1/' + docName +
            '?updateMask.fieldPaths=status&updateMask.fieldPaths=paymentVerified&updateMask.fieldPaths=paidAt';
          var paidBody = {
            fields: {
              status: { stringValue: 'PAID' },
              paymentVerified: { booleanValue: true },
              paidAt: { integerValue: String(nowMs) }
            }
          };
          var paidRes = fetchFirestoreSmart(paidUrl, 'patch', paidBody, adminToken);
          if (paidRes && paidRes.getResponseCode() >= 200 && paidRes.getResponseCode() < 300) {
            patchedOk = true;
            appliedStatus = 'PAID';
          }
        }

        // =====================================================================
        // JALUR B (FALLBACK OTOMATIS TANPA TOKEN SESUAI rules database firebase.js):
        // Jika Jalur A ditolak oleh Firestore Rules (karena rules publik hanya
        // mengizinkan perubahan 1 field `status` bernilai `SUCCESS`), langsung
        // ubah `status` menjadi `SUCCESS` agar 100% pasti tembus!
        // =====================================================================
        if (!patchedOk) {
          var ruleUrl = 'https://firestore.googleapis.com/v1/' + docName + '?updateMask.fieldPaths=status';
          var ruleBody = {
            fields: {
              status: { stringValue: 'SUCCESS' }
            }
          };
          var ruleRes = fetchFirestoreSmart(ruleUrl, 'patch', ruleBody, null);
          if (ruleRes && ruleRes.getResponseCode() >= 200 && ruleRes.getResponseCode() < 300) {
            patchedOk = true;
            appliedStatus = 'SUCCESS';
          } else if (adminToken) {
            var ruleResAuth = fetchFirestoreSmart(ruleUrl, 'patch', ruleBody, adminToken);
            if (ruleResAuth && ruleResAuth.getResponseCode() >= 200 && ruleResAuth.getResponseCode() < 300) {
              patchedOk = true;
              appliedStatus = 'SUCCESS';
            }
          }
        }

        if (patchedOk) {
          matchedList.push({
            orderId: docId,
            invoice: fields.id || fields.orderId || docId,
            uniqueTotal: finalTotal || uniqueTotal,
            productName: fields.productName || '',
            variantName: fields.variantName || '',
            newStatus: appliedStatus
          });
        }
      }
    }
  } catch (e) {
    Logger.log('Auto-match error: ' + e.message);
  }

  return matchedList;
}

/* ============================================================================
 * 5. HELPER JARINGAN & TOKEN ADMIN FIREBASE
 * ============================================================================ */
function fetchFirestoreSmart(url, method, bodyObj, authToken) {
  try {
    var options = {
      method: method || 'get',
      contentType: 'application/json',
      muteHttpExceptions: true
    };
    if (bodyObj) {
      options.payload = typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj);
    }
    if (authToken) {
      options.headers = { 'Authorization': 'Bearer ' + authToken };
    }
    return UrlFetchApp.fetch(url, options);
  } catch (e) {
    return null;
  }
}

function getValidFirebaseAdminToken() {
  try {
    var props = PropertiesService.getScriptProperties();
    var savedToken = props.getProperty('FIREBASE_TOKEN');
    var expiry = props.getProperty('TOKEN_EXPIRY');

    if (savedToken && expiry && Date.now() < parseInt(expiry, 10)) {
      return savedToken;
    }

    var url = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + VIPERCELL_CONFIG.FIREBASE_API_KEY;
    var payload = {
      email: VIPERCELL_CONFIG.ADMIN_EMAIL,
      password: VIPERCELL_CONFIG.ADMIN_PASS,
      returnSecureToken: true
    };
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      var json = JSON.parse(res.getContentText() || '{}');
      if (json.idToken) {
        props.setProperty('FIREBASE_TOKEN', json.idToken);
        props.setProperty('TOKEN_EXPIRY', String(Date.now() + (50 * 60 * 1000)));
        return json.idToken;
      }
    }
  } catch (e) {}
  return null;
}

function firestoreSetDocument(projectId, collection, docId, dataObj, authToken) {
  try {
    var url = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(projectId) +
              '/databases/(default)/documents/' + encodeURIComponent(collection) + '/' + encodeURIComponent(docId);
    var res = fetchFirestoreSmart(url, 'patch', { fields: wrapFirestoreFields(dataObj) }, authToken);
    return res && res.getResponseCode() >= 200 && res.getResponseCode() < 300;
  } catch (e) {
    return false;
  }
}

function firestorePatchDocument(projectId, collection, docId, dataObj, authToken) {
  try {
    var keys = Object.keys(dataObj);
    var maskParams = keys.map(function(k) { return 'updateMask.fieldPaths=' + encodeURIComponent(k); }).join('&');
    var baseDocUrl = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(projectId) + '/databases/(default)/documents';
    var rootUrl = baseDocUrl + '/' + encodeURIComponent(collection) + '/' + encodeURIComponent(docId) + '?' + maskParams;
    var wsUrl = baseDocUrl + '/artifacts/' + encodeURIComponent(VIPERCELL_CONFIG.WORKSPACE_APP_ID) + '/public/data/' + encodeURIComponent(collection) + '/' + encodeURIComponent(docId) + '?' + maskParams;

    var body = { fields: wrapFirestoreFields(dataObj) };
    var r1 = fetchFirestoreSmart(rootUrl, 'patch', body, authToken);
    var r2 = fetchFirestoreSmart(wsUrl, 'patch', body, authToken);
    return (r1 && r1.getResponseCode() === 200) || (r2 && r2.getResponseCode() === 200);
  } catch (e) {
    return false;
  }
}

function wrapFirestoreFields(obj) {
  var fields = {};
  Object.keys(obj).forEach(function(k) {
    fields[k] = toFirestoreValue(obj[k]);
  });
  return fields;
}

function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    return { mapValue: { fields: wrapFirestoreFields(val) } };
  }
  return { stringValue: String(val) };
}

function unwrapFirestoreFields(fieldsObj) {
  var result = {};
  if (!fieldsObj) return result;
  Object.keys(fieldsObj).forEach(function(k) {
    var v = fieldsObj[k];
    if (v.stringValue !== undefined) result[k] = v.stringValue;
    else if (v.integerValue !== undefined) result[k] = Number(v.integerValue);
    else if (v.doubleValue !== undefined) result[k] = Number(v.doubleValue);
    else if (v.booleanValue !== undefined) result[k] = Boolean(v.booleanValue);
    else if (v.mapValue && v.mapValue.fields) result[k] = unwrapFirestoreFields(v.mapValue.fields);
    else if (v.arrayValue && Array.isArray(v.arrayValue.values)) {
      result[k] = v.arrayValue.values.map(function(item) {
        return unwrapFirestoreFields({ temp: item }).temp;
      });
    } else result[k] = null;
  });
  return result;
}

function getScriptProp(key) {
  try {
    return PropertiesService.getScriptProperties().getProperty(key) || '';
  } catch (e) {
    return '';
  }
}

function buildJsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}