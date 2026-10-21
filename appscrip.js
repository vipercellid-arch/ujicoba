/* ============================================================================
 * VIPERCELL — PURE QRIS PAYMENT VALIDATOR ENGINE (GOOGLE APPS SCRIPT)
 * Nama File : SERVER_APPS_SCRIP.js
 * Fokus     : 100% Khusus Validasi Pembayaran QRIS Otomatis (MacroDroid JSON/POST/GET)
 *             Tanpa Fitur Pengiriman Email (Sangat Cepat, Ringan & Bebas Limit Kuota)
 * ============================================================================ */

const VIPERCELL_CONFIG = {
  // Project ID & Web API Key Firebase Resmi Vipercell
  FIREBASE_PROJECT_ID: 'vipercell-fc50e',
  WORKSPACE_APP_ID: 'vipercell-prod',
  FIREBASE_API_KEY: 'AIzaSyBQGZjl7uj5CRiLWCvPQKjiK4HvIYnXSJg',

  // Kredensial Admin Resmi (Sesuai rules database firebase.js & bot_info.js)
  ADMIN_EMAIL: 'vipercell.id@gmail.com',
  ADMIN_PASS: 'Melati@12',

  // Kunci Rahasia Webhook (Kompatibel dengan pengaturan lama & baru)
  WEBHOOK_SECRET: 'VIPERCELL_SECRET_2026',
  LEGACY_SECRET: 'KUNCI_RAHASIA_VIPERCELL',

  // Durasi cache pencegahan duplikat notifikasi (detik)
  IDEMPOTENCY_TTL_SECONDS: 240
};

/**
 * Jalankan fungsi ini 1x di Editor Apps Script untuk memberikan izin akses jaringan ke Firebase
 */
function setupAndAuthorize() {
  var token = getValidFirebaseAdminToken();
  Logger.log('Otorisasi Server Validasi QRIS Vipercell Berhasil! Token Admin: ' + (token ? 'AKTIF' : 'MODE REST PUBLIC'));
}

/**
 * Handler HTTP GET (Mendukung MacroDroid GET & Cek Status / Riwayat Mutasi)
 */
function doGet(e) {
  return handleUnifiedWebhookRequest(e, 'GET');
}

/**
 * Handler HTTP POST (Mendukung MacroDroid POST JSON, Form-UrlEncoded, Raw Text & Web)
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

    // 1. Endpoint Ping / Cek Koneksi dari Panel Admin
    if (action === 'PING_TEST' || action === 'STATUS') {
      var recentList = getStoredRecentMutations(1200000);
      return buildJsonResponse({
        ok: true,
        status: 'ok',
        version: 'V27.5-PURE-QRIS',
        engine: 'VIPERCELL_QRIS_VALIDATOR_ENGINE',
        method: method,
        projectId: projectId,
        lastMutation: recentList.length > 0 ? recentList[0] : null,
        recentMutations: recentList.slice(0, 20),
        timestamp: new Date().toISOString(),
        message: 'Server Validasi Pembayaran QRIS Aktif & Siap Menerima POST JSON MacroDroid!'
      });
    }

    // 2. Endpoint Ambil Riwayat Mutasi Terbaru
    if (action === 'CHECK_PAYMENT' || action === 'GET_RECENT_MUTATIONS') {
      var recentMutations = getStoredRecentMutations(1200000);
      return buildJsonResponse({
        ok: true,
        status: 'ok',
        action: action,
        recentMutations: recentMutations.slice(0, 20),
        timestamp: Date.now()
      });
    }

    // 3. Jika request GET tanpa parameter notifikasi/nominal, tampilkan status aktif
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
      var listMut = getStoredRecentMutations(1200000);
      return buildJsonResponse({
        ok: true,
        status: 'ok',
        version: 'V27.5-PURE-QRIS',
        engine: 'VIPERCELL_QRIS_VALIDATOR_ENGINE',
        projectId: projectId,
        recentMutations: listMut.slice(0, 20),
        timestamp: Date.now(),
        message: 'Server Validasi QRIS Vipercell Aktif.'
      });
    }

    // 4. Jalankan Mesin Utama Validasi Pembayaran QRIS dari MacroDroid
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
 * 1. PARSER PAYLOAD MACRODROID ANTI-GAGAL (MENDUKUNG JSON NORMAL, JSON MULTILINE
 *    YANG RUSAK KARENA ENTER/KUTIP NOTIFIKASI ANDROID, FORM-URLENCODED & GET)
 * ============================================================================ */
function parseIncomingPayload(e) {
  var data = {};

  // A. Ambil dari Query Parameters (GET maupun POST URL Params)
  if (e && e.parameter) {
    Object.keys(e.parameter).forEach(function(k) {
      data[k] = e.parameter[k];
    });
  }

  // B. Ambil dari Body POST (JSON MacroDroid, Form-UrlEncoded, atau Teks Mentah)
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
        // Format application/x-www-form-urlencoded
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

/**
 * Mengurai JSON dari MacroDroid meskipun teks notifikasi mengandung baris baru (Enter),
 * karakter kontrol, atau tanda kutip yang tidak di-escape oleh MacroDroid.
 */
function tryParseMacroDroidJsonSafe(rawStr) {
  if (!rawStr) return null;

  // Percobaan 1: JSON.parse standar
  try {
    return JSON.parse(rawStr);
  } catch (e1) {}

  // Percobaan 2: Bersihkan karakter newline/tab mentah di dalam string JSON MacroDroid
  try {
    var sanitized = rawStr
      .replace(/\r\n/g, ' ')
      .replace(/\n/g, ' ')
      .replace(/\r/g, ' ')
      .replace(/\t/g, ' ');
    return JSON.parse(sanitized);
  } catch (e2) {}

  // Percobaan 3: Ekstraksi field JSON dengan Regex apabila terdapat tanda kutip ganda di dalam isi notifikasi
  var extracted = {};
  var foundAny = false;
  var knownKeys = [
    'action', 'route', 'type', 'secret', 'key', 'token', 'projectId',
    'app', 'app_name', 'appName', 'package',
    'title', 'not_title', 'notif_title',
    'text', 'not_text', 'notif_text', 'notification_text',
    'big_text', 'not_big_text', 'bigText', 'notification',
    'message', 'pesan', 'body', 'content', 'isi', 'subText', 'ticker',
    'amount', 'nominal', 'total', 'uang', 'nilai', 'timestamp', 'forceTest', 'isSimulation'
  ];

  for (var i = 0; i < knownKeys.length; i++) {
    var k = knownKeys[i];
    var reg = new RegExp('"' + k + '"\\s*:\\s*(?:"([^"]*)"|([0-9]+(?:\.[0-9]+)?)|true|false)', 'i');
    var m = reg.exec(rawStr);
    if (m) {
      extracted[k] = m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[0].split(':')[1].trim());
      foundAny = true;
    }
  }

  // Simpan juga seluruh teks mentah tanpa simbol struktur JSON agar semua angka Rp tetap terbaca
  var strippedText = rawStr
    .replace(/[{}"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (strippedText) {
    extracted.raw_body = rawStr;
    if (!extracted.text) extracted.text = strippedText;
    foundAny = true;
  }

  return foundAny ? extracted : null;
}

/* ============================================================================
 * 2. MESIN UTAMA VALIDASI PEMBAYARAN MACRODROID & PELUNASAN OTOMATIS KE FIREBASE
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
    // Tambahkan nilai field lain jika pengguna memakai nama key kustom di JSON MacroDroid
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

    // Idempotency Guard (Cegah duplikat push identik dalam 60 detik)
    var cache = CacheService.getScriptCache();
    var timeBucket = Math.floor(Date.now() / (1000 * 60));
    var signatureRaw = appName + '|' + primaryAmount + '|' + title + '|' + text + '|' + (payload.timestamp || timeBucket);
    var signatureHash = computeMd5Hex(signatureRaw);
    var cacheKey = 'VIPER_QRIS_' + signatureHash;

    if (!payload.forceTest && cache && cache.get(cacheKey)) {
      // Tetap jalankan pengecekan ke Firestore untuk memastikan tidak ada order yang terlewat
      var retryMatches = findAndSettlePendingOrdersInFirestore(projectId, candidateAmounts, {
        mutationId: 'MUT-RETRY-' + Date.now(),
        amount: primaryAmount,
        candidateAmounts: candidateAmounts,
        appName: appName,
        rawText: combinedRawText.substring(0, 400)
      });
      return buildJsonResponse({
        ok: true,
        status: 'ok',
        duplicate: true,
        detectedAmount: primaryAmount,
        allCandidates: candidateAmounts,
        matchedOrdersCount: retryMatches.length,
        matchedOrders: retryMatches,
        message: 'Notifikasi sudah tercatat dan diverifikasi.'
      });
    }

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
      source: payload.isSimulation ? 'ADMIN_SIMULATOR' : 'MACRODROID_WEBHOOK'
    };

    // Simpan ke memori cepat Apps Script
    saveMutationToServerMemory(primaryAmount, candidateAmounts, combinedRawText, nowMs);

    // CARI & LUNASKAN PESANAN UNPAID DI FIREBASE SECARA LANGSUNG (KOMPATIBEL PENUH DENGAN RULES FIREBASE)
    var matchedOrders = findAndSettlePendingOrdersInFirestore(projectId, candidateAmounts, mutationDoc);

    if (matchedOrders.length > 0) {
      mutationDoc.matchedOrderId = matchedOrders.map(function(o) { return o.invoice || o.orderId; }).join(', ');
      mutationDoc.status = 'MATCHED';
      if (cache) {
        cache.put(cacheKey, 'PROCESSED', VIPERCELL_CONFIG.IDEMPOTENCY_TTL_SECONDS);
      }
    }

    // Ambil token Admin (jika tersedia) untuk mencatat ke payment_mutations & settings/mainConfig
    var adminToken = getValidFirebaseAdminToken();

    // Tulis ke payment_mutations & settings/mainConfig (di Root dan Workspace)
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
      duplicate: false,
      mutationId: mutationId,
      detectedAmount: primaryAmount,
      allCandidates: candidateAmounts,
      matchedOrdersCount: matchedOrders.length,
      matchedOrders: matchedOrders,
      latencyMs: Date.now() - (startMs || nowMs),
      timestamp: nowIso,
      message: matchedOrders.length > 0
        ? 'Pembayaran cocok! Pesanan berhasil divalidasi otomatis di Firebase.'
        : 'Mutasi tercatat dan siap dicocokkan.'
    });

  } finally {
    if (hasLock) {
      try { lock.releaseLock(); } catch (e) {}
    }
  }
}

/* ============================================================================
 * 3. SMART MULTI-PATTERN CURRENCY EXTRACTOR
 *    Membuang tanggal & jam terlebih dahulu agar tidak salah membaca tanggal
 *    sebagai nominal uang, lalu mengekstrak angka Rp / ribuan.
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

  // 1. Bersihkan pola Tanggal (contoh: 21/10/2026, 2026-10-21, 21-10-26)
  text = text.replace(/\b\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}\b/g, ' ');

  // 2. Bersihkan pola Jam/Waktu (contoh: 08:25:10, 08:25, 08.25 WIB/WITA/WIT)
  text = text.replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ');
  text = text.replace(/\b\d{1,2}\.\d{2}\s*(WIB|WITA|WIT|AM|PM)\b/gi, ' ');

  // 3. Prioritas Utama: Angka yang didahului kata kunci pembayaran / Rp / IDR
  var rpRegex = /(?:Rp\.?|IDR|sebesar|senilai|masuk|diterima|pembayaran|qris|total|nominal|\+)\s*[:\.]?\s*([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{1,2})?|[0-9]{3,8}(?:[.,][0-9]{1,2})?)/gi;
  var match;
  while ((match = rpRegex.exec(text)) !== null) {
    var parsed = cleanCurrencyString(match[1]);
    if (parsed) addCandidate(parsed);
  }

  // 4. Prioritas Kedua: Angka berformat ribuan (15.123 atau 15,123) atau angka murni 3-8 digit
  var genericRegex = /\b([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{1,2})?|[0-9]{3,8})\b/g;
  while ((match = genericRegex.exec(text)) !== null) {
    var rawToken = match[1];
    var parsedGen = cleanCurrencyString(rawToken);
    // Hindari angka tahun 2020-2035 jika berdiri sendiri tanpa tanda titik/koma
    if (parsedGen && (parsedGen < 2020 || parsedGen > 2035 || rawToken.indexOf('.') !== -1 || rawToken.indexOf(',') !== -1)) {
      addCandidate(parsedGen);
    }
  }

  return results;
}

function cleanCurrencyString(str) {
  if (!str) return null;
  var s = String(str).trim();
  // Hapus sen desimal 2 digit di ujung (misal ,00 atau .00 atau ,-)
  s = s.replace(/[.,]\d{2}$/, '').replace(/,-$/, '');
  var digitsOnly = s.replace(/[^0-9]/g, '');
  if (!digitsOnly) return null;
  return parseInt(digitsOnly, 10);
}

/* ============================================================================
 * 4. FIRESTORE REST API AUTO-MATCHER (100% KOMPATIBEL DENGAN RULES FIREBASE)
 *    - Sesuai `rules database firebase.js`, update tanpa login Admin pada `/orders/{orderId}`
 *      WAJIB HANYA menyentuh field `status` (`?updateMask.fieldPaths=status`)
 *      dengan nilai `"SUCCESS"`!
 *    - Oleh karena itu, begitu nominal cocok, fungsi ini LANGSUNG mengirim PATCH
 *      `?updateMask.fieldPaths=status` -> `status: "SUCCESS"` sehingga 100% diterima
 *      oleh Firestore Rules dalam hitungan milidetik!
 *    - Selanjutnya, jika token Admin (`getValidFirebaseAdminToken()`) aktif dan
 *      stok tersedia di Gudang Stok (`stocks`), fungsi ini otomatis mengambil stok
 *      dan mengisi `adminReply`!
 * ============================================================================ */
function findAndSettlePendingOrdersInFirestore(projectId, candidateAmounts, mutationDoc) {
  var matchedList = [];
  if (!projectId || !candidateAmounts || candidateAmounts.length === 0) return matchedList;

  var baseUrl = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(projectId) + '/databases/(default)/documents';
  var wsParentUrl = baseUrl + '/artifacts/' + encodeURIComponent(VIPERCELL_CONFIG.WORKSPACE_APP_ID) + '/public/data';
  var adminToken = getValidFirebaseAdminToken();

  try {
    // Ambil pesanan dari Root Path & Workspace Path
    var queryUnpaid = {
      structuredQuery: {
        from: [{ collectionId: 'orders' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'status' },
            op: 'EQUAL',
            value: { stringValue: 'UNPAID' }
          }
        },
        limit: 50
      }
    };

    var queryPendingPayment = {
      structuredQuery: {
        from: [{ collectionId: 'orders' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'status' },
            op: 'EQUAL',
            value: { stringValue: 'PENDING_PAYMENT' }
          }
        },
        limit: 50
      }
    };

    var batchQueries = [
      { url: baseUrl + ':runQuery', method: 'post', contentType: 'application/json', payload: JSON.stringify(queryUnpaid), muteHttpExceptions: true },
      { url: wsParentUrl + ':runQuery', method: 'post', contentType: 'application/json', payload: JSON.stringify(queryUnpaid), muteHttpExceptions: true },
      { url: baseUrl + ':runQuery', method: 'post', contentType: 'application/json', payload: JSON.stringify(queryPendingPayment), muteHttpExceptions: true },
      { url: wsParentUrl + ':runQuery', method: 'post', contentType: 'application/json', payload: JSON.stringify(queryPendingPayment), muteHttpExceptions: true }
    ];

    var qResponses = UrlFetchApp.fetchAll(batchQueries);
    var candidateDocs = [];
    var seenDocNames = {};

    for (var q = 0; q < qResponses.length; q++) {
      var res = qResponses[q];
      if (res && res.getResponseCode() === 200) {
        var rows = JSON.parse(res.getContentText() || '[]');
        if (Array.isArray(rows)) {
          for (var r = 0; r < rows.length; r++) {
            var docObj = rows[r] && rows[r].document;
            if (docObj && docObj.name && docObj.fields && !seenDocNames[docObj.name]) {
              seenDocNames[docObj.name] = true;
              candidateDocs.push({
                doc: docObj,
                isWorkspace: (q === 1 || q === 3)
              });
            }
          }
        }
      }
    }

    // Fallback: Jika query terfilter tidak mengembalikan hasil, baca daftar dokumen terbaru dari koleksi orders
    if (candidateDocs.length === 0) {
      var listResps = UrlFetchApp.fetchAll([
        { url: baseUrl + '/orders?pageSize=40', method: 'get', muteHttpExceptions: true },
        { url: wsParentUrl + '/orders?pageSize=40', method: 'get', muteHttpExceptions: true }
      ]);
      for (var l = 0; l < listResps.length; l++) {
        if (listResps[l] && listResps[l].getResponseCode() === 200) {
          var listJson = JSON.parse(listResps[l].getContentText() || '{}');
          var docsArr = listJson.documents || [];
          for (var d = 0; d < docsArr.length; d++) {
            var dItem = docsArr[d];
            if (dItem && dItem.name && dItem.fields && !seenDocNames[dItem.name]) {
              var unwrapped = unwrapFirestoreFields(dItem.fields);
              if (unwrapped.status === 'UNPAID' || unwrapped.status === 'PENDING_PAYMENT' || (unwrapped.status === 'PENDING' && !unwrapped.paymentVerified)) {
                seenDocNames[dItem.name] = true;
                candidateDocs.push({
                  doc: dItem,
                  isWorkspace: (l === 1)
                });
              }
            }
          }
        }
      }
    }

    var nowMs = Date.now();

    for (var i = 0; i < candidateDocs.length; i++) {
      var entry = candidateDocs[i];
      var rowDoc = entry.doc;
      var docName = rowDoc.name;
      var docId = docName.split('/').pop();
      var fields = unwrapFirestoreFields(rowDoc.fields);

      var finalTotal = Math.round(Number(fields.finalTotal || 0));
      var uniqueTotal = Math.round(Number(fields.uniqueTotal || fields.totalPrice || fields.totalAmount || fields.amount || 0));
      var expiresAt = Number(fields.expiresAt || fields.qrisExpiresAt || 0);

      // Toleransi 5 menit jika pelanggan transfer mendekati batas waktu
      var isExpired = expiresAt > 0 && (nowMs > expiresAt + 300000);

      var isAmountMatched = !isExpired && (
        (finalTotal > 0 && candidateAmounts.indexOf(finalTotal) !== -1) ||
        (uniqueTotal > 0 && candidateAmounts.indexOf(uniqueTotal) !== -1)
      );

      if (isAmountMatched) {
        // =========================================================================
        // LANGKAH 1 (UTAMA & PASTI DITERIMA RULES FIREBASE):
        // Update HANYA field `status` menjadi `"SUCCESS"` (?updateMask.fieldPaths=status)
        // Sesuai `rules database firebase.js`:
        //   request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status'])
        //   && resource.data.status != "SUCCESS"
        //   && request.resource.data.status == "SUCCESS"
        // =========================================================================
        var directRuleUrl = 'https://firestore.googleapis.com/v1/' + docName + '?updateMask.fieldPaths=status';
        var directRulePayload = {
          fields: {
            status: { stringValue: 'SUCCESS' }
          }
        };

        var directRes = UrlFetchApp.fetch(directRuleUrl, {
          method: 'patch',
          contentType: 'application/json',
          payload: JSON.stringify(directRulePayload),
          muteHttpExceptions: true
        });

        var patchedOk = (directRes.getResponseCode() >= 200 && directRes.getResponseCode() < 300);

        // Jika butuh token Admin, coba ulangi dengan Authorization Bearer
        if (!patchedOk && adminToken) {
          var authRes = UrlFetchApp.fetch(directRuleUrl, {
            method: 'patch',
            headers: { 'Authorization': 'Bearer ' + adminToken },
            contentType: 'application/json',
            payload: JSON.stringify(directRulePayload),
            muteHttpExceptions: true
          });
          patchedOk = (authRes.getResponseCode() >= 200 && authRes.getResponseCode() < 300);
        }

        // =========================================================================
        // LANGKAH 2 (OPSIONAL DENGAN TOKEN ADMIN):
        // Jika token Admin aktif, cek apakah ada stok Ready di Gudang Stok (`stocks`)
        // untuk langsung dikirim otomatis ke `adminReply`.
        // =========================================================================
        var autoDeliveredStock = false;
        if (patchedOk && adminToken) {
          var parentQueryUrl = entry.isWorkspace ? wsParentUrl : baseUrl;
          autoDeliveredStock = tryDeliverStockWithAdminToken(rowDoc, fields, parentQueryUrl, adminToken, nowMs);
        }

        if (patchedOk) {
          matchedList.push({
            orderId: docId,
            invoice: fields.id || fields.orderId || docId,
            uniqueTotal: finalTotal || uniqueTotal,
            productName: fields.productName || '',
            variantName: fields.variantName || '',
            newStatus: 'SUCCESS',
            autoDelivered: autoDeliveredStock
          });
        }
      }
    }
  } catch (e) {
    Logger.log('Auto-match error: ' + e.message);
  }

  return matchedList;
}

/**
 * Mengambil stok `Ready` dari koleksi `stocks` menggunakan Token Admin dan mengisi `adminReply`
 */
function tryDeliverStockWithAdminToken(orderDoc, unwrappedOrder, parentQueryUrl, adminToken, timestampMs) {
  try {
    var orderId = unwrappedOrder.id || unwrappedOrder.orderId || orderDoc.name.split('/').pop();
    var durationDays = Number(unwrappedOrder.durationDays || 0);
    var itemBrand = unwrappedOrder.productName || '';
    var itemVariant = unwrappedOrder.variantName || '';
    var itemType = 'app';
    var itemProcessType = 'auto';
    var itemQty = 1;

    if (Array.isArray(unwrappedOrder.items) && unwrappedOrder.items.length > 0) {
      var firstItem = unwrappedOrder.items[0] || {};
      itemBrand = firstItem.brandName || itemBrand;
      itemVariant = firstItem.exactItemName || itemVariant;
      itemType = String(firstItem.type || 'app').toLowerCase();
      itemProcessType = String(firstItem.processType || 'auto').toLowerCase();
      itemQty = Math.max(1, Number(firstItem.qty || 1));
      if (!durationDays && firstItem.durationDays) durationDays = Number(firstItem.durationDays);
    }

    if (itemType === 'game' || itemProcessType === 'manual' || !itemBrand) {
      return false;
    }

    var stockQuery = {
      structuredQuery: {
        from: [{ collectionId: 'stocks' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'status' },
            op: 'EQUAL',
            value: { stringValue: 'Ready' }
          }
        },
        limit: 100
      }
    };

    var sResp = UrlFetchApp.fetch(parentQueryUrl + ':runQuery', {
      method: 'post',
      headers: { 'Authorization': 'Bearer ' + adminToken },
      contentType: 'application/json',
      payload: JSON.stringify(stockQuery),
      muteHttpExceptions: true
    });

    if (sResp.getResponseCode() !== 200) return false;

    var rows = JSON.parse(sResp.getContentText() || '[]');
    var matchingStocks = [];
    var normBrand = String(itemBrand).trim().toLowerCase();
    var normVar = String(itemVariant).trim().toLowerCase();

    for (var i = 0; i < rows.length; i++) {
      var sDoc = rows[i] && rows[i].document;
      if (!sDoc || !sDoc.fields) continue;
      var sf = unwrapFirestoreFields(sDoc.fields);
      if (String(sf.brand || '').trim().toLowerCase() === normBrand &&
          (!normVar || String(sf.itemName || '').trim().toLowerCase() === normVar)) {
        matchingStocks.push({ doc: sDoc, data: sf });
      }
    }

    if (matchingStocks.length === 0) return false;

    var deliveredText = '';

    // 1. Cek stok Reusable
    for (var r = 0; r < matchingStocks.length; r++) {
      if (matchingStocks[r].data.isReusable === true) {
        var rItem = matchingStocks[r];
        deliveredText = formatStockCredentialGas(rItem.data.data, rItem.data.stockFormat || 'REUSABLE', '');
        var rPatchUrl = 'https://firestore.googleapis.com/v1/' + rItem.doc.name + '?updateMask.fieldPaths=sentCount&updateMask.fieldPaths=lastSentAt&updateMask.fieldPaths=lastOrderId';
        UrlFetchApp.fetch(rPatchUrl, {
          method: 'patch',
          headers: { 'Authorization': 'Bearer ' + adminToken },
          contentType: 'application/json',
          payload: JSON.stringify({
            fields: wrapFirestoreFields({
              sentCount: Number(rItem.data.sentCount || 0) + itemQty,
              lastSentAt: timestampMs,
              lastOrderId: orderId
            })
          }),
          muteHttpExceptions: true
        });
        break;
      }
    }

    // 2. Cek stok Private / Sharing / Produk Email
    if (!deliveredText) {
      var collected = [];
      for (var s = 0; s < matchingStocks.length; s++) {
        if (collected.length >= itemQty) break;
        var st = matchingStocks[s];
        var maxQ = Math.max(1, Number(st.data.maxQuota || 1));
        var usedQ = Number(st.data.usedQuota || 0);
        if (usedQ < maxQ) {
          var nextUsed = usedQ + 1;
          var nextStatus = nextUsed >= maxQ ? 'Used' : 'Ready';
          var slotLbl = maxQ > 1 ? (' (Slot #' + nextUsed + '/' + maxQ + ')') : '';
          collected.push(formatStockCredentialGas(st.data.data, st.data.stockFormat || st.data.mode || 'PRIVATE', slotLbl));

          var stPatchUrl = 'https://firestore.googleapis.com/v1/' + st.doc.name + '?updateMask.fieldPaths=usedQuota&updateMask.fieldPaths=status&updateMask.fieldPaths=usedAt&updateMask.fieldPaths=orderId';
          UrlFetchApp.fetch(stPatchUrl, {
            method: 'patch',
            headers: { 'Authorization': 'Bearer ' + adminToken },
            contentType: 'application/json',
            payload: JSON.stringify({
              fields: wrapFirestoreFields({
                usedQuota: nextUsed,
                status: nextStatus,
                usedAt: timestampMs,
                orderId: orderId
              })
            }),
            muteHttpExceptions: true
          });
        }
      }
      if (collected.length > 0) {
        deliveredText = collected.join('\n\n');
      }
    }

    if (!deliveredText) return false;

    var finalReply = 'Terima kasih telah berbelanja di Vipercell.\n\n' + deliveredText;
    var orderPatchData = {
      status: 'SUCCESS',
      paymentVerified: true,
      paidAt: timestampMs,
      adminReply: finalReply,
      autoDelivered: true,
      deliveredAt: timestampMs
    };
    if (durationDays > 0) {
      orderPatchData.durationDays = durationDays;
      orderPatchData.subscriptionStartAt = timestampMs;
      orderPatchData.subscriptionEndAt = timestampMs + (durationDays * 86400000);
      orderPatchData.subscriptionStatus = 'ACTIVE';
    }

    var orderKeys = Object.keys(orderPatchData);
    var orderMask = orderKeys.map(function(k) { return 'updateMask.fieldPaths=' + encodeURIComponent(k); }).join('&');
    var orderPatchUrl = 'https://firestore.googleapis.com/v1/' + orderDoc.name + '?' + orderMask;

    var pRes = UrlFetchApp.fetch(orderPatchUrl, {
      method: 'patch',
      headers: { 'Authorization': 'Bearer ' + adminToken },
      contentType: 'application/json',
      payload: JSON.stringify({ fields: wrapFirestoreFields(orderPatchData) }),
      muteHttpExceptions: true
    });

    return pRes.getResponseCode() >= 200 && pRes.getResponseCode() < 300;
  } catch (err) {
    return false;
  }
}

function formatStockCredentialGas(rawStr, stockMode, slotInfo) {
  var clean = String(rawStr || '').trim();
  if (!clean) return '';
  var parts = clean.split('|').map(function(s) { return s.trim(); });
  if ((stockMode === 'EMAIL_OAUTH' || parts.length >= 4) && parts.length >= 4) {
    var fourPart = parts[0] + '|' + parts[1] + '|' + parts[2] + '|' + parts[3];
    return '[PRODUK EMAIL' + (slotInfo || '') + ']\n' +
      'FORMAT_UTUH : ' + fourPart + '\n' +
      'Email       : ' + (parts[0] || '-') + '\n' +
      'Password    : ' + (parts[1] || '-') + '\n' +
      'RefreshToken: ' + (parts[2] || '-') + '\n' +
      'Client_ID   : ' + (parts[3] || '-');
  }
  if (parts.length >= 2) {
    return '[DETAIL AKUN' + (slotInfo || '') + ']\n' +
      'Email / ID : ' + (parts[0] || '-') + '\n' +
      'Password   : ' + (parts[1] || '-') + '\n' +
      'Keterangan : ' + (parts.slice(2).join(' | ') || '-');
  }
  return '[DETAIL PESANAN' + (slotInfo || '') + ']\n' + clean;
}

/* ============================================================================
 * 5. SMART FIREBASE ADMIN AUTH TOKEN (DARI bot_info.js) & HELPERS FIRESTORE
 * ============================================================================ */
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

function saveMutationToServerMemory(primaryAmount, candidateAmounts, rawText, timestampMs) {
  var record = {
    id: 'MUT_' + timestampMs + '_' + primaryAmount,
    amount: Number(primaryAmount),
    candidateAmounts: candidateAmounts,
    rawText: String(rawText || '').slice(0, 280),
    timestamp: Number(timestampMs)
  };
  try {
    var list = getStoredRecentMutations(1800000);
    list.unshift(record);
    if (list.length > 35) list = list.slice(0, 35);
    var serialized = JSON.stringify(list);
    var cache = CacheService.getScriptCache();
    if (cache) cache.put('RECENT_QRIS_MUTATIONS_V275', serialized, 1800);
  } catch (e) {}
  return record;
}

function getStoredRecentMutations(maxAgeMs) {
  var now = Date.now();
  var limitAge = maxAgeMs || 1200000;
  try {
    var cache = CacheService.getScriptCache();
    var rawJson = cache ? (cache.get('RECENT_QRIS_MUTATIONS_V275') || '') : '';
    if (!rawJson) return [];
    var parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(function(item) {
      return item && item.timestamp && (now - Number(item.timestamp) <= limitAge);
    });
  } catch (e) {
    return [];
  }
}

function firestoreSetDocument(projectId, collection, docId, dataObj, authToken) {
  try {
    var url = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(projectId) +
              '/databases/(default)/documents/' + encodeURIComponent(collection) + '/' + encodeURIComponent(docId);
    var params = {
      method: 'patch',
      contentType: 'application/json',
      payload: JSON.stringify({ fields: wrapFirestoreFields(dataObj) }),
      muteHttpExceptions: true
    };
    if (authToken) {
      params.headers = { 'Authorization': 'Bearer ' + authToken };
    }
    var res = UrlFetchApp.fetch(url, params);
    return res.getResponseCode() >= 200 && res.getResponseCode() < 300;
  } catch (e) {
    return false;
  }
}

function firestorePatchDocument(projectId, collection, docId, dataObj, authToken) {
  try {
    var keys = Object.keys(dataObj);
    var maskParams = keys.map(function(k) { return 'updateMask.fieldPaths=' + encodeURIComponent(k); }).join('&');
    var baseDocUrl = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(projectId) + '/databases/(default)/documents';
    var urls = [
      baseDocUrl + '/' + encodeURIComponent(collection) + '/' + encodeURIComponent(docId) + '?' + maskParams,
      baseDocUrl + '/artifacts/' + encodeURIComponent(VIPERCELL_CONFIG.WORKSPACE_APP_ID) + '/public/data/' + encodeURIComponent(collection) + '/' + encodeURIComponent(docId) + '?' + maskParams
    ];
    var payloadStr = JSON.stringify({ fields: wrapFirestoreFields(dataObj) });
    var reqs = urls.map(function(u) {
      var r = {
        url: u,
        method: 'patch',
        contentType: 'application/json',
        payload: payloadStr,
        muteHttpExceptions: true
      };
      if (authToken) r.headers = { 'Authorization': 'Bearer ' + authToken };
      return r;
    });
    var resps = UrlFetchApp.fetchAll(reqs);
    return resps[0].getResponseCode() === 200 || resps[1].getResponseCode() === 200;
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

function computeMd5Hex(input) {
  var rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, input, Utilities.Charset.UTF_8);
  return rawHash.map(function(b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
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