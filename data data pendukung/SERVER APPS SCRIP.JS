/**
 * ============================================================================
 * VIPERCELL V27.0 — UNIFIED GOOGLE APPS SCRIPT SERVER (ALL-IN-ONE ENGINE)
 * ============================================================================
 * Nama File : SERVER APPS SCRIP.JS (V27.0 - Neo-Brutalism V3 Edition)
 *
 * 1 SCRIPT UNTUK 5 FUNGSI UTAMA VIPERCELL V27:
 *  1. [OTP EMAIL]              Mengirim Kode Verifikasi OTP 6-Digit untuk Upgrade
 *                              Akun Anonim ke Member Resmi (`action: "SEND_OTP_EMAIL"`).
 *  2. [LINK UBAH KATA SANDI]   Mengirim Email Link & Token 6-Digit Ubah Kata Sandi
 *                              berdesain Neo-Brutalism V3 (`action: "SEND_PASSWORD_RESET_LINK"`
 *                              & `action: "CONFIRM_PASSWORD_RESET"`) (#5).
 *  3. [DELIVERY & EMAIL OAUTH] Mengirim E-Receipt, Detail Akun/Voucher, & Kotak Khusus
 *                              Format Produk Email (`email|password|refresh_token|client_id`
 *                              + Tombol Link Akses Tanpa Login) otomatis saat stok lokal
 *                              terkirim atau saat Admin klik Selesaikan (`action: "SEND_ORDER_DELIVERY"`) (#3, #17).
 *  4. [REMINDER LANGGANAN]     Mengirim Email Pengingat Masa Aktif Langganan sebelum di-Kick
 *                              (`action: "SEND_EXPIRY_REMINDER"`).
 *  5. [MUTASI QRIS OTOMATIS]   Menerima Webhook dari MacroDroid / Notification Forwarder
 *                              dan meneruskannya ke Cloud Firestore agar pesanan QRIS
 *                              otomatis berubah menjadi LUNAS (SUCCESS) dalam 1 detik!
 *
 * CARA DEPLOY DI GOOGLE APPS SCRIPT (script.google.com):
 *  1. Hapus semua kode lama di `Code.gs`, lalu tempel (Paste) seluruh kode V27 ini.
 *  2. Klik tombol "Run" pada fungsi `setupAndAuthorize()` satu kali untuk memberikan
 *     izin pengiriman Gmail (`MailApp`) dan koneksi eksternal (`UrlFetchApp`).
 *  3. Klik "Deploy" -> "New deployment" (atau "Manage deployments" -> Edit versi baru):
 *     - Select type : Web app
 *     - Execute as  : Me (Email Admin Anda)
 *     - Who has access : Anyone (Siapa saja)  <-- WAJIB PILIH "Anyone"!
 *  4. Salin URL Web App (`https://script.google.com/macros/s/.../exec`), lalu tempelkan ke:
 *     - Pengaturan Web Admin Vipercell -> Kolom "URL Google Apps Script"
 *     - Aplikasi MacroDroid di HP -> Action "HTTP Request (POST)" (untuk mutasi QRIS)
 * ============================================================================
 */

var CONFIG = {
  FIREBASE_PROJECT_ID: 'vipercell-fc50e',
  WEBHOOK_SECRET: 'VIPERCELL_SECRET_2026',
  STORE_NAME: 'VIPERCELL OFFICIAL STORE',
  STORE_TAGLINE: 'Pusat Aplikasi Premium, Produk Email OAuth, Top Up Game & Tools Digital 24/7',
  SUPPORT_WHATSAPP: '6285656321860',
  PRIMARY_COLOR: '#2563eb',
  ACCENT_YELLOW: '#facc15',
  DARK_BORDER: '#0f172a'
};

/**
 * Jalankan fungsi ini 1x di Editor Apps Script untuk memunculkan dialog Otorisasi Google
 */
function setupAndAuthorize() {
  var remainingQuota = MailApp.getRemainingDailyQuota();
  Logger.log('✅ Otorisasi Berhasil! Sisa kuota kirim email harian Anda: ' + remainingQuota);
}

/**
 * Handler HTTP GET — Untuk mengecek apakah URL Web App GAS sudah aktif di browser
 */
function doGet(e) {
  return buildJsonResponse({
    ok: true,
    status: 'ok',
    service: 'Vipercell V27.0 Unified Server (OTP + Password Reset Link + E-Receipt Email OAuth + QRIS Mutation)',
    projectId: CONFIG.FIREBASE_PROJECT_ID,
    remainingEmailQuota: MailApp.getRemainingDailyQuota(),
    timestamp: new Date().toISOString()
  });
}

/**
 * Handler Utama HTTP POST — Menerima request dari Web User, Web Admin, atau MacroDroid
 */
function doPost(e) {
  try {
    var payload = parseIncomingPayload(e);
    if (!payload) {
      return buildJsonResponse({ ok: false, status: 'error', error: 'EMPTY_OR_INVALID_PAYLOAD' });
    }

    // Validasi Secret Key (Mendukung field `secret` atau `key`)
    var incomingSecret = String(payload.secret || payload.key || '').trim();
    if (CONFIG.WEBHOOK_SECRET && incomingSecret && incomingSecret !== CONFIG.WEBHOOK_SECRET) {
      return buildJsonResponse({
        ok: false,
        status: 'error',
        error: 'UNAUTHORIZED_SECRET',
        message: 'Kunci rahasia (Webhook Secret) tidak cocok dengan WEBHOOK_SECRET di Google Apps Script.'
      });
    }

    // Deteksi jenis Action secara pintar
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

    // ROUTING KE MASING-MASING HANDLER V27
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

    // Default: Tangani sebagai Webhook Mutasi Pembayaran QRIS (MacroDroid)
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
 * 1. HANDLER PENGIRIMAN EMAIL KODE OTP 6-DIGIT (UPGRADE ANONIM -> MEMBER RESMI)
 * ============================================================================ */
function handleSendOtpEmail(data) {
  var targetEmail = String(data.email || data.to || data.buyerEmail || '').trim();
  var otpCode = String(data.otpCode || data.otp || '').trim();
  var userName = String(data.userName || data.name || 'Pelanggan Vipercell').trim();
  var expiryMinutes = Number(data.expiryMinutes || 5);

  if (!targetEmail || targetEmail.indexOf('@') === -1) {
    return buildJsonResponse({ ok: false, status: 'error', error: 'EMAIL_TUJUAN_TIDAK_VALID' });
  }
  if (!otpCode) {
    return buildJsonResponse({ ok: false, status: 'error', error: 'KODE_OTP_KOSONG' });
  }

  var subject = '[' + otpCode + '] Kode Verifikasi OTP Member Resmi — ' + CONFIG.STORE_NAME;

  var htmlBody = '' +
    '<div style="font-family:\'Plus Jakarta Sans\',Arial,sans-serif; max-width:560px; margin:0 auto; background:#f4f6fb; padding:24px; border:3px solid #0f172a; border-radius:18px;">' +
      '<div style="background:#2563eb; color:#ffffff; padding:20px; border:2.5px solid #0f172a; border-radius:14px; text-align:center; box-shadow:4px 4px 0px #0f172a;">' +
        '<div style="display:inline-block; background:#facc15; color:#0f172a; font-weight:900; font-size:11px; padding:4px 10px; border-radius:6px; border:1.5px solid #0f172a; margin-bottom:6px;">VERIFIKASI KEAMANAN V27</div>' +
        '<h2 style="margin:0; font-size:21px; font-weight:900; letter-spacing:0.5px;">' + escapeHtmlGas(CONFIG.STORE_NAME) + '</h2>' +
        '<p style="margin:4px 0 0; font-size:12px; opacity:0.92;">Upgrade Sesi Anonim ke Member Resmi Permanen</p>' +
      '</div>' +

      '<div style="background:#ffffff; border:2.5px solid #0f172a; border-radius:14px; padding:22px; margin-top:16px; box-shadow:4px 4px 0px #0f172a; color:#0f172a;">' +
        '<p style="margin:0 0 10px; font-size:14px;">Halo <b>' + escapeHtmlGas(userName) + '</b>,</p>' +
        '<p style="margin:0 0 16px; font-size:13.5px; line-height:1.6; color:#334155;">' +
          'Gunakan <b>6 digit kode OTP</b> di bawah ini pada halaman Web Vipercell untuk mengaktifkan status <b>Member Resmi</b> Anda:' +
        '</p>' +

        '<div style="background:#fef9c3; border:2.5px dashed #0f172a; border-radius:12px; padding:18px; text-align:center; margin:18px 0;">' +
          '<span style="display:block; font-size:11px; font-weight:800; color:#475569; margin-bottom:6px; text-transform:uppercase;">KODE VERIFIKASI OTP ANDA</span>' +
          '<div style="font-family:\'Courier New\',monospace; font-size:34px; font-weight:900; letter-spacing:8px; color:#0f172a;">' +
            escapeHtmlGas(otpCode) +
          '</div>' +
        '</div>' +

        '<p style="margin:0; font-size:12px; color:#64748b; text-align:center;">' +
          '⏱️ Kode ini berlaku selama <b>' + expiryMinutes + ' menit</b>. Jangan bagikan kode ini kepada siapa pun.' +
        '</p>' +
      '</div>' +

      '<div style="text-align:center; margin-top:16px; font-size:11px; color:#64748b; font-weight:700;">' +
        '&copy; ' + new Date().getFullYear() + ' ' + escapeHtmlGas(CONFIG.STORE_NAME) + ' &bull; Sistem Otomatis 24/7' +
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
    message: 'Kode OTP berhasil dikirim ke email ' + targetEmail
  });
}

/* ============================================================================
 * 2. [FEATURE-05] HANDLER PENGIRIMAN LINK & TOKEN UBAH KATA SANDI (NEO-BRUTALISM V3)
 * ============================================================================ */
function handleSendPasswordResetLink(data) {
  var targetEmail = String(data.email || data.to || '').trim();
  var token = String(data.token || data.otpCode || data.otp || '').trim();
  var resetLink = String(data.resetLink || '').trim();
  var userName = String(data.userName || targetEmail.split('@')[0] || 'Member Vipercell').trim();
  var expiryMinutes = Number(data.expiryMinutes || 15);

  if (!targetEmail || targetEmail.indexOf('@') === -1) {
    return buildJsonResponse({ ok: false, status: 'error', error: 'EMAIL_RESET_TIDAK_VALID' });
  }
  if (!token) {
    token = String(Math.floor(100000 + Math.random() * 900000));
  }

  var subject = '🔐 Link & Token Ubah Kata Sandi [' + token + '] — ' + CONFIG.STORE_NAME;

  var ctaButtonHtml = resetLink
    ? '<div style="text-align:center; margin:20px 0;">' +
        '<a href="' + escapeHtmlGas(resetLink) + '" target="_blank" style="display:inline-block; background:#2563eb; color:#ffffff; text-decoration:none; font-weight:900; font-size:14px; padding:14px 24px; border-radius:10px; border:2.5px solid #0f172a; box-shadow:4px 4px 0px #0f172a;">' +
          'BUKA HALAMAN UBAH KATA SANDI SEKARANG &rarr;' +
        '</a>' +
      '</div>'
    : '';

  var htmlBody = '' +
    '<div style="font-family:\'Plus Jakarta Sans\',Arial,sans-serif; max-width:580px; margin:0 auto; background:#f4f6fb; padding:24px; border:3px solid #0f172a; border-radius:18px;">' +
      '<div style="background:#0f172a; color:#ffffff; padding:20px; border:2.5px solid #0f172a; border-radius:14px; text-align:center; box-shadow:4px 4px 0px #2563eb;">' +
        '<div style="display:inline-block; background:#facc15; color:#0f172a; font-weight:900; font-size:11px; padding:4px 10px; border-radius:6px; border:1.5px solid #0f172a; margin-bottom:6px;">PEMULIHAN SANDI NEO-BRUTALISM V27</div>' +
        '<h2 style="margin:0; font-size:21px; font-weight:900;">ATUR ULANG KATA SANDI</h2>' +
        '<p style="margin:4px 0 0; font-size:12px; opacity:0.9;">' + escapeHtmlGas(CONFIG.STORE_NAME) + '</p>' +
      '</div>' +

      '<div style="background:#ffffff; border:2.5px solid #0f172a; border-radius:14px; padding:22px; margin-top:16px; box-shadow:4px 4px 0px #0f172a; color:#0f172a;">' +
        '<p style="margin:0 0 10px; font-size:14px;">Halo <b>' + escapeHtmlGas(userName) + '</b>,</p>' +
        '<p style="margin:0 0 14px; font-size:13.5px; line-height:1.6; color:#334155;">' +
          'Kami menerima permintaan untuk mengatur ulang kata sandi akun Member <b>' + escapeHtmlGas(targetEmail) + '</b>. Klik tombol di bawah ini untuk langsung membuka halaman Ubah Kata Sandi:' +
        '</p>' +

        ctaButtonHtml +

        '<div style="background:#fef3c7; border:2.5px dashed #0f172a; border-radius:12px; padding:16px; text-align:center; margin:16px 0;">' +
          '<span style="display:block; font-size:11px; font-weight:800; color:#92400e; margin-bottom:4px; text-transform:uppercase;">KODE TOKEN RESET 6-DIGIT ANDA</span>' +
          '<div style="font-family:\'Courier New\',monospace; font-size:30px; font-weight:900; letter-spacing:6px; color:#0f172a;">' +
            escapeHtmlGas(token) +
          '</div>' +
          '<span style="display:block; font-size:11px; color:#78350f; margin-top:4px; font-weight:700;">Tempel kode token ini pada halaman Ubah Kata Sandi jika diminta</span>' +
        '</div>' +

        '<p style="margin:0; font-size:12px; color:#64748b; text-align:center;">' +
          '⏱️ Tautan & token ini berlaku selama <b>' + expiryMinutes + ' menit</b>. Abaikan email ini jika Anda tidak merasa meminta perubahan sandi.' +
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
    message: 'Link & Token Ubah Kata Sandi berhasil dikirim ke ' + targetEmail
  });
}

function handleConfirmPasswordReset(data) {
  var targetEmail = String(data.email || '').trim();
  return buildJsonResponse({
    ok: true,
    status: 'ok',
    action: 'CONFIRM_PASSWORD_RESET',
    email: targetEmail,
    message: 'Konfirmasi perubahan kata sandi diterima oleh server GAS V27.'
  });
}

/* ============================================================================
 * 3. [FEATURE-03 & 17] HANDLER PENGIRIMAN E-RECEIPT & FORMAT PRODUK EMAIL OAUTH
 * ============================================================================ */
function handleSendOrderDeliveryEmail(data) {
  var targetEmail = String(data.buyerEmail || data.email || data.to || '').trim();
  if (!targetEmail || targetEmail.indexOf('@') === -1) {
    return buildJsonResponse({ ok: false, status: 'error', error: 'EMAIL_PEMBELI_TIDAK_VALID' });
  }

  var orderId = String(data.orderId || data.invoice || data.invoiceId || 'VP-ORDER').trim();
  var buyerName = String(data.buyerName || targetEmail.split('@')[0] || 'Pelanggan').trim();
  var itemName = String(data.itemName || ((data.productName || 'Produk') + ' - ' + (data.variantName || ''))).trim();
  var totalAmount = Number(data.totalAmount || data.uniqueTotal || 0);
  var totalFormatted = data.totalFormatted || ('Rp ' + totalAmount.toLocaleString('id-ID'));
  var targetId = String(data.targetId || '-').trim();
  var accountDetails = String(data.accountDetails || 'Pesanan Anda telah selesai diproses.').trim();
  var durationDays = Number(data.durationDays || 0);
  var subscriptionEndAt = Number(data.subscriptionEndAt || 0);

  // Deteksi apakah accountDetails mengandung Format Produk Email OAuth (FORMAT_UTUH / 4-pipe) (#17)
  var rawPipeDetected = '';
  var accessPortalLink = '';
  var lines = accountDetails.split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i].trim();
    if (ln.toUpperCase().indexOf('FORMAT_UTUH') === 0) {
      var idxC = ln.indexOf(':');
      if (idxC > -1) rawPipeDetected = ln.substring(idxC + 1).trim();
    } else if (ln.toUpperCase().indexOf('LINK_AKSES') === 0) {
      var idxL = ln.indexOf(':');
      if (idxL > -1) accessPortalLink = ln.substring(idxL + 1).trim();
    } else if (ln.indexOf('|') > -1 && ln.split('|').length >= 4 && !rawPipeDetected) {
      var segs = ln.split('|');
      rawPipeDetected = segs[0].trim() + '|' + segs[1].trim() + '|' + segs[2].trim() + '|' + segs[3].trim();
      if (segs[4]) accessPortalLink = segs[4].trim();
    }
  }

  var emailOAuthHtml = '';
  if (rawPipeDetected) {
    var portalBtn = accessPortalLink
      ? '<div style="margin-top:12px; text-align:center;">' +
          '<a href="' + escapeHtmlGas(accessPortalLink) + '" target="_blank" style="display:inline-block; background:#facc15; color:#0f172a; text-decoration:none; font-weight:900; font-size:12.5px; padding:10px 18px; border-radius:8px; border:2px solid #0f172a; box-shadow:3px 3px 0px #0f172a;">' +
            '🔗 BUKA LINK AKSES AMBIL KODE EMAIL (TANPA LOGIN)' +
          '</a>' +
        '</div>'
      : '';

    emailOAuthHtml = '' +
      '<div style="background:#f3e8ff; border:2.5px solid #0f172a; border-radius:12px; padding:15px; margin-bottom:14px;">' +
        '<div style="font-size:11px; font-weight:900; color:#6b21a8; text-transform:uppercase; margin-bottom:6px;">' +
          '📧 FORMAT UTUH PRODUK EMAIL OAUTH (SALIN & TEMPEL DI WEB AKSES KODE):' +
        '</div>' +
        '<div style="font-family:\'Courier New\',monospace; font-size:12.5px; font-weight:800; color:#0f172a; background:#ffffff; padding:10px; border:1.5px solid #0f172a; border-radius:8px; word-break:break-all;">' +
          escapeHtmlGas(rawPipeDetected) +
        '</div>' +
        portalBtn +
      '</div>';
  }

  var durationHtml = '';
  if (durationDays > 0) {
    var endDateStr = subscriptionEndAt > 0
      ? new Date(subscriptionEndAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
      : (durationDays + ' Hari');
    durationHtml = '' +
      '<tr>' +
        '<td style="padding:7px 0; color:#64748b; font-size:13px;">Durasi Langganan</td>' +
        '<td style="padding:7px 0; font-weight:800; color:#2563eb; font-size:13px; text-align:right;">' + durationDays + ' Hari (Berakhir: ' + escapeHtmlGas(endDateStr) + ')</td>' +
      '</tr>';
  }

  var subject = '✅ E-Receipt & Detail Pesanan #' + orderId + ' — ' + CONFIG.STORE_NAME;

  var htmlBody = '' +
    '<div style="font-family:\'Plus Jakarta Sans\',Arial,sans-serif; max-width:600px; margin:0 auto; background:#f4f6fb; padding:24px; border:3px solid #0f172a; border-radius:18px;">' +
      '<div style="background:#10b981; color:#ffffff; padding:20px; border:2.5px solid #0f172a; border-radius:14px; text-align:center; box-shadow:4px 4px 0px #0f172a;">' +
        '<div style="display:inline-block; background:#facc15; color:#0f172a; font-weight:900; font-size:11px; padding:4px 10px; border-radius:6px; border:1.5px solid #0f172a; margin-bottom:6px;">TRANSAKSI LUNAS & SELESAI</div>' +
        '<h2 style="margin:0; font-size:21px; font-weight:900;">E-RECEIPT RESMI VIPERCELL</h2>' +
        '<p style="margin:4px 0 0; font-size:12.5px; font-weight:700;">Nomor Invoice: #' + escapeHtmlGas(orderId) + '</p>' +
      '</div>' +

      '<div style="background:#ffffff; border:2.5px solid #0f172a; border-radius:14px; padding:22px; margin-top:16px; box-shadow:4px 4px 0px #0f172a; color:#0f172a;">' +
        '<p style="margin:0 0 12px; font-size:14px;">Halo <b>' + escapeHtmlGas(buyerName) + '</b>,</p>' +
        '<p style="margin:0 0 16px; font-size:13.5px; line-height:1.55; color:#334155;">' +
          'Terima kasih telah berbelanja di <b>' + escapeHtmlGas(CONFIG.STORE_NAME) + '</b>. Berikut adalah rincian struk resmi beserta detail akun/layanan pesanan Anda:' +
        '</p>' +

        '<table style="width:100%; border-collapse:collapse; margin-bottom:16px; border-top:2px dashed #cbd5e1; border-bottom:2px dashed #cbd5e1; padding:10px 0;">' +
          '<tr>' +
            '<td style="padding:7px 0; color:#64748b; font-size:13px;">Nomor Invoice</td>' +
            '<td style="padding:7px 0; font-weight:900; color:#0f172a; font-size:13px; text-align:right; font-family:monospace;">#' + escapeHtmlGas(orderId) + '</td>' +
          '</tr>' +
          '<tr>' +
            '<td style="padding:7px 0; color:#64748b; font-size:13px;">Layanan / Produk</td>' +
            '<td style="padding:7px 0; font-weight:800; color:#0f172a; font-size:13px; text-align:right;">' + escapeHtmlGas(itemName) + '</td>' +
          '</tr>' +
          '<tr>' +
            '<td style="padding:7px 0; color:#64748b; font-size:13px;">Data Tujuan</td>' +
            '<td style="padding:7px 0; font-weight:700; color:#334155; font-size:13px; text-align:right;">' + escapeHtmlGas(targetId) + '</td>' +
          '</tr>' +
          durationHtml +
          '<tr>' +
            '<td style="padding:8px 0; color:#0f172a; font-weight:900; font-size:14px;">Total Pembayaran</td>' +
            '<td style="padding:8px 0; font-weight:900; color:#10b981; font-size:15px; text-align:right;">' + escapeHtmlGas(totalFormatted) + '</td>' +
          '</tr>' +
        '</table>' +

        emailOAuthHtml +

        '<div style="background:#f8fafc; border:2.5px solid #0f172a; border-radius:12px; padding:16px; margin-bottom:16px;">' +
          '<div style="font-size:11.5px; font-weight:900; color:#047857; text-transform:uppercase; margin-bottom:8px;">' +
            '🔑 DETAIL AKUN / VOUCHER / PESANAN ANDA:' +
          '</div>' +
          '<pre style="margin:0; font-family:\'Courier New\',monospace; font-size:13px; font-weight:700; color:#0f172a; white-space:pre-wrap; word-break:break-word; line-height:1.55;">' +
            escapeHtmlGas(accountDetails) +
          '</pre>' +
        '</div>' +

        '<div style="background:#eff6ff; border:1.5px solid #93c5fd; border-radius:10px; padding:12px; font-size:12px; color:#1e3a8a; line-height:1.5;">' +
          '💡 <b>Garansi Resmi Vipercell:</b> Simpan email E-Receipt ini sebagai bukti garansi. Anda juga dapat melacak pesanan kapan saja di web cukup dengan memasukkan ID Transaksi <b>#' + escapeHtmlGas(orderId) + '</b>.' +
        '</div>' +
      '</div>' +

      '<div style="text-align:center; margin-top:16px; font-size:11px; color:#64748b; font-weight:700;">' +
        '&copy; ' + new Date().getFullYear() + ' ' + escapeHtmlGas(CONFIG.STORE_NAME) + ' &bull; ' + escapeHtmlGas(CONFIG.STORE_TAGLINE) +
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
    message: 'E-Receipt & Detail Akun berhasil dikirim ke ' + targetEmail
  });
}

/* ============================================================================
 * 4. HANDLER PENGIRIMAN EMAIL PENGINGAT DURASI LANGGANAN (SEBELUM KICK)
 * ============================================================================ */
function handleSendExpiryReminderEmail(data) {
  var targetEmail = String(data.buyerEmail || data.email || data.to || '').trim();
  if (!targetEmail || targetEmail.indexOf('@') === -1) {
    return buildJsonResponse({ ok: false, status: 'error', error: 'EMAIL_TUJUAN_TIDAK_VALID' });
  }

  var orderId = String(data.orderId || data.invoice || 'VP-ORDER').trim();
  var buyerName = String(data.buyerName || targetEmail.split('@')[0] || 'Pelanggan').trim();
  var itemName = String(data.itemName || data.productName || 'Layanan Premium Vipercell').trim();
  var endAt = Number(data.subscriptionEndAt || Date.now());
  var endStr = new Date(endAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  var noteText = String(data.accountDetails || ('Masa aktif paket ' + itemName + ' Anda berakhir pada ' + endStr + '.')).trim();

  var subject = '⏰ Pengingat Masa Aktif Langganan #' + orderId + ' — ' + CONFIG.STORE_NAME;

  var htmlBody = '' +
    '<div style="font-family:\'Plus Jakarta Sans\',Arial,sans-serif; max-width:580px; margin:0 auto; background:#f4f6fb; padding:24px; border:3px solid #0f172a; border-radius:18px;">' +
      '<div style="background:#f59e0b; color:#0f172a; padding:18px; border:2.5px solid #0f172a; border-radius:14px; text-align:center; box-shadow:4px 4px 0px #0f172a;">' +
        '<h2 style="margin:0; font-size:20px; font-weight:900;">⏰ PENGINGAT PERPANJANGAN LANGGANAN</h2>' +
        '<p style="margin:4px 0 0; font-size:12px; font-weight:800;">Invoice #' + escapeHtmlGas(orderId) + '</p>' +
      '</div>' +
      '<div style="background:#ffffff; border:2.5px solid #0f172a; border-radius:14px; padding:20px; margin-top:16px; box-shadow:4px 4px 0px #0f172a; color:#0f172a;">' +
        '<p style="font-size:14px;">Halo <b>' + escapeHtmlGas(buyerName) + '</b>,</p>' +
        '<p style="font-size:13.5px; line-height:1.6;">' + escapeHtmlGas(noteText) + '</p>' +
        '<p style="font-size:13px; color:#475569;">Silakan kunjungi kembali toko resmi <b>' + escapeHtmlGas(CONFIG.STORE_NAME) + '</b> untuk memperpanjang paket langganan Anda agar akses tetap aktif tanpa terputus.</p>' +
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
 * 5. HANDLER WEBHOOK MUTASI PEMBAYARAN QRIS OTOMATIS (MACRODROID -> FIRESTORE)
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

  // Simpan sinyal mutasi ke Firestore `settings/mainConfig` & koleksi `payment_mutations`
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

/**
 * Ekstraktor Nominal Rupiah Pintar dari Notifikasi Aplikasi Merchant / Bank
 * (GoPay Merchant, DANA Bisnis, SeaBank, BCA, BRI, Mandiri, ShopeePay, OVO, Qris.id, OrderKuota)
 */
function extractCandidateAmountsFromNotification(text, explicitAmount) {
  var results = [];
  if (explicitAmount && !isNaN(Number(explicitAmount)) && Number(explicitAmount) >= 100) {
    results.push(Math.round(Number(explicitAmount)));
  }

  if (!text) return results;

  // Hilangkan desimal sen `,00` atau `.00` di akhir nominal
  var cleaned = String(text).replace(/[,\.]00\b/g, '');

  // Cari pola Rp 15.123 / IDR 15,123 / sebesar 15.123
  var regexRp = /(?:rp|idr|sebesar|senilai|masuk|terima|pembayaran)\s*[:\.]?\s*([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{4,8})/gi;
  var match;
  while ((match = regexRp.exec(cleaned)) !== null) {
    var numStr = match[1].replace(/[^0-9]/g, '');
    var val = parseInt(numStr, 10);
    if (!isNaN(val) && val >= 500 && results.indexOf(val) === -1) {
      results.push(val);
    }
  }

  // Fallback angka ribuan umum jika belum tertangkap
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

/**
 * Mengirim sinyal pembayaran masuk ke Cloud Firestore REST API
 */
function pushPaymentSignalToFirestore(primaryAmount, candidateAmounts, rawNotifText, timestampMs) {
  try {
    var baseUrl = 'https://firestore.googleapis.com/v1/projects/' + CONFIG.FIREBASE_PROJECT_ID + '/databases/(default)/documents';

    // 1. Update dokumen `settings/mainConfig` (lastPaymentDetected & lastPaymentMutation)
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

    // 2. Tambahkan dokumen baru ke koleksi `payment_mutations`
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

/* ============================================================================
 * UTILITAS PARSER & JSON RESPONSE BUILDER
 * ============================================================================ */
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