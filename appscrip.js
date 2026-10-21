/**
 * ============================================================================
 * VIPERCELL — GOOGLE APPS SCRIPT SERVER (NEO-BRUTALISM & FAST PAYMENT ENGINE)
 * Nama File : SERVER_APPS_SCRIP.js
 *
 * Fungsi Utama:
 *  1. Verifikasi Pembayaran QRIS Sangat Cepat (Paralel `UrlFetchApp.fetchAll` +
 *     Auto-Match & Patch Langsung Dokumen Order `UNPAID` di Firestore)
 *  2. Mengirim Email Struk & Rincian Pesanan Bergaya Neo-Brutalism Matang
 *     dengan Proteksi Anti-Dobel (`SEND_ORDER_DELIVERY`)
 *  3. Mengirim Kode OTP 6-Digit Neo-Brutalism untuk Upgrade Member (`SEND_OTP_EMAIL`)
 *  4. Mengirim Email Pengingat Masa Aktif Langganan (`SEND_EXPIRY_REMINDER`)
 *  5. Mengirim Email Tautan Ubah Kata Sandi (`SEND_PASSWORD_RESET_LINK`)
 * ============================================================================
 */

var CONFIG = {
  FIREBASE_PROJECT_ID: 'vipercell-fc50e',
  WEBHOOK_SECRET: 'VIPERCELL_SECRET_2026',
  STORE_NAME: 'VIPERCELL',
  STORE_TAGLINE: 'Toko Aplikasi Premium, Top Up Game & Produk Digital',
  SUPPORT_WHATSAPP: '6285656321860',
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
  var remainingQuota = MailApp.getRemainingDailyQuota();
  Logger.log('Otorisasi berhasil. Sisa kuota email harian: ' + remainingQuota);
}

/**
 * Handler HTTP GET (Cek Status Server Cepat)
 */
function doGet(e) {
  return buildJsonResponse({
    ok: true,
    status: 'ok',
    service: 'Vipercell Fast Payment & Email Server',
    projectId: CONFIG.FIREBASE_PROJECT_ID,
    remainingEmailQuota: MailApp.getRemainingDailyQuota(),
    timestamp: new Date().toISOString()
  });
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

    var incomingSecret = String(payload.secret || payload.key || '').trim();
    if (CONFIG.WEBHOOK_SECRET && incomingSecret && incomingSecret !== CONFIG.WEBHOOK_SECRET) {
      return buildJsonResponse({
        ok: false,
        status: 'error',
        error: 'UNAUTHORIZED_SECRET',
        message: 'Webhook Secret tidak sesuai.'
      });
    }

    var action = String(payload.action || payload.type || '').toUpperCase().trim();

    if (!action) {
      if (payload.otpCode || payload.otp) {
        action = 'SEND_OTP_EMAIL';
      } else if (payload.resetLink || payload.newPassword) {
        action = payload.newPassword ? 'CONFIRM_PASSWORD_RESET' : 'SEND_PASSWORD_RESET_LINK';
      } else if (payload.orderId || payload.invoice || payload.accountDetails) {
        action = 'SEND_ORDER_DELIVERY';
      } else {
        action = 'MACRODROID_PAYMENT_WEBHOOK';
      }
    }

    // Prioritaskan jalur cepat untuk mutasi pembayaran QRIS
    if (action === 'MACRODROID_PAYMENT_WEBHOOK' || action === 'PAYMENT_WEBHOOK' || action === 'QRIS_MUTATION') {
      return handleMacroDroidPaymentMutation(payload, startMs);
    }

    if (action === 'SEND_OTP_EMAIL' || action === 'OTP') {
      return handleSendOtpEmail(payload);
    }

    if (action === 'SEND_ORDER_DELIVERY' || action === 'ORDER_DELIVERY') {
      return handleSendOrderDeliveryEmail(payload);
    }

    if (action === 'SEND_EXPIRY_REMINDER' || action === 'EXPIRY_REMINDER') {
      return handleSendExpiryReminderEmail(payload);
    }

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
 * 1. VERIFIKASI PEMBAYARAN QRIS SANGAT CEPAT (MACRODROID -> FIRESTORE PARALEL)
 * ============================================================================ */
function handleMacroDroidPaymentMutation(data, startMs) {
  var nowMs = Date.now();
  var rawTitle = String(data.title || data.appName || data.app || '').trim();
  var rawText = String(
    data.text ||
    data.notification ||
    data.message ||
    data.body ||
    data.bigText ||
    data.subText ||
    data.amount ||
    data.nominal ||
    ''
  ).trim();
  var combinedText = (rawTitle + ' ' + rawText).trim();

  var candidateAmounts = extractCandidateAmountsFromNotification(
    combinedText,
    data.amount || data.nominal || data.total
  );

  if (candidateAmounts.length === 0) {
    return buildJsonResponse({
      ok: false,
      status: 'ignored',
      reason: 'NO_VALID_AMOUNT_DETECTED',
      rawText: combinedText
    });
  }

  var primaryAmount = candidateAmounts[0];

  // Proteksi anti-spam notifikasi ganda dalam 6 detik yang sama agar super ringan
  try {
    var cache = CacheService.getScriptCache();
    if (cache) {
      var sigHash = 'MUT_' + primaryAmount + '_' + String(combinedText).replace(/\s+/g, '').slice(0, 40);
      if (cache.get(sigHash)) {
        return buildJsonResponse({
          ok: true,
          status: 'ok',
          action: 'MACRODROID_PAYMENT_WEBHOOK',
          deduplicated: true,
          detectedAmount: primaryAmount,
          candidateAmounts: candidateAmounts,
          latencyMs: Date.now() - (startMs || nowMs)
        });
      }
      cache.put(sigHash, '1', 6);
    }
  } catch (cErr) {}

  // Eksekusi sinkronisasi paralel ke Firestore + verifikasi langsung dokumen order UNPAID
  var syncResult = pushFastPaymentSignalAndVerifyOrder(primaryAmount, candidateAmounts, combinedText, nowMs);

  return buildJsonResponse({
    ok: true,
    status: 'ok',
    action: 'MACRODROID_PAYMENT_WEBHOOK',
    detectedAmount: primaryAmount,
    candidateAmounts: candidateAmounts,
    matchedOrderIds: syncResult.matchedOrderIds,
    firestoreSynced: syncResult.synced,
    latencyMs: Date.now() - (startMs || nowMs),
    timestamp: nowMs
  });
}

/**
 * Ekstraktor Nominal QRIS Cepat & Akurat
 * Mendukung GoPay Merchant, DANA Bisnis, OVO, ShopeePay, SeaBank, BCA, BRI, Mandiri, BNI, Nobu, Soundbox, dll.
 */
function extractCandidateAmountsFromNotification(text, explicitAmount) {
  var results = [];

  function addAmount(val) {
    var num = Math.round(Number(val));
    if (!isNaN(num) && num >= 100 && num <= 100000000 && results.indexOf(num) === -1) {
      results.push(num);
    }
  }

  if (explicitAmount !== undefined && explicitAmount !== null && String(explicitAmount).trim() !== '') {
    var cleanExplicit = String(explicitAmount).replace(/[,\.]00\b/g, '').replace(/[^0-9]/g, '');
    if (cleanExplicit) addAmount(parseInt(cleanExplicit, 10));
  }

  if (!text) return results;

  // Bersihkan akhiran sen desimal seperti ,00 atau .00
  var cleaned = String(text)
    .replace(/(\d)[,\.]00(?!\d)/g, '$1')
    .replace(/(\d)[,\.]0(?!\d)/g, '$1');

  // 1. Prioritas Utama: Pola kata kunci mata uang / mutasi masuk (Rp, IDR, sebesar, senilai, diterima, masuk, kredit, +)
  var regexRp = /(?:rp\.?|idr|sebesar|senilai|masuk|terima|diterima|pembayaran|kredit|qris|total|\+)\s*[:\.]?\s*([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{3,8})\b/gi;
  var match;
  while ((match = regexRp.exec(cleaned)) !== null) {
    var numStr = match[1].replace(/[^0-9]/g, '');
    var val = parseInt(numStr, 10);
    if (!isNaN(val) && val >= 100) {
      addAmount(val);
    }
  }

  // 2. Cadangan: Angka ribuan berformat titik/koma (contoh: 15.234 atau 25,108) atau angka 4-8 digit
  var genericRegex = /\b([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{4,8})\b/g;
  var gMatch;
  while ((gMatch = genericRegex.exec(cleaned)) !== null) {
    var rawToken = gMatch[1];
    var gNum = parseInt(rawToken.replace(/[^0-9]/g, ''), 10);
    // Hindari tahun seperti 2025/2026/2027 jika tidak diawali Rp
    if (gNum >= 2020 && gNum <= 2035 && rawToken.indexOf('.') === -1 && rawToken.indexOf(',') === -1) {
      continue;
    }
    if (!isNaN(gNum) && gNum >= 500 && gNum <= 50000000) {
      addAmount(gNum);
    }
  }

  return results;
}

/**
 * Mendorong sinyal pembayaran secara PARALEL (`UrlFetchApp.fetchAll`) sekaligus
 * mencari & menandai pesanan `UNPAID` yang cocok menjadi `PAID` (`paymentVerified: true`)
 * agar Web User dan Web Admin merespons secara instan!
 */
function pushFastPaymentSignalAndVerifyOrder(primaryAmount, candidateAmounts, rawNotifText, timestampMs) {
  var baseUrl = 'https://firestore.googleapis.com/v1/projects/' + CONFIG.FIREBASE_PROJECT_ID + '/databases/(default)/documents';
  var matchedOrderIds = [];

  try {
    var arrayValues = [];
    for (var i = 0; i < candidateAmounts.length; i++) {
      arrayValues.push({ integerValue: String(candidateAmounts[i]) });
    }

    var safeRawText = String(rawNotifText || '').slice(0, 280);

    // Request 1: Patch settings/mainConfig
    var settingsPatchUrl = baseUrl + '/settings/mainConfig?updateMask.fieldPaths=lastPaymentDetected&updateMask.fieldPaths=lastPaymentTimestamp&updateMask.fieldPaths=lastPaymentMutation';
    var patchBody = {
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

    // Request 2: Post ke koleksi payment_mutations
    var mutationsUrl = baseUrl + '/payment_mutations';
    var mutBody = {
      fields: {
        amount: { integerValue: String(primaryAmount) },
        receivedAt: { integerValue: String(timestampMs) },
        rawText: { stringValue: safeRawText },
        candidateAmounts: { arrayValue: { values: arrayValues } }
      }
    };

    // Request 3: Query langsung ke koleksi orders yang berstatus UNPAID
    var runQueryUrl = baseUrl + ':runQuery';
    var queryBody = {
      structuredQuery: {
        from: [{ collectionId: 'orders' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'status' },
            op: 'EQUAL',
            value: { stringValue: 'UNPAID' }
          }
        },
        limit: 40
      }
    };

    // Jalankan ketiga request secara PARALEL dalam 1 waktu tunggu!
    var responses = UrlFetchApp.fetchAll([
      {
        url: settingsPatchUrl,
        method: 'patch',
        contentType: 'application/json',
        payload: JSON.stringify(patchBody),
        muteHttpExceptions: true
      },
      {
        url: mutationsUrl,
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(mutBody),
        muteHttpExceptions: true
      },
      {
        url: runQueryUrl,
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(queryBody),
        muteHttpExceptions: true
      }
    ]);

    // Periksa hasil query pesanan UNPAID dan langsung ubah ke PAID jika nominal cocok
    var queryResp = responses[2];
    if (queryResp && queryResp.getResponseCode() === 200) {
      var rows = JSON.parse(queryResp.getContentText() || '[]');
      var orderPatchRequests = [];

      for (var r = 0; r < rows.length; r++) {
        var docObj = rows[r] && rows[r].document;
        if (!docObj || !docObj.fields) continue;

        var f = docObj.fields;
        var finalTotal = extractFirestoreInt(f.finalTotal);
        var uniqueTotal = extractFirestoreInt(f.uniqueTotal);
        var orderIdStr = f.id && f.id.stringValue ? f.id.stringValue : '';

        var isAmountMatch = (
          (finalTotal > 0 && candidateAmounts.indexOf(finalTotal) !== -1) ||
          (uniqueTotal > 0 && candidateAmounts.indexOf(uniqueTotal) !== -1)
        );

        if (isAmountMatch) {
          matchedOrderIds.push(orderIdStr || docObj.name.split('/').pop());
          var docPatchUrl = 'https://firestore.googleapis.com/v1/' + docObj.name +
            '?updateMask.fieldPaths=status&updateMask.fieldPaths=paymentVerified&updateMask.fieldPaths=paidAt';

          orderPatchRequests.push({
            url: docPatchUrl,
            method: 'patch',
            contentType: 'application/json',
            payload: JSON.stringify({
              fields: {
                status: { stringValue: 'PAID' },
                paymentVerified: { booleanValue: true },
                paidAt: { integerValue: String(timestampMs) }
              }
            }),
            muteHttpExceptions: true
          });
        }
      }

      if (orderPatchRequests.length > 0) {
        UrlFetchApp.fetchAll(orderPatchRequests);
      }
    }

    return { synced: true, matchedOrderIds: matchedOrderIds };
  } catch (err) {
    Logger.log('Fast Firestore Sync Error: ' + err);
    return { synced: false, matchedOrderIds: matchedOrderIds };
  }
}

function extractFirestoreInt(fieldObj) {
  if (!fieldObj) return 0;
  if (fieldObj.integerValue !== undefined) return parseInt(fieldObj.integerValue, 10) || 0;
  if (fieldObj.doubleValue !== undefined) return Math.round(Number(fieldObj.doubleValue)) || 0;
  if (fieldObj.stringValue !== undefined) return parseInt(fieldObj.stringValue, 10) || 0;
  return 0;
}

/* ============================================================================
 * 2. TEMPLATE STRUK & RINCIAN PESANAN HTML NEO-BRUTALISM MATANG (#1)
 * ============================================================================ */
function handleSendOrderDeliveryEmail(data) {
  var targetEmail = String(data.buyerEmail || data.email || data.to || '').trim();
  if (!targetEmail || targetEmail.indexOf('@') === -1) {
    return buildJsonResponse({ ok: false, status: 'error', error: 'EMAIL_PEMBELI_TIDAK_VALID' });
  }

  var orderId = String(data.orderId || data.invoice || data.invoiceId || 'VP-ORDER').trim().toUpperCase();
  var isTestOrder = (orderId.indexOf('VP-TEST') === 0);

  // Proteksi Anti-Email Dobel di Server menggunakan LockService & CacheService
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

    // Ekstraksi cerdas baris kredensial agar tampil dalam kartu Neo-Brutalist yang rapi
    var parsedCreds = parseCredentialsForEmailReceipt(accountDetails);

    // Blok Format Utuh untuk Produk Email (email|password|refresh_token|client_id)
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

    // Kartu Kredensial Terstruktur (Email/ID, Password, Link, Keterangan)
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

    // Baris Durasi Masa Aktif (Jika Produk Berdurasi)
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
      '<!-- BANNER STATUS HERO NEO-BRUTALISM -->' +
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

      '<!-- STEPPER PROGRES 3 TAHAP -->' +
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

      '<!-- KARTU ITEM & RINCIAN TRANSAKSI -->' +
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

      '<!-- KOTAK KREDENSIAL / DETAIL AKUN TERKIRIM -->' +
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

    MailApp.sendEmail({
      to: targetEmail,
      subject: subject,
      htmlBody: htmlBody,
      name: CONFIG.STORE_NAME
    });

    return buildJsonResponse({
      ok: true,
      status: 'ok',
      action: 'SEND_ORDER_DELIVERY',
      orderId: orderId,
      recipient: targetEmail,
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

  MailApp.sendEmail({
    to: targetEmail,
    subject: subject,
    htmlBody: htmlBody,
    name: CONFIG.STORE_NAME
  });

  return buildJsonResponse({
    ok: true,
    status: 'ok',
    action: 'SEND_OTP_EMAIL',
    recipient: targetEmail,
    message: 'Kode OTP berhasil dikirim ke ' + targetEmail
  });
}

/* ============================================================================
 * 4. EMAIL PENGINGAT DURASI LANGGANAN NEO-BRUTALISM
 * ============================================================================ */
function handleSendExpiryReminderEmail(data) {
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

  MailApp.sendEmail({
    to: targetEmail,
    subject: subject,
    htmlBody: htmlBody,
    name: CONFIG.STORE_NAME
  });

  return buildJsonResponse({
    ok: true,
    status: 'ok',
    action: 'SEND_EXPIRY_REMINDER',
    orderId: orderId,
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

  MailApp.sendEmail({
    to: targetEmail,
    subject: subject,
    htmlBody: htmlBody,
    name: CONFIG.STORE_NAME
  });

  return buildJsonResponse({
    ok: true,
    status: 'ok',
    action: 'SEND_PASSWORD_RESET_LINK',
    recipient: targetEmail,
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
            '<!-- KARTU UTAMA NEO-BRUTALISM -->' +
            '<div style="background:#ffffff; border:3px solid #0f172a; border-right:7px solid #0f172a; border-bottom:7px solid #0f172a; border-radius:18px; overflow:hidden;">' +

              '<!-- HEADER NEO-BRUTALISM -->' +
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

              '<!-- ISI UTAMA -->' +
              '<div style="padding:20px 22px; background:#ffffff;">' +
                bodyHtml +
              '</div>' +

              '<!-- FOOTER NEO-BRUTALISM -->' +
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