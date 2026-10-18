/* ============================================================================
 * VIPERCELL V25.0 - UNIFIED WEBHOOK ENGINE (GOOGLE APPS SCRIPT)
 * Nama File : SERVER APPS SCRIP.JS
 * Arsitektur: Neo-Brutalism V2.0 Backend (MacroDroid QRIS + Email/OTP Engine)
 * ============================================================================ */

/* ============================================================================
 * [FEATURE-13] UNIFIED MACRODROID PAYMENT WEBHOOK & GAS EMAIL/OTP ENGINE
 * Deskripsi : Konfigurasi Utama, Router HTTP GET/POST, Smart Currency Parser,
 *             Firestore REST Auto-Matcher, dan Pengirim Email HTML Neo-Brutal
 * ============================================================================ */

const VIPERCELL_CONFIG = {
  // Ganti dengan Project ID Firebase Anda (atau kirim via parameter/payload projectId)
  FIREBASE_PROJECT_ID: 'vipercell-store', 
  // Kunci Rahasia Webhook untuk memvalidasi kiriman MacroDroid & Admin Panel
  WEBHOOK_SECRET: 'KUNCI_RAHASIA_VIPERCELL',
  // Nama Toko Resmi di Email & Notifikasi
  STORE_NAME: 'VIPERCELL STORE',
  STORE_TAGLINE: 'Pusat Produk Digital, Game & Aplikasi Premium Otomatis',
  SUPPORT_CONTACT: 'Admin Vipercell Live Chat',
  // Waktu simpan cache idempotency (detik) untuk cegah notifikasi ganda MacroDroid
  IDEMPOTENCY_TTL_SECONDS: 300
};

/**
 * Handler untuk HTTP GET (Mendukung MacroDroid Blok Buka Situs / Simple HTTP GET & Ping Test)
 */
function doGet(e) {
  return handleUnifiedWebhookRequest(e, 'GET');
}

/**
 * Handler untuk HTTP POST (Mendukung MacroDroid JSON Body, Form-UrlEncoded & Fetch Web App)
 */
function doPost(e) {
  return handleUnifiedWebhookRequest(e, 'POST');
}

/**
 * Fungsi Utama Router Unified Webhook V25.0
 */
function handleUnifiedWebhookRequest(e, method) {
  try {
    const payload = parseIncomingPayload(e);
    const projectId = (payload.projectId || getScriptProp('FIREBASE_PROJECT_ID') || VIPERCELL_CONFIG.FIREBASE_PROJECT_ID).trim();
    const configuredSecret = getScriptProp('WEBHOOK_SECRET') || VIPERCELL_CONFIG.WEBHOOK_SECRET;

    // Validasi Secret (Jika dikonfigurasi dan bukan request ping status dasar)
    const incomingSecret = (payload.secret || payload.key || payload.token || '').trim();
    const action = (payload.action || payload.route || 'MACRODROID_PAYMENT_WEBHOOK').toUpperCase();

    if (action === 'PING_TEST' || action === 'STATUS') {
      return buildJsonResponse({
        ok: true,
        version: 'V25.0',
        engine: 'VIPERCELL_UNIFIED_GAS_ENGINE',
        method: method,
        projectId: projectId,
        timestamp: new Date().toISOString(),
        message: 'Unified Webhook Engine V25.0 Aktif & Siap Menerima Data!'
      });
    }

    if (configuredSecret && configuredSecret !== 'KUNCI_RAHASIA_VIPERCELL' && incomingSecret !== configuredSecret) {
      return buildJsonResponse({
        ok: false,
        error: 'UNAUTHORIZED_SECRET',
        message: 'Kunci rahasia (secret) webhook tidak cocok.'
      });
    }

    // Routing berdasarkan Action
    switch (action) {
      case 'SEND_OTP_EMAIL':
        return handleSendOtpEmail(payload);

      case 'SEND_ORDER_DELIVERY':
        return handleSendOrderDeliveryEmail(payload);

      case 'SEND_EXPIRY_REMINDER':
        return handleSendExpiryReminderEmail(payload);

      case 'MACRODROID_PAYMENT_WEBHOOK':
      case 'PAYMENT':
      case 'SIMULATE_MACRODROID':
      default:
        return handleMacroDroidPaymentWebhook(payload, projectId);
    }

  } catch (err) {
    return buildJsonResponse({
      ok: false,
      error: 'INTERNAL_WEBHOOK_ERROR',
      message: err && err.message ? err.message : String(err)
    });
  }
}

/* ============================================================================
 * SUB-MODUL 13A: PARSER PAYLOAD FLEKSIBEL (JSON, FORM-URLENCODED, QUERY PARAM)
 * ============================================================================ */
function parseIncomingPayload(e) {
  let data = {};

  // 1. Ambil dari Query Parameters (GET maupun POST URL Params)
  if (e && e.parameter) {
    Object.keys(e.parameter).forEach(function(k) {
      data[k] = e.parameter[k];
    });
  }

  // 2. Ambil dari Body POST (JSON atau teks mentah)
  if (e && e.postData && e.postData.contents) {
    const rawContents = e.postData.contents.trim();
    try {
      const parsedJson = JSON.parse(rawContents);
      if (parsedJson && typeof parsedJson === 'object') {
        Object.keys(parsedJson).forEach(function(k) {
          data[k] = parsedJson[k];
        });
      }
    } catch (jsonErr) {
      // Jika bukan JSON valid, simpan sebagai raw_body agar tetap bisa diekstrak angkanya
      data.raw_body = rawContents;
    }
  }

  return data;
}

/* ============================================================================
 * SUB-MODUL 13B: ROUTE 1 - MACRODROID PAYMENT WEBHOOK & INSTANT MATCHER
 * ============================================================================ */
function handleMacroDroidPaymentWebhook(payload, projectId) {
  const lock = LockService.getScriptLock();
  try {
    // Tunggu giliran eksekusi maksimal 10 detik untuk mencegah Race Condition
    lock.waitLock(10000);
  } catch (lockErr) {
    return buildJsonResponse({
      ok: false,
      error: 'LOCK_TIMEOUT',
      message: 'Server sedang memproses antrean mutasi lain, silakan coba sesaat lagi.'
    });
  }

  try {
    const appName = String(payload.app || payload.app_name || payload.package || 'MacroDroid-QRIS').trim();
    const title = String(payload.title || payload.not_title || '').trim();
    const text = String(payload.text || payload.not_text || payload.message || payload.pesan || payload.body || '').trim();
    const bigText = String(payload.big_text || payload.not_big_text || payload.notification || payload.raw_body || '').trim();
    const directAmount = payload.amount || payload.nominal || '';

    const combinedRawText = [directAmount, title, text, bigText].filter(Boolean).join(' | ');
    if (!combinedRawText) {
      return buildJsonResponse({
        ok: false,
        error: 'EMPTY_NOTIFICATION',
        message: 'Tidak ada teks notifikasi atau nominal yang dikirim.'
      });
    }

    // Ekstrak seluruh kandidat nominal uang dari teks notifikasi
    const candidateAmounts = extractSmartCurrencyAmounts(combinedRawText, directAmount);
    if (!candidateAmounts || candidateAmounts.length === 0) {
      return buildJsonResponse({
        ok: false,
        error: 'NO_VALID_AMOUNT_DETECTED',
        rawText: combinedRawText,
        message: 'Tidak ditemukan angka nominal pembayaran yang valid pada notifikasi.'
      });
    }

    const primaryAmount = candidateAmounts[0];

    // Cek Idempotency Signature di CacheService (5 Menit) untuk menolak duplikat push dari HP
    const cache = CacheService.getScriptCache();
    const timeBucket = Math.floor(Date.now() / (1000 * 90)); // Bucket 90 detik untuk teks + nominal identik
    const signatureRaw = appName + '|' + primaryAmount + '|' + title + '|' + text + '|' + (payload.timestamp || timeBucket);
    const signatureHash = computeMd5Hex(signatureRaw);
    const cacheKey = 'VIPER_MUT_' + signatureHash;

    if (!payload.forceTest && cache.get(cacheKey)) {
      return buildJsonResponse({
        ok: true,
        duplicate: true,
        amount: primaryAmount,
        candidateAmounts: candidateAmounts,
        message: 'Notifikasi kembar terdeteksi oleh Idempotency Guard dan diabaikan.'
      });
    }
    cache.put(cacheKey, 'PROCESSED', VIPERCELL_CONFIG.IDEMPOTENCY_TTL_SECONDS);

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const mutationId = 'MUT-' + nowMs + '-' + Math.floor(100 + Math.random() * 900);

    // 1. Simpan Log Mutasi ke Koleksi `payment_mutations` di Firestore
    const mutationDoc = {
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

    // 2. DUAL-ACTION ENGINE: Cari pesanan PENDING_PAYMENT yang memiliki uniqueTotal cocok
    const matchedOrders = findAndSettlePendingOrdersInFirestore(projectId, candidateAmounts, mutationDoc);

    if (matchedOrders.length > 0) {
      mutationDoc.matchedOrderId = matchedOrders.map(function(o) { return o.orderId; }).join(', ');
      mutationDoc.status = 'MATCHED';
    }

    // Tulis dokumen ke `payment_mutations/{mutationId}`
    firestoreSetDocument(projectId, 'payment_mutations', mutationId, mutationDoc);

    // Update cadangan trigger real-time di `settings/mainConfig` untuk client listener
    firestorePatchDocument(projectId, 'settings', 'mainConfig', {
      lastPaymentMutation: {
        mutationId: mutationId,
        amount: primaryAmount,
        candidateAmounts: candidateAmounts,
        appName: appName,
        timestamp: nowMs,
        matchedOrderIds: matchedOrders.map(function(o) { return o.orderId; })
      }
    });

    return buildJsonResponse({
      ok: true,
      duplicate: false,
      mutationId: mutationId,
      detectedAmount: primaryAmount,
      allCandidates: candidateAmounts,
      matchedOrdersCount: matchedOrders.length,
      matchedOrders: matchedOrders,
      timestamp: nowIso,
      message: matchedOrders.length > 0
        ? 'Pembayaran cocok! Pesanan berhasil dilunaskan otomatis di server.'
        : 'Mutasi tercatat di Firestore dan siap dicocokkan oleh listener.'
    });

  } finally {
    lock.releaseLock();
  }
}

/* ============================================================================
 * SUB-MODUL 13C: SMART MULTI-PATTERN CURRENCY EXTRACTOR (V25.0)
 * Deskripsi : Membuang tanggal/jam dan sen desimal (,00/.00) sebelum mengambil
 *             angka nominal agar tidak salah baca tanggal sebagai uang.
 * ============================================================================ */
function extractSmartCurrencyAmounts(rawText, directAmount) {
  const results = [];

  function addCandidate(val) {
    const num = parseInt(val, 10);
    // Filter nominal wajar transaksi di Indonesia (Rp 100 s/d Rp 50.000.000)
    if (!isNaN(num) && num >= 100 && num <= 50000000 && results.indexOf(num) === -1) {
      results.push(num);
    }
  }

  // Jika ada parameter amount/nominal eksplisit
  if (directAmount !== undefined && directAmount !== null && String(directAmount).trim() !== '') {
    const cleanedDirect = cleanCurrencyString(String(directAmount));
    if (cleanedDirect) addCandidate(cleanedDirect);
  }

  if (!rawText) return results;

  let text = String(rawText);

  // 1. Bersihkan pola Tanggal (contoh: 18/10/2026, 2026-10-18, 18-10-26)
  text = text.replace(/\b\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}\b/g, ' ');

  // 2. Bersihkan pola Jam/Waktu (contoh: 08:25:10, 08:25, 08.25 WIB/WITA/WIT)
  text = text.replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ');
  text = text.replace(/\b\d{1,2}\.\d{2}\s*(WIB|WITA|WIT|AM|PM)\b/gi, ' ');

  // 3. Prioritas Utama: Angka yang didahului simbol "Rp" atau "IDR"
  // Contoh: Rp 25.142,00 | Rp25.142 | IDR 25,142.00 | Rp. 150.234
  const rpRegex = /(?:Rp\.?|IDR)\s*([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{1,2})?|[0-9]{3,8}(?:[.,][0-9]{1,2})?)/gi;
  let match;
  while ((match = rpRegex.exec(text)) !== null) {
    const parsed = cleanCurrencyString(match[1]);
    if (parsed) addCandidate(parsed);
  }

  // 4. Prioritas Kedua: Angka berformat ribuan (25.142 atau 25,142) atau angka murni 3-8 digit
  const genericRegex = /\b([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{1,2})?|[0-9]{3,8})\b/g;
  while ((match = genericRegex.exec(text)) !== null) {
    const parsed = cleanCurrencyString(match[1]);
    // Hindari angka tahun 2024-2030 jika berdiri sendiri tanpa Rp
    if (parsed && (parsed < 2024 || parsed > 2035)) {
      addCandidate(parsed);
    }
  }

  return results;
}

function cleanCurrencyString(str) {
  if (!str) return null;
  let s = String(str).trim();

  // Hapus sen desimal 2 digit di ujung (misal ,00 atau .00 atau ,50)
  // Contoh: "25.142,00" -> "25.142" | "25,142.00" -> "25,142" | "25142.00" -> "25142"
  s = s.replace(/[.,]\d{2}$/, '');

  // Hapus seluruh karakter non-digit
  const digitsOnly = s.replace(/[^0-9]/g, '');
  if (!digitsOnly) return null;
  return parseInt(digitsOnly, 10);
}

/* ============================================================================
 * SUB-MODUL 13D: FIRESTORE REST API AUTO-MATCHER (PELUNASAN SERVER < 1 DETIK)
 * ============================================================================ */
function findAndSettlePendingOrdersInFirestore(projectId, candidateAmounts, mutationDoc) {
  const matchedList = [];
  if (!projectId || !candidateAmounts || candidateAmounts.length === 0) return matchedList;

  try {
    const url = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(projectId) + '/databases/(default)/documents:runQuery';
    const queryPayload = {
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

    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(queryPayload),
      muteHttpExceptions: true
    });

    if (res.getResponseCode() !== 200) return matchedList;

    const rows = JSON.parse(res.getContentText());
    if (!Array.isArray(rows)) return matchedList;

    const nowMs = Date.now();

    rows.forEach(function(row) {
      if (!row.document || !row.document.fields) return;
      const docName = row.document.name; // projects/.../documents/orders/{orderId}
      const docId = docName.split('/').pop();
      const fields = unwrapFirestoreFields(row.document.fields);

      const uniqueTotal = Number(fields.uniqueTotal || fields.totalPrice || fields.totalAmount || fields.amount || 0);
      const expiresAt = Number(fields.expiresAt || fields.qrisExpiresAt || 0);

      // Pastikan belum kedaluwarsa (berikan toleransi 2 menit jika user scan di detik terakhir)
      const isExpired = expiresAt > 0 && (nowMs > expiresAt + 120000);

      if (!isExpired && candidateAmounts.indexOf(uniqueTotal) !== -1) {
        // Cocok! Update status pesanan di Firestore menjadi PAID
        const updateData = {
          status: 'PAID',
          paidAt: nowMs,
          paidAtIso: new Date(nowMs).toISOString(),
          paymentVerifiedBy: mutationDoc.source || 'MACRODROID_WEBHOOK_V25',
          paymentMutationId: mutationDoc.mutationId,
          paymentApp: mutationDoc.appName
        };

        const patched = firestorePatchDocument(projectId, 'orders', docId, updateData);
        if (patched) {
          matchedList.push({
            orderId: docId,
            invoice: fields.orderId || docId,
            uniqueTotal: uniqueTotal,
            productName: fields.productName || '',
            variantName: fields.variantName || '',
            newStatus: 'PAID'
          });
        }
      }
    });
  } catch (e) {
    Logger.log('Auto-match error: ' + e.message);
  }

  return matchedList;
}

/* ============================================================================
 * SUB-MODUL 13E: ROUTE 2 - PENGIRIMAN EMAIL KODE OTP 6 DIGIT (UPGRADE MEMBER)
 * ============================================================================ */
function handleSendOtpEmail(payload) {
  const email = String(payload.email || payload.to || '').trim();
  const otpCode = String(payload.otpCode || payload.otp || '').trim();
  const userName = String(payload.userName || payload.name || 'Sobat Vipercell').trim();

  if (!email || ! email.includes('@') || !otpCode) {
    return buildJsonResponse({
      ok: false,
      error: 'MISSING_OTP_PARAMS',
      message: 'Alamat email dan kode OTP 6 digit wajib diisi.'
    });
  }

  const subject = '[' + VIPERCELL_CONFIG.STORE_NAME + '] Kode Verifikasi OTP Upgrade Member: ' + otpCode;
  const htmlBody = buildNeoBrutalistEmailTemplate({
    badgeText: 'VERIFIKASI KEAMANAN AKUN',
    badgeColor: '#facc15',
    title: 'Kode OTP Upgrade Member Resmi',
    greeting: 'Halo, <strong>' + escapeHtml(userName) + '</strong>!',
    leadText: 'Anda baru saja mengajukan peningkatan (Upgrade) akun Tamu menjadi <strong>Member Resmi ' + VIPERCELL_CONFIG.STORE_NAME + '</strong>. Masukkan 6 digit kode OTP di bawah ini pada layar aplikasi:',
    highlightBoxHtml:
      '<div style="font-size: 34px; font-weight: 900; letter-spacing: 10px; text-align: center; color: #0f172a; background: #fef08a; border: 3px solid #0f172a; border-radius: 12px; padding: 18px 12px; box-shadow: 4px 4px 0px #0f172a; margin: 18px 0;">' +
        escapeHtml(otpCode) +
      '</div>' +
      '<p style="text-align:center; font-size:12px; font-weight:700; color:#dc2626; margin: 6px 0 0 0;">⏱️ Kode ini hanya berlaku selama 5 menit. Jangan berikan kepada siapa pun!</p>',
    footerNote: 'Jika Anda tidak merasa melakukan permintaan ini, abaikan email ini. Riwayat pesanan dan keamanan akun Anda tetap terlindungi.'
  });

  MailApp.sendEmail({
    to: email,
    subject: subject,
    htmlBody: htmlBody,
    name: VIPERCELL_CONFIG.STORE_NAME
  });

  return buildJsonResponse({
    ok: true,
    route: 'SEND_OTP_EMAIL',
    email: email,
    sentAt: new Date().toISOString(),
    message: 'Kode OTP 6 digit berhasil dikirim ke email ' + email
  });
}

/* ============================================================================
 * SUB-MODUL 13F: ROUTE 3 - PENGIRIMAN STRUK PESANAN & DETAIL AKUN (VAULT/MANUAL)
 * ============================================================================ */
function handleSendOrderDeliveryEmail(payload) {
  const email = String(payload.email || payload.buyerEmail || payload.to || '').trim();
  if (!email || !email.includes('@')) {
    return buildJsonResponse({
      ok: false,
      error: 'INVALID_BUYER_EMAIL',
      message: 'Email pembeli tidak ditemukan atau tidak valid.'
    });
  }

  const orderId = String(payload.orderId || payload.invoice || 'INV-VIPER').trim();
  const buyerName = String(payload.buyerName || 'Pelanggan Setia').trim();
  const productName = String(payload.productName || 'Produk Digital').trim();
  const variantName = String(payload.variantName || '-').trim();
  const totalFormatted = String(payload.totalFormatted || ('Rp ' + Number(payload.uniqueTotal || payload.totalPrice || 0).toLocaleString('id-ID')));
  const accountDetails = String(payload.accountDetails || payload.sn || 'Pesanan telah berhasil diproses ke nomor/ID tujuan Anda.').trim();
  const targetId = String(payload.targetId || '-').trim();
  const durationDays = Number(payload.durationDays || 0);
  const subscriptionEndAt = Number(payload.subscriptionEndAt || 0);

  let durationHtml = '';
  if (durationDays > 0) {
    const endStr = subscriptionEndAt > 0
      ? Utilities.formatDate(new Date(subscriptionEndAt), 'Asia/Jayapura', 'dd MMM yyyy, HH:mm') + ' WIT'
      : durationDays + ' Hari sejak tanggal pembelian';
    durationHtml =
      '<div style="margin-top:14px; padding:12px; background:#dbeafe; border:2.5px solid #0f172a; border-radius:10px; font-size:13px; color:#0f172a;">' +
        '<strong>⏱️ Informasi Masa Aktif Langganan:</strong><br/>' +
        'Durasi Paket: <strong>' + durationDays + ' Hari</strong><br/>' +
        'Berakhir Pada: <strong>' + escapeHtml(endStr) + '</strong>' +
      '</div>';
  }

  const detailsBoxHtml =
    '<div style="background:#f8fafc; border:2.5px solid #0f172a; border-radius:12px; padding:14px; margin-bottom:14px;">' +
      '<table style="width:100%; border-collapse:collapse; font-size:13px; color:#0f172a;">' +
        '<tr><td style="padding:4px 0; color:#475569;">No. Invoice</td><td style="padding:4px 0; font-weight:800; text-align:right;">#' + escapeHtml(orderId) + '</td></tr>' +
        '<tr><td style="padding:4px 0; color:#475569;">Produk</td><td style="padding:4px 0; font-weight:800; text-align:right;">' + escapeHtml(productName) + '</td></tr>' +
        '<tr><td style="padding:4px 0; color:#475569;">Varian Paket</td><td style="padding:4px 0; font-weight:700; text-align:right;">' + escapeHtml(variantName) + '</td></tr>' +
        '<tr><td style="padding:4px 0; color:#475569;">Data Tujuan</td><td style="padding:4px 0; font-weight:700; text-align:right;">' + escapeHtml(targetId) + '</td></tr>' +
        '<tr><td style="padding:4px 0; color:#475569;">Total Bayar</td><td style="padding:4px 0; font-weight:900; color:#16a34a; text-align:right;">' + escapeHtml(totalFormatted) + ' (LUNAS)</td></tr>' +
      '</table>' +
    '</div>' +
    '<div style="background:#dcfce7; border:3px solid #0f172a; border-radius:12px; padding:16px; box-shadow:4px 4px 0px #0f172a;">' +
      '<div style="font-size:12px; font-weight:900; text-transform:uppercase; color:#15803d; margin-bottom:6px;">📦 DETAIL AKUN / VOUCHER / SN ANDA:</div>' +
      '<pre style="margin:0; font-family:monospace; font-size:13px; font-weight:700; color:#0f172a; white-space:pre-wrap; word-break:break-word;">' + escapeHtml(accountDetails) + '</pre>' +
    '</div>' +
    durationHtml;

  const subject = '[LUNAS #' + orderId + '] Pesanan ' + productName + ' - ' + VIPERCELL_CONFIG.STORE_NAME;
  const htmlBody = buildNeoBrutalistEmailTemplate({
    badgeText: 'TRANSAKSI BERHASIL & SELESAI',
    badgeColor: '#4ade80',
    title: 'E-Receipt & Detail Pesanan Anda',
    greeting: 'Terima kasih, <strong>' + escapeHtml(buyerName) + '</strong>!',
    leadText: 'Pembayaran Anda telah terverifikasi dan pesanan Anda di <strong>' + VIPERCELL_CONFIG.STORE_NAME + '</strong> telah selesai diproses. Berikut adalah rincian struk resmi dan data pesanan Anda:',
    highlightBoxHtml: detailsBoxHtml,
    footerNote: 'Simpan email ini sebagai bukti garansi resmi. Jika ada kendala login atau pertanyaan, silakan hubungi Admin melalui fitur Live Chat di toko.'
  });

  MailApp.sendEmail({
    to: email,
    subject: subject,
    htmlBody: htmlBody,
    name: VIPERCELL_CONFIG.STORE_NAME
  });

  return buildJsonResponse({
    ok: true,
    route: 'SEND_ORDER_DELIVERY',
    orderId: orderId,
    email: email,
    sentAt: new Date().toISOString(),
    message: 'Email struk & detail akun berhasil dikirim ke ' + email
  });
}

/* ============================================================================
 * SUB-MODUL 13G: ROUTE 4 - PENGINGAT MASA AKTIF LANGGANAN HABIS (ADMIN KICK)
 * ============================================================================ */
function handleSendExpiryReminderEmail(payload) {
  const email = String(payload.email || payload.buyerEmail || payload.to || '').trim();
  if (!email || !email.includes('@')) {
    return buildJsonResponse({
      ok: false,
      error: 'INVALID_EMAIL',
      message: 'Alamat email tujuan tidak valid.'
    });
  }

  const orderId = String(payload.orderId || 'INV-VIPER').trim();
  const buyerName = String(payload.buyerName || 'Sobat Vipercell').trim();
  const productName = String(payload.productName || 'Aplikasi Premium').trim();
  const variantName = String(payload.variantName || '').trim();

  const boxHtml =
    '<div style="background:#fee2e2; border:3px solid #0f172a; border-radius:12px; padding:16px; box-shadow:4px 4px 0px #0f172a; color:#0f172a;">' +
      '<div style="font-size:13px; font-weight:900; color:#dc2626; margin-bottom:6px;">🚨 MASA BERLANGGANAN TELAH BERAKHIR</div>' +
      '<p style="margin:0; font-size:13px; line-height:1.5;">' +
        'Paket: <strong>' + escapeHtml(productName + (variantName ? ' (' + variantName + ')' : '')) + '</strong><br/>' +
        'Nomor Invoice: <strong>#' + escapeHtml(orderId) + '</strong><br/>' +
        'Status Akses: <strong>Nonaktif / Sesi Berakhir</strong>' +
      '</p>' +
    '</div>';

  const subject = '[Masa Aktif Berakhir] ' + productName + ' (#' + orderId + ') - ' + VIPERCELL_CONFIG.STORE_NAME;
  const htmlBody = buildNeoBrutalistEmailTemplate({
    badgeText: 'PEMBERITAHUAN MASA AKTIF',
    badgeColor: '#f87171',
    title: 'Masa Langganan Aplikasi Anda Telah Habis',
    greeting: 'Halo, <strong>' + escapeHtml(buyerName) + '</strong>!',
    leadText: 'Kami menginformasikan bahwa durasi berlangganan produk aplikasi premium Anda di <strong>' + VIPERCELL_CONFIG.STORE_NAME + '</strong> telah berakhir.',
    highlightBoxHtml: boxHtml,
    footerNote: 'Ingin melanjutkan langganan tanpa putus? Silakan kunjungi kembali katalog ' + VIPERCELL_CONFIG.STORE_NAME + ' atau hubungi Admin untuk perpanjangan cepat!'
  });

  MailApp.sendEmail({
    to: email,
    subject: subject,
    htmlBody: htmlBody,
    name: VIPERCELL_CONFIG.STORE_NAME
  });

  return buildJsonResponse({
    ok: true,
    route: 'SEND_EXPIRY_REMINDER',
    orderId: orderId,
    email: email,
    sentAt: new Date().toISOString(),
    message: 'Email pemberitahuan masa aktif habis berhasil dikirim.'
  });
}

/* ============================================================================
 * SUB-MODUL 13H: GENERATOR TEMPLATE EMAIL HTML NEO-BRUTALISM V2.0
 * ============================================================================ */
function buildNeoBrutalistEmailTemplate(opts) {
  return (
    '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>' +
    '<body style="margin:0; padding:24px 12px; background-color:#f1f5f9; font-family:\'Plus Jakarta Sans\', -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; color:#0f172a;">' +
      '<div style="max-width:520px; margin:0 auto; background:#ffffff; border:3px solid #0f172a; border-radius:16px; box-shadow:7px 7px 0px #0f172a; overflow:hidden;">' +
        '<div style="background:#0f172a; color:#ffffff; padding:18px 22px; border-bottom:3px solid #0f172a;">' +
          '<div style="display:inline-block; background:' + (opts.badgeColor || '#facc15') + '; color:#0f172a; font-size:11px; font-weight:900; padding:4px 10px; border-radius:6px; border:2px solid #0f172a; margin-bottom:8px;">' +
            escapeHtml(opts.badgeText || 'VIPERCELL OFFICIAL') +
          '</div>' +
          '<h1 style="margin:0; font-size:20px; font-weight:900; letter-spacing:-0.3px; color:#ffffff;">' + escapeHtml(opts.title || VIPERCELL_CONFIG.STORE_NAME) + '</h1>' +
        '</div>' +
        '<div style="padding:22px;">' +
          '<p style="margin:0 0 10px 0; font-size:15px;">' + (opts.greeting || 'Halo!') + '</p>' +
          '<p style="margin:0 0 16px 0; font-size:13.5px; line-height:1.6; color:#334155;">' + (opts.leadText || '') + '</p>' +
          (opts.highlightBoxHtml || '') +
          '<p style="margin:18px 0 0 0; font-size:12px; line-height:1.5; color:#64748b; border-top:2px dashed #cbd5e1; padding-top:14px;">' +
            escapeHtml(opts.footerNote || '') +
          '</p>' +
        '</div>' +
        '<div style="background:#f8fafc; border-top:3px solid #0f172a; padding:12px 22px; text-align:center; font-size:11px; font-weight:800; color:#475569;">' +
          '© ' + new Date().getFullYear() + ' ' + escapeHtml(VIPERCELL_CONFIG.STORE_NAME) + ' — ' + escapeHtml(VIPERCELL_CONFIG.STORE_TAGLINE) +
        '</div>' +
      '</div>' +
    '</body></html>'
  );
}

/* ============================================================================
 * SUB-MODUL 13I: UTILITAS FIRESTORE REST API & HELPER
 * ============================================================================ */
function firestoreSetDocument(projectId, collection, docId, dataObj) {
  try {
    const url = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(projectId) +
                '/databases/(default)/documents/' + encodeURIComponent(collection) + '/' + encodeURIComponent(docId);
    const payload = { fields: wrapFirestoreFields(dataObj) };
    const res = UrlFetchApp.fetch(url, {
      method: 'patch',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    return res.getResponseCode() >= 200 && res.getResponseCode() < 300;
  } catch (e) {
    return false;
  }
}

function firestorePatchDocument(projectId, collection, docId, dataObj) {
  try {
    const keys = Object.keys(dataObj);
    const maskParams = keys.map(function(k) { return 'updateMask.fieldPaths=' + encodeURIComponent(k); }).join('&');
    const url = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(projectId) +
                '/databases/(default)/documents/' + encodeURIComponent(collection) + '/' + encodeURIComponent(docId) + '?' + maskParams;
    const payload = { fields: wrapFirestoreFields(dataObj) };
    const res = UrlFetchApp.fetch(url, {
      method: 'patch',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    return res.getResponseCode() >= 200 && res.getResponseCode() < 300;
  } catch (e) {
    return false;
  }
}

function wrapFirestoreFields(obj) {
  const fields = {};
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
  const result = {};
  if (!fieldsObj) return result;
  Object.keys(fieldsObj).forEach(function(k) {
    const v = fieldsObj[k];
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
  const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, input, Utilities.Charset.UTF_8);
  return rawHash.map(function(b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
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

function escapeHtml(str) {
  return String(str || '')
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
/* ======================== END OF [FEATURE-13] ============================= */