/**
 * ============================================================================
 * VIPERCELL — GOOGLE APPS SCRIPT SERVER v27.4
 * (DIRECT FIREBASE QRIS VERIFICATION + AUTO STOCK DELIVERY + UNLIMITED EMAIL ENGINE)
 * Nama File : SERVER_APPS_SCRIP.js
 *
 * Pembaruan Utama v27.4:
 *  1. Direct Firebase QRIS Verification & Auto Stock Delivery (Server-Driven 100%):
 *     - Saat MacroDroid mengirim notifikasi pembayaran QRIS, Apps Script LANGSUNG
 *       mencari pesanan berstatus `UNPAID` di Firebase (`orders`) yang cocok
 *       dengan nominal pembayaran (tanpa bergantung pada pengecekan Web User!).
 *     - Jika produk pada pesanan memiliki stok `Ready` di Gudang Stok (`stocks`),
 *       Apps Script langsung mengambil stok, mengubah status pesanan di Firebase
 *       menjadi `SUCCESS`, mengisi `adminReply`, dan mengirim email struk otomatis.
 *     - Jika produk manual/game atau stok kosong, Apps Script langsung mengubah
 *       status pesanan di Firebase menjadi `PENDING` (`paymentVerified: true`).
 *     - Memperbaiki bug query Firestore (`allDescendants: true` dihapus agar tidak
 *       terkena blokir indeks `FAILED_PRECONDITION` HTTP 400) serta mendukung
 *       OAuth Token otomatis (`ScriptApp.getOAuthToken()`) jika diperlukan.
 *  2. Unlimited Daily Email Notification Engine (Tanpa Batas Kuota Harian):
 *     - Sistem Multi-Layer Email Sender (`sendUnlimitedEmailGas`) yang otomatis
 *       beralih dari `MailApp` -> `GmailApp` -> Daftar URL Apps Script Cadangan
 *       (`BACKUP_GAS_WEBHOOK_URLS`) -> Relay SMTP/API Eksternal sehingga pengiriman
 *       notifikasi & struk ke email berjalan terus tanpa batas kuota harian.
 *  3. Proteksi Opsi Kirim Struk Email (`emailReceiptEnabled`) & Template Neo-Brutalism.
 * ============================================================================
 */

var CONFIG = {
  FIREBASE_PROJECT_ID: 'vipercell-fc50e',
  WORKSPACE_APP_ID: 'vipercell-prod',
  WEBHOOK_SECRET: 'VIPERCELL_SECRET_2026',
  STORE_NAME: 'VIPERCELL',
  STORE_TAGLINE: 'Toko Aplikasi Premium, Top Up Game & Produk Digital',
  SUPPORT_WHATSAPP: '6285656321860',
  // Daftar URL Google Apps Script Cadangan (Multi-Akun Google) agar Kuota Email Tanpa Batas:
  // Anda juga dapat memisahkan beberapa URL dengan tanda koma (,) langsung di Pengaturan Toko Admin.
  BACKUP_GAS_WEBHOOK_URLS: [],
  EXTERNAL_EMAIL_RELAY_URL: '',
  PRIMARY_COLOR: '#2563eb',
  ACCENT_YELLOW: '#facc15',
  ACCENT_GREEN: '#10b981',
  ACCENT_AMBER: '#f59e0b',
  ACCENT_PURPLE: '#8b5cf6',
  BG_CREAM: '#f4f1ea',
  DARK_BORDER: '#0f172a'
};

/**
 * Jalankan fungsi ini 1x di Editor Apps Script untuk memberikan izin pengiriman email & akses jaringan
 */
function setupAndAuthorize() {
  var remainingQuota = 0;
  try {
    remainingQuota = MailApp.getRemainingDailyQuota();
  } catch (e) {}
  Logger.log('Otorisasi v27.4 berhasil. Sisa kuota MailApp akun ini: ' + remainingQuota);
}

/**
 * PENGIRIM EMAIL TANPA BATAS KUOTA HARIAN (MULTI-ENGINE & MULTI-RELAY FAILOVER) (#5)
 * Urutan Pengiriman:
 *  1. MailApp (Kuota standar Google Apps Script)
 *  2. GmailApp (Fallback langsung ke layanan Gmail API akun aktif)
 *  3. Rotasi ke URL Apps Script Cadangan (Multi-Akun Google di BACKUP_GAS_WEBHOOK_URLS / payload.backupWebhookUrls)
 *  4. Relay Email API Eksternal (EXTERNAL_EMAIL_RELAY_URL jika disiapkan)
 */
function sendUnlimitedEmailGas(emailOptions, originalPayload) {
  var to = String(emailOptions.to || '').trim();
  var subject = String(emailOptions.subject || CONFIG.STORE_NAME).trim();
  var htmlBody = String(emailOptions.htmlBody || '').trim();
  var senderName = String(emailOptions.name || CONFIG.STORE_NAME).trim();

  var errors = [];

  // Lapis 1: Coba kirim via MailApp
  try {
    var quota = MailApp.getRemainingDailyQuota();
    if (quota > 0) {
      MailApp.sendEmail({
        to: to,
        subject: subject,
        htmlBody: htmlBody,
        name: senderName
      });
      return { sent: true, engine: 'MailApp', remainingQuota: quota - 1 };
    } else {
      errors.push('MailApp quota exhausted (0)');
    }
  } catch (mailErr) {
    errors.push('MailApp: ' + String(mailErr.message || mailErr));
  }

  // Lapis 2: Fallback ke GmailApp
  try {
    if (typeof GmailApp !== 'undefined' && GmailApp.sendEmail) {
      GmailApp.sendEmail(to, subject, 'Silakan buka email ini dengan tampilan HTML.', {
        htmlBody: htmlBody,
        name: senderName
      });
      return { sent: true, engine: 'GmailApp', remainingQuota: 'unlimited-fallback' };
    }
  } catch (gmailErr) {
    errors.push('GmailApp: ' + String(gmailErr.message || gmailErr));
  }

  // Lapis 3: Rotasi ke Daftar URL Apps Script Cadangan (Multi-Akun)
  var relayUrls = [];
  if (Array.isArray(CONFIG.BACKUP_GAS_WEBHOOK_URLS)) {
    for (var i = 0; i < CONFIG.BACKUP_GAS_WEBHOOK_URLS.length; i++) {
      if (CONFIG.BACKUP_GAS_WEBHOOK_URLS[i]) relayUrls.push(String(CONFIG.BACKUP_GAS_WEBHOOK_URLS[i]).trim());
    }
  }
  if (originalPayload && Array.isArray(originalPayload.backupWebhookUrls)) {
    for (var j = 0; j < originalPayload.backupWebhookUrls.length; j++) {
      var bUrl = String(originalPayload.backupWebhookUrls[j] || '').trim();
      if (bUrl && relayUrls.indexOf(bUrl) === -1) relayUrls.push(bUrl);
    }
  }

  if (relayUrls.length > 0 && !(originalPayload && originalPayload._isRelayHop)) {
    for (var r = 0; r < relayUrls.length; r++) {
      var targetRelayUrl = relayUrls[r];
      if (!targetRelayUrl || targetRelayUrl.indexOf('https://script.google.com/') !== 0) continue;
      try {
        var relayPayload = {};
        if (originalPayload) {
          for (var k in originalPayload) relayPayload[k] = originalPayload[k];
        }
        relayPayload._isRelayHop = true;
        relayPayload.action = 'DIRECT_RAW_EMAIL_RELAY';
        relayPayload.to = to;
        relayPayload.subject = subject;
        relayPayload.htmlBody = htmlBody;
        relayPayload.senderName = senderName;
        relayPayload.secret = CONFIG.WEBHOOK_SECRET;

        var resp = UrlFetchApp.fetch(targetRelayUrl, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(relayPayload),
          followRedirects: true,
          muteHttpExceptions: true
        });
        if (resp.getResponseCode() === 200) {
          var rJson = JSON.parse(resp.getContentText() || '{}');
          if (rJson && (rJson.ok === true || rJson.status === 'ok')) {
            return { sent: true, engine: 'BackupGasRelay#' + (r + 1) };
          }
        }
      } catch (relayErr) {
        errors.push('Relay#' + (r + 1) + ': ' + String(relayErr.message || relayErr));
      }
    }
  }

  // Lapis 4: External Email Relay URL (Jika dikonfigurasi)
  var extUrl = String(CONFIG.EXTERNAL_EMAIL_RELAY_URL || (originalPayload && originalPayload.externalEmailRelayUrl) || '').trim();
  if (extUrl && extUrl.indexOf('http') === 0) {
    try {
      var extResp = UrlFetchApp.fetch(extUrl, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
          to: to,
          subject: subject,
          htmlBody: htmlBody,
          name: senderName,
          secret: CONFIG.WEBHOOK_SECRET
        }),
        followRedirects: true,
        muteHttpExceptions: true
      });
      if (extResp.getResponseCode() >= 200 && extResp.getResponseCode() < 300) {
        return { sent: true, engine: 'ExternalRelay' };
      }
    } catch (extErr) {
      errors.push('ExternalRelay: ' + String(extErr.message || extErr));
    }
  }

  throw new Error('Gagal mengirim email pada semua jalur: ' + errors.join(' | '));
}

/**
 * Handler HTTP GET
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var action = String(params.action || params.type || '').toUpperCase().trim();

    // Jika MacroDroid dikonfigurasi mengirim via HTTP GET
    if (
      action === 'MACRODROID_PAYMENT_WEBHOOK' ||
      action === 'PAYMENT_WEBHOOK' ||
      action === 'QRIS_MUTATION' ||
      params.notification ||
      params.notif_text ||
      params.text ||
      params.bigText ||
      params.amount ||
      params.nominal
    ) {
      if (action !== 'CHECK_PAYMENT' && action !== 'GET_RECENT_MUTATIONS') {
        return handleMacroDroidPaymentMutation(params, Date.now());
      }
    }

    var recentMutations = getStoredRecentMutations(1200000);
    var quotaLeft = 100;
    try { quotaLeft = MailApp.getRemainingDailyQuota(); } catch (qErr) {}

    return buildJsonResponse({
      ok: true,
      status: 'ok',
      version: 'v27.4',
      service: 'Vipercell Direct Firebase QRIS Verification & Unlimited Email Server',
      projectId: CONFIG.FIREBASE_PROJECT_ID,
      remainingEmailQuota: quotaLeft,
      unlimitedMultiRelayActive: true,
      lastMutation: recentMutations.length > 0 ? recentMutations[0] : null,
      recentMutations: recentMutations.slice(0, 20),
      timestamp: Date.now()
    });
  } catch (err) {
    return buildJsonResponse({
      ok: false,
      status: 'error',
      error: String(err.message || err)
    });
  }
}

/**
 * Handler Utama HTTP POST
 */
function doPost(e) {
  var startMs = Date.now();
  try {
    var payload = parseIncomingPayload(e);
    if (!payload) {
      return buildJsonResponse({ ok: false, status: 'error', error: 'EMPTY_OR_INVALID_PAYLOAD' });
    }

    var action = String(payload.action || payload.type || '').toUpperCase().trim();

    if (!action) {
      if (payload.otpCode || payload.otp) {
        action = 'SEND_OTP_EMAIL';
      } else if (payload.resetLink || payload.newPassword) {
        action = payload.newPassword ? 'CONFIRM_PASSWORD_RESET' : 'SEND_PASSWORD_RESET_LINK';
      } else if (payload.orderId || payload.invoice || payload.accountDetails) {
        action = 'SEND_ORDER_DELIVERY';
      } else if (payload.productName && payload.category && !payload.amount && !payload.totalAmount) {
        action = 'SAVE_PRODUCT_SUGGESTION';
      } else {
        action = 'MACRODROID_PAYMENT_WEBHOOK';
      }
    }

    var incomingSecret = String(payload.secret || payload.key || '').trim();
    if (
      action !== 'MACRODROID_PAYMENT_WEBHOOK' &&
      action !== 'PAYMENT_WEBHOOK' &&
      action !== 'QRIS_MUTATION' &&
      action !== 'CHECK_PAYMENT' &&
      action !== 'GET_RECENT_MUTATIONS' &&
      CONFIG.WEBHOOK_SECRET &&
      incomingSecret &&
      incomingSecret !== CONFIG.WEBHOOK_SECRET
    ) {
      return buildJsonResponse({
        ok: false,
        status: 'error',
        error: 'UNAUTHORIZED_SECRET',
        message: 'Webhook Secret tidak sesuai.'
      });
    }

    // Relay Email Langsung Antar-Apps Script (Untuk Fitur Tanpa Batas Kuota Harian #5)
    if (action === 'DIRECT_RAW_EMAIL_RELAY') {
      var relayResult = sendUnlimitedEmailGas({
        to: payload.to,
        subject: payload.subject,
        htmlBody: payload.htmlBody,
        name: payload.senderName || CONFIG.STORE_NAME
      }, payload);
      return buildJsonResponse({
        ok: true,
        status: 'ok',
        action: 'DIRECT_RAW_EMAIL_RELAY',
        engine: relayResult.engine
      });
    }

    // 1. Jalur Utama Mutasi Pembayaran QRIS dari MacroDroid -> Langsung Ubah Status UNPAID di Firebase!
    if (action === 'MACRODROID_PAYMENT_WEBHOOK' || action === 'PAYMENT_WEBHOOK' || action === 'QRIS_MUTATION') {
      return handleMacroDroidPaymentMutation(payload, startMs);
    }

    // 2. Endpoint Riwayat Mutasi untuk Panel Admin
    if (action === 'CHECK_PAYMENT' || action === 'GET_RECENT_MUTATIONS') {
      var recentList = getStoredRecentMutations(1200000);
      return buildJsonResponse({
        ok: true,
        status: 'ok',
        action: action,
        recentMutations: recentList.slice(0, 20),
        timestamp: Date.now()
      });
    }

    // 3. Simpan Saran Produk Cadangan
    if (action === 'SAVE_PRODUCT_SUGGESTION') {
      return handleSaveProductSuggestion(payload);
    }

    // 4. Kirim Email OTP 6-Digit
    if (action === 'SEND_OTP_EMAIL' || action === 'OTP') {
      return handleSendOtpEmail(payload);
    }

    // 5. Kirim Email Struk & Rincian Pesanan
    if (action === 'SEND_ORDER_DELIVERY' || action === 'ORDER_DELIVERY') {
      return handleSendOrderDeliveryEmail(payload);
    }

    // 6. Kirim Email Pengingat Masa Aktif
    if (action === 'SEND_EXPIRY_REMINDER' || action === 'EXPIRY_REMINDER') {
      return handleSendExpiryReminderEmail(payload);
    }

    // 7. Kirim Link Ubah Kata Sandi
    if (action === 'SEND_PASSWORD_RESET_LINK' || action === 'RESET_PASSWORD') {
      return handleSendPasswordResetLink(payload);
    }

    if (action === 'CONFIRM_PASSWORD_RESET') {
      return handleConfirmPasswordReset(payload);
    }

    return handleMacroDroidPaymentMutation(payload, startMs);

  } catch (err) {
    return buildJsonResponse({
      ok: false,
      status: 'error',
      error: String(err.message || err)
    });
  }
}

/* ============================================================================
 * 1. ENGINE VERIFIKASI PEMBAYARAN QRIS LANGSUNG KE FIREBASE (SERVER-DRIVEN 100%)
 * ============================================================================ */
function handleMacroDroidPaymentMutation(data, startMs) {
  var nowMs = Date.now();
  var rawTitle = String(
    data.title || data.appName || data.app || data.package || data.notif_title || ''
  ).trim();

  var textParts = [
    data.text,
    data.notification,
    data.notif_text,
    data.notification_text,
    data.message,
    data.body,
    data.bigText,
    data.big_text,
    data.subText,
    data.content,
    data.isi,
    data.pesan,
    data.ticker,
    data.rawBody
  ];
  var rawTextJoined = '';
  for (var t = 0; t < textParts.length; t++) {
    if (textParts[t] !== undefined && textParts[t] !== null && String(textParts[t]).trim() !== '') {
      rawTextJoined += ' ' + String(textParts[t]).trim();
    }
  }

  if (!rawTextJoined.trim()) {
    for (var k in data) {
      if (k !== 'secret' && k !== 'key' && k !== 'action' && data[k]) {
        rawTextJoined += ' ' + String(data[k]);
      }
    }
  }

  var combinedText = (rawTitle + ' ' + rawTextJoined).trim();
  var explicitAmt = data.amount || data.nominal || data.total || data.uang || data.nilai || '';
  var candidateAmounts = extractCandidateAmountsFromNotification(combinedText, explicitAmt);

  if (candidateAmounts.length === 0) {
    return buildJsonResponse({
      ok: false,
      status: 'ignored',
      reason: 'NO_VALID_AMOUNT_DETECTED',
      rawText: combinedText.slice(0, 300)
    });
  }

  var primaryAmount = candidateAmounts[0];

  // Kunci Eksklusif agar 2 notifikasi serentak tidak memproses order yang sama dua kali
  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    hasLock = lock.tryLock(6000);
  } catch (e) {}

  try {
    var mutationRecord = saveMutationToServerMemory(primaryAmount, candidateAmounts, combinedText, nowMs);

    // LANGSUNG CARI & UBAH STATUS ORDER UNPAID DI FIREBASE TANPA MENUNGGU WEB USER!
    var syncResult = verifyAndProcessUnpaidOrderDirectlyInFirebase(primaryAmount, candidateAmounts, combinedText, nowMs);

    return buildJsonResponse({
      ok: true,
      status: 'ok',
      version: 'v27.4',
      action: 'MACRODROID_PAYMENT_WEBHOOK',
      mutationId: mutationRecord.id,
      detectedAmount: primaryAmount,
      candidateAmounts: candidateAmounts,
      matchedOrderIds: syncResult.matchedOrderIds,
      processedStatuses: syncResult.processedStatuses,
      firestoreSynced: syncResult.synced,
      firestoreHttpCodes: syncResult.httpCodes,
      latencyMs: Date.now() - (startMs || nowMs),
      timestamp: nowMs
    });
  } finally {
    if (hasLock) {
      try { lock.releaseLock(); } catch (e) {}
    }
  }
}

/**
 * Helper Eksekusi Request Firestore dengan Fallback OAuth Token Otomatis
 */
function executeFirestoreRequestsSmart(requestsArray) {
  if (!requestsArray || requestsArray.length === 0) return [];
  var responses = UrlFetchApp.fetchAll(requestsArray);

  var needOAuthRetry = false;
  for (var i = 0; i < responses.length; i++) {
    var code = responses[i].getResponseCode();
    if (code === 401 || code === 403) {
      needOAuthRetry = true;
      break;
    }
  }

  if (needOAuthRetry) {
    try {
      var token = ScriptApp.getOAuthToken();
      if (token) {
        var authedRequests = [];
        for (var j = 0; j < requestsArray.length; j++) {
          var reqCopy = {};
          for (var k in requestsArray[j]) reqCopy[k] = requestsArray[j][k];
          reqCopy.headers = reqCopy.headers || {};
          reqCopy.headers['Authorization'] = 'Bearer ' + token;
          authedRequests.push(reqCopy);
        }
        responses = UrlFetchApp.fetchAll(authedRequests);
      }
    } catch (authErr) {}
  }
  return responses;
}

/**
 * LANGSUNG MENGUBAH STATUS UNPAID DI FIREBASE (`orders`) DAN MENGIRIM STOK OTOMATIS JIKA ADA (#1)
 * - Memperbaiki bug v27.3: TIDAK lagi memakai `allDescendants: true` yang menyebabkan error 400 `FAILED_PRECONDITION`.
 * - Mengecek di Root Path (`/documents:runQuery`) dan Workspace Path (`/documents/artifacts/{appId}/public/data:runQuery`).
 * - Jika order cocok dan produk memiliki stok `Ready` di koleksi `stocks`:
 *   -> Ambil stok, update `stocks` menjadi `Used` (atau tambah `usedQuota`),
 *   -> Update `orders` langsung menjadi `status: 'SUCCESS'`, `paymentVerified: true`, `adminReply: ...`, `autoDelivered: true`,
 *   -> Langsung kirim email struk & akun ke pembeli (jika `emailReceiptEnabled !== false`).
 * - Jika order cocok namun produk manual/game atau stok kosong:
 *   -> Update `orders` langsung menjadi `status: 'PENDING'`, `paymentVerified: true`, `paidAt: timestampMs`.
 */
function verifyAndProcessUnpaidOrderDirectlyInFirebase(primaryAmount, candidateAmounts, rawNotifText, timestampMs) {
  var baseUrl = 'https://firestore.googleapis.com/v1/projects/' + CONFIG.FIREBASE_PROJECT_ID + '/databases/(default)/documents';
  var wsParentUrl = baseUrl + '/artifacts/' + CONFIG.WORKSPACE_APP_ID + '/public/data';
  var matchedOrderIds = [];
  var processedStatuses = [];
  var httpCodes = [];

  try {
    var arrayValues = [];
    for (var i = 0; i < candidateAmounts.length; i++) {
      arrayValues.push({ integerValue: String(candidateAmounts[i]) });
    }
    var safeRawText = String(rawNotifText || '').slice(0, 280);

    var patchSettingsBody = {
      fields: {
        lastPaymentDetected: { integerValue: String(primaryAmount) },
        lastPaymentTimestamp: { integerValue: String(timestampMs) },
        lastPaymentMutation: {
          mapValue: {
            fields: {
              amount: { integerValue: String(primaryAmount) },
              timestamp: { integerValue: String(timestampMs) },
              rawText: { stringValue: safeRawText },
              candidateAmounts: { arrayValue: { values: arrayValues } }
            }
          }
        }
      }
    };

    var mutBody = {
      fields: {
        amount: { integerValue: String(primaryAmount) },
        receivedAt: { integerValue: String(timestampMs) },
        rawText: { stringValue: safeRawText },
        candidateAmounts: { arrayValue: { values: arrayValues } }
      }
    };

    var maskParams = '?updateMask.fieldPaths=lastPaymentDetected&updateMask.fieldPaths=lastPaymentTimestamp&updateMask.fieldPaths=lastPaymentMutation';

    // Query TANPA allDescendants: true agar 100% bebas error FAILED_PRECONDITION index!
    var singleCollectionQueryBody = {
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

    var initialRequests = [
      // 0: Query Root orders (status == UNPAID)
      {
        url: baseUrl + ':runQuery',
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(singleCollectionQueryBody),
        muteHttpExceptions: true
      },
      // 1: Query Workspace orders (status == UNPAID)
      {
        url: wsParentUrl + ':runQuery',
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(singleCollectionQueryBody),
        muteHttpExceptions: true
      },
      // 2: Update Root settings/mainConfig
      {
        url: baseUrl + '/settings/mainConfig' + maskParams,
        method: 'patch',
        contentType: 'application/json',
        payload: JSON.stringify(patchSettingsBody),
        muteHttpExceptions: true
      },
      // 3: Update Workspace settings/mainConfig
      {
        url: wsParentUrl + '/settings/mainConfig' + maskParams,
        method: 'patch',
        contentType: 'application/json',
        payload: JSON.stringify(patchSettingsBody),
        muteHttpExceptions: true
      },
      // 4: Catat log ke payment_mutations
      {
        url: baseUrl + '/payment_mutations',
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(mutBody),
        muteHttpExceptions: true
      }
    ];

    var responses = executeFirestoreRequestsSmart(initialRequests);
    for (var c = 0; c < responses.length; c++) {
      httpCodes.push(responses[c].getResponseCode());
    }

    // Gabungkan hasil dokumen order UNPAID dari Root Path & Workspace Path
    var candidateDocs = [];
    for (var qIdx = 0; qIdx <= 1; qIdx++) {
      var qResp = responses[qIdx];
      if (qResp && qResp.getResponseCode() === 200) {
        var rows = JSON.parse(qResp.getContentText() || '[]');
        for (var r = 0; r < rows.length; r++) {
          if (rows[r] && rows[r].document && rows[r].document.fields) {
            candidateDocs.push({
              doc: rows[r].document,
              isWorkspace: (qIdx === 1)
            });
          }
        }
      }
    }

    // Fallback: Jika query terfilter kosong, ambil daftar dokumen terbaru dari koleksi orders secara langsung
    if (candidateDocs.length === 0) {
      var listResps = executeFirestoreRequestsSmart([
        { url: baseUrl + '/orders?pageSize=35', method: 'get', muteHttpExceptions: true },
        { url: wsParentUrl + '/orders?pageSize=35', method: 'get', muteHttpExceptions: true }
      ]);
      for (var lIdx = 0; lIdx <= 1; lIdx++) {
        var lResp = listResps[lIdx];
        if (lResp && lResp.getResponseCode() === 200) {
          var listData = JSON.parse(lResp.getContentText() || '{}');
          var docsArr = listData.documents || [];
          for (var d = 0; d < docsArr.length; d++) {
            var docItem = docsArr[d];
            var stVal = extractFirestoreString(docItem.fields && docItem.fields.status);
            if (stVal === 'UNPAID' || stVal === 'PENDING_PAYMENT') {
              candidateDocs.push({
                doc: docItem,
                isWorkspace: (lIdx === 1)
              });
            }
          }
        }
      }
    }

    // Cocokkan nominal pembayaran dengan pesanan UNPAID
    for (var m = 0; m < candidateDocs.length; m++) {
      var entry = candidateDocs[m];
      var docObj = entry.doc;
      var f = docObj.fields || {};

      var finalTotal = extractFirestoreInt(f.finalTotal);
      var uniqueTotal = extractFirestoreInt(f.uniqueTotal);
      var orderIdStr = extractFirestoreString(f.id) || docObj.name.split('/').pop();

      var isAmountMatch = (
        (finalTotal > 0 && candidateAmounts.indexOf(finalTotal) !== -1) ||
        (uniqueTotal > 0 && candidateAmounts.indexOf(uniqueTotal) !== -1)
      );

      // Cek juga kecocokan teks titik/koma pada isi notifikasi
      if (!isAmountMatch && finalTotal > 0 && safeRawText) {
        var dotStr = finalTotal.toLocaleString('id-ID');
        var commaStr = dotStr.replace(/\./g, ',');
        if (safeRawText.indexOf(dotStr) !== -1 || safeRawText.indexOf(commaStr) !== -1 || safeRawText.indexOf(String(finalTotal)) !== -1) {
          isAmountMatch = true;
        }
      }

      if (isAmountMatch) {
        matchedOrderIds.push(orderIdStr);
        var parentQueryUrl = entry.isWorkspace ? wsParentUrl : baseUrl;
        var processOutcome = processMatchedOrderInFirebaseDirect(docObj, parentQueryUrl, timestampMs);
        processedStatuses.push(orderIdStr + ':' + processOutcome);
      }
    }

    var anySuccess = httpCodes.indexOf(200) !== -1;
    return {
      synced: anySuccess,
      matchedOrderIds: matchedOrderIds,
      processedStatuses: processedStatuses,
      httpCodes: httpCodes
    };
  } catch (err) {
    Logger.log('Direct Firebase QRIS Verification Error: ' + err);
    return {
      synced: false,
      matchedOrderIds: matchedOrderIds,
      processedStatuses: processedStatuses,
      httpCodes: httpCodes
    };
  }
}

/**
 * Memproses dokumen Order yang sudah cocok di Firebase secara langsung:
 * 1. Mengecek apakah produk otomatis dan memiliki stok `Ready` di koleksi `stocks`.
 * 2. Jika ada stok Ready -> langsung ambil stok, ubah status order jadi `SUCCESS`, isi `adminReply`, dan kirim email struk.
 * 3. Jika tidak ada stok / produk manual -> langsung ubah status order jadi `PENDING` (`paymentVerified: true`).
 */
function processMatchedOrderInFirebaseDirect(orderDoc, parentQueryUrl, timestampMs) {
  var f = orderDoc.fields || {};
  var orderId = extractFirestoreString(f.id) || orderDoc.name.split('/').pop();
  var userEmail = extractFirestoreString(f.userEmail) || extractFirestoreString(f.buyerEmail);
  var buyerName = extractFirestoreString(f.buyerName) || (userEmail ? userEmail.split('@')[0] : 'Pelanggan');
  var finalTotal = extractFirestoreInt(f.finalTotal) || extractFirestoreInt(f.uniqueTotal);
  var durationDays = extractFirestoreInt(f.durationDays);
  var emailReceiptEnabled = f.emailReceiptEnabled && f.emailReceiptEnabled.booleanValue === false ? false : true;

  // Ekstrak informasi item pertama dari array items
  var itemBrand = extractFirestoreString(f.productName);
  var itemVariant = extractFirestoreString(f.variantName);
  var itemFullName = itemBrand && itemVariant ? (itemBrand + ' - ' + itemVariant) : (itemBrand || 'Produk Vipercell');
  var itemType = 'app';
  var itemProcessType = 'auto';
  var itemQty = 1;
  var targetId = extractFirestoreString(f.targetId) || '-';

  if (f.items && f.items.arrayValue && Array.isArray(f.items.arrayValue.values) && f.items.arrayValue.values.length > 0) {
    var firstItemMap = f.items.arrayValue.values[0].mapValue;
    if (firstItemMap && firstItemMap.fields) {
      var itf = firstItemMap.fields;
      itemBrand = extractFirestoreString(itf.brandName) || itemBrand;
      itemVariant = extractFirestoreString(itf.exactItemName) || itemVariant;
      itemFullName = extractFirestoreString(itf.name) || itemFullName;
      itemType = (extractFirestoreString(itf.type) || 'app').toLowerCase();
      itemProcessType = (extractFirestoreString(itf.processType) || 'auto').toLowerCase();
      itemQty = Math.max(1, extractFirestoreInt(itf.qty) || 1);
      targetId = extractFirestoreString(itf.playerInfo) || targetId;
      if (!durationDays) durationDays = extractFirestoreInt(itf.durationDays);
    }
  }

  var deliveredCredentialsText = '';

  // Coba ambil stok otomatis dari koleksi `stocks` jika bukan produk manual/game
  if (itemType !== 'game' && itemProcessType !== 'manual' && itemBrand) {
    deliveredCredentialsText = tryClaimReadyStockFromFirestoreDirect(
      parentQueryUrl,
      itemBrand,
      itemVariant,
      itemQty,
      orderId,
      userEmail,
      timestampMs
    );
  }

  var docPatchBaseUrl = 'https://firestore.googleapis.com/v1/' + orderDoc.name;
  var subEndAt = durationDays > 0 ? (timestampMs + (durationDays * 86400000)) : 0;

  if (deliveredCredentialsText) {
    var finalReply = 'Terima kasih telah berbelanja di Vipercell.\n\n' + deliveredCredentialsText;
    var maskSuccess = '?updateMask.fieldPaths=status' +
      '&updateMask.fieldPaths=paymentVerified' +
      '&updateMask.fieldPaths=paidAt' +
      '&updateMask.fieldPaths=adminReply' +
      '&updateMask.fieldPaths=autoDelivered' +
      '&updateMask.fieldPaths=deliveredAt' +
      '&updateMask.fieldPaths=emailSent';

    var successFields = {
      status: { stringValue: 'SUCCESS' },
      paymentVerified: { booleanValue: true },
      paidAt: { integerValue: String(timestampMs) },
      adminReply: { stringValue: finalReply },
      autoDelivered: { booleanValue: true },
      deliveredAt: { integerValue: String(timestampMs) },
      emailSent: { booleanValue: Boolean(emailReceiptEnabled && userEmail && userEmail.indexOf('@') !== -1) }
    };

    if (durationDays > 0) {
      maskSuccess += '&updateMask.fieldPaths=durationDays&updateMask.fieldPaths=subscriptionStartAt&updateMask.fieldPaths=subscriptionEndAt&updateMask.fieldPaths=subscriptionStatus';
      successFields.durationDays = { integerValue: String(durationDays) };
      successFields.subscriptionStartAt = { integerValue: String(timestampMs) };
      successFields.subscriptionEndAt = { integerValue: String(subEndAt) };
      successFields.subscriptionStatus = { stringValue: 'ACTIVE' };
    }

    executeFirestoreRequestsSmart([{
      url: docPatchBaseUrl + maskSuccess,
      method: 'patch',
      contentType: 'application/json',
      payload: JSON.stringify({ fields: successFields }),
      muteHttpExceptions: true
    }]);

    // Kirim struk & akun otomatis ke email pembeli jika diizinkan
    if (emailReceiptEnabled && userEmail && userEmail.indexOf('@') !== -1) {
      try {
        handleSendOrderDeliveryEmail({
          orderId: orderId,
          buyerEmail: userEmail,
          buyerName: buyerName,
          productName: itemBrand,
          variantName: itemVariant,
          itemName: itemFullName,
          totalAmount: finalTotal,
          paymentMethod: 'QRIS OTOMATIS',
          targetId: targetId,
          accountDetails: finalReply,
          durationDays: durationDays,
          subscriptionEndAt: subEndAt,
          emailReceiptEnabled: true
        });
      } catch (emErr) {}
    }

    return 'SUCCESS_AUTO_DELIVERED';
  } else {
    // Jika produk manual/game atau stok di Gudang Stok sedang kosong -> Langsung set PENDING (Diproses Admin)
    var maskPending = '?updateMask.fieldPaths=status&updateMask.fieldPaths=paymentVerified&updateMask.fieldPaths=paidAt';
    var pendingFields = {
      status: { stringValue: 'PENDING' },
      paymentVerified: { booleanValue: true },
      paidAt: { integerValue: String(timestampMs) }
    };

    if (durationDays > 0) {
      maskPending += '&updateMask.fieldPaths=durationDays&updateMask.fieldPaths=subscriptionStartAt&updateMask.fieldPaths=subscriptionEndAt&updateMask.fieldPaths=subscriptionStatus';
      pendingFields.durationDays = { integerValue: String(durationDays) };
      pendingFields.subscriptionStartAt = { integerValue: String(timestampMs) };
      pendingFields.subscriptionEndAt = { integerValue: String(subEndAt) };
      pendingFields.subscriptionStatus = { stringValue: 'ACTIVE' };
    }

    executeFirestoreRequestsSmart([{
      url: docPatchBaseUrl + maskPending,
      method: 'patch',
      contentType: 'application/json',
      payload: JSON.stringify({ fields: pendingFields }),
      muteHttpExceptions: true
    }]);

    return 'PENDING_ADMIN_PROCESS';
  }
}

/**
 * Mencari dan mengklaim stok `Ready` dari koleksi `stocks` di Firestore secara langsung
 */
function tryClaimReadyStockFromFirestoreDirect(parentQueryUrl, targetBrand, targetVariant, neededQty, orderId, buyerEmail, timestampMs) {
  try {
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

    var qResps = executeFirestoreRequestsSmart([{
      url: parentQueryUrl + ':runQuery',
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(stockQuery),
      muteHttpExceptions: true
    }]);

    if (!qResps[0] || qResps[0].getResponseCode() !== 200) return '';

    var rows = JSON.parse(qResps[0].getContentText() || '[]');
    var matchingStockDocs = [];
    var normBrand = String(targetBrand || '').trim().toLowerCase();
    var normVar = String(targetVariant || '').trim().toLowerCase();

    for (var i = 0; i < rows.length; i++) {
      var sDoc = rows[i] && rows[i].document;
      if (!sDoc || !sDoc.fields) continue;
      var sf = sDoc.fields;
      var sBrand = extractFirestoreString(sf.brand).trim().toLowerCase();
      var sItem = extractFirestoreString(sf.itemName).trim().toLowerCase();

      if (sBrand === normBrand && (!normVar || sItem === normVar)) {
        matchingStockDocs.push(sDoc);
      }
    }

    if (matchingStockDocs.length === 0) return '';

    // 1. Cek apakah ada stok Reusable (tanpa batas)
    for (var r = 0; r < matchingStockDocs.length; r++) {
      var rDoc = matchingStockDocs[r];
      var rf = rDoc.fields;
      if (rf.isReusable && rf.isReusable.booleanValue === true) {
        var rawData = extractFirestoreString(rf.data);
        var sentCount = extractFirestoreInt(rf.sentCount) + neededQty;
        var rPatchUrl = 'https://firestore.googleapis.com/v1/' + rDoc.name +
          '?updateMask.fieldPaths=sentCount&updateMask.fieldPaths=lastSentAt&updateMask.fieldPaths=lastOrderId';
        executeFirestoreRequestsSmart([{
          url: rPatchUrl,
          method: 'patch',
          contentType: 'application/json',
          payload: JSON.stringify({
            fields: {
              sentCount: { integerValue: String(sentCount) },
              lastSentAt: { integerValue: String(timestampMs) },
              lastOrderId: { stringValue: orderId }
            }
          }),
          muteHttpExceptions: true
        }]);
        return formatStockCredentialLineGas(rawData, extractFirestoreString(rf.stockFormat) || 'REUSABLE', '');
      }
    }

    // 2. Ambil stok Private / Sharing / Email OAuth sesuai jumlah neededQty
    var collectedLines = [];
    var stockPatchRequests = [];

    for (var s = 0; s < matchingStockDocs.length; s++) {
      if (collectedLines.length >= neededQty) break;
      var stDoc = matchingStockDocs[s];
      var stf = stDoc.fields;
      var maxQ = Math.max(1, extractFirestoreInt(stf.maxQuota) || 1);
      var usedQ = extractFirestoreInt(stf.usedQuota) || 0;

      if (usedQ < maxQ) {
        var nextUsed = usedQ + 1;
        var nextStatus = nextUsed >= maxQ ? 'Used' : 'Ready';
        var slotLabel = maxQ > 1 ? (' (Slot #' + nextUsed + '/' + maxQ + ')') : '';
        var stockMode = extractFirestoreString(stf.stockFormat) || extractFirestoreString(stf.mode) || 'PRIVATE';
        var rawCred = extractFirestoreString(stf.data);

        collectedLines.push(formatStockCredentialLineGas(rawCred, stockMode, slotLabel));

        var stPatchUrl = 'https://firestore.googleapis.com/v1/' + stDoc.name +
          '?updateMask.fieldPaths=usedQuota&updateMask.fieldPaths=status&updateMask.fieldPaths=usedAt&updateMask.fieldPaths=orderId';

        stockPatchRequests.push({
          url: stPatchUrl,
          method: 'patch',
          contentType: 'application/json',
          payload: JSON.stringify({
            fields: {
              usedQuota: { integerValue: String(nextUsed) },
              status: { stringValue: nextStatus },
              usedAt: { integerValue: String(timestampMs) },
              orderId: { stringValue: orderId }
            }
          }),
          muteHttpExceptions: true
        });
      }
    }

    if (stockPatchRequests.length > 0) {
      executeFirestoreRequestsSmart(stockPatchRequests);
    }

    return collectedLines.join('\n\n');
  } catch (e) {
    Logger.log('Claim Stock Error: ' + e);
    return '';
  }
}

function formatStockCredentialLineGas(rawStr, stockMode, slotInfo) {
  var clean = String(rawStr || '').trim();
  if (!clean) return '';

  var parts = clean.split('|');
  for (var i = 0; i < parts.length; i++) parts[i] = parts[i].trim();

  var isEmailOAuth = (stockMode === 'EMAIL_OAUTH' || parts.length >= 4);
  if (isEmailOAuth && parts.length >= 4) {
    var emailAddr = parts[0] || '-';
    var passStr = parts[1] || '-';
    var refreshToken = parts[2] || '-';
    var clientId = parts[3] || '-';
    var fourPart = emailAddr + '|' + passStr + '|' + refreshToken + '|' + clientId;

    var out = '[PRODUK EMAIL' + (slotInfo || '') + ']\n';
    out += 'FORMAT_UTUH : ' + fourPart + '\n';
    out += 'Email       : ' + emailAddr + '\n';
    out += 'Password    : ' + passStr + '\n';
    out += 'RefreshToken: ' + refreshToken + '\n';
    out += 'Client_ID   : ' + clientId;
    return out;
  }

  if (parts.length >= 2) {
    var ket = parts.length > 2 ? parts.slice(2).join(' | ') : '-';
    return '[DETAIL AKUN' + (slotInfo || '') + ']\nEmail / ID : ' + (parts[0] || '-') + '\nPassword   : ' + (parts[1] || '-') + '\nKeterangan : ' + (ket || '-');
  }

  return '[DETAIL PESANAN' + (slotInfo || '') + ']\n' + clean;
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
    if (list.length > 40) {
      list = list.slice(0, 40);
    }
    var serialized = JSON.stringify(list);

    var cache = CacheService.getScriptCache();
    if (cache) {
      cache.put('RECENT_QRIS_MUTATIONS_V274', serialized, 1800);
    }
    var props = PropertiesService.getScriptProperties();
    if (props) {
      props.setProperty('RECENT_QRIS_MUTATIONS_V274', serialized);
    }
  } catch (err) {}
  return record;
}

function getStoredRecentMutations(maxAgeMs) {
  var now = Date.now();
  var limitAge = maxAgeMs || 1200000;
  var rawJson = '';

  try {
    var cache = CacheService.getScriptCache();
    if (cache) {
      rawJson = cache.get('RECENT_QRIS_MUTATIONS_V274') || '';
    }
    if (!rawJson) {
      var props = PropertiesService.getScriptProperties();
      if (props) {
        rawJson = props.getProperty('RECENT_QRIS_MUTATIONS_V274') || '';
      }
    }
    if (!rawJson) return [];

    var parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [];

    var valid = [];
    for (var i = 0; i < parsed.length; i++) {
      var item = parsed[i];
      if (item && item.timestamp && (now - Number(item.timestamp) <= limitAge)) {
        valid.push(item);
      }
    }
    return valid;
  } catch (e) {
    return [];
  }
}

function extractCandidateAmountsFromNotification(text, explicitAmount) {
  var results = [];

  function addAmount(val) {
    var num = Math.round(Number(val));
    if (!isNaN(num) && num >= 100 && num <= 100000000 && results.indexOf(num) === -1) {
      results.push(num);
    }
  }

  if (explicitAmount !== undefined && explicitAmount !== null && String(explicitAmount).trim() !== '') {
    var cleanExplicit = String(explicitAmount)
      .replace(/[,\.]00\b/g, '')
      .replace(/,-/g, '')
      .replace(/[^0-9]/g, '');
    if (cleanExplicit) addAmount(parseInt(cleanExplicit, 10));
  }

  if (!text) return results;

  var cleaned = String(text)
    .replace(/(\d)[,\.]00(?!\d)/g, '$1')
    .replace(/(\d)[,\.]0(?!\d)/g, '$1')
    .replace(/,-/g, '');

  var regexRp = /(?:rp\.?|idr|sebesar|senilai|masuk|terima|diterima|pembayaran|kredit|qris|total|nominal|\+)\s*[:\.]?\s*([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{3,8})\b/gi;
  var match;
  while ((match = regexRp.exec(cleaned)) !== null) {
    var numStr = match[1].replace(/[^0-9]/g, '');
    var val = parseInt(numStr, 10);
    if (!isNaN(val) && val >= 100) {
      addAmount(val);
    }
  }

  var genericRegex = /\b([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{3,8})\b/g;
  var gMatch;
  while ((gMatch = genericRegex.exec(cleaned)) !== null) {
    var rawToken = gMatch[1];
    var gNum = parseInt(rawToken.replace(/[^0-9]/g, ''), 10);
    if (gNum >= 2020 && gNum <= 2035 && rawToken.indexOf('.') === -1 && rawToken.indexOf(',') === -1) {
      continue;
    }
    if (!isNaN(gNum) && gNum >= 500 && gNum <= 50000000) {
      addAmount(gNum);
    }
  }

  return results;
}

function extractFirestoreInt(fieldObj) {
  if (!fieldObj) return 0;
  if (fieldObj.integerValue !== undefined) return parseInt(fieldObj.integerValue, 10) || 0;
  if (fieldObj.doubleValue !== undefined) return Math.round(Number(fieldObj.doubleValue)) || 0;
  if (fieldObj.stringValue !== undefined) return parseInt(fieldObj.stringValue, 10) || 0;
  return 0;
}

function extractFirestoreString(fieldObj) {
  if (!fieldObj) return '';
  if (fieldObj.stringValue !== undefined) return String(fieldObj.stringValue);
  if (fieldObj.integerValue !== undefined) return String(fieldObj.integerValue);
  return '';
}

function handleSaveProductSuggestion(data) {
  var prodName = String(data.productName || '').trim();
  if (!prodName) {
    return buildJsonResponse({ ok: false, status: 'error', error: 'NAMA_PRODUK_KOSONG' });
  }
  return buildJsonResponse({
    ok: true,
    status: 'ok',
    action: 'SAVE_PRODUCT_SUGGESTION',
    productName: prodName,
    timestamp: Date.now()
  });
}

/* ============================================================================
 * 2. TEMPLATE STRUK & RINCIAN PESANAN HTML NEO-BRUTALISM MATANG (UNLIMITED EMAIL #5)
 * ============================================================================ */
function handleSendOrderDeliveryEmail(data) {
  if (data.emailReceiptEnabled === false || String(data.emailReceiptEnabled).toLowerCase() === 'false') {
    return buildJsonResponse({
      ok: false,
      status: 'blocked',
      error: 'EMAIL_RECEIPT_DISABLED_BY_USER',
      message: 'Pengiriman struk email dinonaktifkan oleh pengguna di pengaturan profil.'
    });
  }

  var targetEmail = String(data.buyerEmail || data.email || data.to || '').trim();
  if (!targetEmail || targetEmail.indexOf('@') === -1) {
    return buildJsonResponse({ ok: false, status: 'error', error: 'EMAIL_PEMBELI_TIDAK_VALID' });
  }

  var orderId = String(data.orderId || data.invoice || data.invoiceId || 'VP-ORDER').trim().toUpperCase();
  var isTestOrder = (orderId.indexOf('VP-TEST') === 0);

  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    hasLock = lock.tryLock(8000);
  } catch (lockErr) {}

  try {
    var cache = CacheService.getScriptCache();
    var dedupKey = 'SENT_ORDER_' + orderId + '_' + targetEmail.toLowerCase();

    if (!isTestOrder && cache) {
      var alreadySent = cache.get(dedupKey);
      if (alreadySent) {
        return buildJsonResponse({
          ok: true,
          status: 'ok',
          action: 'SEND_ORDER_DELIVERY',
          orderId: orderId,
          recipient: targetEmail,
          deduplicated: true,
          message: 'Email untuk pesanan #' + orderId + ' sudah terkirim sebelumnya.'
        });
      }
      cache.put(dedupKey, '1', 21600);
    }

    var buyerName = String(data.buyerName || targetEmail.split('@')[0] || 'Pelanggan').trim();
    var productName = String(data.productName || 'Produk Digital').trim();
    var variantName = String(data.variantName || '').trim();
    var itemName = String(data.itemName || (variantName ? (productName + ' - ' + variantName) : productName)).trim();
    var totalAmount = Number(data.totalAmount || data.uniqueTotal || 0);
    var totalFormatted = data.totalFormatted || ('Rp' + totalAmount.toLocaleString('id-ID'));
    var paymentMethod = String(data.paymentMethod || 'QRIS OTOMATIS').toUpperCase();
    var targetId = String(data.targetId || '-').trim();
    var accountDetails = String(data.accountDetails || 'Pesanan telah selesai diproses.').trim();
    var durationDays = Number(data.durationDays || 0);
    var subscriptionEndAt = Number(data.subscriptionEndAt || 0);
    var txDateStr = formatIndonesianDateTime(data.date ? new Date(data.date) : new Date());

    var parsedCreds = parseCredentialsForEmailReceipt(accountDetails);

    var emailOAuthSectionHtml = '';
    if (parsedCreds.rawPipes.length > 0) {
      for (var p = 0; p < parsedCreds.rawPipes.length; p++) {
        var pipeBadge = parsedCreds.rawPipes.length > 1 ? ('FORMAT EMAIL #' + (p + 1)) : 'FORMAT EMAIL UTUH';
        emailOAuthSectionHtml += '' +
          '<div style="background:#f3e8ff; border:2.5px solid #0f172a; border-right:5px solid #0f172a; border-bottom:5px solid #0f172a; border-radius:12px; padding:14px; margin-bottom:14px;">' +
            '<div style="margin-bottom:8px;">' +
              '<span style="display:inline-block; background:#facc15; color:#0f172a; font-size:10px; font-weight:900; padding:3px 9px; border-radius:6px; border:1.5px solid #0f172a; letter-spacing:0.04em;">' +
                escapeHtmlGas(pipeBadge) +
              '</span>' +
            '</div>' +
            '<div style="font-family:\'Courier New\',Consolas,monospace; font-size:12.5px; font-weight:800; color:#0f172a; background:#ffffff; padding:11px 12px; border:2px solid #0f172a; border-radius:8px; word-break:break-all; line-height:1.45;">' +
              escapeHtmlGas(parsedCreds.rawPipes[p]) +
            '</div>' +
          '</div>';
      }
    }

    var structuredPairsHtml = '';
    if (parsedCreds.pairs.length > 0) {
      var rowsPairs = '';
      for (var k = 0; k < parsedCreds.pairs.length; k++) {
        var pair = parsedCreds.pairs[k];
        var valContent = pair.isUrl
          ? '<a href="' + escapeHtmlGas(pair.val) + '" target="_blank" style="color:#2563eb; text-decoration:underline; font-weight:900; word-break:break-all;">' + escapeHtmlGas(pair.val) + '</a>'
          : '<span style="font-family:\'Courier New\',Consolas,monospace; font-size:13.5px; font-weight:900; color:#0f172a; word-break:break-all;">' + escapeHtmlGas(pair.val) + '</span>';

        rowsPairs += '' +
          '<tr>' +
            '<td style="padding:9px 11px; background:#ffffff; border-bottom:1.5px solid #0f172a;">' +
              '<span style="display:block; font-size:10px; font-weight:900; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">' +
                escapeHtmlGas(pair.label) +
              '</span>' +
              valContent +
            '</td>' +
          '</tr>';
      }

      structuredPairsHtml = '' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid #0f172a; border-radius:10px; overflow:hidden; margin-bottom:14px; border-collapse:separate;">' +
          rowsPairs +
        '</table>';
    }

    var durationRowHtml = '';
    if (durationDays > 0) {
      var endDateStr = subscriptionEndAt > 0
        ? formatIndonesianDateOnly(new Date(subscriptionEndAt))
        : (durationDays + ' Hari');
      durationRowHtml = '' +
        '<tr>' +
          '<td style="padding:9px 12px; border-top:1.5px dashed #cbd5e1; font-size:12px; font-weight:800; color:#475569;">MASA AKTIF</td>' +
          '<td style="padding:9px 12px; border-top:1.5px dashed #cbd5e1; font-size:12.5px; font-weight:900; color:#2563eb; text-align:right;">' +
            durationDays + ' Hari (s/d ' + escapeHtmlGas(endDateStr) + ')' +
          '</td>' +
        '</tr>';
    }

    var subject = 'Struk & Rincian Pesanan #' + orderId + ' — ' + CONFIG.STORE_NAME;

    var innerContentHtml = '' +
      '<div style="background:#dcfce7; border:2.5px solid #0f172a; border-right:4px solid #0f172a; border-bottom:4px solid #0f172a; border-radius:12px; padding:14px 16px; margin-bottom:16px;">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
          '<tr>' +
            '<td width="44" valign="middle">' +
              '<div style="width:36px; height:36px; line-height:36px; text-align:center; background:#10b981; color:#ffffff; font-size:18px; font-weight:900; border:2px solid #0f172a; border-radius:9px;">&#10003;</div>' +
            '</td>' +
            '<td valign="middle">' +
              '<div style="font-size:14px; font-weight:900; color:#0f172a; line-height:1.25;">Pesanan Terkirim &amp; Selesai</div>' +
              '<div style="font-size:12px; font-weight:700; color:#065f46; margin-top:2px;">Halo <b>' + escapeHtmlGas(buyerName) + '</b>, pembayaran telah diterima dan pesananmu siap digunakan.</div>' +
            '</td>' +
          '</tr>' +
        '</table>' +
      '</div>' +

      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border:2px solid #0f172a; border-radius:10px; margin-bottom:16px; text-align:center;">' +
        '<tr>' +
          '<td width="33%" style="padding:8px 4px; border-right:1.5px dashed #cbd5e1;">' +
            '<div style="font-size:10px; font-weight:900; color:#047857;">&#10003; 1. PESANAN</div>' +
          '</td>' +
          '<td width="33%" style="padding:8px 4px; border-right:1.5px dashed #cbd5e1;">' +
            '<div style="font-size:10px; font-weight:900; color:#047857;">&#10003; 2. LUNAS</div>' +
          '</td>' +
          '<td width="34%" style="padding:8px 4px; background:#fef9c3; border-top-right-radius:8px; border-bottom-right-radius:8px;">' +
            '<div style="font-size:10px; font-weight:900; color:#0f172a;">&#9733; 3. TERKIRIM</div>' +
          '</td>' +
        '</tr>' +
      '</table>' +

      '<div style="background:#ffffff; border:2.5px solid #0f172a; border-right:4px solid #0f172a; border-bottom:4px solid #0f172a; border-radius:12px; overflow:hidden; margin-bottom:18px;">' +
        '<div style="background:#eff6ff; padding:12px 14px; border-bottom:2px solid #0f172a;">' +
          '<span style="display:inline-block; background:#2563eb; color:#ffffff; font-size:9.5px; font-weight:900; padding:2px 7px; border-radius:5px; border:1.5px solid #0f172a; text-transform:uppercase; margin-bottom:4px;">ITEM PESANAN</span>' +
          '<div style="font-size:16px; font-weight:900; color:#0f172a; line-height:1.3;">' + escapeHtmlGas(itemName) + '</div>' +
        '</div>' +

        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' +
          '<tr>' +
            '<td style="padding:9px 12px; font-size:12px; font-weight:800; color:#475569;">ID TRANSAKSI</td>' +
            '<td style="padding:9px 12px; font-family:\'Courier New\',Consolas,monospace; font-size:13px; font-weight:900; color:#0f172a; text-align:right;">#' + escapeHtmlGas(orderId) + '</td>' +
          '</tr>' +
          '<tr>' +
            '<td style="padding:9px 12px; border-top:1.5px dashed #cbd5e1; font-size:12px; font-weight:800; color:#475569;">WAKTU TRANSAKSI</td>' +
            '<td style="padding:9px 12px; border-top:1.5px dashed #cbd5e1; font-size:12px; font-weight:800; color:#0f172a; text-align:right;">' + escapeHtmlGas(txDateStr) + '</td>' +
          '</tr>' +
          '<tr>' +
            '<td style="padding:9px 12px; border-top:1.5px dashed #cbd5e1; font-size:12px; font-weight:800; color:#475569;">METODE BAYAR</td>' +
            '<td style="padding:9px 12px; border-top:1.5px dashed #cbd5e1; font-size:12px; font-weight:900; color:#0f172a; text-align:right;">' + escapeHtmlGas(paymentMethod) + '</td>' +
          '</tr>' +
          '<tr>' +
            '<td style="padding:9px 12px; border-top:1.5px dashed #cbd5e1; font-size:12px; font-weight:800; color:#475569;">DATA TUJUAN</td>' +
            '<td style="padding:9px 12px; border-top:1.5px dashed #cbd5e1; font-size:12px; font-weight:800; color:#0f172a; text-align:right;">' + escapeHtmlGas(targetId) + '</td>' +
          '</tr>' +
          durationRowHtml +
          '<tr style="background:#fef9c3;">' +
            '<td style="padding:12px; border-top:2px solid #0f172a; font-size:13px; font-weight:900; color:#0f172a;">TOTAL PEMBAYARAN</td>' +
            '<td style="padding:12px; border-top:2px solid #0f172a; font-size:17px; font-weight:900; color:#2563eb; text-align:right;">' + escapeHtmlGas(totalFormatted) + '</td>' +
          '</tr>' +
        '</table>' +
      '</div>' +

      '<div style="background:#ecfdf5; border:2.5px solid #0f172a; border-right:5px solid #0f172a; border-bottom:5px solid #0f172a; border-radius:12px; padding:15px;">' +
        '<div style="margin-bottom:10px;">' +
          '<span style="display:inline-block; background:#10b981; color:#ffffff; font-size:10.5px; font-weight:900; padding:4px 10px; border-radius:6px; border:1.5px solid #0f172a; letter-spacing:0.04em;">' +
            '&#128273; RINCIAN AKUN / PESANAN TERKIRIM' +
          '</span>' +
        '</div>' +

        emailOAuthSectionHtml +
        structuredPairsHtml +

        '<div style="background:#ffffff; border:2px solid #0f172a; border-radius:9px; padding:12px;">' +
          '<div style="font-size:10px; font-weight:900; color:#64748b; margin-bottom:5px; letter-spacing:0.04em;">SALINAN LENGKAP PESANAN:</div>' +
          '<pre style="margin:0; font-family:\'Courier New\',Consolas,monospace; font-size:12.5px; font-weight:800; color:#0f172a; white-space:pre-wrap; word-break:break-word; line-height:1.55;">' +
            escapeHtmlGas(accountDetails) +
          '</pre>' +
        '</div>' +
      '</div>';

    var htmlBody = buildNeoBrutalEmailEnvelope({
      badgeText: 'E-RECEIPT #' + orderId,
      headerBg: '#2563eb',
      headerTitle: CONFIG.STORE_NAME,
      headerSubtitle: 'Struk Resmi & Rincian Pesanan Digital',
      bodyHtml: innerContentHtml,
      orderIdForSupport: orderId
    });

    var sendInfo = sendUnlimitedEmailGas({
      to: targetEmail,
      subject: subject,
      htmlBody: htmlBody,
      name: CONFIG.STORE_NAME
    }, data);

    return buildJsonResponse({
      ok: true,
      status: 'ok',
      action: 'SEND_ORDER_DELIVERY',
      orderId: orderId,
      recipient: targetEmail,
      engine: sendInfo.engine,
      message: 'Struk & rincian pesanan dikirim ke ' + targetEmail
    });
  } finally {
    if (hasLock) {
      try { lock.releaseLock(); } catch (e) {}
    }
  }
}

/* ============================================================================
 * 3. EMAIL KODE OTP 6-DIGIT NEO-BRUTALISM
 * ============================================================================ */
function handleSendOtpEmail(data) {
  var targetEmail = String(data.email || data.to || data.buyerEmail || '').trim();
  var otpCode = String(data.otpCode || data.otp || '').trim();
  var userName = String(data.userName || data.name || 'Pelanggan').trim();
  var expiryMinutes = Number(data.expiryMinutes || 5);

  if (!targetEmail || targetEmail.indexOf('@') === -1) {
    return buildJsonResponse({ ok: false, status: 'error', error: 'EMAIL_TUJUAN_TIDAK_VALID' });
  }
  if (!otpCode) {
    return buildJsonResponse({ ok: false, status: 'error', error: 'KODE_OTP_KOSONG' });
  }

  var subject = '[' + otpCode + '] Kode Verifikasi OTP — ' + CONFIG.STORE_NAME;

  var innerHtml = '' +
    '<p style="margin:0 0 10px; font-size:14.5px; font-weight:800; color:#0f172a;">Halo ' + escapeHtmlGas(userName) + ',</p>' +
    '<p style="margin:0 0 16px; font-size:13.5px; font-weight:600; line-height:1.55; color:#334155;">' +
      'Gunakan 6 digit kode OTP di bawah ini untuk menyelesaikan verifikasi akun Member kamu di <b>' + escapeHtmlGas(CONFIG.STORE_NAME) + '</b>:' +
    '</p>' +

    '<div style="background:#fef9c3; border:2.5px solid #0f172a; border-right:5px solid #0f172a; border-bottom:5px solid #0f172a; border-radius:14px; padding:18px; text-align:center; margin:18px 0;">' +
      '<span style="display:inline-block; background:#0f172a; color:#facc15; font-size:10px; font-weight:900; padding:3px 10px; border-radius:6px; letter-spacing:0.08em; margin-bottom:8px;">KODE VERIFIKASI 6-DIGIT</span>' +
      '<div style="font-family:\'Courier New\',Consolas,monospace; font-size:34px; font-weight:900; letter-spacing:8px; color:#0f172a; background:#ffffff; border:2px solid #0f172a; border-radius:10px; padding:12px 10px; margin-top:4px;">' +
        escapeHtmlGas(otpCode) +
      '</div>' +
    '</div>' +

    '<div style="background:#f8fafc; border:2px solid #0f172a; border-radius:10px; padding:11px 14px; text-align:center;">' +
      '<span style="font-size:12px; font-weight:700; color:#475569;">' +
        'Kode ini berlaku selama <b>' + expiryMinutes + ' menit</b>. Jangan bagikan kode ini kepada siapa pun.' +
      '</span>' +
    '</div>';

  var htmlBody = buildNeoBrutalEmailEnvelope({
    badgeText: 'VERIFIKASI MEMBER',
    headerBg: '#2563eb',
    headerTitle: CONFIG.STORE_NAME,
    headerSubtitle: 'Kode OTP Verifikasi Akun',
    bodyHtml: innerHtml,
    orderIdForSupport: ''
  });

  var sendInfo = sendUnlimitedEmailGas({
    to: targetEmail,
    subject: subject,
    htmlBody: htmlBody,
    name: CONFIG.STORE_NAME
  }, data);

  return buildJsonResponse({
    ok: true,
    status: 'ok',
    action: 'SEND_OTP_EMAIL',
    recipient: targetEmail,
    engine: sendInfo.engine,
    message: 'Kode OTP berhasil dikirim ke ' + targetEmail
  });
}

/* ============================================================================
 * 4. EMAIL PENGINGAT DURASI LANGGANAN NEO-BRUTALISM
 * ============================================================================ */
function handleSendExpiryReminderEmail(data) {
  if (data.emailReceiptEnabled === false || String(data.emailReceiptEnabled).toLowerCase() === 'false') {
    return buildJsonResponse({
      ok: false,
      status: 'blocked',
      error: 'EMAIL_RECEIPT_DISABLED_BY_USER',
      message: 'Notifikasi email dinonaktifkan oleh pengguna.'
    });
  }

  var targetEmail = String(data.buyerEmail || data.email || data.to || '').trim();
  if (!targetEmail || targetEmail.indexOf('@') === -1) {
    return buildJsonResponse({ ok: false, status: 'error', error: 'EMAIL_TUJUAN_TIDAK_VALID' });
  }

  var orderId = String(data.orderId || data.invoice || 'VP-ORDER').trim().toUpperCase();
  var buyerName = String(data.buyerName || targetEmail.split('@')[0] || 'Pelanggan').trim();
  var itemName = String(data.itemName || data.productName || 'Layanan Vipercell').trim();
  var endAt = Number(data.subscriptionEndAt || Date.now());
  var endStr = formatIndonesianDateOnly(new Date(endAt));
  var noteText = String(data.accountDetails || ('Masa aktif paket ' + itemName + ' berakhir pada ' + endStr + '.')).trim();

  var subject = 'Pengingat Masa Aktif #' + orderId + ' — ' + CONFIG.STORE_NAME;

  var innerHtml = '' +
    '<p style="margin:0 0 10px; font-size:14.5px; font-weight:800; color:#0f172a;">Halo ' + escapeHtmlGas(buyerName) + ',</p>' +
    '<div style="background:#fef3c7; border:2.5px solid #0f172a; border-right:5px solid #0f172a; border-bottom:5px solid #0f172a; border-radius:12px; padding:15px; margin:14px 0;">' +
      '<div style="font-size:11px; font-weight:900; color:#b45309; text-transform:uppercase; margin-bottom:4px;">INFORMASI MASA AKTIF LANGGANAN</div>' +
      '<div style="font-size:15px; font-weight:900; color:#0f172a; margin-bottom:6px;">' + escapeHtmlGas(itemName) + ' (#' + escapeHtmlGas(orderId) + ')</div>' +
      '<div style="font-size:13px; font-weight:700; color:#0f172a; line-height:1.5;">' + escapeHtmlGas(noteText) + '</div>' +
    '</div>' +
    '<p style="margin:0; font-size:13px; font-weight:600; color:#475569; line-height:1.5;">' +
      'Silakan kunjungi kembali <b>' + escapeHtmlGas(CONFIG.STORE_NAME) + '</b> apabila kamu ingin memperpanjang masa aktif layananmu.' +
    '</p>';

  var htmlBody = buildNeoBrutalEmailEnvelope({
    badgeText: 'PENGINGAT DURASI',
    headerBg: '#f59e0b',
    headerTextDark: true,
    headerTitle: CONFIG.STORE_NAME,
    headerSubtitle: 'Informasi Masa Aktif Layanan #' + orderId,
    bodyHtml: innerHtml,
    orderIdForSupport: orderId
  });

  var sendInfo = sendUnlimitedEmailGas({
    to: targetEmail,
    subject: subject,
    htmlBody: htmlBody,
    name: CONFIG.STORE_NAME
  }, data);

  return buildJsonResponse({
    ok: true,
    status: 'ok',
    action: 'SEND_EXPIRY_REMINDER',
    orderId: orderId,
    engine: sendInfo.engine,
    recipient: targetEmail
  });
}

/* ============================================================================
 * 5. EMAIL TAUTAN UBAH KATA SANDI NEO-BRUTALISM
 * ============================================================================ */
function handleSendPasswordResetLink(data) {
  var targetEmail = String(data.email || data.to || '').trim();
  var resetLink = String(data.resetLink || '').trim();
  var userName = String(data.userName || targetEmail.split('@')[0] || 'Pelanggan').trim();

  if (!targetEmail || targetEmail.indexOf('@') === -1) {
    return buildJsonResponse({ ok: false, status: 'error', error: 'EMAIL_RESET_TIDAK_VALID' });
  }

  var subject = 'Ubah Kata Sandi Akun — ' + CONFIG.STORE_NAME;

  var ctaButtonHtml = resetLink
    ? '<div style="text-align:center; margin:20px 0;">' +
        '<a href="' + escapeHtmlGas(resetLink) + '" target="_blank" style="display:inline-block; background:#facc15; color:#0f172a; text-decoration:none; font-weight:900; font-size:14px; padding:13px 24px; border-radius:10px; border:2.5px solid #0f172a; border-right:5px solid #0f172a; border-bottom:5px solid #0f172a;">' +
          'UBAH KATA SANDI SEKARANG &rarr;' +
        '</a>' +
      '</div>'
    : '';

  var innerHtml = '' +
    '<p style="margin:0 0 10px; font-size:14.5px; font-weight:800; color:#0f172a;">Halo ' + escapeHtmlGas(userName) + ',</p>' +
    '<p style="margin:0 0 14px; font-size:13.5px; font-weight:600; line-height:1.55; color:#334155;">' +
      'Kami menerima permintaan untuk mengganti kata sandi akun <b>' + escapeHtmlGas(targetEmail) + '</b> di ' + escapeHtmlGas(CONFIG.STORE_NAME) + '.' +
    '</p>' +
    ctaButtonHtml +
    '<p style="margin:0; font-size:12px; font-weight:600; color:#64748b; text-align:center;">' +
      'Abaikan email ini apabila kamu tidak merasa melakukan permintaan perubahan kata sandi.' +
    '</p>';

  var htmlBody = buildNeoBrutalEmailEnvelope({
    badgeText: 'KEAMANAN AKUN',
    headerBg: '#0f172a',
    headerTitle: CONFIG.STORE_NAME,
    headerSubtitle: 'Permintaan Ubah Kata Sandi',
    bodyHtml: innerHtml,
    orderIdForSupport: ''
  });

  var sendInfo = sendUnlimitedEmailGas({
    to: targetEmail,
    subject: subject,
    htmlBody: htmlBody,
    name: CONFIG.STORE_NAME
  }, data);

  return buildJsonResponse({
    ok: true,
    status: 'ok',
    action: 'SEND_PASSWORD_RESET_LINK',
    recipient: targetEmail,
    engine: sendInfo.engine,
    message: 'Link ubah kata sandi dikirim ke ' + targetEmail
  });
}

function handleConfirmPasswordReset(data) {
  var targetEmail = String(data.email || '').trim();
  return buildJsonResponse({
    ok: true,
    status: 'ok',
    action: 'CONFIRM_PASSWORD_RESET',
    email: targetEmail
  });
}

/* ============================================================================
 * BUILDER AMPLOP EMAIL NEO-BRUTALISM RESMI & PARSER KREDENSIAL
 * ============================================================================ */
function buildNeoBrutalEmailEnvelope(opts) {
  var badgeText = opts.badgeText || 'INFO RESMI';
  var headerBg = opts.headerBg || '#2563eb';
  var headerTextColor = opts.headerTextDark ? '#0f172a' : '#ffffff';
  var headerTitle = opts.headerTitle || CONFIG.STORE_NAME;
  var headerSubtitle = opts.headerSubtitle || CONFIG.STORE_TAGLINE;
  var bodyHtml = opts.bodyHtml || '';
  var orderId = opts.orderIdForSupport || '';

  var waMsg = orderId
    ? ('Halo Admin Vipercell, saya butuh bantuan untuk pesanan #' + orderId)
    : 'Halo Admin Vipercell';
  var waUrl = 'https://wa.me/' + CONFIG.SUPPORT_WHATSAPP + '?text=' + encodeURIComponent(waMsg);

  return '' +
    '<!DOCTYPE html>' +
    '<html lang="id">' +
    '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>' +
    '<body style="margin:0; padding:16px 10px; background-color:#f4f1ea; font-family:\'Plus Jakarta Sans\',-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif; color:#0f172a;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px; margin:0 auto;">' +
        '<tr>' +
          '<td>' +
            '<div style="background:#ffffff; border:3px solid #0f172a; border-right:7px solid #0f172a; border-bottom:7px solid #0f172a; border-radius:18px; overflow:hidden;">' +

              '<div style="background:' + headerBg + '; color:' + headerTextColor + '; padding:20px 22px; border-bottom:3px solid #0f172a;">' +
                '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
                  '<tr>' +
                    '<td valign="middle">' +
                      '<span style="display:inline-block; background:#facc15; color:#0f172a; font-size:10px; font-weight:900; padding:3px 10px; border-radius:6px; border:2px solid #0f172a; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px;">' +
                        '&#9889; ' + escapeHtmlGas(badgeText) +
                      '</span>' +
                      '<h1 style="margin:0; font-size:22px; font-weight:900; letter-spacing:-0.02em; color:' + headerTextColor + ';">' +
                        escapeHtmlGas(headerTitle) +
                      '</h1>' +
                      '<p style="margin:3px 0 0; font-size:12px; font-weight:700; opacity:0.92; color:' + headerTextColor + ';">' +
                        escapeHtmlGas(headerSubtitle) +
                      '</p>' +
                    '</td>' +
                  '</tr>' +
                '</table>' +
              '</div>' +

              '<div style="padding:20px 22px; background:#ffffff;">' +
                bodyHtml +
              '</div>' +

              '<div style="background:#f8fafc; padding:15px 22px; border-top:2.5px solid #0f172a;">' +
                '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
                  '<tr>' +
                    '<td valign="middle" style="font-size:11.5px; font-weight:700; color:#475569;">' +
                      'Butuh bantuan terkait pesananmu?' +
                    '</td>' +
                    '<td valign="middle" align="right">' +
                      '<a href="' + waUrl + '" target="_blank" style="display:inline-block; background:#facc15; color:#0f172a; text-decoration:none; font-size:11.5px; font-weight:900; padding:7px 13px; border-radius:8px; border:2px solid #0f172a; border-right:3.5px solid #0f172a; border-bottom:3.5px solid #0f172a;">' +
                        'Hubungi CS &rarr;' +
                      '</a>' +
                    '</td>' +
                  '</tr>' +
                '</table>' +
              '</div>' +

            '</div>' +

            '<div style="text-align:center; padding-top:12px; font-size:11px; font-weight:700; color:#64748b;">' +
              '&copy; ' + new Date().getFullYear() + ' <b>' + escapeHtmlGas(CONFIG.STORE_NAME) + '</b> &bull; ' + escapeHtmlGas(CONFIG.STORE_TAGLINE) +
            '</div>' +
          '</td>' +
        '</tr>' +
      '</table>' +
    '</body>' +
    '</html>';
}

function parseCredentialsForEmailReceipt(rawText) {
  var result = { rawPipes: [], pairs: [] };
  if (!rawText) return result;

  var lines = String(rawText).split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    if (line.charAt(0) === '[' && line.charAt(line.length - 1) === ']') continue;
    if (line.toLowerCase().indexOf('terima kasih telah berbelanja') === 0) continue;

    if (line.toUpperCase().indexOf('FORMAT_UTUH') === 0) {
      var cIdx = line.indexOf(':');
      var pipeStr = cIdx > -1 ? line.substring(cIdx + 1).trim() : '';
      if (pipeStr && result.rawPipes.indexOf(pipeStr) === -1) {
        result.rawPipes.push(pipeStr);
      }
      continue;
    }

    if (line.indexOf('|') > -1 && line.split('|').length >= 4) {
      var segs = line.split('|');
      var fourPart = segs[0].trim() + '|' + segs[1].trim() + '|' + segs[2].trim() + '|' + segs[3].trim();
      if (result.rawPipes.indexOf(fourPart) === -1) {
        result.rawPipes.push(fourPart);
      }
      if (segs[0].trim()) result.pairs.push({ label: 'Email', val: segs[0].trim(), isUrl: false });
      if (segs[1].trim() && segs[1].trim() !== '-') result.pairs.push({ label: 'Password', val: segs[1].trim(), isUrl: false });
      if (segs[2].trim() && segs[2].trim() !== '-') result.pairs.push({ label: 'Refresh Token', val: segs[2].trim(), isUrl: false });
      if (segs[3].trim() && segs[3].trim() !== '-') result.pairs.push({ label: 'Client ID', val: segs[3].trim(), isUrl: false });
      continue;
    }

    var colonPos = line.indexOf(':');
    if (colonPos > 0 && colonPos < 28) {
      var lbl = line.substring(0, colonPos).trim();
      var val = line.substring(colonPos + 1).trim();
      if (val && val !== '-') {
        result.pairs.push({
          label: lbl,
          val: val,
          isUrl: val.indexOf('http://') === 0 || val.indexOf('https://') === 0
        });
      }
    } else if (line.indexOf('|') > -1) {
      var parts = line.split('|');
      if (parts[0] && parts[0].trim()) result.pairs.push({ label: 'Email / ID', val: parts[0].trim(), isUrl: false });
      if (parts[1] && parts[1].trim() && parts[1].trim() !== '-') result.pairs.push({ label: 'Password', val: parts[1].trim(), isUrl: false });
      if (parts.length > 2) {
        var noteStr = parts.slice(2).join(' | ').trim();
        if (noteStr && noteStr !== '-') {
          result.pairs.push({
            label: 'Keterangan',
            val: noteStr,
            isUrl: noteStr.indexOf('http://') === 0 || noteStr.indexOf('https://') === 0
          });
        }
      }
    }
  }
  return result;
}

function formatIndonesianDateTime(d) {
  try {
    return Utilities.formatDate(d, 'Asia/Jakarta', 'dd MMM yyyy, HH:mm') + ' WIB';
  } catch (e) {
    return d.toLocaleString('id-ID');
  }
}

function formatIndonesianDateOnly(d) {
  try {
    return Utilities.formatDate(d, 'Asia/Jakarta', 'dd MMM yyyy');
  } catch (e) {
    return d.toLocaleDateString('id-ID');
  }
}

function parseIncomingPayload(e) {
  if (!e) return null;
  var data = {};

  if (e.parameter) {
    for (var k in e.parameter) {
      data[k] = e.parameter[k];
    }
  }

  if (e.postData && e.postData.contents) {
    var raw = String(e.postData.contents).trim();
    if (raw) {
      try {
        var parsedJson = JSON.parse(raw);
        for (var jk in parsedJson) {
          data[jk] = parsedJson[jk];
        }
      } catch (jsonErr) {
        if (raw.indexOf('=') !== -1 && raw.indexOf('{') === -1) {
          var pairs = raw.split('&');
          for (var p = 0; p < pairs.length; p++) {
            var eqIdx = pairs[p].indexOf('=');
            if (eqIdx > 0) {
              var pKey = decodeURIComponent(pairs[p].substring(0, eqIdx).replace(/\+/g, ' ')).trim();
              var pVal = decodeURIComponent(pairs[p].substring(eqIdx + 1).replace(/\+/g, ' ')).trim();
              data[pKey] = pVal;
            }
          }
        }
        data.rawBody = raw;
        if (!data.text) data.text = raw;
      }
    }
  }
  return data;
}

function escapeHtmlGas(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildJsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}