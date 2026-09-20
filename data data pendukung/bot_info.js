/**
 * ========================================================
 * VIPERCELL - STABLE 1-MINUTE TELEGRAM NOTIFIER (24/7)
 * ========================================================
 * Skrip ini berjalan tepat 1 menit sekali. 
 * Bebas dari limit 90 menit Google dan aman dari blokir Firebase.
 */

const PROJECT_ID = 'vipercell-fc50e';
const API_KEY = 'AIzaSyBQGZjl7uj5CRiLWCvPQKjiK4HvIYnXSJg';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// 🔴 WAJIB DIISI: Kredensial Login Admin
const ADMIN_EMAIL = 'vipercell.id@gmail.com'; // Ganti dengan Email Anda
const ADMIN_PASS  = 'Melati@12';  // Ganti dengan Password Anda

const PATH_SETTINGS = 'settings/mainConfig';
const PATH_ORDERS = 'orders';
const PATH_CHATS = 'chats';

/**
 * =======================================
 * 1. FUNGSI UTAMA (DIJALANKAN SETIAP 1 MENIT)
 * =======================================
 */
function runVipercellStabil() {
  // 1. Ambil Token (Login hanya jika token kadaluarsa)
  const authToken = getValidAuthToken();
  if(!authToken) return;

  // 2. Ambil Pengaturan
  const settings = getFirestoreDoc(PATH_SETTINGS, authToken);
  if (!settings || !settings.teleActive || !settings.teleToken || !settings.teleChatId) return;

  // 3. Eksekusi Pengecekan Cepat
  checkOrders(settings.teleToken, settings.teleChatId, authToken);
  checkLiveChats(settings.teleToken, settings.teleChatId, authToken);
}

/**
 * =======================================
 * 2. LOGIKA DETEKSI PESANAN & CHAT
 * =======================================
 */
function checkOrders(token, chatId, authToken) {
  const orders = getFirestoreCollection(PATH_ORDERS, authToken);
  if (!orders || orders.length === 0) return;

  orders.forEach(order => {
    let docId = order.id; let data = order.data;
    if (!data) return;

    let status = data.status || '';
    let adminReply = data.adminReply || '';
    let trxId = data.id || docId;
    let waktuTrx = getWaktuWIT();
    let nominalRp = data.finalTotal ? data.finalTotal.toLocaleString('id-ID') : 0;
    
    let namaItemStr = '-';
    if (data.items && Array.isArray(data.items)) {
      namaItemStr = data.items.map(i => `${i.name} (x${i.qty || 1})`).join(', ');
    }

    if ((status === 'PENDING' || status === 'UNPAID') && !data.notif_new) {
      let msg = `🛒 <b>PESANAN BARU MASUK!</b>\n\n<pre>\n- ID Trx : ${trxId}\n- Waktu  : ${waktuTrx}\n- Produk : ${bersihHTML(namaItemStr)}\n- Harga  : Rp ${nominalRp}\n- Status : MENUNGGU PEMBAYARAN\n</pre>\n\n<i>Sistem menunggu pembayaran user...</i>`;
      if (sendTelegram(token, chatId, msg)) { updateFirestoreDocFlag(PATH_ORDERS, docId, 'notif_new', true, authToken); }
    }
    else if (status === 'SUCCESS' && !adminReply && !data.notif_paid) {
      let msg = `✅ <b>PEMBAYARAN DITERIMA (BUTUH PROSES MANUAL)</b>\n\n<pre>\n- ID Trx : ${trxId}\n- Waktu  : ${waktuTrx}\n- Produk : ${bersihHTML(namaItemStr)}\n- Harga  : Rp ${nominalRp}\n</pre>\n\n⚠️ <b>PERHATIAN:</b> Sistem gagal mengirim otomatis. Segera proses pesanan di Dashboard Admin!`;
      if (sendTelegram(token, chatId, msg)) { updateFirestoreDocFlag(PATH_ORDERS, docId, 'notif_paid', true, authToken); }
    }
    else if (status === 'SUCCESS' && adminReply && !data.notif_completed) {
      let msg = `🎉 <b>PESANAN SELESAI & TERKIRIM</b>\n\n<pre>\n- ID Trx : ${trxId}\n- Waktu  : ${waktuTrx}\n- Produk : ${bersihHTML(namaItemStr)}\n- Harga  : Rp ${nominalRp}\n- Status : BERHASIL TERKIRIM\n</pre>\n\n<b>Balasan Admin:</b>\n<i>${bersihHTML(adminReply)}</i>\n\n✅ Transaksi diselesaikan.`;
      if (sendTelegram(token, chatId, msg)) { updateFirestoreDocFlag(PATH_ORDERS, docId, 'notif_completed', true, authToken); }
    }
  });
}

function checkLiveChats(token, chatId, authToken) {
  const chats = getFirestoreCollection(PATH_CHATS, authToken);
  if (!chats || chats.length === 0) return;

  chats.forEach(chat => {
    let docId = chat.id; let data = chat.data;
    if (!data || !data.messages || !Array.isArray(data.messages)) return;

    let currentMsgCount = data.messages.length;
    let lastNotifiedCount = data.notif_msg_count || 0;

    if (currentMsgCount > lastNotifiedCount) {
      let newMessages = data.messages.slice(lastNotifiedCount);
      let lastMsg = newMessages[newMessages.length - 1];

      if (lastMsg && lastMsg.sender === 'user') {
        let userInfo = data.userInfo || 'Pelanggan';
        let msg = `💬 <b>PESAN BANTUAN BARU</b>\n\n<b>Dari:</b> ${bersihHTML(userInfo)}\n<b>Pesan:</b> <i>"${bersihHTML(lastMsg.text)}"</i>\n\nBuka Dashboard Web Admin untuk membalas.`;
        if (sendTelegram(token, chatId, msg)) { updateFirestoreDocNumber(PATH_CHATS, docId, 'notif_msg_count', currentMsgCount, authToken); }
      } else {
        updateFirestoreDocNumber(PATH_CHATS, docId, 'notif_msg_count', currentMsgCount, authToken);
      }
    }
  });
}

/**
 * =======================================
 * 3. FUNGSI SMART LOGIN (CACHE TOKEN)
 * =======================================
 */
function getValidAuthToken() {
  const props = PropertiesService.getScriptProperties();
  const savedToken = props.getProperty('FIREBASE_TOKEN');
  const expiry = props.getProperty('TOKEN_EXPIRY');
  
  // Jika token masih ada dan belum kadaluarsa (berlaku 50 menit), gunakan yang lama
  if (savedToken && expiry && new Date().getTime() < parseInt(expiry)) {
    return savedToken;
  }
  
  // Jika kosong atau kadaluarsa, baru lakukan Login ulang
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
  const payload = { email: ADMIN_EMAIL, password: ADMIN_PASS, returnSecureToken: true };
  try {
    const res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
    const json = JSON.parse(res.getContentText());
    if (json.idToken) {
      // Simpan token baru dan atur kadaluarsa 50 menit dari sekarang
      props.setProperty('FIREBASE_TOKEN', json.idToken);
      props.setProperty('TOKEN_EXPIRY', (new Date().getTime() + (50 * 60 * 1000)).toString());
      return json.idToken;
    }
  } catch(e) {}
  return null;
}

/**
 * =======================================
 * 4. FUNGSI API & UTILITIES
 * =======================================
 */
function sendTelegram(token, chatId, message) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }), muteHttpExceptions: true });
    return JSON.parse(res.getContentText()).ok;
  } catch (e) { return false; }
}

function getFirestoreDoc(path, authToken) {
  const url = `${BASE_URL}/${path}`;
  try {
    const res = UrlFetchApp.fetch(url, { headers: { 'Authorization': `Bearer ${authToken}` }, muteHttpExceptions: true });
    if (res.getResponseCode() === 200) return parseFirestoreJson(JSON.parse(res.getContentText()).fields);
  } catch(e) {}
  return null;
}

function getFirestoreCollection(collectionName, authToken) {
  const url = `${BASE_URL}/${collectionName}?pageSize=100`; // Dibatasi 100 agar ringan
  try {
    const res = UrlFetchApp.fetch(url, { headers: { 'Authorization': `Bearer ${authToken}` }, muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      const json = JSON.parse(res.getContentText());
      if (!json.documents) return [];
      return json.documents.map(doc => {
        const idParts = doc.name.split('/');
        return { id: idParts[idParts.length - 1], data: parseFirestoreJson(doc.fields) };
      });
    }
  } catch(e) {}
  return [];
}

function updateFirestoreDocFlag(collectionName, docId, fieldName, valueBoolean, authToken) {
  const url = `${BASE_URL}/${collectionName}/${docId}?updateMask.fieldPaths=${fieldName}`;
  UrlFetchApp.fetch(url, { method: 'patch', headers: { 'Authorization': `Bearer ${authToken}` }, contentType: 'application/json', payload: JSON.stringify({ fields: { [fieldName]: { booleanValue: valueBoolean } } }), muteHttpExceptions: true });
}

function updateFirestoreDocNumber(collectionName, docId, fieldName, valueNumber, authToken) {
  const url = `${BASE_URL}/${collectionName}/${docId}?updateMask.fieldPaths=${fieldName}`;
  UrlFetchApp.fetch(url, { method: 'patch', headers: { 'Authorization': `Bearer ${authToken}` }, contentType: 'application/json', payload: JSON.stringify({ fields: { [fieldName]: { integerValue: valueNumber.toString() } } }), muteHttpExceptions: true });
}

function getWaktuWIT() {
  return new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jayapura', hour12: false }) + ' WIT';
}

function bersihHTML(text) {
  if (!text) return '-';
  return text.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseFirestoreJson(fields) {
  if (!fields) return {};
  let result = {};
  for (let key in fields) {
    let valObj = fields[key];
    if (valObj.stringValue !== undefined) result[key] = valObj.stringValue;
    else if (valObj.integerValue !== undefined) result[key] = parseInt(valObj.integerValue);
    else if (valObj.doubleValue !== undefined) result[key] = parseFloat(valObj.doubleValue);
    else if (valObj.booleanValue !== undefined) result[key] = valObj.booleanValue;
    else if (valObj.arrayValue !== undefined) result[key] = (valObj.arrayValue.values || []).map(v => parseFirestoreJson({t: v}).t);
    else if (valObj.mapValue !== undefined) result[key] = parseFirestoreJson(valObj.mapValue.fields);
  }
  return result;
}

/**
 * ========================================================
 * 5. AKTIVASI SISTEM (JALANKAN FUNGSI INI)
 * ========================================================
 */
function AKTIFKAN_SISTEM_STABIL() {
  // Hapus semua pemicu lama agar tidak tumpang tindih
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t));
  
  // Buat pemicu baru tepat 1 Menit
  ScriptApp.newTrigger('runVipercellStabil')
           .timeBased()
           .everyMinutes(1)
           .create();
           
  Logger.log("✅ SISTEM 1-MENIT STABIL BERHASIL DIAKTIFKAN!");
}