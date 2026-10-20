/**
 * ============================================================================
 * VIPERCELL — GOOGLE APPS SCRIPT SERVER
 * Nama File : SERVER_APPS_SCRIP.js
 *
 * Fungsi Utama:
 *  1. Mengirim Kode OTP 6-Digit untuk Upgrade Akun ke Member (`SEND_OTP_EMAIL`)
 *  2. Mengirim Email Struk & Detail Pesanan dengan Proteksi Anti-Dobel (`SEND_ORDER_DELIVERY`)
 *  3. Mengirim Email Pengingat Masa Aktif Langganan (`SEND_EXPIRY_REMINDER`)
 *  4. Menerima Webhook Mutasi Pembayaran QRIS dari MacroDroid ke Firestore
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
 * Handler HTTP GET
 */
function doGet(e) {
  return buildJsonResponse({
    ok: true,
    status: 'ok',
    service: 'Vipercell Server',
    projectId: CONFIG.FIREBASE_PROJECT_ID,
    remainingEmailQuota: MailApp.getRemainingDailyQuota(),
    timestamp: new Date().toISOString()
  });
}

/**
 * Handler Utama HTTP POST
 */
function doPost(e) {
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

    if (action === 'SEND_OTP_EMAIL' || action === 'OTP') {
      return handleSendOtpEmail(payload);
    }

    if (action === 'SEND_PASSWORD_RESET_LINK' || action === 'RESET_PASSWORD') {
      return handleSendPasswordResetLink(payload);
    }

    if (action === 'CONFIRM_PASSWORD_RESET') {
      return handleConfirmPasswordReset(payload);
    }

    if (action === 'SEND_ORDER_DELIVERY' || action === 'ORDER_DELIVERY') {
      return handleSendOrderDeliveryEmail(payload);
    }

    if (action === 'SEND_EXPIRY_REMINDER' || action === 'EXPIRY_REMINDER') {
      return handleSendExpiryReminderEmail(payload);
    }

    return handleMacroDroidPaymentMutation(payload);

  } catch (err) {
    return buildJsonResponse({
      ok: false,
      status: 'error',
      error: String(err.message || err)
    });
  }
}

/* ============================================================================
 * 1. PENGIRIMAN EMAIL KODE OTP 6-DIGIT
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

  var subject = '[' + otpCode + '] Kode OTP — ' + CONFIG.STORE_NAME;

  var htmlBody = '' +
    '<div style="font-family:\'Plus Jakarta Sans\',Arial,sans-serif; max-width:540px; margin:0 auto; background:#f4f6fb; padding:22px; border:2px solid #0f172a; border-radius:16px;">' +
      '<div style="background:#2563eb; color:#ffffff; padding:18px; border:2px solid #0f172a; border-radius:12px; text-align:center;">' +
        '<h2 style="margin:0; font-size:20px; font-weight:800;">' + escapeHtmlGas(CONFIG.STORE_NAME) + '</h2>' +
        '<p style="margin:4px 0 0; font-size:12px; opacity:0.92;">Kode Verifikasi Akun</p>' +
      '</div>' +

      '<div style="background:#ffffff; border:2px solid #0f172a; border-radius:12px; padding:20px; margin-top:14px; color:#0f172a;">' +
        '<p style="margin:0 0 10px; font-size:14px;">Halo <b>' + escapeHtmlGas(userName) + '</b>,</p>' +
        '<p style="margin:0 0 14px; font-size:13.5px; line-height:1.55; color:#334155;">' +
          'Gunakan 6 digit kode OTP berikut untuk memverifikasi akun kamu:' +
        '</p>' +

        '<div style="background:#fef9c3; border:2px dashed #0f172a; border-radius:10px; padding:16px; text-align:center; margin:16px 0;">' +
          '<span style="display:block; font-size:11px; font-weight:800; color:#475569; margin-bottom:4px;">KODE OTP</span>' +
          '<div style="font-family:\'Courier New\',monospace; font-size:32px; font-weight:900; letter-spacing:7px; color:#0f172a;">' +
            escapeHtmlGas(otpCode) +
          '</div>' +
        '</div>' +

        '<p style="margin:0; font-size:12px; color:#64748b; text-align:center;">' +
          'Kode berlaku selama <b>' + expiryMinutes + ' menit</b>. Jangan bagikan kode ini kepada siapa pun.' +
        '</p>' +
      '</div>' +
    '</div>';

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
 * 2. PENGIRIMAN LINK UBAH KATA SANDI KE EMAIL AKUN (#8)
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
    ? '<div style="text-align:center; margin:18px 0;">' +
        '<a href="' + escapeHtmlGas(resetLink) + '" target="_blank" style="display:inline-block; background:#2563eb; color:#ffffff; text-decoration:none; font-weight:800; font-size:14px; padding:12px 22px; border-radius:10px; border:2px solid #0f172a;">' +
          'Ubah Kata Sandi Sekarang' +
        '</a>' +
      '</div>'
    : '';

  var htmlBody = '' +
    '<div style="font-family:\'Plus Jakarta Sans\',Arial,sans-serif; max-width:540px; margin:0 auto; background:#f4f6fb; padding:22px; border:2px solid #0f172a; border-radius:16px;">' +
      '<div style="background:#0f172a; color:#ffffff; padding:18px; border:2px solid #0f172a; border-radius:12px; text-align:center;">' +
        '<h2 style="margin:0; font-size:19px; font-weight:800;">UBAH KATA SANDI</h2>' +
        '<p style="margin:4px 0 0; font-size:12px; opacity:0.9;">' + escapeHtmlGas(CONFIG.STORE_NAME) + '</p>' +
      '</div>' +

      '<div style="background:#ffffff; border:2px solid #0f172a; border-radius:12px; padding:20px; margin-top:14px; color:#0f172a;">' +
        '<p style="margin:0 0 10px; font-size:14px;">Halo <b>' + escapeHtmlGas(userName) + '</b>,</p>' +
        '<p style="margin:0 0 14px; font-size:13.5px; line-height:1.55; color:#334155;">' +
          'Silakan klik tombol di bawah untuk mengganti kata sandi akun <b>' + escapeHtmlGas(targetEmail) + '</b>:' +
        '</p>' +
        ctaButtonHtml +
        '<p style="margin:0; font-size:12px; color:#64748b; text-align:center;">' +
          'Abaikan pesan ini jika kamu tidak meminta perubahan kata sandi.' +
        '</p>' +
      '</div>' +
    '</div>';

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
 * 3. PENGIRIMAN EMAIL STRUK & DETAIL PESANAN DENGAN ANTI-DOBEL SERVER (#12 & #18)
 * ============================================================================ */
function handleSendOrderDeliveryEmail(data) {
  var targetEmail = String(data.buyerEmail || data.email || data.to || '').trim();
  if (!targetEmail || targetEmail.indexOf('@') === -1) {
    return buildJsonResponse({ ok: false, status: 'error', error: 'EMAIL_PEMBELI_TIDAK_VALID' });
  }

  var orderId = String(data.orderId || data.invoice || data.invoiceId || 'VP-ORDER').trim().toUpperCase();
  var isTestOrder = (orderId.indexOf('VP-TEST') === 0);

  // Proteksi Anti-Email Dobel di Server menggunakan LockService & CacheService (#12)
  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    hasLock = lock.tryLock(10000);
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
      // Simpan penanda di cache selama 6 jam (21.600 detik) sebelum mengirim
      cache.put(dedupKey, '1', 21600);
    }

    var buyerName = String(data.buyerName || targetEmail.split('@')[0] || 'Pelanggan').trim();
    var itemName = String(data.itemName || ((data.productName || 'Produk') + ' - ' + (data.variantName || ''))).trim();
    var totalAmount = Number(data.totalAmount || data.uniqueTotal || 0);
    var totalFormatted = data.totalFormatted || ('Rp ' + totalAmount.toLocaleString('id-ID'));
    var targetId = String(data.targetId || '-').trim();
    var accountDetails = String(data.accountDetails || 'Pesanan selesai diproses.').trim();
    var durationDays = Number(data.durationDays || 0);
    var subscriptionEndAt = Number(data.subscriptionEndAt || 0);

    // Deteksi format produk email (email|password|refresh_token|client_id) tanpa link default ambil kode (#18)
    var rawPipeDetected = '';
    var lines = accountDetails.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].trim();
      if (ln.toUpperCase().indexOf('FORMAT_UTUH') === 0) {
        var idxC = ln.indexOf(':');
        if (idxC > -1) rawPipeDetected = ln.substring(idxC + 1).trim();
      } else if (ln.indexOf('|') > -1 && ln.split('|').length >= 4 && !rawPipeDetected) {
        var segs = ln.split('|');
        rawPipeDetected = segs[0].trim() + '|' + segs[1].trim() + '|' + segs[2].trim() + '|' + segs[3].trim();
      }
    }

    var emailOAuthHtml = '';
    if (rawPipeDetected) {
      emailOAuthHtml = '' +
        '<div style="background:#f3e8ff; border:2px solid #0f172a; border-radius:10px; padding:14px; margin-bottom:14px;">' +
          '<div style="font-size:11px; font-weight:800; color:#6b21a8; margin-bottom:5px;">' +
            'FORMAT EMAIL UTUH:' +
          '</div>' +
          '<div style="font-family:\'Courier New\',monospace; font-size:12.5px; font-weight:800; color:#0f172a; background:#ffffff; padding:9px; border:1.5px solid #0f172a; border-radius:7px; word-break:break-all;">' +
            escapeHtmlGas(rawPipeDetected) +
          '</div>' +
        '</div>';
    }

    var durationHtml = '';
    if (durationDays > 0) {
      var endDateStr = subscriptionEndAt > 0
        ? new Date(subscriptionEndAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
        : (durationDays + ' Hari');
      durationHtml = '' +
        '<tr>' +
          '<td style="padding:6px 0; color:#64748b; font-size:13px;">Durasi</td>' +
          '<td style="padding:6px 0; font-weight:800; color:#2563eb; font-size:13px; text-align:right;">' + durationDays + ' Hari (' + escapeHtmlGas(endDateStr) + ')</td>' +
        '</tr>';
    }

    var subject = 'Rincian Pesanan #' + orderId + ' — ' + CONFIG.STORE_NAME;

    var htmlBody = '' +
      '<div style="font-family:\'Plus Jakarta Sans\',Arial,sans-serif; max-width:560px; margin:0 auto; background:#f4f6fb; padding:22px; border:2px solid #0f172a; border-radius:16px;">' +
        '<div style="background:#10b981; color:#ffffff; padding:18px; border:2px solid #0f172a; border-radius:12px; text-align:center;">' +
          '<h2 style="margin:0; font-size:20px; font-weight:800;">PESANAN SELESAI</h2>' +
          '<p style="margin:4px 0 0; font-size:12.5px; font-weight:700;">Invoice #' + escapeHtmlGas(orderId) + '</p>' +
        '</div>' +

        '<div style="background:#ffffff; border:2px solid #0f172a; border-radius:12px; padding:20px; margin-top:14px; color:#0f172a;">' +
          '<p style="margin:0 0 10px; font-size:14px;">Halo <b>' + escapeHtmlGas(buyerName) + '</b>,</p>' +
          '<p style="margin:0 0 14px; font-size:13.5px; line-height:1.5; color:#334155;">' +
            'Terima kasih telah berbelanja di <b>' + escapeHtmlGas(CONFIG.STORE_NAME) + '</b>. Berikut adalah rincian pesanan kamu:' +
          '</p>' +

          '<table style="width:100%; border-collapse:collapse; margin-bottom:14px; border-top:1.5px dashed #cbd5e1; border-bottom:1.5px dashed #cbd5e1;">' +
            '<tr>' +
              '<td style="padding:6px 0; color:#64748b; font-size:13px;">Nomor Invoice</td>' +
              '<td style="padding:6px 0; font-weight:800; color:#0f172a; font-size:13px; text-align:right; font-family:monospace;">#' + escapeHtmlGas(orderId) + '</td>' +
            '</tr>' +
            '<tr>' +
              '<td style="padding:6px 0; color:#64748b; font-size:13px;">Produk</td>' +
              '<td style="padding:6px 0; font-weight:800; color:#0f172a; font-size:13px; text-align:right;">' + escapeHtmlGas(itemName) + '</td>' +
            '</tr>' +
            '<tr>' +
              '<td style="padding:6px 0; color:#64748b; font-size:13px;">Tujuan</td>' +
              '<td style="padding:6px 0; font-weight:700; color:#334155; font-size:13px; text-align:right;">' + escapeHtmlGas(targetId) + '</td>' +
            '</tr>' +
            durationHtml +
            '<tr>' +
              '<td style="padding:8px 0; color:#0f172a; font-weight:800; font-size:14px;">Total Bayar</td>' +
              '<td style="padding:8px 0; font-weight:900; color:#10b981; font-size:15px; text-align:right;">' + escapeHtmlGas(totalFormatted) + '</td>' +
            '</tr>' +
          '</table>' +

          emailOAuthHtml +

          '<div style="background:#f8fafc; border:2px solid #0f172a; border-radius:10px; padding:14px; margin-bottom:12px;">' +
            '<div style="font-size:11px; font-weight:800; color:#047857; margin-bottom:6px;">' +
              'DETAIL PESANAN:' +
            '</div>' +
            '<pre style="margin:0; font-family:\'Courier New\',monospace; font-size:13px; font-weight:700; color:#0f172a; white-space:pre-wrap; word-break:break-word; line-height:1.5;">' +
              escapeHtmlGas(accountDetails) +
            '</pre>' +
          '</div>' +
        '</div>' +
      '</div>';

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
      message: 'Rincian pesanan dikirim ke ' + targetEmail
    });
  } finally {
    if (hasLock) {
      try { lock.releaseLock(); } catch (e) {}
    }
  }
}

/* ============================================================================
 * 4. PENGIRIMAN EMAIL PENGINGAT DURASI LANGGANAN
 * ============================================================================ */
function handleSendExpiryReminderEmail(data) {
  var targetEmail = String(data.buyerEmail || data.email || data.to || '').trim();
  if (!targetEmail || targetEmail.indexOf('@') === -1) {
    return buildJsonResponse({ ok: false, status: 'error', error: 'EMAIL_TUJUAN_TIDAK_VALID' });
  }

  var orderId = String(data.orderId || data.invoice || 'VP-ORDER').trim();
  var buyerName = String(data.buyerName || targetEmail.split('@')[0] || 'Pelanggan').trim();
  var itemName = String(data.itemName || data.productName || 'Layanan Vipercell').trim();
  var endAt = Number(data.subscriptionEndAt || Date.now());
  var endStr = new Date(endAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  var noteText = String(data.accountDetails || ('Masa aktif paket ' + itemName + ' berakhir pada ' + endStr + '.')).trim();

  var subject = 'Pengingat Masa Aktif #' + orderId + ' — ' + CONFIG.STORE_NAME;

  var htmlBody = '' +
    '<div style="font-family:\'Plus Jakarta Sans\',Arial,sans-serif; max-width:540px; margin:0 auto; background:#f4f6fb; padding:22px; border:2px solid #0f172a; border-radius:16px;">' +
      '<div style="background:#f59e0b; color:#0f172a; padding:16px; border:2px solid #0f172a; border-radius:12px; text-align:center;">' +
        '<h2 style="margin:0; font-size:19px; font-weight:800;">PENGINGAT LANGGANAN</h2>' +
        '<p style="margin:4px 0 0; font-size:12px; font-weight:700;">Invoice #' + escapeHtmlGas(orderId) + '</p>' +
      '</div>' +
      '<div style="background:#ffffff; border:2px solid #0f172a; border-radius:12px; padding:18px; margin-top:14px; color:#0f172a;">' +
        '<p style="font-size:14px;">Halo <b>' + escapeHtmlGas(buyerName) + '</b>,</p>' +
        '<p style="font-size:13.5px; line-height:1.55;">' + escapeHtmlGas(noteText) + '</p>' +
        '<p style="font-size:13px; color:#475569;">Silakan kunjungi kembali <b>' + escapeHtmlGas(CONFIG.STORE_NAME) + '</b> jika ingin memperpanjang layanan kamu.</p>' +
      '</div>' +
    '</div>';

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
 * 5. WEBHOOK MUTASI PEMBAYARAN QRIS (MACRODROID -> FIRESTORE)
 * ============================================================================ */
function handleMacroDroidPaymentMutation(data) {
  var rawTitle = String(data.title || data.appName || data.app || '').trim();
  var rawText = String(data.text || data.notification || data.message || data.body || data.amount || '').trim();
  var combinedText = (rawTitle + ' ' + rawText).trim();

  var candidateAmounts = extractCandidateAmountsFromNotification(combinedText, data.amount);
  if (candidateAmounts.length === 0) {
    return buildJsonResponse({
      ok: false,
      status: 'ignored',
      reason: 'NO_VALID_AMOUNT_DETECTED',
      rawText: combinedText
    });
  }

  var primaryAmount = candidateAmounts[0];
  var nowMs = Date.now();

  var firestoreUpdated = pushPaymentSignalToFirestore(primaryAmount, candidateAmounts, combinedText, nowMs);

  return buildJsonResponse({
    ok: true,
    status: 'ok',
    action: 'MACRODROID_PAYMENT_WEBHOOK',
    detectedAmount: primaryAmount,
    candidateAmounts: candidateAmounts,
    firestoreSynced: firestoreUpdated,
    timestamp: nowMs
  });
}

function extractCandidateAmountsFromNotification(text, explicitAmount) {
  var results = [];
  if (explicitAmount && !isNaN(Number(explicitAmount)) && Number(explicitAmount) >= 100) {
    results.push(Math.round(Number(explicitAmount)));
  }

  if (!text) return results;

  var cleaned = String(text).replace(/[,\.]00\b/g, '');

  var regexRp = /(?:rp|idr|sebesar|senilai|masuk|terima|pembayaran)\s*[:\.]?\s*([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{4,8})/gi;
  var match;
  while ((match = regexRp.exec(cleaned)) !== null) {
    var numStr = match[1].replace(/[^0-9]/g, '');
    var val = parseInt(numStr, 10);
    if (!isNaN(val) && val >= 500 && results.indexOf(val) === -1) {
      results.push(val);
    }
  }

  if (results.length === 0) {
    var genericRegex = /\b([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]{4,8})\b/g;
    var gMatch;
    while ((gMatch = genericRegex.exec(cleaned)) !== null) {
      var gNum = parseInt(gMatch[1].replace(/[^0-9]/g, ''), 10);
      if (!isNaN(gNum) && gNum >= 500 && gNum <= 50000000 && results.indexOf(gNum) === -1) {
        results.push(gNum);
      }
    }
  }

  return results;
}

function pushPaymentSignalToFirestore(primaryAmount, candidateAmounts, rawNotifText, timestampMs) {
  try {
    var baseUrl = 'https://firestore.googleapis.com/v1/projects/' + CONFIG.FIREBASE_PROJECT_ID + '/databases/(default)/documents';

    var settingsPatchUrl = baseUrl + '/settings/mainConfig?updateMask.fieldPaths=lastPaymentDetected&updateMask.fieldPaths=lastPaymentTimestamp&updateMask.fieldPaths=lastPaymentMutation';

    var arrayValues = [];
    for (var i = 0; i < candidateAmounts.length; i++) {
      arrayValues.push({ integerValue: String(candidateAmounts[i]) });
    }

    var patchBody = {
      fields: {
        lastPaymentDetected: { integerValue: String(primaryAmount) },
        lastPaymentTimestamp: { integerValue: String(timestampMs) },
        lastPaymentMutation: {
          mapValue: {
            fields: {
              amount: { integerValue: String(primaryAmount) },
              timestamp: { integerValue: String(timestampMs) },
              rawText: { stringValue: String(rawNotifText || '').slice(0, 300) },
              candidateAmounts: {
                arrayValue: { values: arrayValues }
              }
            }
          }
        }
      }
    };

    UrlFetchApp.fetch(settingsPatchUrl, {
      method: 'patch',
      contentType: 'application/json',
      payload: JSON.stringify(patchBody),
      muteHttpExceptions: true
    });

    var mutationsUrl = baseUrl + '/payment_mutations';
    var mutBody = {
      fields: {
        amount: { integerValue: String(primaryAmount) },
        receivedAt: { integerValue: String(timestampMs) },
        rawText: { stringValue: String(rawNotifText || '').slice(0, 300) },
        candidateAmounts: {
          arrayValue: { values: arrayValues }
        }
      }
    };

    UrlFetchApp.fetch(mutationsUrl, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(mutBody),
      muteHttpExceptions: true
    });

    return true;
  } catch (err) {
    Logger.log('Firestore Sync Error: ' + err);
    return false;
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