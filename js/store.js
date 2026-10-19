
/* ============================================================================
 * VIPERCELL V25.1 - STOREFRONT ENGINE (WEB USER - FAST & RESPONSIVE)
 * Standar Arsitektur : Modular Feature Blocks ([FEATURE-01] s/d [FEATURE-13])
 * ============================================================================ */

import { 
    db, auth,
    signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword,
    sendPasswordResetEmail, GoogleAuthProvider, EmailAuthProvider, linkWithCredential, deleteUser,
    signInWithPopup, onAuthStateChanged,
    signOut, setPersistence, browserLocalPersistence,
    doc, setDoc, getDoc, updateDoc, deleteDoc, onSnapshot, collection, addDoc, increment, arrayUnion, query, where, getDocs, runTransaction 
} from './firebase.js';

// ==========================================
// KONFIGURASI PATH DATABASE FIRESTORE
// ==========================================
const appId = typeof __app_id !== 'undefined' ? __app_id : 'vipercell-prod';
const isWorkspace = typeof __app_id !== 'undefined';

const pathProducts = isWorkspace ? `artifacts/${appId}/public/data/products` : 'products';
const pathOrders = isWorkspace ? `artifacts/${appId}/public/data/orders` : 'orders';
const pathSettings = isWorkspace ? `artifacts/${appId}/public/data/settings` : 'settings';
const pathUsers = isWorkspace ? `artifacts/${appId}/public/data/users` : 'users';
const pathPromos = isWorkspace ? `artifacts/${appId}/public/data/promos` : 'promos';
const pathChats = isWorkspace ? `artifacts/${appId}/public/data/chats` : 'chats';
const pathReviews = isWorkspace ? `artifacts/${appId}/public/data/reviews` : 'reviews';
const pathStocks = isWorkspace ? `artifacts/${appId}/public/data/stocks` : 'stocks';
const pathDeviceLocks = isWorkspace ? `artifacts/${appId}/public/data/device_locks` : 'device_locks';
const pathDeletedAccounts = isWorkspace ? `artifacts/${appId}/public/data/deleted_accounts` : 'deleted_accounts';
const pathMutations = isWorkspace ? `artifacts/${appId}/public/data/payment_mutations` : 'payment_mutations';

const fallbackSettingsPath = isWorkspace ? 'settings' : `artifacts/${appId}/public/data/settings`;

// ==========================================
// STATE & VARIABEL GLOBAL (V25.1)
// ==========================================
let products = [];
let groupedBrands = []; 
let orders = [];
let promos = [];
let reviewsData = [];
let siteSettings = { 
    logoText: 'VIPER',
    logoAccent: 'CELL',
    logoImgBase64: '',
    pwaIconBase64: '',
    marquee: 'Selamat Datang di Vipercell! Layanan Otomatis 24 Jam.',
    qrisStringData: '',
    emailWebhookUrl: '',
    webhookSecret: 'VIPERCELL_SECRET_2026',
    adminWa: '085656321860',
    igLink: '',
    ttLink: '',
    newsList: [],
    banners: [],
    isStoreOpen: true,
    waChannelLink: '',
    deletedUids: [],
    blockedUids: [],
    blockedDevices: []
};

let currentDeviceId = '';
let boundLegacyGuestUid = null;
let userProfile = { name: '', email: '', phone: '', whatsapp: '', role: 'anonymous', isAnonymous: true, isGuest: true };
let currentUser = null;
let currentCheckoutBrand = null;
let selectedProductForBuy = null;
let appliedPromo = null; 
let currentCheckoutSession = null; 
let userChatMessages = [];
let initialOrderLoad = true;
let isSettingsLoaded = false; 
let isPreloaderFinished = false;
let previousOrdersData = {}; 
let lastSuccessOrderCount = -1;
let currentOpenedArticle = null;

// Smart Accordion & Filter States ([FEATURE-04])
let currentBrandFilter = 'all';
let currentSearchQuery = '';
let isCatalogExpanded = false;
let isVariantsExpanded = false;
let currentVariantSearchQuery = '';
let currentUserHistoryFilter = 'ALL';

// Timer Debounce untuk Input Pencarian Cepat
let catalogSearchDebounceTimer = null;
let variantSearchDebounceTimer = null;

// State Verifikasi OTP 6-Digit ([FEATURE-02])
let pendingUpgradeState = {
    name: '',
    whatsapp: '',
    email: '',
    password: '',
    otpCode: '',
    otpExpiresAt: 0
};
let otpResendTimer = null;

// Registry Cleanup untuk Listener & Timer ([FEATURE-13])
const activeTimersRegistry = {
    qrisCountdown: null,
    bannerSlider: null,
    preloaderSafety: null
};
const activeListenersRegistry = {
    chat: null,
    deletedAccount: null,
    mutations: null
};

// Preferensi Notifikasi User
let isUserNotifEnabled = localStorage.getItem('vipercell_user_notif') !== 'off';

// Gembok Anti-Dobel Transaksi, Pengiriman Vault & Ulasan
let isProcessingCheckout = false;
let isCancellingOrder = false;
let isCheckingPaymentNow = false;
let isResendingReceiptEmail = false;
let isSubmittingReview = false;
let isUpgradingAccount = false;
let targetReviewOrderId = null;
const deliveringOrderIds = new Set();

// ==========================================
// UTILITAS KEAMANAN TEKS & FORMATTER
// ==========================================
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeJsStr(str) {
    if (!str) return '';
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

/* ============================================================================
 * [FEATURE-13] CLIENT-SIDE UNIFIED GAS WEBHOOK CALLER (CORS-SAFE & SECRET AUTH)
 * Deskripsi : Memanggil Google Apps Script untuk OTP Email & E-Receipt Otomatis
 *             dengan menyertakan Kunci Rahasia (webhookSecret) secara otomatis.
 * ============================================================================ */
async function callUnifiedGasWebhook(payloadObj) {
    const gasWebAppUrl = (siteSettings.emailWebhookUrl || '').trim();
    if (!gasWebAppUrl || !gasWebAppUrl.startsWith('https://script.google.com/')) {
        throw new Error('WEBHOOK_NOT_CONFIGURED');
    }

    const activeSecret = (siteSettings.webhookSecret || 'VIPERCELL_SECRET_2026').trim();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 18000);

    try {
        const response = await fetch(gasWebAppUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify({
                projectId: 'vipercell-fc50e',
                secret: activeSecret,
                key: activeSecret,
                ...payloadObj
            }),
            redirect: 'follow',
            signal: controller.signal
        });

        const rawText = await response.text();
        let result = null;
        try {
            result = JSON.parse(rawText);
        } catch (parseErr) {
            throw new Error('Respons server GAS bukan format JSON yang valid. Pastikan Web App di-deploy sebagai "Anyone" (Siapa saja).');
        }

        if (!result || (result.ok === false && result.status !== 'ok')) {
            const errCode = result?.error || '';
            if (errCode === 'UNAUTHORIZED_SECRET') {
                throw new Error('Kunci Rahasia (Webhook Secret) di Pengaturan Admin tidak cocok dengan WEBHOOK_SECRET di Google Apps Script.');
            }
            throw new Error((result && result.message) || (result && result.error) || 'Gagal menghubungi server GAS Webhook.');
        }
        return result;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function sendOrderReceiptAndAccountEmail(orderData, accountDetailsText) {
    const gasUrl = (siteSettings.emailWebhookUrl || '').trim();
    const buyerEmail = (orderData.userEmail || orderData.buyerEmail || '').trim();
    if (!gasUrl || !buyerEmail || !buyerEmail.includes('@')) return false;

    const itemObj = (orderData.items && orderData.items[0]) ? orderData.items[0] : {};
    const finalNominal = Number(orderData.finalTotal || orderData.uniqueTotal || 0);

    try {
        await callUnifiedGasWebhook({
            action: 'SEND_ORDER_DELIVERY',
            email: buyerEmail,
            buyerEmail: buyerEmail,
            to: buyerEmail,
            orderId: orderData.id,
            invoice: orderData.id,
            invoiceId: orderData.id,
            buyerName: orderData.buyerName || userProfile.name || buyerEmail.split('@')[0],
            productName: itemObj.brandName || orderData.productName || itemObj.name || 'Produk Digital',
            variantName: itemObj.exactItemName || orderData.variantName || itemObj.name || '-',
            itemName: itemObj.name || 'Layanan Digital Vipercell',
            totalAmount: finalNominal,
            uniqueTotal: finalNominal,
            totalFormatted: `Rp ${finalNominal.toLocaleString('id-ID')}`,
            targetId: itemObj.playerInfo || orderData.targetId || '-',
            accountDetails: accountDetailsText || orderData.adminReply || 'Pesanan selesai diproses.',
            durationDays: Number(itemObj.durationDays || orderData.durationDays || 0),
            subscriptionEndAt: Number(orderData.subscriptionEndAt || 0)
        });
        return true;
    } catch (e) {
        console.warn("Automated Email Delivery Info:", e.message);
        return false;
    }
}

window.resendOrderEmailReceipt = async function(invId) {
    if (isResendingReceiptEmail) return;
    const order = orders.find(o => o.id === invId);
    if (!order) return;

    const targetEmail = (order.userEmail || userProfile.email || localStorage.getItem('vipercell_track_email') || '').trim();
    if (!targetEmail || !targetEmail.includes('@')) {
        window.customAlert('Email Tidak Ditemukan', 'Alamat email pada pesanan ini kosong atau tidak valid.', 'warning');
        return;
    }

    if (!(siteSettings.emailWebhookUrl || '').trim().startsWith('https://script.google.com/')) {
        window.customAlert('Webhook Belum Aktif', 'Fitur pengiriman email otomatis sedang tidak diaktifkan oleh Admin.', 'warning');
        return;
    }

    isResendingReceiptEmail = true;
    window.showToast('Mengirim Email...', `Sedang mengirim ulang E-Receipt #${order.id} ke ${targetEmail}`, 'info');

    try {
        const sent = await sendOrderReceiptAndAccountEmail(
            { ...order, userEmail: targetEmail },
            order.adminReply || 'Terima kasih! Pembayaran Anda telah diverifikasi dan pesanan telah selesai diproses.'
        );
        if (sent) {
            window.showToast('Email Terkirim! 📩', `E-Receipt #${order.id} berhasil dikirim ke ${targetEmail}. Cek Inbox/Spam.`, 'success');
        } else {
            window.customAlert('Gagal Mengirim Email', 'Tidak dapat mengirim struk ke email. Pastikan URL & Kunci Rahasia Webhook di Admin sudah sesuai.', 'error');
        }
    } catch (err) {
        window.customAlert('Gagal Mengirim Email', err.message, 'error');
    } finally {
        isResendingReceiptEmail = false;
    }
};
/* ======================== END OF [FEATURE-13] ============================= */

/* ============================================================================
 * [FEATURE-01] ZERO-LEAK PRE-LOADER GATEKEEPER (4-STAGE REAL DATA LATCH)
 * Deskripsi : Menahan pembukaan layar sampai Auth, Config, Katalog & Font siap
 * ============================================================================ */
function updatePreloaderStage(percent, statusText, subText = '') {
    const txtEl = document.getElementById('preloader-status-text');
    const fillEl = document.getElementById('preloader-bar-fill');
    const subEl = document.getElementById('preloader-stage-sub');

    if (txtEl && statusText) txtEl.innerText = statusText;
    if (fillEl) fillEl.style.width = `${Math.min(100, Math.max(5, percent))}%`;
    if (subEl && subText) subEl.innerText = subText;
}

function showPreloaderRetryUI(reasonText) {
    const spinner = document.getElementById('preloader-spinner');
    const retryBox = document.getElementById('preloader-retry-box');
    const subEl = document.getElementById('preloader-stage-sub');
    if (spinner) spinner.style.display = 'none';
    if (subEl && reasonText) subEl.innerText = reasonText;
    if (retryBox) retryBox.style.display = 'block';
}

window.retryPreloaderConnection = function() {
    const spinner = document.getElementById('preloader-spinner');
    const retryBox = document.getElementById('preloader-retry-box');
    if (spinner) spinner.style.display = 'block';
    if (retryBox) retryBox.style.display = 'none';
    initializeAppWithLoader();
};

function unlockAppUI() {
    if (activeTimersRegistry.preloaderSafety) {
        clearTimeout(activeTimersRegistry.preloaderSafety);
        activeTimersRegistry.preloaderSafety = null;
    }
    isPreloaderFinished = true;
    document.body.classList.remove('preloader-locked');
    document.body.classList.remove('no-scroll');

    const loader = document.getElementById('app-preloader-overlay');
    if (loader && !loader.classList.contains('hidden')) {
        loader.classList.add('hidden');
        setTimeout(() => {
            loader.style.display = 'none';
        }, 260);
    }
}

function setAuthGateLock(isLocked) {
    if (isLocked) {
        document.body.classList.add('auth-locked');
        document.querySelectorAll('.main-tab-content').forEach(el => el.classList.remove('active'));
        const authTab = document.getElementById('tab-auth');
        if (authTab) authTab.classList.add('active');
        window.switchAuthTab('login');
        window.scrollTo({ top: 0, behavior: 'instant' });
    } else {
        document.body.classList.remove('auth-locked');
    }
}

function checkAuthStateFirstLoad() {
    return new Promise((resolve) => {
        const unsub = onAuthStateChanged(auth, (user) => {
            unsub();
            resolve(user);
        }, () => resolve(null));
    });
}

async function fetchInitialStoreDataWithGatekeeper() {
    // Stage 2: Tarik Konfigurasi Toko &Katalog Secara Paralel agar Lebih Cepat
    updatePreloaderStage(45, 'Sedang memuat data...', 'Menarik konfigurasi toko & katalog produk...');
    const [settingsSnap, productsSnap, ordersSnap] = await Promise.all([
        getDoc(doc(db, pathSettings, 'mainConfig')).catch(() => null),
        getDocs(collection(db, pathProducts)).catch(() => null),
        getDocs(collection(db, pathOrders)).catch(() => null)
    ]);

    if (settingsSnap && settingsSnap.exists()) {
        siteSettings = { ...siteSettings, ...settingsSnap.data() };
    } else {
        const fallbackSnap = await getDoc(doc(db, fallbackSettingsPath, 'mainConfig')).catch(() => null);
        if (fallbackSnap && fallbackSnap.exists()) {
            siteSettings = { ...siteSettings, ...fallbackSnap.data() };
        }
    }
    isSettingsLoaded = true;
    window.applySettingsToUI();
    applyCustomPwaIcon();

    updatePreloaderStage(78, 'Sedang memuat data...', 'Menyusun katalog produk & varian layanan...');
    if (ordersSnap) {
        orders = [];
        ordersSnap.forEach((d) => orders.push({ dbId: d.id, ...d.data() }));
        orders.sort((a, b) => new Date(b.date) - new Date(a.date));
        lastSuccessOrderCount = orders.filter(o => o.status === 'SUCCESS').length;
    }

    if (productsSnap) {
        products = [];
        productsSnap.forEach((docSnap) => {
            products.push({ dbId: docSnap.id, ...docSnap.data() });
        });
    }
    rebuildGroupedBrands();
}

async function initializeAppWithLoader() {
    initTypewriter();
    updateProfileNotifToggleUI();

    const savedTheme = localStorage.getItem('vipercell_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const icon = document.getElementById('theme-icon');
    if (icon) icon.className = savedTheme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';

    const trackEmailInp = document.getElementById('track-email');
    if (trackEmailInp && localStorage.getItem('vipercell_track_email')) {
        trackEmailInp.value = localStorage.getItem('vipercell_track_email');
    }

    if (!navigator.onLine) {
        updatePreloaderStage(20, 'Koneksi Terputus', 'Periksa sambungan internet perangkat Anda.');
        showPreloaderRetryUI('Perangkat sedang offline.');
        return;
    }

    // Smart Timeout 9.000ms (9 Detik)
    if (activeTimersRegistry.preloaderSafety) clearTimeout(activeTimersRegistry.preloaderSafety);
    activeTimersRegistry.preloaderSafety = setTimeout(() => {
        if (!isPreloaderFinished) {
            if (!navigator.onLine) {
                showPreloaderRetryUI('Waktu tunggu jaringan habis.');
            } else {
                unlockAppUI();
            }
        }
    }, 9000);

    try {
        // STAGE 1 (0% -> 25%): Sesi Perangkat & Autentikasi
        updatePreloaderStage(25, 'Sedang memuat data...', 'Memeriksa sesi perangkat & keamanan...');
        await setPersistence(auth, browserLocalPersistence).catch(() => {});
        await initDeviceIdentity();
        const initialUser = await checkAuthStateFirstLoad();

        // STAGE 2 & 3 (25% -> 85%): Konfigurasi Toko & Katalog Produk
        await fetchInitialStoreDataWithGatekeeper();

        // Aktifkan Real-Time Listeners
        listenData();
        setupAuthStateListener();

        // STAGE 4 (85% -> 100%): Font Warmup + Penentuan Halaman Awal
        updatePreloaderStage(94, 'Sedang memuat data...', 'Menyiapkan antarmuka pengguna...');
        if (document.fonts && document.fonts.ready) {
            await Promise.race([
                document.fonts.ready,
                new Promise(res => setTimeout(res, 400))
            ]);
        }

        const sessionMode = localStorage.getItem('vipercell_active_session_mode');
        if ((initialUser && !initialUser.isAnonymous) || sessionMode === 'guest') {
            const userObjToSync = initialUser || {
                uid: boundLegacyGuestUid || `anon_${currentDeviceId}`,
                isAnonymous: true,
                email: ''
            };
            await syncUserProfileFromAuth(userObjToSync);

            const restricted = await checkRealtimeAccountRestriction();
            if (!restricted) {
                localStorage.setItem('vipercell_active_session_mode', userObjToSync.isAnonymous ? 'guest' : 'member');
                setAuthGateLock(false);
                window.switchMainTab('katalog');
            }
        } else {
            setAuthGateLock(true);
        }

        updatePreloaderStage(100, 'Siap!', 'Membuka halaman Vipercell...');
        setTimeout(unlockAppUI, 120);
    } catch (error) {
        console.error("Gatekeeper Init Error:", error);
        setAuthGateLock(true);
        unlockAppUI();
    }
    observeReveals();
}
/* ======================== END OF [FEATURE-01] ============================= */

/* ============================================================================
 * [FEATURE-02] AUTH GATE, 1-HP-1-ANON FINGERPRINT & 6-DIGIT OTP UPGRADE
 * ============================================================================ */
function computeDeviceFingerprint() {
    try {
        const nav = window.navigator || {};
        const scr = window.screen || {};
        const rawTraits = [
            nav.userAgent || '',
            nav.language || '',
            nav.hardwareConcurrency || '',
            nav.deviceMemory || '',
            nav.maxTouchPoints || '',
            `${scr.width || 0}x${scr.height || 0}x${scr.colorDepth || 0}`,
            Intl.DateTimeFormat().resolvedOptions().timeZone || ''
        ];

        try {
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 40;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.textBaseline = 'top';
                ctx.font = '14px Arial';
                ctx.fillStyle = '#2563eb';
                ctx.fillRect(10, 5, 80, 25);
                ctx.fillStyle = '#0f172a';
                ctx.fillText('VipercellGuardV25', 14, 12);
                rawTraits.push(canvas.toDataURL().slice(-64));
            }
        } catch (e) {}

        const combined = rawTraits.join('||');
        let h1 = 0xdeadbeef ^ combined.length;
        let h2 = 0x41c6ce57 ^ combined.length;
        for (let i = 0, ch; i < combined.length; i++) {
            ch = combined.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        const hexHash = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(12, '0');
        return `fp_${hexHash}`;
    } catch (err) {
        return 'fp_default_device';
    }
}

async function saveMultiLayerToken(key, value) {
    if (!value) return;
    try { localStorage.setItem(key, value); } catch (e) {}

    try {
        const req = indexedDB.open('VipercellGuardDB', 1);
        req.onupgradeneeded = (e) => {
            const idb = e.target.result;
            if (!idb.objectStoreNames.contains('tokens')) {
                idb.createObjectStore('tokens');
            }
        };
        req.onsuccess = (e) => {
            const idb = e.target.result;
            const tx = idb.transaction('tokens', 'readwrite');
            tx.objectStore('tokens').put(value, key);
        };
    } catch (e) {}

    try {
        if ('caches' in window) {
            const cache = await caches.open('vipercell-guard-token-v25');
            await cache.put(`/__guard/${key}`, new Response(value));
        }
    } catch (e) {}
}

async function readMultiLayerToken(key) {
    try {
        const lsVal = localStorage.getItem(key);
        if (lsVal) return lsVal;
    } catch (e) {}

    try {
        if ('caches' in window) {
            const cache = await caches.open('vipercell-guard-token-v25');
            const res = await cache.match(`/__guard/${key}`);
            if (res) {
                const text = await res.text();
                if (text) {
                    localStorage.setItem(key, text);
                    return text;
                }
            }
        }
    } catch (e) {}

    try {
        const idbVal = await new Promise((resolve) => {
            const req = indexedDB.open('VipercellGuardDB', 1);
            req.onupgradeneeded = (e) => {
                const idb = e.target.result;
                if (!idb.objectStoreNames.contains('tokens')) {
                    idb.createObjectStore('tokens');
                }
            };
            req.onsuccess = (e) => {
                const idb = e.target.result;
                if (!idb.objectStoreNames.contains('tokens')) return resolve(null);
                const tx = idb.transaction('tokens', 'readonly');
                const getReq = tx.objectStore('tokens').get(key);
                getReq.onsuccess = () => resolve(getReq.result || null);
                getReq.onerror = () => resolve(null);
            };
            req.onerror = () => resolve(null);
        });
        if (idbVal) {
            localStorage.setItem(key, idbVal);
            return idbVal;
        }
    } catch (e) {}

    return null;
}

async function initDeviceIdentity() {
    currentDeviceId = computeDeviceFingerprint();
    await saveMultiLayerToken('vipercell_device_id', currentDeviceId);

    const savedLegacyUid = await readMultiLayerToken('vipercell_anon_uid');
    if (savedLegacyUid) {
        boundLegacyGuestUid = savedLegacyUid;
    }
    return currentDeviceId;
}

async function checkRealtimeAccountRestriction() {
    if (!currentDeviceId) await initDeviceIdentity();
    const effectiveUid = boundLegacyGuestUid || currentUser?.uid || '';

    const deletedList = Array.isArray(siteSettings.deletedUids) ? siteSettings.deletedUids : [];
    const blockedUidList = Array.isArray(siteSettings.blockedUids) ? siteSettings.blockedUids : [];
    const blockedDevList = Array.isArray(siteSettings.blockedDevices) ? siteSettings.blockedDevices : [];

    const isDeleted = effectiveUid && deletedList.includes(effectiveUid);
    const isBlocked = (effectiveUid && blockedUidList.includes(effectiveUid)) ||
                      (currentDeviceId && blockedDevList.includes(currentDeviceId));

    if ((isDeleted || isBlocked) && !document.body.classList.contains('auth-locked')) {
        localStorage.removeItem('vipercell_anon_uid');
        localStorage.removeItem('vipercell_anon_name');
        localStorage.setItem('vipercell_active_session_mode', 'logged_out');

        try {
            if (auth.currentUser) {
                if (isDeleted) {
                    await deleteUser(auth.currentUser).catch(async () => await signOut(auth));
                } else {
                    await signOut(auth);
                }
            }
        } catch (e) {}

        currentUser = null;
        userProfile = { name: '', email: '', phone: '', isGuest: true, isAnonymous: true };
        setAuthGateLock(true);

        window.customAlert(
            isBlocked ? 'Akses Akun Diblokir' : 'Akun Dihapus',
            isBlocked
                ? 'Maaf, akun atau perangkat Anda telah diblokir oleh Administrator Vipercell.'
                : 'Akun Anda telah dihapus oleh Administrator Vipercell.',
            'error'
        );
        return true;
    }
    return false;
}

function listenDeletedAccountStatus(uid) {
    if (!uid) return;
    if (activeListenersRegistry.deletedAccount) activeListenersRegistry.deletedAccount();

    activeListenersRegistry.deletedAccount = onSnapshot(doc(db, pathUsers, uid), async (docSnap) => {
        if (docSnap.exists()) {
            const uData = docSnap.data();
            if (uData.isBlocked === true || uData.isDeleted === true) {
                if (!siteSettings.blockedUids) siteSettings.blockedUids = [];
                if (uData.isBlocked && !siteSettings.blockedUids.includes(uid)) siteSettings.blockedUids.push(uid);
                if (!siteSettings.deletedUids) siteSettings.deletedUids = [];
                if (uData.isDeleted && !siteSettings.deletedUids.includes(uid)) siteSettings.deletedUids.push(uid);
                await checkRealtimeAccountRestriction();
            }
        }
    }, () => {});
}

window.processAnonymousLogin = async function() {
    const btnGuest = document.getElementById('auth-guest-btn');
    const ogHtml = btnGuest ? btnGuest.innerHTML : '';
    if (btnGuest) {
        btnGuest.disabled = true;
        btnGuest.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Memverifikasi Sesi Anonim...</span>`;
    }

    try {
        if (!currentDeviceId) await initDeviceIdentity();

        const blockedDevList = Array.isArray(siteSettings.blockedDevices) ? siteSettings.blockedDevices : [];
        const blockedUidList = Array.isArray(siteSettings.blockedUids) ? siteSettings.blockedUids : [];
        const deletedUidList = Array.isArray(siteSettings.deletedUids) ? siteSettings.deletedUids : [];

        if (blockedDevList.includes(currentDeviceId)) {
            window.customAlert('Perangkat Diblokir', 'Maaf, akses sesi anonim pada perangkat ini telah diblokir oleh Administrator.', 'error');
            return;
        }

        let activeUser = auth.currentUser;
        if (!activeUser) {
            try {
                const cred = await signInAnonymously(auth);
                activeUser = cred.user;
            } catch (authErr) {
                const fallbackUid = (boundLegacyGuestUid && !deletedUidList.includes(boundLegacyGuestUid))
                    ? boundLegacyGuestUid
                    : `anon_${currentDeviceId}`;
                activeUser = { uid: fallbackUid, isAnonymous: true, email: '' };
            }
        }
        currentUser = activeUser;

        let effectiveUid = activeUser.uid;
        if (boundLegacyGuestUid && !deletedUidList.includes(boundLegacyGuestUid)) {
            effectiveUid = boundLegacyGuestUid;
        }

        if (deletedUidList.includes(effectiveUid)) {
            try {
                await signOut(auth);
                const newCred = await signInAnonymously(auth);
                activeUser = newCred.user;
                currentUser = activeUser;
                effectiveUid = activeUser.uid;
            } catch (reAuthErr) {
                effectiveUid = `anon_${currentDeviceId}_${Date.now().toString(36).slice(-4)}`;
            }
        }

        if (blockedUidList.includes(effectiveUid)) {
            window.customAlert('Akun Diblokir', 'Maaf, sesi akun anonim Anda telah diblokir oleh Administrator.', 'error');
            return;
        }

        boundLegacyGuestUid = effectiveUid;
        await saveMultiLayerToken('vipercell_anon_uid', effectiveUid);

        const shortId = effectiveUid.slice(-4).toUpperCase();
        const savedAnonName = localStorage.getItem('vipercell_anon_name') || `Tamu #${shortId}`;

        let loadedProfile = null;
        try {
            const userDocRef = doc(db, pathUsers, effectiveUid);
            const existingSnap = await getDoc(userDocRef);
            if (existingSnap.exists()) {
                const existingData = existingSnap.data();
                if (existingData.isBlocked === true) {
                    window.customAlert('Akun Diblokir', 'Maaf, akun anonim ini telah diblokir oleh Administrator.', 'error');
                    return;
                }
                if (!existingData.isDeleted && !deletedUidList.includes(effectiveUid)) {
                    loadedProfile = existingData;
                }
            }
        } catch (readErr) {}

        if (loadedProfile) {
            userProfile = {
                ...loadedProfile,
                uid: effectiveUid,
                name: loadedProfile.name || savedAnonName,
                role: 'anonymous',
                isAnonymous: true,
                isGuest: true,
                deviceId: currentDeviceId
            };
            if (loadedProfile.name) localStorage.setItem('vipercell_anon_name', loadedProfile.name);
        } else {
            userProfile = {
                uid: effectiveUid,
                authUid: activeUser.uid,
                name: savedAnonName,
                email: localStorage.getItem('vipercell_track_email') || '',
                phone: localStorage.getItem('vipercell_track_phone') || '',
                whatsapp: localStorage.getItem('vipercell_track_phone') || '',
                role: 'anonymous',
                isAnonymous: true,
                isGuest: true,
                isBlocked: false,
                isDeleted: false,
                deviceId: currentDeviceId,
                createdAt: Date.now()
            };
        }

        try {
            await setDoc(doc(db, pathUsers, effectiveUid), { ...userProfile, lastActiveAt: Date.now() }, { merge: true });
        } catch (writeErr) {
            if (activeUser.uid && activeUser.uid !== effectiveUid) {
                effectiveUid = activeUser.uid;
                userProfile.uid = effectiveUid;
                boundLegacyGuestUid = effectiveUid;
                await saveMultiLayerToken('vipercell_anon_uid', effectiveUid);
                await setDoc(doc(db, pathUsers, effectiveUid), { ...userProfile, lastActiveAt: Date.now() }, { merge: true }).catch(() => {});
            }
        }

        setDoc(doc(db, pathDeviceLocks, currentDeviceId), {
            uid: effectiveUid,
            role: 'anonymous',
            status: 'active',
            deviceId: currentDeviceId,
            isBlocked: false,
            updatedAt: Date.now()
        }, { merge: true }).catch(() => {});

        localStorage.setItem('vipercell_active_session_mode', 'guest');
        listenDeletedAccountStatus(effectiveUid);
        setAuthGateLock(false);
        applyUserSessionToUI();
        window.renderUserOrders();
        checkChatUserState();
        listenUserChat();
        window.switchMainTab('katalog');

        window.showToast('Berhasil Masuk', `Selamat datang, ${userProfile.name}!`, 'success');
    } catch (err) {
        console.error("Anonymous Login Error:", err);
        window.customAlert('Gagal Masuk', 'Terjadi kendala jaringan. Silakan periksa koneksi internet Anda.', 'error');
    } finally {
        if (btnGuest && ogHtml) {
            btnGuest.disabled = false;
            btnGuest.innerHTML = ogHtml;
        }
    }
};

// VERIFIKASI EMAIL OTP 6-DIGIT SAAT UPGRADE AKUN ANONIM KE MEMBER
window.openUpgradeMemberModal = function() {
    const nameInp = document.getElementById('upg-name');
    const phoneInp = document.getElementById('upg-phone');
    const emailInp = document.getElementById('upg-email');
    const passInp = document.getElementById('upg-pass');
    const passConfInp = document.getElementById('upg-pass-confirm');
    const otpInp = document.getElementById('upg-otp-input');

    const savedName = userProfile.name && !userProfile.name.startsWith('Tamu #') ? userProfile.name : '';
    if (nameInp) nameInp.value = savedName;
    if (phoneInp) phoneInp.value = userProfile.phone || userProfile.whatsapp || '';
    if (emailInp) emailInp.value = userProfile.email || localStorage.getItem('vipercell_track_email') || '';
    if (passInp) passInp.value = '';
    if (passConfInp) passConfInp.value = '';
    if (otpInp) otpInp.value = '';

    window.backToUpgradeStep1();
    window.openModal('modal-upgrade-member');
};

window.backToUpgradeStep1 = function() {
    const step1 = document.getElementById('upgrade-step-1-form');
    const step2 = document.getElementById('upgrade-step-2-otp');
    if (step1) step1.style.display = 'block';
    if (step2) step2.style.display = 'none';
};

function startOtpResendCountdown(seconds = 60) {
    if (otpResendTimer) clearInterval(otpResendTimer);
    const resendBtn = document.getElementById('btn-resend-upg-otp');
    let remain = seconds;

    if (resendBtn) {
        resendBtn.disabled = true;
        resendBtn.innerHTML = `Kirim Ulang (<span id="upg-otp-countdown">${remain}</span>s)`;
    }

    otpResendTimer = setInterval(() => {
        remain--;
        const countSpan = document.getElementById('upg-otp-countdown');
        if (countSpan) countSpan.innerText = String(Math.max(0, remain));

        if (remain <= 0) {
            clearInterval(otpResendTimer);
            if (resendBtn) {
                resendBtn.disabled = false;
                resendBtn.innerHTML = `<i class="fa-solid fa-rotate-right"></i> Kirim Ulang OTP`;
            }
        }
    }, 1000);
}

window.requestUpgradeOtpEmail = async function(isResend = false) {
    const name = document.getElementById('upg-name')?.value.trim() || '';
    const whatsapp = document.getElementById('upg-phone')?.value.trim() || '';
    const email = document.getElementById('upg-email')?.value.trim().toLowerCase() || '';
    const password = document.getElementById('upg-pass')?.value || '';
    const passwordConfirm = document.getElementById('upg-pass-confirm')?.value || '';

    if (!name || !whatsapp || !email || !email.includes('@')) {
        window.customAlert('Data Belum Lengkap', 'Harap isi Nama Lengkap, Nomor WhatsApp, dan Alamat Email yang valid.', 'warning');
        return;
    }
    if (password.length < 6) {
        window.customAlert('Password Terlalu Pendek', 'Password baru minimal harus terdiri dari 6 karakter.', 'warning');
        return;
    }
    if (password !== passwordConfirm) {
        window.customAlert('Password Tidak Cocok', 'Konfirmasi password tidak sama dengan password baru.', 'warning');
        return;
    }

    const btn = isResend ? document.getElementById('btn-resend-upg-otp') : document.getElementById('btn-request-upgrade-otp');
    const ogHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Mengirim Kode OTP...</span>';
    }

    try {
        // Bangkitkan kode OTP 6 digit acak (berlaku 5 menit = 300.000 ms)
        const generatedOtp = String(Math.floor(100000 + Math.random() * 900000));
        pendingUpgradeState = {
            name,
            whatsapp,
            email,
            password,
            otpCode: generatedOtp,
            otpExpiresAt: Date.now() + 300000
        };

        await callUnifiedGasWebhook({
            action: 'SEND_OTP_EMAIL',
            email: email,
            to: email,
            otpCode: generatedOtp,
            otp: generatedOtp,
            userName: name,
            name: name,
            expiryMinutes: 5
        });

        const step1 = document.getElementById('upgrade-step-1-form');
        const step2 = document.getElementById('upgrade-step-2-otp');
        const targetLbl = document.getElementById('upg-otp-target-email');

        if (targetLbl) targetLbl.innerText = email;
        if (step1) step1.style.display = 'none';
        if (step2) step2.style.display = 'block';
        document.getElementById('upg-otp-input')?.focus();

        startOtpResendCountdown(60);
        window.showToast('Kode OTP Terkirim', `Cek kotak masuk atau folder spam email ${email}`, 'success');
    } catch (err) {
        console.warn("OTP Webhook Info:", err.message);
        if (err.message === 'WEBHOOK_NOT_CONFIGURED') {
            window.customAlert(
                'Webhook Email Belum Diatur',
                'URL Google Apps Script pengirim email belum diisi di Pengaturan Admin. Silakan hubungi Admin atau pastikan URL Webhook GAS sudah terpasang.',
                'warning'
            );
        } else {
            window.customAlert('Gagal Mengirim OTP', `${escapeHtml(err.message)}`, 'error');
        }
    } finally {
        if (btn && ogHtml && !isResend) {
            btn.disabled = false;
            btn.innerHTML = ogHtml;
        }
    }
};

window.verifyOtpAndUpgradeMember = async function() {
    if (isUpgradingAccount) return;

    const inputOtp = (document.getElementById('upg-otp-input')?.value || '').trim();
    if (!/^\d{6}$/.test(inputOtp)) {
        window.customAlert('Kode OTP Belum Lengkap', 'Masukkan 6 digit angka kode OTP yang dikirim ke email kamu.', 'warning');
        return;
    }

    if (!pendingUpgradeState.otpCode || Date.now() > pendingUpgradeState.otpExpiresAt) {
        window.customAlert('Kode OTP Kedaluwarsa', 'Masa berlaku kode OTP (5 menit) telah habis. Silakan klik tombol Kirim Ulang OTP.', 'error');
        return;
    }

    if (inputOtp !== pendingUpgradeState.otpCode) {
        window.customAlert('Kode OTP Salah', 'Kode OTP yang kamu masukkan tidak cocok. Silakan periksa kembali email kamu.', 'error');
        return;
    }

    const { name, whatsapp, email, password } = pendingUpgradeState;
    const btn = document.getElementById('btn-submit-upgrade');
    const ogHtml = btn ? btn.innerHTML : '';
    isUpgradingAccount = true;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Memverifikasi & Mengaitkan Akun...</span>';
    }

    try {
        await ensureAuthSession();
        const activeUser = auth.currentUser;
        let finalUid = activeUser ? activeUser.uid : null;

        if (activeUser && activeUser.isAnonymous && typeof activeUser.getIdToken === 'function') {
            const credential = EmailAuthProvider.credential(email, password);
            const usercred = await linkWithCredential(activeUser, credential);
            finalUid = usercred.user.uid;
            currentUser = usercred.user;
        } else {
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            finalUid = cred.user.uid;
            currentUser = cred.user;
        }

        // Migrasikan pesanan & riwayat chat jika sebelumnya memakai boundLegacyGuestUid
        if (boundLegacyGuestUid && boundLegacyGuestUid !== finalUid) {
            const oldOrders = orders.filter(o => o.userId === boundLegacyGuestUid);
            for (const ord of oldOrders) {
                await updateDoc(doc(db, pathOrders, ord.dbId), { userId: finalUid, userEmail: email, userPhone: whatsapp }).catch(() => {});
            }
            const oldChatSnap = await getDoc(doc(db, pathChats, boundLegacyGuestUid)).catch(() => null);
            if (oldChatSnap && oldChatSnap.exists()) {
                await setDoc(doc(db, pathChats, finalUid), {
                    ...oldChatSnap.data(),
                    uid: finalUid,
                    userInfo: name,
                    userEmail: email
                }, { merge: true }).catch(() => {});
                await deleteDoc(doc(db, pathChats, boundLegacyGuestUid)).catch(() => {});
            }
            await deleteDoc(doc(db, pathUsers, boundLegacyGuestUid)).catch(() => {});
        }

        const matchingOrders = orders.filter(o => o.userId === finalUid || (!o.userId && o.userEmail?.toLowerCase() === email.toLowerCase()));
        for (const ord of matchingOrders) {
            await updateDoc(doc(db, pathOrders, ord.dbId), { userId: finalUid, userEmail: email, userPhone: whatsapp }).catch(() => {});
        }

        const memberData = {
            uid: finalUid,
            name: name,
            phone: whatsapp,
            whatsapp: whatsapp,
            email: email,
            role: 'member',
            isAnonymous: false,
            isGuest: false,
            isBlocked: false,
            isDeleted: false,
            verified: true,
            emailVerified: true,
            deviceId: currentDeviceId,
            upgradedAt: Date.now(),
            createdAt: userProfile.createdAt || Date.now()
        };

        await setDoc(doc(db, pathUsers, finalUid), memberData, { merge: true });

        if (currentDeviceId) {
            setDoc(doc(db, pathDeviceLocks, currentDeviceId), {
                status: 'upgraded_to_member',
                role: 'member',
                uid: finalUid,
                updatedAt: Date.now()
            }, { merge: true }).catch(() => {});
        }

        boundLegacyGuestUid = null;
        pendingUpgradeState = { name: '', whatsapp: '', email: '', password: '', otpCode: '', otpExpiresAt: 0 };
        if (otpResendTimer) clearInterval(otpResendTimer);

        localStorage.removeItem('vipercell_anon_uid');
        localStorage.setItem('vipercell_anon_name', name);
        localStorage.setItem('vipercell_track_email', email);
        localStorage.setItem('vipercell_track_phone', whatsapp);
        localStorage.setItem('vipercell_active_session_mode', 'member');

        userProfile = memberData;
        window.closeModal('modal-upgrade-member');
        setAuthGateLock(false);
        applyUserSessionToUI();
        window.renderUserOrders();
        updateProfileStats();

        window.customAlert(
            'Upgrade Member Berhasil! 🎉',
            `Selamat <b>${escapeHtml(name)}</b>! Email kamu telah terverifikasi dengan OTP dan akunmu resmi menjadi <b>Member Terverifikasi</b>. Seluruh riwayat pesanan tersimpan permanen.`,
            'success'
        );
    } catch (error) {
        console.error("Upgrade Account Error:", error);
        if (error.code === 'auth/credential-already-in-use' || error.code === 'auth/email-already-in-use') {
            window.customAlert(
                'Email Sudah Terdaftar',
                'Email ini sudah terdaftar sebagai Member sebelumnya. Silakan gunakan email lain atau langsung Login ke akun Member Anda.',
                'warning'
            );
        } else {
            window.customAlert('Gagal Upgrade Akun', 'Terjadi kesalahan saat mengaitkan akun. Pastikan format email benar dan jaringan stabil.', 'error');
        }
    } finally {
        isUpgradingAccount = false;
        if (btn && ogHtml) {
            btn.disabled = false;
            btn.innerHTML = ogHtml;
        }
    }
};

window.upgradeAnonymousToMember = window.verifyOtpAndUpgradeMember;
/* ======================== END OF [FEATURE-02] ============================= */

// ==========================================
// JAMINAN SESI AUTH & SINKRONISASI PROFIL UI
// ==========================================
async function ensureAuthSession() {
    if (auth.currentUser) {
        currentUser = auth.currentUser;
        return currentUser;
    }
    try {
        const cred = await signInAnonymously(auth);
        currentUser = cred.user;
        return currentUser;
    } catch (err) {
        if (!currentDeviceId) await initDeviceIdentity();
        const fallbackUid = boundLegacyGuestUid || `anon_${currentDeviceId}`;
        currentUser = { uid: fallbackUid, isAnonymous: true, email: '' };
        return currentUser;
    }
}

async function syncUserProfileFromAuth(user) {
    currentUser = user;
    if (!user) return;

    const deletedList = Array.isArray(siteSettings.deletedUids) ? siteSettings.deletedUids : [];
    const effectiveUid = (user.isAnonymous && boundLegacyGuestUid && !deletedList.includes(boundLegacyGuestUid))
        ? boundLegacyGuestUid
        : user.uid;

    listenDeletedAccountStatus(effectiveUid);

    if (user.isAnonymous) {
        await saveMultiLayerToken('vipercell_anon_uid', effectiveUid);
        const shortId = effectiveUid.slice(-4).toUpperCase();
        const userDocRef = doc(db, pathUsers, effectiveUid);
        const userSnap = await getDoc(userDocRef).catch(() => null);

        if (userSnap && userSnap.exists()) {
            const data = userSnap.data();
            userProfile = {
                ...data,
                uid: effectiveUid,
                isAnonymous: true,
                isGuest: true,
                deviceId: currentDeviceId
            };
            if (data.name) localStorage.setItem('vipercell_anon_name', data.name);
        } else {
            const savedName = localStorage.getItem('vipercell_anon_name') || `Tamu #${shortId}`;
            userProfile = {
                uid: effectiveUid,
                authUid: user.uid,
                name: savedName,
                email: localStorage.getItem('vipercell_track_email') || '',
                phone: localStorage.getItem('vipercell_track_phone') || '',
                whatsapp: localStorage.getItem('vipercell_track_phone') || '',
                role: 'anonymous',
                isAnonymous: true,
                isGuest: true,
                isBlocked: false,
                isDeleted: false,
                deviceId: currentDeviceId,
                createdAt: Date.now()
            };
            await setDoc(userDocRef, userProfile, { merge: true }).catch(() => {});
        }
    } else {
        const userDocRef = doc(db, pathUsers, user.uid);
        const userSnap = await getDoc(userDocRef).catch(() => null);
        if (userSnap && userSnap.exists()) {
            const data = userSnap.data();
            userProfile = {
                ...data,
                uid: user.uid,
                email: data.email || user.email || '',
                phone: data.phone || data.whatsapp || '',
                whatsapp: data.whatsapp || data.phone || '',
                role: 'member',
                isAnonymous: false,
                isGuest: false
            };
        } else {
            userProfile = {
                uid: user.uid,
                name: user.displayName || user.email?.split('@')[0] || 'Member Vipercell',
                email: user.email || '',
                phone: '',
                whatsapp: '',
                role: 'member',
                isAnonymous: false,
                isGuest: false,
                isBlocked: false,
                isDeleted: false,
                deviceId: currentDeviceId,
                createdAt: Date.now()
            };
            await setDoc(userDocRef, userProfile, { merge: true }).catch(() => {});
        }
    }

    applyUserSessionToUI();
    window.renderUserOrders();
    updateProfileStats();
    checkChatUserState();
    listenUserChat();
}

function setupAuthStateListener() {
    onAuthStateChanged(auth, async (user) => {
        if (!isPreloaderFinished) return;
        currentUser = user;
        const sessionMode = localStorage.getItem('vipercell_active_session_mode');

        if (user && (!user.isAnonymous || sessionMode === 'guest')) {
            await syncUserProfileFromAuth(user);
            const restricted = await checkRealtimeAccountRestriction();
            if (!restricted) setAuthGateLock(false);
        } else if (!user && sessionMode !== 'guest') {
            userProfile = { name: '', email: '', phone: '', isGuest: true, isAnonymous: true };
            setAuthGateLock(true);
        }
    });
}

function applyUserSessionToUI() {
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    const isGuestSession = Boolean(currentUser && (currentUser.isAnonymous || userProfile.isGuest));

    const btnUpgradeHeader = document.getElementById('btn-upgrade-guest-header');
    const textPesananDesk = document.getElementById('nav-text-pesanan-desk');
    const textProfilDesk = document.getElementById('nav-text-profil-desk');
    const textProfilMob = document.getElementById('nav-text-profil-mob');

    const bannerUpgradeOrders = document.getElementById('guest-upgrade-banner-orders');
    const bannerUpgradeProfile = document.getElementById('guest-upgrade-banner-profile');
    const btnProfUpgrade = document.getElementById('btn-prof-upgrade-guest');
    const btnProfLogout = document.getElementById('btn-prof-logout-member');
    const textBtnLogout = document.getElementById('text-btn-logout');
    const secMemberBox = document.getElementById('prof-security-member-box');
    const secGuestBox = document.getElementById('prof-security-guest-box');

    const guestTrackSec = document.getElementById('guest-tracking-section');
    const emailGroupBuy = document.getElementById('buy-email-group');

    const statusBadge = document.getElementById('prof-email-status');
    const dispNameEl = document.getElementById('prof-display-name');
    const dispEmailEl = document.getElementById('prof-display-email');
    const avatarEl = document.getElementById('prof-avatar-initial');
    const profNameInp = document.getElementById('prof-name');
    const profEmailInp = document.getElementById('prof-email');
    const profPhoneInp = document.getElementById('prof-phone');

    if (isMember) {
        const finalEmail = userProfile.email || currentUser.email || '';
        const finalName = userProfile.name || finalEmail.split('@')[0] || 'Member Vipercell';
        const finalPhone = userProfile.phone || userProfile.whatsapp || '';

        if (btnUpgradeHeader) btnUpgradeHeader.style.display = 'none';
        if (textPesananDesk) textPesananDesk.innerText = 'Pesanan Saya';
        if (textProfilDesk) textProfilDesk.innerText = 'Profil Saya';
        if (textProfilMob) textProfilMob.innerText = 'Profil';

        if (bannerUpgradeOrders) bannerUpgradeOrders.style.display = 'none';
        if (bannerUpgradeProfile) bannerUpgradeProfile.style.display = 'none';
        if (btnProfUpgrade) btnProfUpgrade.style.display = 'none';
        if (btnProfLogout) btnProfLogout.style.display = 'inline-flex';
        if (textBtnLogout) textBtnLogout.innerText = 'Keluar Akun';
        if (secMemberBox) secMemberBox.style.display = 'block';
        if (secGuestBox) secGuestBox.style.display = 'none';

        if (guestTrackSec) guestTrackSec.style.display = 'none';
        if (emailGroupBuy) emailGroupBuy.style.display = 'none';

        if (statusBadge) {
            statusBadge.className = 'brutal-tag tag-success';
            statusBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> MEMBER RESMI';
        }
        if (dispNameEl) dispNameEl.innerText = finalName;
        if (dispEmailEl) dispEmailEl.innerText = finalEmail + (finalPhone ? ` • ${finalPhone}` : '');
        if (avatarEl) avatarEl.innerText = finalName.charAt(0).toUpperCase();

        if (profNameInp) profNameInp.value = finalName;
        if (profEmailInp) profEmailInp.value = finalEmail;
        if (profPhoneInp) profPhoneInp.value = finalPhone;

    } else if (isGuestSession) {
        const effectiveUid = boundLegacyGuestUid || currentUser.uid;
        const shortId = effectiveUid.slice(-4).toUpperCase();
        const guestName = userProfile.name || localStorage.getItem('vipercell_anon_name') || `Tamu #${shortId}`;
        const guestEmail = userProfile.email || localStorage.getItem('vipercell_track_email') || 'Belum dikaitkan (Sesi Anonim)';
        const guestPhone = userProfile.phone || userProfile.whatsapp || '';

        if (btnUpgradeHeader) btnUpgradeHeader.style.display = 'inline-flex';
        if (textPesananDesk) textPesananDesk.innerText = 'Lacak Pesanan';
        if (textProfilDesk) textProfilDesk.innerText = 'Akun Anonim';
        if (textProfilMob) textProfilMob.innerText = 'Akun';

        if (bannerUpgradeOrders) bannerUpgradeOrders.style.display = 'flex';
        if (bannerUpgradeProfile) bannerUpgradeProfile.style.display = 'flex';
        if (btnProfUpgrade) btnProfUpgrade.style.display = 'inline-flex';
        if (btnProfLogout) btnProfLogout.style.display = 'inline-flex';
        if (textBtnLogout) textBtnLogout.innerText = 'Keluar Sesi';
        if (secMemberBox) secMemberBox.style.display = 'none';
        if (secGuestBox) secGuestBox.style.display = 'block';

        if (guestTrackSec) guestTrackSec.style.display = 'block';
        if (emailGroupBuy) emailGroupBuy.style.display = 'block';

        if (statusBadge) {
            statusBadge.className = 'brutal-tag status-pending';
            statusBadge.innerHTML = `<i class="fa-solid fa-user-secret"></i> SESI ANONIM (#${escapeHtml(shortId)})`;
        }
        if (dispNameEl) dispNameEl.innerText = guestName;
        if (dispEmailEl) dispEmailEl.innerText = guestEmail;
        if (avatarEl) avatarEl.innerText = 'A';

        if (profNameInp) profNameInp.value = guestName;
        if (profEmailInp) profEmailInp.value = guestEmail;
        if (profPhoneInp) profPhoneInp.value = guestPhone;
    }
}

/* ============================================================================
 * [FEATURE-08 & FEATURE-09] VAULT AUTO-DELIVERY (PRIVATE & MULTI-QUOTA SHARING)
 * + SUBSCRIPTION DURATION TRACKER + ATOMIC FIRESTORE TRANSACTION
 * ============================================================================ */
function computeVariantAvailableStock(item) {
    if (!item) return null;
    if (Array.isArray(item.stockVault) && item.stockVault.length > 0) {
        return item.stockVault.reduce((sum, v) => {
            const maxQ = parseInt(v.maxQuota || item.defaultMaxQuota || 1, 10);
            const usedQ = parseInt(v.usedQuota || 0, 10);
            return sum + Math.max(0, maxQ - usedQ);
        }, 0);
    }
    if (typeof item.stockCount === 'number' && item.stockCount >= 0) {
        return item.stockCount;
    }
    return null;
}

async function tryAutoDeliverOrderFromVault(orderData, orderDbId) {
    if (!orderData || !orderDbId || deliveringOrderIds.has(orderDbId)) return;
    if (orderData.adminReply && orderData.adminReply.trim() !== '') return;

    const item = (orderData.items && orderData.items[0]) ? orderData.items[0] : null;
    if (!item) return;

    deliveringOrderIds.add(orderDbId);
    const neededQty = parseInt(item.qty || 1, 10);
    const durationDays = parseInt(item.durationDays || orderData.durationDays || 0, 10);
    const nowMs = Date.now();
    const subUpdates = durationDays > 0 ? {
        durationDays: durationDays,
        subscriptionStartAt: nowMs,
        subscriptionEndAt: nowMs + (durationDays * 86400000),
        subscriptionStatus: 'ACTIVE'
    } : {};

    try {
        // 1. Jika tipe manual atau top-up game, cukup pastikan durasi tercatat jika ada
        if (item.processType === 'manual' || item.type === 'game') {
            if (Object.keys(subUpdates).length > 0 && !orderData.subscriptionEndAt) {
                await updateDoc(doc(db, pathOrders, orderDbId), subUpdates).catch(() => {});
            }
            return;
        }

        let deliveredCredentialsText = '';

        // 2. Cek apakah produk menyimpan stockVault di dokumen products/{productDbId}
        if (item.productDbId) {
            const prodRef = doc(db, pathProducts, item.productDbId);
            try {
                await runTransaction(db, async (transaction) => {
                    const prodSnap = await transaction.get(prodRef);
                    if (!prodSnap.exists()) return;
                    const pData = prodSnap.data();

                    if (Array.isArray(pData.stockVault) && pData.stockVault.length > 0) {
                        const vault = [...pData.stockVault];
                        const exhausted = Array.isArray(pData.exhaustedVault) ? [...pData.exhaustedVault] : [];
                        const collectedCreds = [];

                        for (let q = 0; q < neededQty; q++) {
                            const availIdx = vault.findIndex(v => (parseInt(v.usedQuota || 0, 10)) < (parseInt(v.maxQuota || pData.defaultMaxQuota || 1, 10)));
                            if (availIdx === -1) break;

                            const slotItem = { ...vault[availIdx] };
                            const maxQ = parseInt(slotItem.maxQuota || pData.defaultMaxQuota || 1, 10);
                            const newUsed = parseInt(slotItem.usedQuota || 0, 10) + 1;
                            slotItem.usedQuota = newUsed;

                            const buyersArr = Array.isArray(slotItem.buyers) ? [...slotItem.buyers] : [];
                            buyersArr.push({
                                orderId: orderData.id,
                                buyerEmail: orderData.userEmail || '',
                                sentAt: new Date().toISOString()
                            });
                            slotItem.buyers = buyersArr;

                            collectedCreds.push(slotItem.credentials || slotItem.data || '');

                            if (newUsed >= maxQ && !slotItem.isReusable) {
                                exhausted.push(slotItem);
                                vault.splice(availIdx, 1);
                            } else {
                                vault[availIdx] = slotItem;
                            }
                        }

                        if (collectedCreds.length > 0) {
                            const remainingTotal = vault.reduce((acc, v) => acc + Math.max(0, (parseInt(v.maxQuota || pData.defaultMaxQuota || 1, 10)) - (parseInt(v.usedQuota || 0, 10))), 0);
                            transaction.update(prodRef, {
                                stockVault: vault,
                                exhaustedVault: exhausted,
                                stockCount: remainingTotal,
                                soldOut: remainingTotal <= 0
                            });
                            deliveredCredentialsText = collectedCreds.join('\n\n');
                        }
                    }
                });
            } catch (txErr) {
                console.warn("Product Vault Transaction Fallback:", txErr.message);
            }
        }

        // 3. Jika belum terkirim dari product.stockVault, ambil dari koleksi `stocks`
        if (!deliveredCredentialsText) {
            const targetBrand = item.brandName || item.name.split(' - ')[0];
            const exactItemName = item.exactItemName || item.name.replace(`(x${item.qty})`, '').trim();

            const q = query(
                collection(db, pathStocks),
                where("brand", "==", targetBrand),
                where("itemName", "==", exactItemName),
                where("status", "==", "Ready")
            );
            const snap = await getDocs(q).catch(() => null);

            if (snap && !snap.empty) {
                const reusableDoc = snap.docs.find(d => d.data().isReusable === true);
                if (reusableDoc) {
                    const rData = reusableDoc.data();
                    const parts = (rData.data || '').split('|');
                    deliveredCredentialsText = `[AKSES LAYANAN / TOOLS DIGITAL]\nEmail / Link : ${parts[0] || '-'}\nSandi / Kode : ${parts[1] || '-'}\nKeterangan   : ${parts[2] || '-'}`;
                    await updateDoc(doc(db, pathStocks, reusableDoc.id), {
                        sentCount: increment(neededQty),
                        lastSentAt: nowMs,
                        lastOrderId: orderData.id
                    }).catch(() => {});
                } else {
                    const collected = [];
                    for (const sDoc of snap.docs) {
                        if (collected.length >= neededQty) break;
                        const sData = sDoc.data();
                        const maxQ = parseInt(sData.maxQuota || 1, 10);
                        const usedQ = parseInt(sData.usedQuota || 0, 10);

                        if (usedQ < maxQ) {
                            const nextUsed = usedQ + 1;
                            const parts = (sData.data || '').split('|');
                            const slotLabel = maxQ > 1 ? ` (Slot Sharing #${nextUsed}/${maxQ})` : '';
                            collected.push(`[DETAIL AKUN ANDA${slotLabel}]\nEmail / ID : ${parts[0] || '-'}\nPassword   : ${parts[1] || '-'}\nKeterangan : ${parts[2] || '-'}`);

                            await updateDoc(doc(db, pathStocks, sDoc.id), {
                                usedQuota: nextUsed,
                                status: nextUsed >= maxQ ? 'Used' : 'Ready',
                                usedAt: nowMs,
                                orderId: orderData.id,
                                buyers: arrayUnion({
                                    orderId: orderData.id,
                                    buyerEmail: orderData.userEmail || '',
                                    sentAt: new Date(nowMs).toISOString()
                                })
                            }).catch(() => {});
                        }
                    }
                    if (collected.length > 0) {
                        deliveredCredentialsText = collected.join('\n\n');
                    }
                }
            }
        }

        if (deliveredCredentialsText) {
            const finalReply = `Terima kasih! Pembayaran Anda telah diverifikasi otomatis.\n\n${deliveredCredentialsText}\n\nSimpan bukti E-Receipt ini sebagai garansi resmi Vipercell.`;
            await updateDoc(doc(db, pathOrders, orderDbId), {
                status: 'SUCCESS',
                adminReply: finalReply,
                ...subUpdates
            }).catch(() => {});

            sendOrderReceiptAndAccountEmail({
                ...orderData,
                ...subUpdates,
                adminReply: finalReply
            }, finalReply);
        } else if (Object.keys(subUpdates).length > 0 && !orderData.subscriptionEndAt) {
            await updateDoc(doc(db, pathOrders, orderDbId), subUpdates).catch(() => {});
        }
    } catch (err) {
        console.error("Vault Auto-Delivery Error:", err);
    } finally {
        setTimeout(() => deliveringOrderIds.delete(orderDbId), 3000);
    }
}
/* ======================== END OF [FEATURE-08 & 09] ======================== */

// ==========================================
// REAL-TIME DATA LISTENER (FIRESTORE + MACRODROID MUTATIONS)
// ==========================================
let isListening = false;
function listenData() {
    if (isListening) return;
    isListening = true;
    
    onSnapshot(doc(db, pathSettings, 'mainConfig'), async (docSnap) => {
        if (docSnap.exists()) {
            const incoming = docSnap.data();
            siteSettings = { ...siteSettings, ...incoming };

            // 1. Cek jika ada sinyal pembayaran dari Simulator Admin (lastPaymentDetected)
            if (incoming.lastPaymentDetected && incoming.lastPaymentTimestamp) {
                const ageMs = Date.now() - Number(incoming.lastPaymentTimestamp);
                if (ageMs < 180000) {
                    checkClientPendingOrdersAgainstAmount(Number(incoming.lastPaymentDetected));
                }
            }

            // 2. Cek jika ada sinyal dari SERVER APPS SCRIP.JS (lastPaymentMutation)
            if (incoming.lastPaymentMutation && incoming.lastPaymentMutation.timestamp) {
                const mutObj = incoming.lastPaymentMutation;
                const mutAge = Date.now() - Number(mutObj.timestamp);
                if (mutAge < 180000) {
                    if (Array.isArray(mutObj.candidateAmounts) && mutObj.candidateAmounts.length > 0) {
                        mutObj.candidateAmounts.forEach(amt => checkClientPendingOrdersAgainstAmount(Number(amt)));
                    } else if (mutObj.amount) {
                        checkClientPendingOrdersAgainstAmount(Number(mutObj.amount));
                    }
                }
            }
        }
        isSettingsLoaded = true;
        window.applySettingsToUI();
        applyCustomPwaIcon();
        await checkRealtimeAccountRestriction();
    });

    // Listener langsung ke koleksi payment_mutations dari MacroDroid Webhook
    if (!activeListenersRegistry.mutations) {
        activeListenersRegistry.mutations = onSnapshot(collection(db, pathMutations), (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const mut = change.doc.data();
                    const mutTime = Number(mut.receivedAt || mut.createdAt || mut.timestamp || 0);
                    const mutAge = Date.now() - mutTime;
                    if (mutAge < 180000) {
                        if (Array.isArray(mut.candidateAmounts) && mut.candidateAmounts.length > 0) {
                            mut.candidateAmounts.forEach(amt => checkClientPendingOrdersAgainstAmount(Number(amt)));
                        } else if (mut.amount) {
                            checkClientPendingOrdersAgainstAmount(Number(mut.amount));
                        }
                    }
                }
            });
        }, () => {});
    }

    onSnapshot(collection(db, pathReviews), (snapshot) => {
        reviewsData = [];
        snapshot.forEach((docSnap) => { reviewsData.push({ dbId: docSnap.id, ...docSnap.data() }); });
        
        if (currentCheckoutBrand) window.renderReviewsUI();
        window.renderUserOrders();
    });

    onSnapshot(collection(db, pathOrders), (snapshot) => {
        let newOrders = [];
        const now = Date.now();
        const effectiveUid = boundLegacyGuestUid || currentUser?.uid || '';
        const savedEmail = (localStorage.getItem('vipercell_track_email') || '').toLowerCase();
        
        snapshot.forEach((docSnap) => {
            let data = { dbId: docSnap.id, ...docSnap.data() };
            const orderTime = new Date(data.date).getTime();
            const expiryLimitMs = data.expiresAt ? (data.expiresAt - orderTime) : 900000; // Default 15 menit
            const orderEmail = (data.userEmail || '').toLowerCase();
            const isMyOrder = (effectiveUid && data.userId === effectiveUid) ||
                              (currentUser && data.userId === currentUser.uid) ||
                              (savedEmail && savedEmail === orderEmail);
            
            if (data.status === 'UNPAID' || data.status === 'PENDING_PAYMENT') {
                if (now - orderTime > expiryLimitMs) { 
                    if (isMyOrder) {
                        updateDoc(doc(db, pathOrders, data.dbId), { status: 'EXPIRED' }).catch(() => {});
                    }
                    data.status = 'EXPIRED';
                }
            }

            // Jika status berubah menjadi PAID oleh MacroDroid GAS Webhook, ubah ke SUCCESS & picu pengiriman Vault
            if (data.status === 'PAID') {
                if (isMyOrder) {
                    updateDoc(doc(db, pathOrders, data.dbId), { status: 'SUCCESS' }).catch(() => {});
                }
                data.status = 'SUCCESS';
            }

            newOrders.push(data);

            if (isMyOrder && data.status === 'SUCCESS' && !data.adminReply) {
                tryAutoDeliverOrderFromVault(data, data.dbId);
            }

            if (!initialOrderLoad && isMyOrder) {
                let oldStatus = previousOrdersData[data.id];
                if (oldStatus && oldStatus !== 'SUCCESS' && data.status === 'SUCCESS') {
                    window.showPaymentSuccessAnimation(data.id);
                }
            }
            previousOrdersData[data.id] = data.status;
        });
        
        orders = newOrders.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Hanya render ulang katalog jika jumlah order sukses berubah (Optimasi Performa DOM)
        const currentSuccessCount = orders.filter(o => o.status === 'SUCCESS').length;
        if (currentSuccessCount !== lastSuccessOrderCount) {
            lastSuccessOrderCount = currentSuccessCount;
            window.renderBrands(currentBrandFilter);
        }
        
        const trackResult = document.getElementById('track-result');
        if (trackResult && trackResult.style.display === 'block') {
            const currentTrackId = document.getElementById('track-id')?.value.trim().toUpperCase();
            if (currentTrackId) window.trackOrder(); 
        }
        
        updateOrderBadges();
        window.renderUserOrders();
        updateProfileStats();
        if (currentCheckoutBrand) window.renderReviewsUI();
        initialOrderLoad = false;
    });

    onSnapshot(collection(db, pathProducts), (snapshot) => {
        products = [];
        snapshot.forEach((docSnap) => { products.push({ dbId: docSnap.id, ...docSnap.data() }); });
        rebuildGroupedBrands();
    });

    onSnapshot(collection(db, pathPromos), (snapshot) => {
        promos = [];
        snapshot.forEach((docSnap) => { promos.push({ dbId: docSnap.id, ...docSnap.data() }); });
        if (selectedProductForBuy) window.calculateDirectBuyTotal();
    });
}

async function checkClientPendingOrdersAgainstAmount(detectedAmount) {
    if (!detectedAmount || detectedAmount <= 0) return;
    const matchingUnpaid = orders.find(o =>
        (o.status === 'UNPAID' || o.status === 'PENDING_PAYMENT') &&
        (Number(o.finalTotal) === detectedAmount || Number(o.uniqueTotal) === detectedAmount)
    );
    if (matchingUnpaid) {
        await updateDoc(doc(db, pathOrders, matchingUnpaid.dbId), {
            status: 'SUCCESS'
        }).catch(() => {});
    }
}

function rebuildGroupedBrands() {
    groupedBrands = [];
    products.forEach(p => {
        const brandName = p.brand || p.name;
        const existing = groupedBrands.find(b => b.brandName === brandName);
        if (existing) {
            existing.items.push(p);
            if (p.imgUrlBase64 && !existing.imgUrlBase64) existing.imgUrlBase64 = p.imgUrlBase64;
            if (p.desc && !existing.desc) existing.desc = p.desc;
            if (p.requireAppTarget) existing.requireAppTarget = true;
            if (p.appTargetLabel && !existing.appTargetLabel) existing.appTargetLabel = p.appTargetLabel;
            if (p.appTargetPlaceholder && !existing.appTargetPlaceholder) existing.appTargetPlaceholder = p.appTargetPlaceholder;
        } else {
            groupedBrands.push({
                brandName: brandName,
                type: p.type || 'app',
                imgUrlBase64: p.imgUrlBase64 || '',
                desc: p.desc || '',
                isGangguan: p.isGangguan || false,
                requireAppTarget: Boolean(p.requireAppTarget || p.inputType === 'app_target' || p.inputType === 'custom'),
                appTargetLabel: p.appTargetLabel || '',
                appTargetPlaceholder: p.appTargetPlaceholder || '',
                items: [p]
            });
        }
    });

    const heroCatalogCount = document.getElementById('hero-live-catalog-count');
    if (heroCatalogCount && groupedBrands.length > 0) {
        heroCatalogCount.innerText = `${groupedBrands.length} Brand & ${products.length} Layanan Aktif`;
    }
    window.renderBrands(currentBrandFilter);
}

function updateOrderBadges() {
    const savedEmail = (localStorage.getItem('vipercell_track_email') || '').toLowerCase();
    const effectiveUid = boundLegacyGuestUid || currentUser?.uid || '';
    const hasActionNeeded = orders.some(o => {
        const isMine = (effectiveUid && o.userId === effectiveUid) ||
                       (currentUser && o.userId === currentUser.uid) ||
                       (savedEmail && o.userEmail?.toLowerCase() === savedEmail);
        return isMine && (o.status === 'UNPAID' || o.status === 'PENDING_PAYMENT' || o.status === 'PENDING');
    });
    const badgeDesk = document.getElementById('user-order-badge-desktop');
    if (badgeDesk) badgeDesk.style.display = hasActionNeeded ? 'block' : 'none';
    const badgeMob = document.getElementById('user-order-badge-mobile');
    if (badgeMob) badgeMob.style.display = hasActionNeeded ? 'block' : 'none';
}

/* ============================================================================
 * [FEATURE-07] FULL-SCREEN QRIS PAYMENT VIEW, EMVCo TAG 59 PARSER,
 * INSTANT ORDER CANCELLATION & MANUAL PAYMENT CHECKER
 * ============================================================================ */
function extractMerchantInfoFromQris(qrisString) {
    if (!qrisString || typeof qrisString !== 'string' || !qrisString.trim().startsWith('000201')) {
        return { merchantName: `${siteSettings.logoText || 'VIPER'}${siteSettings.logoAccent || 'CELL'} STORE`, merchantCity: 'INDONESIA' };
    }
    const raw = qrisString.trim();
    let index = 0;
    let merchantName = `${siteSettings.logoText || 'VIPER'}${siteSettings.logoAccent || 'CELL'} STORE`;
    let merchantCity = 'INDONESIA';

    while (index < raw.length - 4) {
        const tag = raw.substring(index, index + 2);
        const length = parseInt(raw.substring(index + 2, index + 4), 10);
        if (isNaN(length) || length <= 0 || index + 4 + length > raw.length) break;

        const value = raw.substring(index + 4, index + 4 + length);
        if (tag === '59' && value.trim()) merchantName = value.trim();
        if (tag === '60' && value.trim()) merchantCity = value.trim();
        if (tag === '63') break;
        index += 4 + length;
    }
    return { merchantName, merchantCity };
}

function calculateCRC16(payload) {
    let crc = 0xFFFF;
    for (let c = 0; c < payload.length; c++) {
        crc ^= payload.charCodeAt(c) << 8;
        for (let i = 0; i < 8; i++) {
            if ((crc & 0x8000) !== 0) {
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
            } else {
                crc = (crc << 1) & 0xFFFF;
            }
        }
    }
    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

function generateDynamicQRIS(staticQRIS, amount) {
    if (!staticQRIS) return "";
    let raw = staticQRIS.trim();

    const intAmount = Math.round(Number(amount) || 0);
    if (intAmount <= 0) return raw;
    const amountStr = intAmount.toString();
    const tag54 = `54${amountStr.length.toString().padStart(2, '0')}${amountStr}`;

    let pos = 0;
    let parsedTags = [];
    let isValidTLV = true;

    while (pos < raw.length) {
        if (pos + 4 > raw.length) { isValidTLV = false; break; }
        const tag = raw.substring(pos, pos + 2);
        const len = parseInt(raw.substring(pos + 2, pos + 4), 10);
        if (isNaN(len) || len < 0) { isValidTLV = false; break; }
        if (tag === '63') break;
        if (pos + 4 + len > raw.length) { isValidTLV = false; break; }
        const val = raw.substring(pos + 4, pos + 4 + len);
        parsedTags.push({ tag, val });
        pos += 4 + len;
    }

    if (isValidTLV && parsedTags.length > 3 && parsedTags[0].tag === '00') {
        let rebuilt = '';
        let amountInserted = false;

        for (let i = 0; i < parsedTags.length; i++) {
            let { tag, val } = parsedTags[i];
            if (tag === '01' && val === '11') val = '12';
            if (tag === '54') continue;
            if (!amountInserted && (tag === '58' || tag === '59' || parseInt(tag, 10) > 54)) {
                const hasCurrency = parsedTags.some(t => t.tag === '53');
                if (!hasCurrency) rebuilt += '5303360';
                rebuilt += tag54;
                amountInserted = true;
            }
            rebuilt += `${tag}${val.length.toString().padStart(2, '0')}${val}`;
        }

        if (!amountInserted) rebuilt += tag54;

        const payloadWithCrcHeader = `${rebuilt}6304`;
        const newCRC = calculateCRC16(payloadWithCrcHeader);
        return `${payloadWithCrcHeader}${newCRC}`;
    }

    let cleanStr = raw;
    const crcIndex = cleanStr.lastIndexOf('6304');
    if (crcIndex !== -1 && crcIndex >= cleanStr.length - 8) {
        cleanStr = cleanStr.substring(0, crcIndex);
    }
    cleanStr = cleanStr.replace(/^000201010211/, '000201010212');

    let finalPayload = '';
    const idx5802 = cleanStr.indexOf('5802ID');
    if (idx5802 !== -1) {
        finalPayload = cleanStr.substring(0, idx5802) + tag54 + cleanStr.substring(idx5802) + '6304';
    } else {
        finalPayload = cleanStr + tag54 + '6304';
    }
    return finalPayload + calculateCRC16(finalPayload);
}

// Penghancuran Elemen QRIS dari DOM saat waktu habis atau dibatalkan pembeli
function destroyExpiredQrisDom(orderDbId, reason = 'EXPIRED') {
    if (activeTimersRegistry.qrisCountdown) {
        clearInterval(activeTimersRegistry.qrisCountdown);
        activeTimersRegistry.qrisCountdown = null;
    }

    const qrContainer = document.getElementById('qrcode-container');
    const activeCard = document.getElementById('qris-fullscreen-card');
    const expiredCard = document.getElementById('qris-expired-state');
    const statusBadge = document.getElementById('qris-fs-status-badge');
    const timeText = document.getElementById('qris-time-left');
    const progressBar = document.getElementById('qris-fs-progress-bar');

    const expBadge = document.getElementById('qris-expired-badge');
    const expTitle = document.getElementById('qris-expired-title');
    const expDesc = document.getElementById('qris-expired-desc');

    // Hapus total canvas & img QRIS dari memori DOM agar tidak bisa di-scan
    if (qrContainer) qrContainer.innerHTML = '';
    if (activeCard) activeCard.style.display = 'none';
    if (expiredCard) expiredCard.style.display = 'block';

    const isCancelled = (reason === 'CANCELLED');
    if (statusBadge) {
        statusBadge.className = 'status-badge status-failed';
        statusBadge.innerText = isCancelled ? 'PESANAN DIBATALKAN' : 'WAKTU HABIS (EXPIRED)';
    }
    if (expBadge) {
        expBadge.innerText = isCancelled ? 'TRANSAKSI DIBATALKAN PEMBELI' : 'TRANSAKSI KEDALUWARSA (EXPIRED)';
    }
    if (expTitle) {
        expTitle.innerText = isCancelled ? 'Pesanan Telah Dibatalkan' : 'Waktu Pembayaran Habis';
    }
    if (expDesc) {
        expDesc.innerHTML = isCancelled
            ? 'Tagihan dan kode QRIS untuk pesanan ini telah <b>dibatalkan dan dinonaktifkan</b> atas permintaan kamu. Kamu bisa langsung membuat pesanan baru sekarang tanpa perlu menunggu!'
            : 'Kode QRIS untuk tagihan ini telah <b>dihapus dan dinonaktifkan secara permanen</b> demi keamanan transaksi. Mohon jangan melakukan transfer ke kode QR sebelumnya.';
    }

    if (timeText) timeText.innerText = '00:00';
    if (progressBar) {
        progressBar.style.width = '0%';
        progressBar.style.backgroundColor = 'var(--danger)';
    }

    if (orderDbId && !isCancelled) {
        updateDoc(doc(db, pathOrders, orderDbId), { status: 'EXPIRED' }).catch(() => {});
    }
}

// FITUR BARU: BATALKAN PESANAN AKTIF TANPA TUNGGU EXPIRED 15 MENIT
window.cancelActiveOrder = function(explicitDbId = null) {
    if (isCancellingOrder) return;
    const targetDbId = explicitDbId || currentCheckoutSession?.dbId;
    if (!targetDbId) {
        window.customAlert('Tidak Ada Tagihan', 'Tidak ditemukan sesi pesanan aktif untuk dibatalkan.', 'warning');
        return;
    }

    const orderObj = orders.find(o => o.dbId === targetDbId);
    const invLabel = orderObj ? orderObj.id : (currentCheckoutSession?.id || 'Pesanan Ini');

    window.openConfirm(
        'Batalkan Pesanan Ini?',
        `Apakah kamu yakin ingin membatalkan tagihan <b>#${escapeHtml(invLabel)}</b> sekarang?<br><br><small style="color:var(--text-muted);">Setelah dibatalkan, kode pembayaran ini tidak berlaku lagi dan kamu bisa langsung membuat pesanan baru tanpa menunggu 15 menit.</small>`,
        async (confirmed) => {
            if (!confirmed) return;
            isCancellingOrder = true;

            const btnCancelQris = document.getElementById('btn-cancel-qris-order');
            const btnCancelCash = document.getElementById('btn-cancel-cash-order');
            if (btnCancelQris) {
                btnCancelQris.disabled = true;
                btnCancelQris.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Membatalkan...';
            }
            if (btnCancelCash) {
                btnCancelCash.disabled = true;
                btnCancelCash.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Membatalkan...';
            }

            try {
                // Coba set status ke CANCELLED, jika Firestore Rules lama belum diupdate, fallback ke EXPIRED
                try {
                    await updateDoc(doc(db, pathOrders, targetDbId), { status: 'CANCELLED' });
                    if (orderObj) orderObj.status = 'CANCELLED';
                } catch (ruleErr) {
                    await updateDoc(doc(db, pathOrders, targetDbId), { status: 'EXPIRED' });
                    if (orderObj) orderObj.status = 'EXPIRED';
                }

                window.closeModal('modal-cash-barcode');
                window.closeModal('modal-order-detail');

                const activeTab = document.querySelector('.main-tab-content.active');
                if (activeTab && activeTab.id === 'tab-payment-qris') {
                    destroyExpiredQrisDom(targetDbId, 'CANCELLED');
                }

                updateOrderBadges();
                window.renderUserOrders();
                window.showToast('Pesanan Dibatalkan', `Tagihan #${invLabel} berhasil dibatalkan. Silakan buat pesanan baru.`, 'info');
            } catch (err) {
                console.error("Cancel Order Error:", err);
                window.customAlert('Gagal Membatalkan', 'Terjadi kendala jaringan saat membatalkan pesanan. Silakan coba lagi.', 'error');
            } finally {
                isCancellingOrder = false;
                if (btnCancelQris) {
                    btnCancelQris.disabled = false;
                    btnCancelQris.innerHTML = '<i class="fa-solid fa-ban"></i> Batalkan Pesanan Ini';
                }
                if (btnCancelCash) {
                    btnCancelCash.disabled = false;
                    btnCancelCash.innerHTML = '<i class="fa-solid fa-ban"></i> Batalkan Tiket Pesanan Ini';
                }
            }
        },
        'warning'
    );
};

// FITUR BARU: TOMBOL CEK STATUS PEMBAYARAN QRIS INSTAN
window.manualCheckQrisPaymentStatus = async function() {
    if (isCheckingPaymentNow || !currentCheckoutSession?.dbId) return;
    isCheckingPaymentNow = true;

    const btn = document.getElementById('btn-check-payment-now');
    const ogHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengecek...';
    }

    try {
        const orderRef = doc(db, pathOrders, currentCheckoutSession.dbId);
        const [orderSnap, settingsSnap] = await Promise.all([
            getDoc(orderRef).catch(() => null),
            getDoc(doc(db, pathSettings, 'mainConfig')).catch(() => null)
        ]);

        if (orderSnap && orderSnap.exists()) {
            const oData = orderSnap.data();
            if (oData.status === 'SUCCESS' || oData.status === 'PAID') {
                if (oData.status === 'PAID') {
                    await updateDoc(orderRef, { status: 'SUCCESS' }).catch(() => {});
                }
                window.showPaymentSuccessAnimation(oData.id);
                return;
            }
        }

        if (settingsSnap && settingsSnap.exists()) {
            const sData = settingsSnap.data();
            const targetNominal = Number(currentCheckoutSession.finalTotal || 0);
            const mutObj = sData.lastPaymentMutation;

            if (mutObj && mutObj.timestamp && (Date.now() - Number(mutObj.timestamp) < 600000)) {
                const candidates = Array.isArray(mutObj.candidateAmounts) ? mutObj.candidateAmounts.map(Number) : [Number(mutObj.amount || 0)];
                if (candidates.includes(targetNominal)) {
                    await updateDoc(orderRef, { status: 'SUCCESS' }).catch(() => {});
                    window.showPaymentSuccessAnimation(currentCheckoutSession.id);
                    return;
                }
            }
        }

        window.showToast('Belum Ada Mutasi Masuk', `Sistem masih menunggu transfer tepat Rp${(currentCheckoutSession.finalTotal || 0).toLocaleString('id-ID')}.`, 'info');
    } catch (err) {
        window.showToast('Gagal Mengecek', 'Periksa koneksi internet kamu dan coba lagi.', 'warning');
    } finally {
        isCheckingPaymentNow = false;
        if (btn && ogHtml) {
            btn.disabled = false;
            btn.innerHTML = ogHtml;
        }
    }
};

window.startQrisTimer = function(orderDate, orderDbId = null) {
    if (activeTimersRegistry.qrisCountdown) {
        clearInterval(activeTimersRegistry.qrisCountdown);
    }

    const timeText = document.getElementById('qris-time-left');
    const progressBar = document.getElementById('qris-fs-progress-bar');
    const pillBox = document.getElementById('qris-timer-pill-box');
    if (!timeText) return;

    const totalDurationMs = 900000; // 15 Menit (900.000 ms)
    const startTime = new Date(orderDate).getTime();

    const updateTick = () => {
        const elapsed = Date.now() - startTime;
        const remain = totalDurationMs - elapsed;

        if (remain <= 0) {
            destroyExpiredQrisDom(orderDbId || currentCheckoutSession?.dbId, 'EXPIRED');
            return;
        }

        const m = Math.floor(remain / 60000);
        const s = Math.floor((remain % 60000) / 1000);
        timeText.innerText = `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;

        const pct = Math.max(0, Math.min(100, (remain / totalDurationMs) * 100));
        if (progressBar) {
            progressBar.style.width = `${pct}%`;
            if (remain < 60000) {
                progressBar.style.backgroundColor = 'var(--danger)';
            } else if (remain < 300000) {
                progressBar.style.backgroundColor = 'var(--warning)';
            } else {
                progressBar.style.backgroundColor = 'var(--success)';
            }
        }

        if (pillBox) {
            if (remain < 60000) {
                pillBox.className = 'qris-countdown-pill timer-danger';
            } else if (remain < 300000) {
                pillBox.className = 'qris-countdown-pill timer-warn';
            } else {
                pillBox.className = 'qris-countdown-pill';
            }
        }
    };

    updateTick();
    activeTimersRegistry.qrisCountdown = setInterval(updateTick, 1000);
};

window.openQRISModal = function() {
    window.closeModal('modal-order-detail');
    if (!currentCheckoutSession) return;

    const qrContainer = document.getElementById('qrcode-container');
    const qrErrorMsg = document.getElementById('qris-error-msg');
    const invIdEl = document.getElementById('pay-modal-invoice-id');
    const itemTitleEl = document.getElementById('qris-fs-item-title');
    const merchantNameEl = document.getElementById('qris-merchant-name');
    const merchantCityEl = document.getElementById('qris-merchant-city');
    const activeCard = document.getElementById('qris-fullscreen-card');
    const expiredCard = document.getElementById('qris-expired-state');
    const statusBadge = document.getElementById('qris-fs-status-badge');

    if (qrContainer) qrContainer.innerHTML = '';
    if (activeCard) activeCard.style.display = 'grid';
    if (expiredCard) expiredCard.style.display = 'none';
    if (statusBadge) {
        statusBadge.className = 'status-badge status-pending';
        statusBadge.innerText = 'MENUNGGU PEMBAYARAN';
    }

    if (invIdEl) invIdEl.innerText = `#${currentCheckoutSession.id}`;
    if (itemTitleEl) itemTitleEl.innerText = currentCheckoutSession.itemName || 'Pesanan Vipercell';

    const qrisBaseString = (siteSettings.qrisStringData || '').trim();
    const { merchantName, merchantCity } = extractMerchantInfoFromQris(qrisBaseString);
    if (merchantNameEl) merchantNameEl.innerText = merchantName;
    if (merchantCityEl) merchantCityEl.innerText = merchantCity ? `LOKASI: ${merchantCity}` : 'STANDAR QRIS NASIONAL';

    const orderObj = orders.find(o => o.dbId === currentCheckoutSession.dbId);
    if (orderObj && (orderObj.status === 'CANCELLED' || orderObj.status === 'EXPIRED')) {
        window.switchMainTab('payment-qris');
        destroyExpiredQrisDom(currentCheckoutSession.dbId, orderObj.status);
        return;
    }

    const orderAgeMs = Date.now() - new Date(currentCheckoutSession.date).getTime();
    if (orderAgeMs >= 900000) {
        window.switchMainTab('payment-qris');
        destroyExpiredQrisDom(currentCheckoutSession.dbId, 'EXPIRED');
        return;
    }

    if (qrisBaseString && currentCheckoutSession.finalTotal > 0 && qrContainer) {
        const dynamicQRIS = generateDynamicQRIS(qrisBaseString, currentCheckoutSession.finalTotal);
        new QRCode(qrContainer, {
            text: dynamicQRIS,
            width: 235,
            height: 235,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
        qrContainer.style.display = 'flex';
        if (qrErrorMsg) qrErrorMsg.style.display = 'none';
    } else if (qrContainer && qrErrorMsg) {
        qrContainer.style.display = 'none';
        qrErrorMsg.style.display = 'flex';
        qrErrorMsg.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>String QRIS belum diatur di Admin atau nominal tidak valid.</span>`;
    }

    const guestWarning = document.getElementById('pay-modal-guest-warning');
    if (guestWarning) {
        guestWarning.style.display = userProfile.isGuest ? 'block' : 'none';
    }

    const totalDisp = document.getElementById('pay-total-display');
    if (totalDisp) totalDisp.innerText = `Rp${currentCheckoutSession.finalTotal.toLocaleString('id-ID')}`;

    window.switchMainTab('payment-qris');
    if (currentCheckoutSession.date) {
        window.startQrisTimer(currentCheckoutSession.date, currentCheckoutSession.dbId);
    }
};

window.recreateExpiredOrder = function() {
    if (currentCheckoutBrand) {
        window.openDirectBuyModal(currentCheckoutBrand.brandName);
    } else if (currentCheckoutSession && currentCheckoutSession.brandName) {
        window.openDirectBuyModal(currentCheckoutSession.brandName);
    } else {
        window.switchMainTab('katalog');
    }
};
/* ======================== END OF [FEATURE-07] ============================= */

/* ============================================================================
 * [FEATURE-04 & FEATURE-05] KATALOG SMART ACCORDION, FILTER VARIAN (DEBOUNCED),
 * DESKRIPSI VARIAN OPSIONAL & INPUT DATA TUJUAN APP OPSIONAL
 * ============================================================================ */
window.filterBrands = function(type, btnEl) {
    currentBrandFilter = type;
    isCatalogExpanded = false;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    window.renderBrands(type);
};

window.handleCatalogSearch = function() {
    const inp = document.getElementById('catalog-search-input');
    const clearBtn = document.getElementById('btn-clear-search');
    const val = inp ? inp.value.trim().toLowerCase() : '';
    if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';

    if (catalogSearchDebounceTimer) clearTimeout(catalogSearchDebounceTimer);
    catalogSearchDebounceTimer = setTimeout(() => {
        currentSearchQuery = val;
        window.renderBrands(currentBrandFilter);
    }, 110);
};

window.clearCatalogSearch = function() {
    const inp = document.getElementById('catalog-search-input');
    const clearBtn = document.getElementById('btn-clear-search');
    if (inp) inp.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    currentSearchQuery = '';
    window.renderBrands(currentBrandFilter);
};

window.toggleCatalogShowAll = function() {
    isCatalogExpanded = !isCatalogExpanded;
    window.renderBrands(currentBrandFilter);
};

window.renderBrands = function(filter = currentBrandFilter) {
    const grid = document.getElementById('brand-grid');
    const moreWrap = document.getElementById('catalog-more-wrap');
    const moreBtn = document.getElementById('btn-catalog-more');
    if (!grid) return;
    
    let filteredBrands = filter === 'all' ? [...groupedBrands] : groupedBrands.filter(b => b.type === filter);

    if (currentSearchQuery) {
        filteredBrands = filteredBrands.filter(b =>
            b.brandName.toLowerCase().includes(currentSearchQuery) ||
            (b.desc && b.desc.toLowerCase().includes(currentSearchQuery)) ||
            b.items.some(i => i.name.toLowerCase().includes(currentSearchQuery) || (i.variantDesc && i.variantDesc.toLowerCase().includes(currentSearchQuery)))
        );
    }

    filteredBrands = filteredBrands.map(b => {
        const soldCount = orders.filter(o => o.status === 'SUCCESS' && o.items && o.items[0]?.brandName === b.brandName)
                                .reduce((sum, o) => sum + (o.items[0].qty || 1), 0);
        const prices = b.items.map(i => i.priceNum || 0).filter(p => p > 0);
        const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
        return { ...b, soldCount, minPrice };
    });

    const sortMode = document.getElementById('catalog-sort-select')?.value || 'popular';
    if (sortMode === 'popular') {
        filteredBrands.sort((a, b) => b.soldCount - a.soldCount);
    } else if (sortMode === 'price_asc') {
        filteredBrands.sort((a, b) => a.minPrice - b.minPrice);
    } else if (sortMode === 'name_asc') {
        filteredBrands.sort((a, b) => a.brandName.localeCompare(b.brandName));
    }
    
    if (filteredBrands.length === 0) { 
        grid.innerHTML = `<div class="brutal-empty-box" style="grid-column: 1/-1;"><i class="fa-solid fa-box-open" style="font-size:2rem; display:block; margin-bottom:8px;"></i>Produk yang kamu cari belum tersedia di kategori ini.</div>`; 
        if (moreWrap) moreWrap.style.display = 'none';
        return; 
    }

    const INITIAL_CATALOG_LIMIT = 6;
    const shouldCollapse = !currentSearchQuery && filteredBrands.length > INITIAL_CATALOG_LIMIT;
    const visibleBrands = (shouldCollapse && !isCatalogExpanded)
        ? filteredBrands.slice(0, INITIAL_CATALOG_LIMIT)
        : filteredBrands;

    if (moreWrap && moreBtn) {
        if (shouldCollapse) {
            const hiddenCount = filteredBrands.length - INITIAL_CATALOG_LIMIT;
            moreWrap.style.display = 'block';
            moreBtn.innerHTML = isCatalogExpanded
                ? `<i class="fa-solid fa-minus"></i> <span>Sembunyikan Sebagian</span> <i class="fa-solid fa-chevron-up"></i>`
                : `<i class="fa-solid fa-plus"></i> <span>Lihat ${hiddenCount} Produk Selengkapnya</span> <i class="fa-solid fa-chevron-down"></i>`;
        } else {
            moreWrap.style.display = 'none';
        }
    }
    
    let html = '';
    visibleBrands.forEach((b, idx) => {
        const safeJsBrand = escapeJsStr(b.brandName);
        const safeHtmlBrand = escapeHtml(b.brandName);
        
        let tagClass = 'tag-app';
        let tagLabel = 'APLIKASI';
        if (b.isGangguan) {
            tagClass = 'tag-maint';
            tagLabel = 'GANGGUAN';
        } else if (b.type === 'game') {
            tagClass = 'tag-game';
            tagLabel = 'GAME';
        } else if (b.type === 'tools') {
            tagClass = 'tag-tools';
            tagLabel = 'TOOLS';
        }

        const imgHtml = b.imgUrlBase64 
             ? `<img src="${b.imgUrlBase64}" alt="${safeHtmlBrand}" loading="lazy" decoding="async">` 
             : `<div style="width:100%; height:100%; background:var(--primary); display:flex; align-items:center; justify-content:center; font-size:1.9rem; font-weight:900; color:#ffffff;">${safeHtmlBrand.charAt(0)}</div>`;
             
        const clickAction = b.isGangguan 
            ? `window.customAlert('Maintenance Server', 'Mohon maaf, layanan produk ini sedang dalam pemeliharaan jaringan.', 'warning')` 
            : `window.openDirectBuyModal('${safeJsBrand}')`;
        const cssClass = b.isGangguan ? 'brand-card stagger-card sold-out' : 'brand-card stagger-card';
        const animDelay = `${Math.min(idx * 30, 240)}ms`;
        
        html += `
            <div class="${cssClass}" style="animation-delay: ${animDelay};" onclick="${clickAction}">
                <div>
                    <div class="brand-card-top">
                        <div class="brand-img-wrapper">
                            ${imgHtml}
                        </div>
                        <span class="brand-top-tag ${tagClass}">${tagLabel}</span>
                    </div>
                    <div class="brand-content">
                        <h3>${safeHtmlBrand}</h3>
                        <div class="brand-start-price">Mulai <b>Rp${b.minPrice.toLocaleString('id-ID')}</b></div>
                    </div>
                </div>
                <div class="brand-meta-footer">
                    <span class="sold-pill"><i class="fa-solid fa-fire"></i> ${b.soldCount} Terjual</span>
                    <span class="buy-arrow-pill">Beli <i class="fa-solid fa-arrow-right"></i></span>
                </div>
            </div>`;
    });
    grid.innerHTML = html;
};

// Render Daftar Varian di Halaman Checkout dengan Debounce & Smart Accordion
window.filterCheckoutVariants = function() {
    const inp = document.getElementById('variant-quick-search');
    const val = inp ? inp.value.trim().toLowerCase() : '';
    if (variantSearchDebounceTimer) clearTimeout(variantSearchDebounceTimer);
    variantSearchDebounceTimer = setTimeout(() => {
        currentVariantSearchQuery = val;
        renderCheckoutVariantCards();
    }, 90);
};

window.toggleVariantsShowAll = function() {
    isVariantsExpanded = !isVariantsExpanded;
    renderCheckoutVariantCards();
};

function renderCheckoutVariantCards() {
    if (!currentCheckoutBrand) return;
    const itemGrid = document.getElementById('buy-item-grid');
    const moreBtn = document.getElementById('btn-items-more');
    const searchWrap = document.getElementById('variant-search-wrap');
    if (!itemGrid) return;

    const allSortedItems = [...currentCheckoutBrand.items].sort((a, b) => (a.priceNum || 0) - (b.priceNum || 0));

    if (searchWrap) {
        searchWrap.style.display = allSortedItems.length > 6 ? 'block' : 'none';
    }

    let filteredItems = allSortedItems;
    if (currentVariantSearchQuery) {
        filteredItems = allSortedItems.filter(item =>
            (item.name || '').toLowerCase().includes(currentVariantSearchQuery) ||
            (item.variantDesc || item.description || '').toLowerCase().includes(currentVariantSearchQuery)
        );
    }

    const INITIAL_VARIANT_LIMIT = 6;
    const shouldCollapse = !currentVariantSearchQuery && filteredItems.length > INITIAL_VARIANT_LIMIT;
    const visibleItems = (shouldCollapse && !isVariantsExpanded)
        ? filteredItems.slice(0, INITIAL_VARIANT_LIMIT)
        : filteredItems;

    if (moreBtn) {
        if (shouldCollapse) {
            const hiddenCount = filteredItems.length - INITIAL_VARIANT_LIMIT;
            moreBtn.style.display = 'inline-flex';
            moreBtn.innerHTML = isVariantsExpanded
                ? `<i class="fa-solid fa-minus"></i> <span>Sembunyikan Sebagian Varian</span> <i class="fa-solid fa-chevron-up"></i>`
                : `<i class="fa-solid fa-plus"></i> <span>Lihat ${hiddenCount} Varian Selengkapnya</span> <i class="fa-solid fa-chevron-down"></i>`;
        } else {
            moreBtn.style.display = 'none';
        }
    }

    if (visibleItems.length === 0) {
        itemGrid.innerHTML = `<div class="brutal-empty-box" style="grid-column: 1/-1; padding: 1.4rem;">Varian paket tidak ditemukan.</div>`;
        return;
    }

    let html = '';
    visibleItems.forEach((item, idx) => {
        const normalPrice = item.priceNum || 0;
        const availQuota = computeVariantAvailableStock(item);
        const hasStockQuota = typeof availQuota === 'number' && availQuota >= 0;
        const isQuotaEmpty = hasStockQuota && availQuota === 0;
        const isSold = Boolean(item.soldOut || isQuotaEmpty);
        const isSelected = selectedProductForBuy && selectedProductForBuy.dbId === item.dbId;

        const procBadge = item.processType === 'manual'
            ? '<small style="font-size:0.62rem; font-weight:800; color:var(--warning);">MANUAL</small>'
            : '<small style="font-size:0.62rem; font-weight:800; color:var(--success);"><i class="fa-solid fa-bolt"></i> INSTAN</small>';

        const varDescText = (item.variantDesc || item.description || '').trim();
        const varDescHtml = varDescText
            ? `<div class="item-variant-desc">${escapeHtml(varDescText)}</div>`
            : '';

        let badgesHtml = '';
        if (item.stockMode === 'SHARING' || (item.defaultMaxQuota && item.defaultMaxQuota > 1)) {
            badgesHtml += `<span class="item-sharing-pill"><i class="fa-solid fa-users"></i> SHARING</span>`;
        }
        if (item.durationDays && item.durationDays > 0) {
            badgesHtml += `<span class="item-duration-pill"><i class="fa-regular fa-clock"></i> ${item.durationDays} Hari</span>`;
        }
        if (hasStockQuota) {
            badgesHtml += `<span class="item-stock-pill"><i class="fa-solid fa-layer-group"></i> Sisa: <b>${availQuota}</b></span>`;
        }

        const animDelay = `${Math.min(idx * 25, 200)}ms`;

        html += `
            <div class="item-card stagger-card ${isSold ? 'sold-out' : ''} ${isSelected ? 'selected' : ''}" style="animation-delay:${animDelay};" id="buy-card-${item.dbId}" onclick="${isSold ? '' : `window.selectItemToBuy('${item.dbId}')`}">
                <div>
                    <h4>${escapeHtml(item.name)}</h4>
                    ${varDescHtml}
                    ${badgesHtml ? `<div class="item-badges-row">${badgesHtml}</div>` : ''}
                </div>
                <div class="price-wrapper">
                    <span class="price-normal">Rp${normalPrice.toLocaleString('id-ID')}</span>
                    ${procBadge}
                </div>
            </div>
        `;
    });
    itemGrid.innerHTML = html;
}

window.openDirectBuyModal = function(brandName) {
    const brandObj = groupedBrands.find(b => b.brandName === brandName);
    if (!brandObj) return;
    if (brandObj.isGangguan) {
        window.customAlert('Maintenance Server', 'Mohon maaf, produk sedang gangguan.', 'warning');
        return;
    }
    
    currentCheckoutBrand = brandObj;
    selectedProductForBuy = null;
    appliedPromo = null;
    isVariantsExpanded = false;
    currentVariantSearchQuery = '';
    
    const varSearchInp = document.getElementById('variant-quick-search');
    if (varSearchInp) varSearchInp.value = '';
    document.getElementById('buy-promo-code').value = '';
    document.getElementById('buy-promo-msg').innerHTML = '';
    document.getElementById('buy-qty').value = 1;
    document.getElementById('manual-warning-msg').style.display = 'none';
    document.getElementById('cash-warning-msg').style.display = 'none';
    const qtySub = document.getElementById('buy-qty-subtext');
    if (qtySub) qtySub.innerText = 'Kuantitas item';
    window.switchBuyModalTab('form');
    
    document.getElementById('buy-detail-fields').style.maxHeight = '220px';
    document.getElementById('buy-desc-fade').style.display = 'block';
    document.getElementById('btn-desc-more').style.display = 'block';

    document.getElementById('buy-brand-name').innerText = brandObj.brandName;
    let badgeTypeLabel = 'APLIKASI PREMIUM';
    if (brandObj.type === 'game') badgeTypeLabel = 'TOP UP GAME';
    else if (brandObj.type === 'tools') badgeTypeLabel = 'TOOLS DIGITAL';
    document.getElementById('buy-brand-badge').innerText = badgeTypeLabel;
    
    const totalSold = orders.filter(o => o.status === 'SUCCESS' && o.items && o.items[0]?.brandName === brandObj.brandName)
                            .reduce((sum, o) => sum + (o.items[0].qty || 1), 0);
    document.getElementById('buy-brand-sold').innerText = `${totalSold} Terjual`;
    
    const imgEl = document.getElementById('buy-brand-img');
    if (brandObj.imgUrlBase64) { imgEl.src = brandObj.imgUrlBase64; imgEl.style.display = 'block'; } 
    else { imgEl.style.display = 'none'; }
    
    renderCheckoutVariantCards();
    
    const fields = document.getElementById('buy-detail-fields');
    const firstItem = brandObj.items[0] || {};
    let inpType = firstItem.inputType || (brandObj.type === 'game' ? 'id_zone' : 'none');
    const requireAppTarget = Boolean(brandObj.requireAppTarget || firstItem.requireAppTarget || (brandObj.type === 'app' && inpType && inpType !== 'none'));

    let fmtDesc = brandObj.desc ? escapeHtml(brandObj.desc).replace(/\n/g, '<br>') : '';
    let extraDesc = fmtDesc ? `<div style="font-size:0.84rem; font-weight:600; color:var(--text); background:var(--bg); padding:12px; border-radius:10px; border:1.5px solid var(--border); margin-bottom:12px;"><i class="fa-solid fa-circle-info text-primary" style="margin-right:6px;"></i> ${fmtDesc}</div>` : '';
    
    if (!fmtDesc || brandObj.desc.length < 130) {
        document.getElementById('buy-desc-fade').style.display = 'none';
        document.getElementById('btn-desc-more').style.display = 'none';
        document.getElementById('buy-detail-fields').style.maxHeight = '1200px';
    }

    if (brandObj.type === 'app' && requireAppTarget) {
        const customLbl = firstItem.appTargetLabel || brandObj.appTargetLabel || 'Masukkan Email / Akun Tujuan (Untuk Invite / Upgrade)';
        const customPh = firstItem.appTargetPlaceholder || brandObj.appTargetPlaceholder || 'Contoh: emailkamu@gmail.com / Username Akun';
        fields.innerHTML = `
            ${extraDesc}
            <div class="form-group" style="margin-bottom:0;">
                <label for="buy-id"><i class="fa-solid fa-at text-primary"></i> ${escapeHtml(customLbl)} <span style="color:var(--danger)">*</span></label>
                <input type="text" id="buy-id" class="form-control" placeholder="${escapeHtml(customPh)}" required>
                <small class="form-helper" style="color:var(--danger);">*Pastikan alamat Email atau akun tujuan yang dimasukkan sudah benar.</small>
            </div>`;
    } else if (brandObj.type === 'game' || (brandObj.type === 'tools' && inpType && inpType !== 'none')) {
        if (inpType === 'id_only') {
            fields.innerHTML = `
                ${extraDesc}
                <div class="form-group" style="margin-bottom:0;">
                    <label for="buy-id">ID Player / UID Tujuan <span style="color:var(--danger)">*</span></label>
                    <input type="text" id="buy-id" class="form-control" placeholder="Masukkan ID Player (Contoh: 123456789)" required>
                    <small class="form-helper" style="color:var(--danger);">*Pastikan ID sudah benar.</small>
                </div>`;
        } else if (inpType === 'custom' || inpType === 'roblox') {
            fields.innerHTML = `
                ${extraDesc}
                <div class="form-group" style="margin-bottom:0;">
                    <label for="buy-id">Username / Email / Link Tujuan <span style="color:var(--danger)">*</span></label>
                    <input type="text" id="buy-id" class="form-control" placeholder="Masukkan Username / Email Akun / Link Target" required>
                    <small class="form-helper" style="color:var(--danger);">*Pastikan data target sudah benar.</small>
                </div>`;
        } else {
            fields.innerHTML = `
                ${extraDesc}
                <div style="display:grid; grid-template-columns: 2fr 1fr; gap:10px;">
                    <div class="form-group" style="margin-bottom:0;">
                        <label for="buy-id">ID Player <span style="color:var(--danger)">*</span></label>
                        <input type="text" id="buy-id" class="form-control" placeholder="Contoh: 12345678" required>
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label for="buy-zone">Zone / Server</label>
                        <input type="text" id="buy-zone" class="form-control" placeholder="1234">
                    </div>
                </div>
                <small class="form-helper" style="color:var(--danger); margin-top:6px;">*Pastikan ID & Zone sudah sesuai.</small>`;
        }
    } else {
        fields.innerHTML = `
            ${extraDesc}
            <div class="brutal-alert-box" style="background:var(--bg); color:var(--text);">
                <i class="fa-solid fa-bolt text-primary" style="font-size:1.2rem;"></i>
                <span>Detail <b>Akun / Password / Link Akses Tools</b> akan langsung dikirimkan otomatis ke menu <b>Pesanan (E-Receipt)</b> & Email kamu detik itu juga setelah pembayaran lunas!</span>
            </div>`;
    }
    
    const emailGroup = document.getElementById('buy-email-group');
    const emailInput = document.getElementById('buy-email');
    const phoneInput = document.getElementById('buy-phone');
    if (!userProfile.isGuest && userProfile.email) {
        emailInput.value = userProfile.email;
        if (emailGroup) emailGroup.style.display = 'none';
    } else {
        emailInput.value = localStorage.getItem('vipercell_track_email') || '';
        if (emailGroup) emailGroup.style.display = 'block';
    }
    if (phoneInput) {
        phoneInput.value = userProfile.phone || userProfile.whatsapp || localStorage.getItem('vipercell_track_phone') || '';
    }
    
    const defaultPayCard = document.querySelector('input[name="payment_method"][value="qris"]');
    if (defaultPayCard) window.selectPaymentUI('qris', defaultPayCard.parentElement);
    
    window.calculateDirectBuyTotal();
    window.renderReviewsUI();
    window.switchMainTab('checkout');
};

window.selectItemToBuy = function(dbId) {
    selectedProductForBuy = currentCheckoutBrand.items.find(i => i.dbId === dbId);
    document.querySelectorAll('.item-card').forEach(el => el.classList.remove('selected'));
    const cardEl = document.getElementById(`buy-card-${dbId}`);
    if (cardEl) cardEl.classList.add('selected');
    
    const manualWarn = document.getElementById('manual-warning-msg');
    if (manualWarn && selectedProductForBuy) {
        manualWarn.style.display = selectedProductForBuy.processType === 'manual' ? 'flex' : 'none';
    }

    const qtyInput = document.getElementById('buy-qty');
    const qtySub = document.getElementById('buy-qty-subtext');
    const availQuota = computeVariantAvailableStock(selectedProductForBuy);

    if (typeof availQuota === 'number') {
        if (qtySub) qtySub.innerText = `Tersedia ${availQuota} stok/slot`;
        if (parseInt(qtyInput.value) > availQuota) {
            qtyInput.value = Math.max(1, availQuota);
        }
    } else if (qtySub) {
        qtySub.innerText = 'Kuantitas item';
    }
    
    window.calculateDirectBuyTotal();
};
/* ======================== END OF [FEATURE-04 & 05] ======================== */

/* ============================================================================
 * [FEATURE-06] PROMO ENGINE & CHECKOUT CALCULATION
 * ============================================================================ */
window.selectPaymentUI = function(val, el) {
    document.querySelectorAll('input[name="payment_method"]').forEach(input => { input.parentElement.classList.remove('active'); });
    if (el) {
        el.classList.add('active');
        const rad = el.querySelector('input');
        if (rad) rad.checked = true;
    }
    
    const cashWarn = document.getElementById('cash-warning-msg');
    if (cashWarn) cashWarn.style.display = val === 'cash' ? 'flex' : 'none';
    
    window.calculateDirectBuyTotal();
};

window.changeBuyQty = function(change) {
    const input = document.getElementById('buy-qty');
    let current = parseInt(input.value) || 1;
    let newVal = current + change;
    if (newVal < 1) newVal = 1;

    const availQuota = computeVariantAvailableStock(selectedProductForBuy);
    if (typeof availQuota === 'number' && availQuota > 0) {
        if (newVal > availQuota) {
            newVal = availQuota;
            window.showToast('Batas Stok', `Maksimal stok/slot tersedia untuk varian ini adalah ${availQuota}.`, 'warning');
        }
    }

    input.value = newVal;
    window.calculateDirectBuyTotal();
};

window.applyPromoDirect = function() {
    const codeInput = document.getElementById('buy-promo-code').value.trim().toUpperCase();
    const msgEl = document.getElementById('buy-promo-msg');
    
    if (!codeInput) {
        appliedPromo = null; window.calculateDirectBuyTotal(); return;
    }
    
    const effectiveUid = boundLegacyGuestUid || currentUser?.uid || '';
    const p = promos.find(x => x.code === codeInput);
    const qty = parseInt(document.getElementById('buy-qty')?.value) || 1;
    const rawSubtotal = selectedProductForBuy ? (selectedProductForBuy.priceNum * qty) : 0;
    const todayIso = new Date().toISOString().slice(0, 10);

    if (!p || !p.active) {
        appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-circle-xmark"></i> Kode promo tidak ditemukan atau tidak aktif.</span>`;
    } else if (p.usedCount >= p.maxUses) {
        appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-circle-xmark"></i> Kuota kode promo sudah habis.</span>`;
    } else if (p.expiryDate && p.expiryDate < todayIso) {
        appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-circle-xmark"></i> Masa berlaku kode promo telah berakhir.</span>`;
    } else if (p.minOrder && p.minOrder > 0 && rawSubtotal < p.minOrder) {
        appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-circle-xmark"></i> Minimal belanja Rp${p.minOrder.toLocaleString('id-ID')}.</span>`;
    } else if (p.targetBrand !== 'all' && p.targetBrand !== currentCheckoutBrand.brandName) {
        appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-circle-xmark"></i> Khusus produk ${escapeHtml(p.targetBrand)}.</span>`;
    } else if (p.targetUser === 'new') {
        const hasOrders = effectiveUid ? orders.some(o => o.userId === effectiveUid || o.userId === currentUser?.uid) : false;
        if (hasOrders) {
            appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-circle-xmark"></i> Khusus pengguna transaksi pertama.</span>`;
        } else { setValidPromo(p, msgEl); }
    } else {
        setValidPromo(p, msgEl);
    }
    window.calculateDirectBuyTotal();
};

function setValidPromo(p, msgEl) {
    appliedPromo = { dbId: p.dbId, code: p.code, amount: p.amount, type: p.type || 'nominal' };
    msgEl.innerHTML = `<span style="color:var(--success)"><i class="fa-solid fa-circle-check"></i> Promo ${escapeHtml(p.code)} berhasil dipasang!</span>`;
}

window.calculateDirectBuyTotal = function() {
    const btnProc = document.getElementById('btn-process-buy');
    
    if (!selectedProductForBuy) {
        document.getElementById('buy-total-price').innerText = 'Rp0';
        btnProc.innerHTML = '<i class="fa-solid fa-cart-shopping"></i> <span>Pilih Varian Dahulu</span>';
        btnProc.disabled = true;
        return; 
    }
    
    const qty = parseInt(document.getElementById('buy-qty').value) || 1;
    let baseTotal = selectedProductForBuy.priceNum * qty;
    
    let disc = 0;
    if (appliedPromo) {
        if (appliedPromo.type === 'percent') disc = Math.round(baseTotal * (appliedPromo.amount / 100));
        else disc = appliedPromo.amount;
        
        if (disc > baseTotal) disc = baseTotal;
        baseTotal -= disc;
    } else if (document.getElementById('buy-promo-code').value === '') {
        document.getElementById('buy-promo-msg').innerHTML = '';
    }
    
    document.getElementById('buy-total-price').innerText = `Rp${baseTotal.toLocaleString('id-ID')}`;
    
    if (siteSettings.isStoreOpen === false) {
        btnProc.innerHTML = '<i class="fa-solid fa-lock"></i> <span>Toko Sedang Tutup</span>';
        btnProc.disabled = true;
        return;
    }
    
    btnProc.innerHTML = '<i class="fa-solid fa-bolt"></i> <span id="btn-process-text">Beli & Bayar Sekarang</span>'; 
    btnProc.disabled = false;
};

window.processDirectCheckout = async function() {
    if (isProcessingCheckout || !selectedProductForBuy) return;
    
    let emailInput = document.getElementById('buy-email').value.trim();
    let phoneInput = document.getElementById('buy-phone') ? document.getElementById('buy-phone').value.trim() : '';
    if (!emailInput || !emailInput.includes('@')) { 
        window.customAlert('Email Diperlukan', 'Harap masukkan alamat Email aktif untuk pengiriman struk & akun!', 'warning'); 
        return; 
    }
    
    const qty = parseInt(document.getElementById('buy-qty').value) || 1;
    const availQuota = computeVariantAvailableStock(selectedProductForBuy);

    if (typeof availQuota === 'number' && availQuota < qty) {
        window.customAlert('Stok Tidak Cukup', `Sisa stok/slot untuk varian ini hanya ${availQuota}.`, 'warning');
        return;
    }
    
    let playerInfo = '';
    let rawTargetId = '';
    const buyIdEl = document.getElementById('buy-id');
    if (buyIdEl) {
        const pid = buyIdEl.value.trim();
        const zol = document.getElementById('buy-zone') ? document.getElementById('buy-zone').value.trim() : '';
        if (!pid) {
            window.customAlert('Data Tujuan Kosong', 'Harap isi kolom Data Tujuan / Email / ID terlebih dahulu!', 'warning');
            return;
        }
        rawTargetId = zol ? `${pid} (${zol})` : pid;

        let inpType = currentCheckoutBrand.items[0]?.inputType || 'id_zone';
        if (currentCheckoutBrand.type === 'app') playerInfo = `Email/Akun Tujuan: ${pid}`;
        else if (inpType === 'id_only') playerInfo = `ID: ${pid}`;
        else if (inpType === 'custom' || inpType === 'roblox') playerInfo = `Target: ${pid}`;
        else playerInfo = `ID: ${pid} | Zone: ${zol}`;
    } else {
        const typeLabel = currentCheckoutBrand.type === 'tools' ? 'Tools Digital' : 'Akun Premium';
        playerInfo = `${typeLabel} (Delivery: ${selectedProductForBuy.processType === 'manual' ? 'Manual' : 'Auto'})`;
    }

    await ensureAuthSession();
    const effectiveUid = (currentUser?.isAnonymous && boundLegacyGuestUid) ? boundLegacyGuestUid : (currentUser?.uid || null);

    const now = Date.now();
    const paymentMethod = document.querySelector('input[name="payment_method"]:checked').value;

    // Cek apakah masih ada pesanan UNPAID/PENDING yang identik (dan belum dibatalkan)
    const existingActiveOrder = orders.find(o => {
        const isSameUser = (effectiveUid && o.userId === effectiveUid) ||
                           (o.userEmail && o.userEmail.toLowerCase() === emailInput.toLowerCase());
        const isStillActive = (o.status === 'UNPAID' || o.status === 'PENDING_PAYMENT' || o.status === 'PENDING') && (now - new Date(o.date).getTime() < 900000);
        const isSameItem = o.items && o.items[0] &&
                           o.items[0].productDbId === selectedProductForBuy.dbId &&
                           o.items[0].qty === qty &&
                           o.items[0].playerInfo === playerInfo &&
                           o.paymentMethod === paymentMethod;
        return isSameUser && isStillActive && isSameItem;
    });

    if (existingActiveOrder) {
        window.showToast('Tagihan Aktif Ditemukan', `Membuka kembali tagihan ${existingActiveOrder.id}. Kamu juga bisa membatalkannya jika ingin buat baru.`, 'warning');
        window.resumePayment(existingActiveOrder.dbId);
        return;
    }

    isProcessingCheckout = true;
    const btnProc = document.getElementById('btn-process-buy');
    const ogHtml = btnProc.innerHTML;
    btnProc.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Menerbitkan Tagihan...</span>';
    btnProc.disabled = true;

    localStorage.setItem('vipercell_track_email', emailInput);
    if (phoneInput) localStorage.setItem('vipercell_track_phone', phoneInput);
    const trackEmailEl = document.getElementById('track-email');
    if (trackEmailEl) trackEmailEl.value = emailInput;
    
    let rawTotal = selectedProductForBuy.priceNum * qty;
    let discountPromo = 0; let promoUsedCode = '';
    if (appliedPromo) {
        if (appliedPromo.type === 'percent') discountPromo = Math.round(rawTotal * (appliedPromo.amount / 100));
        else discountPromo = appliedPromo.amount;
        if (discountPromo > rawTotal) discountPromo = rawTotal;
        promoUsedCode = appliedPromo.code;
    }
    
    let baseTotal = rawTotal - discountPromo;
    if (baseTotal < 0) baseTotal = 0;
    
    // Pastikan kode unik 3 digit tidak bentrok dengan pesanan UNPAID lain yang sedang aktif
    let uniqueCode = 0;
    if (paymentMethod === 'qris' && baseTotal > 0) {
        uniqueCode = Math.floor(Math.random() * 250) + 1;
        let safetyTry = 0;
        while (orders.some(o => (o.status === 'UNPAID' || o.status === 'PENDING_PAYMENT') && o.finalTotal === (baseTotal + uniqueCode)) && safetyTry < 40) {
            uniqueCode = Math.floor(Math.random() * 450) + 1;
            safetyTry++;
        }
    }
    let finalTotal = baseTotal + uniqueCode;
    
    let invId = 'VP-' + Math.floor(100000 + Math.random() * 900000);
    while (orders.some(o => o.id === invId)) {
        invId = 'VP-' + Math.floor(100000 + Math.random() * 900000);
    }

    const durationDays = parseInt(selectedProductForBuy.durationDays || 0, 10);

    const singleItem = { 
        cartId: now.toString(),
        productDbId: selectedProductForBuy.dbId,
        brandName: currentCheckoutBrand.brandName,
        exactItemName: selectedProductForBuy.name,
        name: `${currentCheckoutBrand.brandName} - ${selectedProductForBuy.name} (x${qty})`, 
        priceNum: selectedProductForBuy.priceNum,
        qty: qty,
        type: currentCheckoutBrand.type, 
        processType: selectedProductForBuy.processType || 'auto',
        durationDays: durationDays,
        playerInfo: playerInfo 
    };

    const newOrder = {
        id: invId, 
        orderId: invId,
        userEmail: emailInput,
        buyerEmail: emailInput,
        buyerName: userProfile.name || emailInput.split('@')[0],
        userPhone: phoneInput || userProfile.phone || userProfile.whatsapp || '',
        userId: effectiveUid, 
        deviceId: currentDeviceId,
        targetId: rawTargetId || playerInfo,
        productName: currentCheckoutBrand.brandName,
        variantName: selectedProductForBuy.name,
        items: [singleItem],
        finalTotal: finalTotal,
        uniqueTotal: finalTotal,
        baseTotal: baseTotal,
        uniqueCode: uniqueCode,
        promoCode: promoUsedCode,
        promoDiscount: discountPromo,
        durationDays: durationDays,
        status: paymentMethod === 'cash' ? 'PENDING' : 'UNPAID',
        paymentMethod: paymentMethod,
        adminReply: '',
        date: new Date(now).toISOString(),
        expiresAt: now + 900000
    };

    try {
        const docRef = await addDoc(collection(db, pathOrders), newOrder);
        currentCheckoutSession = {
            dbId: docRef.id,
            id: invId,
            brandName: currentCheckoutBrand.brandName,
            itemName: singleItem.name,
            finalTotal: finalTotal,
            method: paymentMethod,
            date: newOrder.date
        };
        
        if (appliedPromo) {
            await updateDoc(doc(db, pathPromos, appliedPromo.dbId), { usedCount: increment(1) }).catch(() => {});
        }
        
        if (paymentMethod === 'qris') {
            setTimeout(() => window.openQRISModal(), 100);
        } else {
            setTimeout(() => window.openCashBarcodeModal(), 100);
        }
    } catch (e) { 
        window.customAlert("Gagal", "Gagal membuat pesanan ke server, silakan coba lagi.", "error"); 
    } finally {
        setTimeout(() => {
            isProcessingCheckout = false;
            btnProc.innerHTML = ogHtml;
            btnProc.disabled = false;
        }, 800);
    }
};
/* ======================== END OF [FEATURE-06] ============================= */

/* ============================================================================
 * [FEATURE-11] E-RECEIPT WITH QUICK COPY CREDENTIAL PARSER, RESEND EMAIL,
 * CANCEL BUTTON, HISTORY & LIVE CHAT
 * ============================================================================ */
function buildQuickCopyCredentialButtons(rawReplyText, invId) {
    if (!rawReplyText) return '';
    const lines = String(rawReplyText).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const extractedPairs = [];

    lines.forEach(line => {
        if (line.startsWith('[') && line.endsWith(']')) return;
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0 && colonIdx < 28) {
            const label = line.substring(0, colonIdx).trim();
            const val = line.substring(colonIdx + 1).trim();
            if (val && val !== '-' && !label.toLowerCase().includes('terima kasih')) {
                extractedPairs.push({ label, val });
            }
        } else if (line.includes('|')) {
            const parts = line.split('|').map(s => s.trim()).filter(Boolean);
            if (parts[0]) extractedPairs.push({ label: 'Email / ID / Link', val: parts[0] });
            if (parts[1] && parts[1] !== '-') extractedPairs.push({ label: 'Password / Kode', val: parts[1] });
            if (parts[2] && parts[2] !== '-') extractedPairs.push({ label: 'Profil / Info', val: parts[2] });
        }
    });

    if (extractedPairs.length === 0) return '';

    let html = `<div class="cred-parsed-grid">`;
    extractedPairs.forEach(pair => {
        const safeVal = escapeJsStr(pair.val);
        const safeLbl = escapeJsStr(pair.label);
        html += `
            <div class="cred-copy-item">
                <div class="cred-copy-meta">
                    <span>${escapeHtml(pair.label)}</span>
                    <strong>${escapeHtml(pair.val)}</strong>
                </div>
                <button type="button" class="btn btn-primary btn-sm" style="padding:4px 10px; min-height:30px; font-size:0.72rem;" onclick="window.copyCredentialPart('${safeVal}', '${safeLbl}')">
                    <i class="fa-regular fa-copy"></i> Salin
                </button>
            </div>
        `;
    });
    html += `</div>`;
    return html;
}

window.copyCredentialPart = function(val, label) {
    if (!val) return;
    navigator.clipboard.writeText(val).then(() => {
        window.showToast(`${label} Disalin`, `${val} berhasil disalin ke papan klip!`, 'success');
    });
};

window.copyAccountReplyText = function(invId) {
    const order = orders.find(o => o.id === invId);
    if (!order || !order.adminReply) return;
    navigator.clipboard.writeText(order.adminReply).then(() => {
        window.showToast('Data Disalin', 'Seluruh detail akun/link pesanan berhasil disalin!', 'success');
    });
};

function generateHelpButtons(invId, orderStatus, item) {
    let actionBtn = '';
    if (orderStatus === 'PENDING') {
        const msg = `Halo Admin, saya sudah membayar untuk pesanan ${invId}. Tolong dicek ya Min.`;
        actionBtn = `<button class="btn btn-warning" style="width:100%;" onclick="window.sendPredefinedChat('${escapeJsStr(msg)}')"><i class="fa-solid fa-check-double"></i> Konfirmasi Pembayaran ke Admin</button>`;
    } else if (orderStatus === 'SUCCESS') {
        if (item?.processType === 'manual') {
            const msg = `Halo Admin, pesanan ${invId} saya statusnya SUKSES (Manual). Mohon segera diproses ya.`;
            actionBtn = `<button class="btn btn-primary" style="width:100%;" onclick="window.sendPredefinedChat('${escapeJsStr(msg)}')"><i class="fa-solid fa-headset"></i> Hubungi Admin (Proses Manual)</button>`;
        } else {
            const msg = `Halo Admin, saya butuh bantuan / klaim garansi untuk pesanan ID: ${invId}.`;
            actionBtn = `<button class="btn btn-outline" style="width:100%;" onclick="window.sendPredefinedChat('${escapeJsStr(msg)}')"><i class="fa-solid fa-shield-halved"></i> Bantuan / Klaim Garansi</button>`;
        }
    } else if (orderStatus === 'EXPIRED') {
        const msg = `Halo Admin, saya sudah membayar untuk pesanan ${invId} namun statusnya Expired. Mohon bantuannya.`;
        actionBtn = `<button class="btn btn-danger" style="width:100%;" onclick="window.sendPredefinedChat('${escapeJsStr(msg)}')"><i class="fa-solid fa-triangle-exclamation"></i> Lapor Kendala Expired</button>`;
    }
    
    if (!actionBtn) return '';
    return `
    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1.5px dashed var(--border-subtle);">
        ${actionBtn}
    </div>`;
}

function hasOrderBeenReviewed(order) {
    if (!order) return true;
    return reviewsData.some(r => r.orderId && r.orderId === order.id);
}

function buildFullReceiptHTML(order) {
    const isUnpaid = order.status === 'UNPAID' || order.status === 'PENDING_PAYMENT';
    const isCancelled = order.status === 'CANCELLED';
    const isFailed = order.status === 'FAILED' || order.status === 'EXPIRED' || isCancelled;

    const sBadge = isUnpaid ? 'status-unpaid' : order.status === 'PENDING' ? 'status-pending' : isCancelled ? 'status-cancelled' : isFailed ? 'status-failed' : 'status-success';
    const sName = isUnpaid ? 'BELUM DIBAYAR' : order.status === 'PENDING' ? 'MENUNGGU KASIR / PROSES' : isCancelled ? 'DIBATALKAN PEMBELI' : order.status === 'FAILED' ? 'GAGAL / BATAL' : order.status === 'EXPIRED' ? 'WAKTU HABIS' : 'TRANSAKSI SUKSES';
    
    const brandName = order.items[0]?.brandName || '';
    const safeJsBrand = escapeJsStr(brandName);

    const step2Class = order.status === 'SUCCESS' ? 'done' : (isFailed ? 'failed' : 'active');
    const step3Class = order.status === 'SUCCESS' ? 'done' : '';

    let actionHtml = '';
    if (isUnpaid) {
        actionHtml = `
        <div class="ereceipt-action-grid">
            <button class="btn btn-primary" onclick="window.resumePayment('${order.dbId}')">
                <i class="fa-solid fa-qrcode"></i> Bayar QRIS Sekarang
            </button>
            <button class="btn btn-danger" onclick="window.cancelActiveOrder('${order.dbId}')">
                <i class="fa-solid fa-ban"></i> Batalkan Pesanan
            </button>
        </div>`;
    } else if (order.status === 'PENDING' && order.paymentMethod === 'cash') {
        actionHtml = `
        <div class="ereceipt-action-grid">
            <button class="btn btn-primary" onclick="window.resumePayment('${order.dbId}')">
                <i class="fa-solid fa-barcode"></i> Buka Barcode Kasir
            </button>
            <button class="btn btn-danger" onclick="window.cancelActiveOrder('${order.dbId}')">
                <i class="fa-solid fa-ban"></i> Batalkan Pesanan
            </button>
        </div>`;
    } else if (isCancelled || order.status === 'EXPIRED') {
        if (brandName) {
            actionHtml = `<button class="btn btn-primary" style="width:100%; margin-top:1rem;" onclick="window.closeModal('modal-order-detail'); window.openDirectBuyModal('${safeJsBrand}')"><i class="fa-solid fa-rotate-right"></i> Buat Pesanan Baru Produk Ini</button>`;
        }
    } else if (order.status === 'SUCCESS') {
        const alreadyReviewed = hasOrderBeenReviewed(order);
        const resendEmailBtn = (siteSettings.emailWebhookUrl || '').trim().startsWith('https://script.google.com/')
            ? `<button class="btn btn-outline btn-sm" style="width:100%; margin-top:8px;" onclick="window.resendOrderEmailReceipt('${escapeJsStr(order.id)}')"><i class="fa-solid fa-envelope-circle-check text-primary"></i> Kirim Ulang E-Receipt ke Email</button>`
            : '';

        if (!alreadyReviewed && brandName) {
            actionHtml = `
                <button class="btn btn-warning" style="width:100%; margin-top:1rem;" onclick="window.goToReview('${safeJsBrand}', '${order.id}')"><i class="fa-solid fa-star"></i> Beri Ulasan Transaksi Ini</button>
                ${resendEmailBtn}`;
        } else if (alreadyReviewed) {
            actionHtml = `
                <div style="margin-top:1rem; text-align:center; font-size:0.78rem; font-weight:800; color:var(--success); padding:8px; border:1.5px dashed var(--success); border-radius:8px;"><i class="fa-solid fa-circle-check"></i> Transaksi ini sudah diulas</div>
                ${resendEmailBtn}`;
        } else {
            actionHtml = resendEmailBtn;
        }
    }

    let guestUpgradeOfferHtml = '';
    if (userProfile.isGuest) {
        guestUpgradeOfferHtml = `
        <div class="brutal-alert-box alert-warning" style="margin-top: 12px; flex-direction: column; align-items: stretch; gap: 8px;">
            <div style="display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-user-shield"></i>
                <span>Ingin menyimpan bukti transaksi & garansi ini secara permanen? Ubah akun Anda menjadi Member.</span>
            </div>
            <button class="btn btn-warning btn-sm" style="width:100%;" onclick="window.closeModal('modal-order-detail'); window.openUpgradeMemberModal();">
                <i class="fa-solid fa-link"></i> Verifikasi OTP & Jadi Member
            </button>
        </div>`;
    }

    let durationReceiptHtml = '';
    const durDays = order.durationDays || order.items[0]?.durationDays || 0;
    if (durDays > 0 && order.status === 'SUCCESS') {
        const endMs = order.subscriptionEndAt || (new Date(order.date).getTime() + durDays * 86400000);
        durationReceiptHtml = `
            <div style="margin-top:8px; padding-top:8px; border-top:1px dashed var(--border-subtle); font-size:0.76rem; font-weight:800; color:var(--primary-light); display:flex; justify-content:space-between; flex-wrap:wrap;">
                <span><i class="fa-regular fa-clock"></i> Paket Langganan: ${durDays} Hari</span>
                <span>Berakhir: ${new Date(endMs).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' })}</span>
            </div>`;
    }
    
    let replyHtml = '';
    if (order.status === 'SUCCESS') {
        if (order.adminReply) {
            const quickCopyButtonsHtml = buildQuickCopyCredentialButtons(order.adminReply, order.id);
            replyHtml = `
            <div class="ereceipt-cred-vault">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                    <span style="font-weight: 800; color: var(--success); font-size: 0.84rem; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-key"></i> DATA AKUN / VOUCHER TERKIRIM:
                    </span>
                    <button class="btn btn-outline btn-sm" style="padding:3px 10px; min-height:28px; font-size:0.7rem;" onclick="window.copyAccountReplyText('${escapeJsStr(order.id)}')">
                        <i class="fa-regular fa-copy"></i> Salin Semua
                    </button>
                </div>
                ${quickCopyButtonsHtml}
                <div class="ereceipt-cred-content">${escapeHtml(order.adminReply)}</div>
            </div>`;
        } else if (order.items[0]?.processType === 'manual') {
            replyHtml = `
            <div class="brutal-alert-box alert-warning" style="margin-top: 12px;">
                <i class="fa-solid fa-user-clock"></i>
                <span>Pembayaran terverifikasi! Pesanan manual sedang disiapkan oleh Admin.</span>
            </div>`;
        } else {
            replyHtml = `
            <div class="brutal-alert-box alert-warning" style="margin-top: 12px;">
                <i class="fa-solid fa-clock"></i>
                <span>Pembayaran lunas! Sistem sedang menyiapkan stok otomatis untukmu.</span>
            </div>`;
        }
    }
    
    const helpHtml = generateHelpButtons(order.id, order.status, order.items[0]);

    return `
    <div class="ereceipt-ticket">
        <div class="ereceipt-top-banner">
            <div>
                <span style="font-size:0.68rem; font-weight:800; color:var(--text-muted); display:block;">NOMOR INVOICE RESMI</span>
                <div class="ereceipt-inv-code">
                    <span>#${escapeHtml(order.id)}</span>
                    <button class="mini-copy-btn" onclick="navigator.clipboard.writeText('${escapeJsStr(order.id)}'); window.showToast('Tersalin','Nomor Invoice disalin','success');"><i class="fa-regular fa-copy"></i></button>
                </div>
            </div>
            <span class="status-badge ${sBadge}">${sName}</span>
        </div>

        <div class="ereceipt-stepper">
            <div class="estep-item done">
                <div class="estep-dot"><i class="fa-solid fa-check"></i></div>
                <span class="estep-label">1. Order Dibuat</span>
            </div>
            <div class="estep-item ${step2Class}">
                <div class="estep-dot"><i class="fa-solid ${isFailed ? 'fa-xmark' : (order.paymentMethod === 'cash' ? 'fa-barcode' : 'fa-qrcode')}"></i></div>
                <span class="estep-label">2. ${order.paymentMethod === 'cash' ? 'Kasir Tunai' : 'Bayar QRIS'}</span>
            </div>
            <div class="estep-item ${step3Class}">
                <div class="estep-dot"><i class="fa-solid fa-box-open"></i></div>
                <span class="estep-label">3. Selesai Dikirim</span>
            </div>
        </div>

        <div class="ereceipt-body">
            <div style="font-size: 0.76rem; font-weight: 700; color: var(--text-muted); margin-bottom: 10px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:6px;">
                <span><i class="fa-regular fa-calendar-check"></i> ${new Date(order.date).toLocaleString('id-ID')}</span>
                <span>Email: <b>${escapeHtml(order.userEmail || '-')}</b></span>
            </div>
            <div class="ereceipt-product-box">
                ${order.items.map(i => `<div style="font-weight: 800; font-size: 0.96rem; color: var(--text);">${escapeHtml(i.name)}</div>`).join('')}
                <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); margin-top:4px;">${escapeHtml(order.items[0]?.playerInfo || '')}</div>
                ${durationReceiptHtml}
            </div>
            ${replyHtml}
            ${guestUpgradeOfferHtml}
        </div>

        <div class="ereceipt-footer">
            <div class="receipt-row">
                <span style="color:var(--text-muted);">Harga Layanan</span>
                <span>Rp${(order.baseTotal + (order.promoDiscount || 0)).toLocaleString('id-ID')}</span>
            </div>
            ${order.promoDiscount > 0 ? `
            <div class="receipt-row">
                <span style="color:var(--success);">Diskon Voucher (${escapeHtml(order.promoCode)})</span>
                <span style="color:var(--success);">-Rp${order.promoDiscount.toLocaleString('id-ID')}</span>
            </div>` : ''}
            ${order.uniqueCode > 0 ? `
            <div class="receipt-row">
                <span style="color:var(--warning);">Kode Unik Verifikasi QRIS</span>
                <span style="color:var(--warning);">+Rp${order.uniqueCode}</span>
            </div>` : ''}
            <div class="receipt-row" style="margin-top: 8px; padding-top: 8px; border-top: 1.5px solid var(--border);">
                <strong style="font-size: 0.95rem; font-weight: 900; color: var(--text);">TOTAL TAGIHAN</strong>
                <strong style="font-size: 1.2rem; font-weight: 900; color: var(--primary-light);">Rp${order.finalTotal.toLocaleString('id-ID')}</strong>
            </div>
            ${actionHtml}
            ${helpHtml}
        </div>
    </div>`;
}

function buildCompactOrderItemHTML(order) {
    const isUnpaid = order.status === 'UNPAID' || order.status === 'PENDING_PAYMENT';
    const isCancelled = order.status === 'CANCELLED';
    const isFailed = order.status === 'FAILED' || order.status === 'EXPIRED' || isCancelled;

    const sBadge = isUnpaid ? 'status-unpaid' : order.status === 'PENDING' ? 'status-pending' : isCancelled ? 'status-cancelled' : isFailed ? 'status-failed' : 'status-success';
    const sName = isUnpaid ? 'BELUM BAYAR' : order.status === 'PENDING' ? (order.paymentMethod === 'cash' ? 'TUNAI BARCODE' : 'DIPROSES') : isCancelled ? 'DIBATALKAN' : order.status === 'FAILED' ? 'GAGAL' : order.status === 'EXPIRED' ? 'EXPIRED' : 'SELESAI';
    
    const item = order.items && order.items[0] ? order.items[0] : {};
    const typeIcon = item.type === 'game' ? 'fa-gamepad' : (item.type === 'tools' ? 'fa-screwdriver-wrench' : 'fa-mobile-screen');

    return `
    <div class="order-compact-card" onclick="window.openOrderDetailModalById('${escapeJsStr(order.id)}')">
        <div class="order-compact-left">
            <div class="order-compact-icon">
                <i class="fa-solid ${typeIcon}"></i>
            </div>
            <div class="order-compact-info">
                <div class="order-compact-top">
                    <span class="order-compact-inv">#${escapeHtml(order.id)}</span>
                    <span class="status-badge ${sBadge}" style="font-size:0.62rem; padding:2px 6px;">${sName}</span>
                    <span class="order-compact-date">${new Date(order.date).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                </div>
                <div class="order-compact-title">${escapeHtml(item.name || 'Pesanan Vipercell')}</div>
                <div class="order-compact-sub">${escapeHtml(item.playerInfo || '')}</div>
            </div>
        </div>
        <div class="order-compact-right">
            <span class="order-compact-price">Rp${(order.finalTotal || 0).toLocaleString('id-ID')}</span>
            <span class="order-tap-hint">Buka E-Receipt <i class="fa-solid fa-chevron-right"></i></span>
        </div>
    </div>`;
}

window.openOrderDetailModalById = function(invId) {
    const order = orders.find(o => o.id === invId);
    if (!order) return;
    const modalBody = document.getElementById('modal-order-detail-body');
    if (modalBody) {
        modalBody.innerHTML = buildFullReceiptHTML(order);
        window.openModal('modal-order-detail');
    }
};

window.filterUserHistory = function(statusFilter, btnEl) {
    currentUserHistoryFilter = statusFilter;
    document.querySelectorAll('.hist-pill').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    window.renderUserOrders();
};

window.refreshOrderData = function() {
    window.renderUserOrders();
    const trackResult = document.getElementById('track-result');
    if (trackResult && trackResult.style.display === 'block') window.trackOrder();
    window.showToast('Diperbarui', 'Status transaksi telah disegarkan.', 'info');
};

window.trackOrder = function() {
    const invId = document.getElementById('track-id').value.trim().toUpperCase();
    if (!invId) return;

    let trackEmail = "";
    if (userProfile.isGuest) {
        trackEmail = document.getElementById('track-email').value.trim();
        if (!trackEmail) {
            window.customAlert('Email Diperlukan', 'Silakan masukkan email yang digunakan saat pembelian.', 'warning');
            return;
        }
        localStorage.setItem('vipercell_track_email', trackEmail);
        window.renderUserOrders();
    } else {
        trackEmail = userProfile.email;
    }

    const order = orders.find(o => o.id === invId);
    const resBox = document.getElementById('track-result');
    
    if (!order) {
        resBox.style.display = 'block';
        resBox.innerHTML = `<div class="brutal-alert-box alert-danger"><i class="fa-solid fa-circle-xmark"></i> <span>Invoice <b>${escapeHtml(invId)}</b> tidak ditemukan.</span></div>`;
        return; 
    }

    if (userProfile.isGuest && order.userEmail.toLowerCase() !== trackEmail.toLowerCase()) {
        window.customAlert('Akses Ditolak', 'Alamat Email tidak cocok dengan pemilik Invoice ini.', 'error');
        return;
    }

    resBox.style.display = 'block';
    resBox.innerHTML = buildFullReceiptHTML(order);
};

window.renderUserOrders = function() {
    const grid = document.getElementById('user-order-grid');
    if (!grid) return;
    
    const effectiveUid = boundLegacyGuestUid || currentUser?.uid || '';
    const savedTrackEmail = (localStorage.getItem('vipercell_track_email') || '').toLowerCase();
    const activeEmail = (!userProfile.isGuest && userProfile.email) ? userProfile.email.toLowerCase() : savedTrackEmail;

    let userOrders = orders.filter(o => {
        const matchUid = (effectiveUid && o.userId === effectiveUid) || (currentUser && o.userId === currentUser.uid);
        const matchEmail = activeEmail && o.userEmail && o.userEmail.toLowerCase() === activeEmail;
        return matchUid || matchEmail;
    });

    if (currentUserHistoryFilter !== 'ALL') {
        userOrders = userOrders.filter(o => {
            if (currentUserHistoryFilter === 'UNPAID') return o.status === 'UNPAID' || o.status === 'PENDING_PAYMENT';
            if (currentUserHistoryFilter === 'FAILED') return o.status === 'FAILED' || o.status === 'EXPIRED' || o.status === 'CANCELLED';
            return o.status === currentUserHistoryFilter;
        });
    }
    
    if (userOrders.length === 0) {
        grid.innerHTML = `<div class="brutal-empty-box">Belum ada riwayat transaksi pada filter ini.</div>`;
        return;
    }
    
    let html = '';
    userOrders.slice(0, 50).forEach((o) => {
        html += buildCompactOrderItemHTML(o);
    });
    grid.innerHTML = html;
};

// ==========================================
// FITUR LIVE CHAT (GUEST & MEMBER)
// ==========================================
async function getResolvedChatDocId() {
    const user = await ensureAuthSession();
    if (user && !user.isAnonymous) return user.uid;
    if (boundLegacyGuestUid) return boundLegacyGuestUid;
    if (user && user.uid) {
        await saveMultiLayerToken('vipercell_anon_uid', user.uid);
        return user.uid;
    }
    return currentDeviceId || 'guest_session';
}

function checkChatUserState() {
    const preForm = document.getElementById('chat-pre-form');
    const chatHeader = document.getElementById('chat-wa-header');
    const chatBody = document.getElementById('user-chat-body');
    const chatFooter = document.getElementById('user-chat-footer');
    const chatChips = document.getElementById('chat-quick-chips');
    const userLabel = document.getElementById('chat-current-user-label');
    
    let savedName = localStorage.getItem('vipercell_anon_name') || '';
    if (!userProfile.name && savedName) userProfile.name = savedName;
    if (!userProfile.name && currentUser && !userProfile.isGuest && currentUser.email) {
        userProfile.name = currentUser.email.split('@')[0];
    }

    let hasName = Boolean(userProfile.name && userProfile.name.trim() !== '');
    if (userLabel && hasName) userLabel.innerText = userProfile.name;
    
    if (hasName) {
        if (preForm) preForm.style.display = 'none';
        if (chatHeader) chatHeader.style.display = 'flex';
        if (chatBody) chatBody.style.display = 'flex';
        if (chatChips) chatChips.style.display = 'flex';
        if (chatFooter) chatFooter.style.display = 'flex';
        scrollToBottomUserChat();
    } else {
        if (preForm) preForm.style.display = 'flex';
        if (chatHeader) chatHeader.style.display = 'none';
        if (chatBody) chatBody.style.display = 'none';
        if (chatChips) chatChips.style.display = 'none';
        if (chatFooter) chatFooter.style.display = 'none';
    }
}

window.startAnonChat = async function() {
    const input = document.getElementById('chat-anon-name');
    const name = input ? input.value.trim() : '';
    if (!name) {
        window.customAlert('Nama Diperlukan', 'Silakan masukkan nama panggilan kamu terlebih dahulu.', 'warning');
        return;
    }
    
    const btn = document.getElementById('btn-start-chat');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Menghubungkan...</span>';
    }

    await ensureAuthSession();
    userProfile.name = name;
    localStorage.setItem('vipercell_anon_name', name);

    const effectiveUid = boundLegacyGuestUid || currentUser?.uid;
    if (effectiveUid) {
        await setDoc(doc(db, pathUsers, effectiveUid), { name: name }, { merge: true }).catch(() => {});
    }

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span>Buka Ruang Obrolan</span>';
    }

    checkChatUserState();
    applyUserSessionToUI();
    await listenUserChat();

    if (window.pendingMsgToAdmin) {
        const msgToSend = window.pendingMsgToAdmin;
        window.pendingMsgToAdmin = null;
        const chatInp = document.getElementById('user-chat-input');
        if (chatInp) {
            chatInp.value = msgToSend;
            window.sendUserChat();
        }
    }
};

window.changeChatNamePrompt = async function() {
    const currentName = userProfile.name || localStorage.getItem('vipercell_anon_name') || '';
    const newName = prompt('Ubah nama panggilan kamu di ruang obrolan:', currentName);
    if (newName && newName.trim() !== '') {
        userProfile.name = newName.trim();
        localStorage.setItem('vipercell_anon_name', userProfile.name);
        const effectiveUid = boundLegacyGuestUid || currentUser?.uid;
        if (effectiveUid) {
            await setDoc(doc(db, pathUsers, effectiveUid), { name: userProfile.name }, { merge: true }).catch(() => {});
        }
        checkChatUserState();
        applyUserSessionToUI();
        window.showToast('Nama Diperbarui', `Nama obrolan diubah menjadi ${userProfile.name}`, 'success');
    }
};

window.insertQuickUserChat = function(text) {
    const savedName = userProfile.name || localStorage.getItem('vipercell_anon_name') || '';
    if (!savedName) {
        window.pendingMsgToAdmin = text;
        const nameInput = document.getElementById('chat-anon-name');
        if (nameInput) nameInput.focus();
        window.showToast('Isi Nama Panggilan', 'Ketik nama panggilanmu lalu pesan akan terkirim otomatis.', 'info');
        return;
    }
    const inp = document.getElementById('user-chat-input');
    if (inp) {
        inp.value = text;
        window.sendUserChat();
    }
};

async function listenUserChat() {
    const chatId = await getResolvedChatDocId();
    if (!chatId) return;
    const chatRef = doc(db, pathChats, chatId);
    if (activeListenersRegistry.chat) activeListenersRegistry.chat();
    
    activeListenersRegistry.chat = onSnapshot(chatRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const oldLen = userChatMessages.length;
            userChatMessages = data.messages || [];

            if (!userProfile.name && data.userInfo && data.userInfo !== 'Pelanggan Tamu') {
                userProfile.name = data.userInfo;
                localStorage.setItem('vipercell_anon_name', data.userInfo);
                checkChatUserState();
            }
            
            window.renderUserChatMessages();
            
            const lastMsg = userChatMessages[userChatMessages.length - 1];
            const activeTab = document.querySelector('.main-tab-content.active');
            const isBantuanOpen = activeTab && activeTab.id === 'tab-bantuan';

            const chatBadgeDesk = document.getElementById('user-chat-badge-desktop');
            const chatBadgeMob = document.getElementById('user-chat-badge-mobile');
            const showUnreadDot = lastMsg && lastMsg.sender === 'admin' && !isBantuanOpen;
            if (chatBadgeDesk) chatBadgeDesk.style.display = showUnreadDot ? 'block' : 'none';
            if (chatBadgeMob) chatBadgeMob.style.display = showUnreadDot ? 'block' : 'none';

            if (oldLen > 0 && userChatMessages.length > oldLen && lastMsg && lastMsg.sender === 'admin') {
                sendNativeNotification('Balasan Baru dari Admin CS 💬', lastMsg.text);
                if (!isBantuanOpen) {
                    window.showToast('Pesan Baru dari Admin CS', lastMsg.text, 'info', () => window.switchMainTab('bantuan'));
                }
            }
        } else {
            userChatMessages = [];
            window.renderUserChatMessages();
        }
    });
}

window.renderUserChatMessages = function() {
    const body = document.getElementById('user-chat-body');
    if (!body) return;
    
    if (userChatMessages.length === 0) {
        body.innerHTML = `
            <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100%; color:var(--text-muted); text-align:center; padding: 1.5rem;">
                <i class="fa-solid fa-comments" style="font-size:2.8rem; margin-bottom:10px; color:var(--primary-light);"></i>
                <strong style="color:var(--text); font-size:0.95rem;">Ruang Obrolan Siap Digunakan</strong>
                <small style="max-width:300px; margin-top:4px;">Tulis pertanyaan atau nomor Invoice kamu di bawah. Riwayat chat ini tersimpan otomatis meskipun halaman di-refresh.</small>
            </div>`;
        return;
    }
    
    let html = '';
    userChatMessages.forEach(msg => {
        const isUser = msg.sender === 'user';
        const msgClass = isUser ? 'user' : 'admin';
        const senderLabel = isUser
            ? `<span class="chat-sender-label">Kamu</span>`
            : `<span class="chat-sender-label" style="color:var(--primary-light);"><i class="fa-solid fa-headset"></i> Admin Vipercell</span>`;

        html += `
            <div class="chat-msg ${msgClass}">
                ${senderLabel}
                ${escapeHtml(msg.text).replace(/\n/g, '<br>')}
                <span class="chat-time">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
        `;
    });
    body.innerHTML = html;
    scrollToBottomUserChat();
};

function scrollToBottomUserChat() {
    const body = document.getElementById('user-chat-body');
    if (body) setTimeout(() => { body.scrollTop = body.scrollHeight; }, 80);
}

window.sendUserChat = async function() {
    const input = document.getElementById('user-chat-input');
    const btn = document.getElementById('btn-send-chat');
    if (!input || !btn) return;
    
    const text = input.value.trim();
    if (!text || btn.disabled) return;
    
    input.value = '';
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    
    try {
        const chatId = await getResolvedChatDocId();
        if (!chatId) throw new Error("Sesi belum siap");

        const chatRef = doc(db, pathChats, chatId);
        const msgTimestamp = Date.now();
        const newMsg = { sender: 'user', text: text, timestamp: msgTimestamp };

        const displayName = userProfile.name
            ? userProfile.name
            : (localStorage.getItem('vipercell_anon_name') || (userProfile.isGuest ? 'Pelanggan Tamu' : (currentUser?.email || 'Pelanggan')));

        await setDoc(chatRef, {
            uid: chatId,
            userInfo: displayName,
            userEmail: userProfile.email || localStorage.getItem('vipercell_track_email') || '',
            deviceId: currentDeviceId,
            updatedAt: msgTimestamp,
            messages: arrayUnion(newMsg)
        }, { merge: true });

        scrollToBottomUserChat();
    } catch (e) {
        console.error("Send Chat Error:", e);
        input.value = text;
        window.customAlert('Gagal Mengirim Pesan', 'Koneksi ke server chat terganggu. Silakan klik tombol kirim sekali lagi.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    }
};
/* ======================== END OF [FEATURE-11] ============================= */

// ==========================================
// UI, TEMA, NOTIFIKASI & NAVIGASI TAB
// ==========================================
window.toggleTheme = function() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('vipercell_theme', newTheme);
    
    const metaTheme = document.getElementById('meta-theme-color');
    if (metaTheme) metaTheme.setAttribute('content', newTheme === 'dark' ? '#090d16' : '#ffffff');
    
    const icon = document.getElementById('theme-icon');
    if (icon) icon.className = newTheme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
};

function updateProfileNotifToggleUI() {
    const statusText = document.getElementById('prof-notif-status-text');
    const toggleBtn = document.getElementById('btn-prof-toggle-notif');
    const iconEl = document.getElementById('prof-notif-icon');
    const iconBox = document.getElementById('prof-notif-icon-box');

    if (!statusText || !toggleBtn || !iconEl) return;

    const browserGranted = ('Notification' in window) && Notification.permission === 'granted';
    const isActive = isUserNotifEnabled && browserGranted;

    if (isActive) {
        statusText.innerText = 'Status: Aktif (Menerima pemberitahuan pesanan & chat)';
        statusText.style.color = 'var(--success)';
        toggleBtn.innerText = 'Matikan';
        toggleBtn.className = 'btn btn-sm btn-danger';
        iconEl.className = 'fa-solid fa-bell';
        if (iconBox) {
            iconBox.style.background = 'rgba(16, 185, 129, 0.15)';
            iconBox.style.color = 'var(--success)';
        }
    } else {
        statusText.innerText = isUserNotifEnabled
            ? 'Status: Belum diizinkan di browser'
            : 'Status: Dinonaktifkan oleh kamu';
        statusText.style.color = 'var(--text-muted)';
        toggleBtn.innerText = 'Aktifkan';
        toggleBtn.className = 'btn btn-sm btn-primary';
        iconEl.className = 'fa-regular fa-bell-slash';
        if (iconBox) {
            iconBox.style.background = 'var(--surface-hover)';
            iconBox.style.color = 'var(--text-muted)';
        }
    }
}

window.toggleUserNotificationSetting = async function() {
    if (!('Notification' in window)) {
        window.customAlert('Tidak Didukung', 'Browser perangkat kamu belum mendukung notifikasi sistem.', 'warning');
        return;
    }

    const browserGranted = Notification.permission === 'granted';

    if (isUserNotifEnabled && browserGranted) {
        isUserNotifEnabled = false;
        localStorage.setItem('vipercell_user_notif', 'off');
        updateProfileNotifToggleUI();
        window.showToast('Notifikasi Dimatikan', 'Pemberitahuan browser telah dinonaktifkan.', 'info');
        return;
    }

    if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
            window.showToast('Izin Ditolak', 'Mohon izinkan notifikasi pada pengaturan browser kamu.', 'warning');
            updateProfileNotifToggleUI();
            return;
        }
    } else if (Notification.permission === 'denied') {
        window.customAlert('Izin Diblokir Browser', 'Kamu sebelumnya memblokir izin notifikasi. Silakan buka pengaturan situs di browser lalu ubah izin Notifikasi menjadi "Izinkan".', 'warning');
        return;
    }

    isUserNotifEnabled = true;
    localStorage.setItem('vipercell_user_notif', 'on');
    updateProfileNotifToggleUI();
    window.showToast('Notifikasi Diaktifkan', 'Kamu akan menerima pemberitahuan saat pesanan selesai atau dibalas CS.', 'success');
    sendNativeNotification('Notifikasi Vipercell Aktif!', 'Pemberitahuan transaksi dan chat bantuan siap dikirim ke perangkatmu.');
};

function sendNativeNotification(title, bodyText) {
    if (!isUserNotifEnabled) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const iconUrl = siteSettings.pwaIconBase64 || siteSettings.logoImgBase64 || 'icon-192.png';
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification(title, {
                body: bodyText,
                icon: iconUrl,
                badge: iconUrl,
                vibrate: [150, 80, 150]
            });
        }).catch(() => {
            try { new Notification(title, { body: bodyText, icon: iconUrl }); } catch (e) {}
        });
    } else {
        try { new Notification(title, { body: bodyText, icon: iconUrl }); } catch (e) {}
    }
}

let dynamicManifestBlobUrl = null;
function applyCustomPwaIcon() {
    const customIcon = siteSettings.pwaIconBase64 || siteSettings.logoImgBase64;
    if (!customIcon) return;

    const favicon = document.getElementById('favicon');
    const appleIcon = document.getElementById('apple-touch-icon');
    const pwaPromptLogo = document.getElementById('pwa-prompt-logo');
    const pwaPromptFallback = document.getElementById('pwa-prompt-fallback');

    if (favicon) favicon.href = customIcon;
    if (appleIcon) appleIcon.href = customIcon;
    if (pwaPromptLogo) {
        pwaPromptLogo.src = customIcon;
        pwaPromptLogo.style.display = 'block';
        if (pwaPromptFallback) pwaPromptFallback.style.display = 'none';
    }

    try {
        const manifestObj = {
            id: "/",
            name: `${siteSettings.logoText || 'Viper'}${siteSettings.logoAccent || 'cell'} - Digital Store`,
            short_name: `${siteSettings.logoText || 'Viper'}${siteSettings.logoAccent || 'cell'}`,
            description: "Platform penyedia layanan aplikasi premium, top up game, dan tools digital otomatis 24/7.",
            start_url: window.location.origin + window.location.pathname,
            scope: window.location.origin + "/",
            display: "standalone",
            background_color: "#090d16",
            theme_color: "#2563eb",
            orientation: "any",
            icons: [
                {
                    src: customIcon,
                    sizes: "192x192",
                    type: customIcon.startsWith('data:image/webp') ? "image/webp" : "image/png",
                    purpose: "any"
                },
                {
                    src: customIcon,
                    sizes: "512x512",
                    type: customIcon.startsWith('data:image/webp') ? "image/webp" : "image/png",
                    purpose: "maskable"
                }
            ]
        };
        if (dynamicManifestBlobUrl) URL.revokeObjectURL(dynamicManifestBlobUrl);
        const blob = new Blob([JSON.stringify(manifestObj)], { type: 'application/json' });
        dynamicManifestBlobUrl = URL.createObjectURL(blob);
        const manifestLink = document.getElementById('pwa-manifest-link');
        if (manifestLink) manifestLink.setAttribute('href', dynamicManifestBlobUrl);
    } catch (e) {}
}

const twWords = [
    "Aplikasi Premium Bergaransi",
    "Top Up Game Instan 24 Jam",
    "Tools Digital & Produktivitas",
    "QRIS Otomatis & Barcode Kasir"
];
let twWordIdx = 0;
let twCharIdx = 0;
let twIsDeleting = false;

function initTypewriter() {
    const el = document.getElementById('tw-text');
    if (!el) return;

    const currentWord = twWords[twWordIdx];
    if (twIsDeleting) {
        twCharIdx--;
        el.textContent = currentWord.substring(0, twCharIdx);
    } else {
        twCharIdx++;
        el.textContent = currentWord.substring(0, twCharIdx);
    }

    let speed = twIsDeleting ? 35 : 80;

    if (!twIsDeleting && twCharIdx === currentWord.length) {
        speed = 2200;
        twIsDeleting = true;
    } else if (twIsDeleting && twCharIdx === 0) {
        twIsDeleting = false;
        twWordIdx = (twWordIdx + 1) % twWords.length;
        speed = 350;
    }

    setTimeout(initTypewriter, speed);
}

function triggerSuccessConfetti() {
    const container = document.getElementById('confetti-container');
    if (!container) return;
    container.innerHTML = '';

    const colors = ['#2563eb', '#fbbf24', '#10b981', '#ec4899', '#8b5cf6', '#ef4444'];
    for (let i = 0; i < 60; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + 'vw';
        piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        piece.style.width = (Math.floor(Math.random() * 10) + 8) + 'px';
        piece.style.height = (Math.floor(Math.random() * 14) + 8) + 'px';
        piece.style.animationDuration = (Math.random() * 1.8 + 1.4) + 's';
        piece.style.animationDelay = (Math.random() * 0.5) + 's';
        container.appendChild(piece);
    }
}

window.showPaymentSuccessAnimation = function(orderId) {
    if (activeTimersRegistry.qrisCountdown) {
        clearInterval(activeTimersRegistry.qrisCountdown);
        activeTimersRegistry.qrisCountdown = null;
    }
    window.closeModal('modal-cash-barcode');
    sendNativeNotification('Pembayaran Berhasil! 🎉', `Pesanan #${orderId} telah selesai diproses oleh sistem Vipercell.`);
    const successOverlay = document.getElementById('payment-success-overlay');
    if (successOverlay) {
        triggerSuccessConfetti();
        successOverlay.style.display = 'flex';
        successOverlay.classList.add('active');
        successOverlay.style.opacity = '1';

        setTimeout(() => {
            successOverlay.style.opacity = '0';
            setTimeout(() => {
                successOverlay.style.display = 'none';
                successOverlay.classList.remove('active');
                window.switchMainTab('pesanan');
                window.openOrderDetailModalById(orderId);
            }, 400);
        }, 2200);
    }
};

window.showToast = function(title, msg, type = 'info', actionCallback = null) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    
    let icon = '<i class="fa-solid fa-circle-info"></i>';
    if (type === 'success') icon = '<i class="fa-solid fa-circle-check"></i>';
    if (type === 'warning') icon = '<i class="fa-solid fa-triangle-exclamation"></i>';
    if (type === 'error') icon = '<i class="fa-solid fa-circle-xmark"></i>';
    
    const hintText = actionCallback ? 'Ketuk untuk buka &bull; Geser untuk tutup' : 'Geser ke kiri/kanan untuk tutup';

    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            <h4>${escapeHtml(title)}</h4>
            <p>${escapeHtml(msg)}</p>
            <span class="toast-swipe-hint">${hintText}</span>
        </div>
    `;
    
    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    let autoRemoveTimer = null;

    const dismissToast = (direction = 1) => {
        if (autoRemoveTimer) clearTimeout(autoRemoveTimer);
        toast.style.transition = 'transform 0.22s ease, opacity 0.22s ease';
        toast.style.transform = `translateX(${direction * 120}%)`;
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 220);
    };

    const onDragStart = (clientX) => {
        startX = clientX;
        currentX = 0;
        isDragging = true;
        toast.style.transition = 'none';
    };

    const onDragMove = (clientX) => {
        if (!isDragging) return;
        currentX = clientX - startX;
        toast.style.transform = `translateX(${currentX}px)`;
        toast.style.opacity = String(Math.max(0.2, 1 - Math.abs(currentX) / 180));
    };

    const onDragEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        if (Math.abs(currentX) > 65) {
            dismissToast(currentX > 0 ? 1 : -1);
        } else {
            toast.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
            toast.style.transform = 'translateY(0) translateX(0)';
            toast.style.opacity = '1';
            if (Math.abs(currentX) < 10 && actionCallback) {
                actionCallback();
                dismissToast(1);
            }
        }
    };

    toast.addEventListener('touchstart', (e) => onDragStart(e.touches[0].clientX), { passive: true });
    toast.addEventListener('touchmove', (e) => onDragMove(e.touches[0].clientX), { passive: true });
    toast.addEventListener('touchend', onDragEnd);

    toast.addEventListener('mousedown', (e) => onDragStart(e.clientX));
    window.addEventListener('mousemove', (e) => { if (isDragging) onDragMove(e.clientX); });
    window.addEventListener('mouseup', () => { if (isDragging) onDragEnd(); });

    toast.style.cursor = actionCallback ? 'pointer' : 'grab';
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 15);
    autoRemoveTimer = setTimeout(() => {
        if (document.body.contains(toast)) {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 250);
        }
    }, 4800);
};

window.openModal = (id) => {
    const el = document.getElementById(id);
    if (el) { el.classList.add('active'); document.body.classList.add('no-scroll'); }
};
window.closeModal = (id) => {
    const el = document.getElementById(id);
    if (el) { 
        el.classList.remove('active');
        document.body.classList.remove('no-scroll'); 
    }
};
window.handleLogoClick = () => {
    if (!document.body.classList.contains('auth-locked')) {
        window.switchMainTab('katalog');
    }
};

window.customAlert = (title, message, type = 'info', extraActionHtml = '') => {
    const titleEl = document.getElementById('ca-title');
    const descEl = document.getElementById('ca-desc');
    const iconEl = document.getElementById('ca-icon');
    const extraEl = document.getElementById('ca-extra-action');
    const alertEl = document.getElementById('custom-alert');
    
    if (titleEl) titleEl.innerText = title;
    if (descEl) descEl.innerHTML = message;
    if (extraEl) extraEl.innerHTML = extraActionHtml || '';
    if (iconEl) {
        iconEl.className = `msg-icon ${type}`;
        if (type === 'success') iconEl.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
        else if (type === 'error') iconEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
        else if (type === 'warning') iconEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
        else iconEl.innerHTML = '<i class="fa-solid fa-circle-info"></i>';
    }
    if (alertEl) alertEl.classList.add('active');
    document.body.classList.add('no-scroll');
};

window.closeAlert = () => {
    const alertEl = document.getElementById('custom-alert');
    const extraEl = document.getElementById('ca-extra-action');
    if (alertEl) alertEl.classList.remove('active');
    if (extraEl) extraEl.innerHTML = '';
    document.body.classList.remove('no-scroll');
};

let promptCallback = null;
window.openConfirm = function(title, message, callback, actionType = 'warning') {
    const titleEl = document.getElementById('mc-title');
    const descEl = document.getElementById('mc-desc');
    const iconContainer = document.getElementById('mc-icon-container');
    const confirmBtn = document.getElementById('mc-confirm-btn');
    
    if (titleEl) titleEl.innerText = title;
    if (descEl) descEl.innerHTML = message;
    promptCallback = callback;
    
    if (iconContainer && confirmBtn) {
        if (actionType === 'success') {
            iconContainer.className = 'msg-icon success';
            iconContainer.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
            confirmBtn.className = 'btn btn-success';
        } else {
            iconContainer.className = 'msg-icon warning';
            iconContainer.innerHTML = '<i class="fa-solid fa-circle-question"></i>';
            confirmBtn.className = 'btn btn-danger';
        }
    }
    window.openModal('modal-confirm');
};
window.resolveConfirm = function(isConfirmed) {
    window.closeModal('modal-confirm');
    if (promptCallback) promptCallback(isConfirmed);
};

const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('reveal-visible'); });
}, { threshold: 0.1 });
function observeReveals() { document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el)); }

window.openAuthModal = function() {
    setAuthGateLock(true);
};

window.switchAuthTab = function(tab) {
    document.getElementById('form-login').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('form-reset').style.display = tab === 'reset' ? 'block' : 'none';
    
    const authTabsContainer = document.getElementById('auth-tabs-container');
    const authDivider = document.getElementById('auth-divider');
    const googleBtn = document.getElementById('auth-google-btn');
    const guestBtn = document.getElementById('auth-guest-btn');
    const authTitle = document.getElementById('auth-title');
    const authSub = document.getElementById('auth-subtitle');
    
    if (tab === 'reset') {
        if (authTabsContainer) authTabsContainer.style.display = 'none';
        if (authDivider) authDivider.style.display = 'none';
        if (googleBtn) googleBtn.style.display = 'none';
        if (guestBtn) guestBtn.style.display = 'none';
        authTitle.innerText = 'Pulihkan Kata Sandi'; 
        authSub.innerText = 'Masukkan email terdaftar untuk menerima tautan reset.';
    } else {
        if (authTabsContainer) authTabsContainer.style.display = 'flex';
        if (authDivider) authDivider.style.display = 'flex';
        if (googleBtn) googleBtn.style.display = 'inline-flex';
        if (guestBtn) guestBtn.style.display = 'inline-flex';
        authTitle.innerText = tab === 'login' ? 'Masuk ke Vipercell' : 'Daftar Member Vipercell';
        authSub.innerText = tab === 'login' ? 'Silakan masuk ke akun kamu atau pilih akses cepat di bawah.' : 'Daftar gratis untuk menyimpan riwayat E-Receipt otomatis.';
        
        const btnL = document.getElementById('tab-login');
        const btnR = document.getElementById('tab-register');
        if (btnL) btnL.className = tab === 'login' ? 'active' : '';
        if (btnR) btnR.className = tab === 'register' ? 'active' : '';
    }
};
window.showResetPassword = () => window.switchAuthTab('reset');

window.switchMainTab = function(tab) {
    if (document.body.classList.contains('auth-locked') && tab !== 'auth') {
        return;
    }

    if (tab !== 'payment-qris' && activeTimersRegistry.qrisCountdown) {
        clearInterval(activeTimersRegistry.qrisCountdown);
        activeTimersRegistry.qrisCountdown = null;
    }

    document.querySelectorAll('.main-tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('nav a').forEach(el => el.classList.remove('active'));
    
    const navKey = tab === 'baca-berita' ? 'berita' : (tab === 'payment-qris' ? 'pesanan' : tab);
    let navEl = document.getElementById('nav-' + navKey);
    if (navEl) navEl.classList.add('active');
    let botNavEl = document.getElementById('nav-bot-' + navKey);
    if (botNavEl) botNavEl.classList.add('active');
    
    let tabEl = document.getElementById('tab-' + tab);
    if (tabEl) {
        tabEl.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'instant' }); 
    }
    
    if (tab === 'bantuan') {
        checkChatUserState();
        const chatBadgeDesk = document.getElementById('user-chat-badge-desktop');
        const chatBadgeMob = document.getElementById('user-chat-badge-mobile');
        if (chatBadgeDesk) chatBadgeDesk.style.display = 'none';
        if (chatBadgeMob) chatBadgeMob.style.display = 'none';
    }
    if (tab === 'profil') {
        applyUserSessionToUI();
        updateProfileStats();
        updateProfileNotifToggleUI();
    }
    if (tab === 'pesanan') window.renderUserOrders();
    setTimeout(observeReveals, 50);
};

window.goToReview = function(brandName, orderId = null) {
    window.closeModal('modal-order-detail');
    targetReviewOrderId = orderId;
    window.openDirectBuyModal(brandName);
    setTimeout(() => {
        window.switchBuyModalTab('reviews');
    }, 220); 
};

// ==========================================
// AUTHENTICATION & LOGOUT
// ==========================================
window.processLogin = async function() {
    const em = document.getElementById('auth-l-email').value.trim();
    const pw = document.getElementById('auth-l-pass').value.trim();
    if (!em || !pw) { window.customAlert('Error', 'Email dan Kata Sandi wajib diisi!', 'error'); return; }
    
    const btn = document.getElementById('btn-do-login');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Memproses...</span>'; 
    btn.disabled = true;
    try {
        const cred = await signInWithEmailAndPassword(auth, em, pw);
        currentUser = cred.user;
        localStorage.setItem('vipercell_active_session_mode', 'member');
        await syncUserProfileFromAuth(cred.user);
        const restricted = await checkRealtimeAccountRestriction();
        if (!restricted) {
            setAuthGateLock(false);
            window.switchMainTab('katalog');
            window.showToast('Berhasil Masuk', 'Selamat datang kembali di Vipercell!', 'success');
        }
    } catch (e) { window.customAlert('Gagal Masuk', 'Email atau kata sandi tidak cocok.', 'error'); } 
    finally { 
        btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> <span>Masuk Sekarang</span>'; 
        btn.disabled = false; 
    }
};

window.processRegister = async function() {
    const name = document.getElementById('auth-r-name').value.trim();
    const phone = document.getElementById('auth-r-phone') ? document.getElementById('auth-r-phone').value.trim() : '';
    const em = document.getElementById('auth-r-email').value.trim();
    const pw = document.getElementById('auth-r-pass').value.trim();
    
    if (!name || !em || pw.length < 6) { 
        window.customAlert('Peringatan', 'Harap lengkapi Nama, Email, dan Kata Sandi minimal 6 karakter.', 'warning');
        return; 
    }
    
    const btn = document.getElementById('btn-do-register');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Memproses...</span>'; 
    btn.disabled = true;
    try {
        if (auth.currentUser && auth.currentUser.isAnonymous) {
            await signOut(auth).catch(() => {});
        }
        const cred = await createUserWithEmailAndPassword(auth, em, pw);
        const newMemberObj = { 
            uid: cred.user.uid,
            email: em, 
            name: name, 
            phone: phone,
            whatsapp: phone,
            role: 'member',
            isAnonymous: false,
            isGuest: false, 
            isBlocked: false,
            isDeleted: false,
            verified: true, 
            deviceId: currentDeviceId,
            createdAt: Date.now() 
        };
        await setDoc(doc(db, pathUsers, cred.user.uid), newMemberObj, { merge: true });
        if (currentDeviceId) {
            setDoc(doc(db, pathDeviceLocks, currentDeviceId), {
                uid: cred.user.uid,
                role: 'member',
                status: 'upgraded_to_member',
                updatedAt: Date.now()
            }, { merge: true }).catch(() => {});
        }
        userProfile = newMemberObj;
        localStorage.setItem('vipercell_anon_name', name);
        localStorage.setItem('vipercell_track_email', em);
        localStorage.setItem('vipercell_active_session_mode', 'member');
        setAuthGateLock(false);
        applyUserSessionToUI();
        window.switchMainTab('katalog');
        window.customAlert('Pendaftaran Berhasil', 'Akun member kamu telah aktif dan siap digunakan!', 'success');
    } catch (e) { window.customAlert('Gagal Daftar', 'Email mungkin sudah terdaftar atau format salah.', 'error'); } 
    finally { 
        btn.innerHTML = '<i class="fa-solid fa-user-check"></i> <span>Buat Akun Member</span>'; 
        btn.disabled = false; 
    }
};

function checkResetCooldown() {
    const lastResetTime = localStorage.getItem('vipercell_last_reset') || 0;
    const COOLDOWN = 4 * 60 * 1000;
    const now = Date.now();
    if (now - lastResetTime < COOLDOWN) {
        const remaining = Math.ceil((COOLDOWN - (now - lastResetTime)) / 1000);
        const min = Math.floor(remaining / 60); const sec = remaining % 60;
        window.customAlert('Tunggu Sebentar', `Harap tunggu <b>${min}m ${sec}s</b> sebelum mengirim ulang link reset.`, 'warning');
        return false;
    }
    return true;
}

window.processReset = async function() {
    const em = document.getElementById('auth-res-email').value.trim();
    if (!em) { window.customAlert('Error', 'Masukkan email terdaftar.', 'error'); return; }
    if (!checkResetCooldown()) return;
    
    const btn = document.getElementById('btn-do-reset');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Memproses...</span>';
    btn.disabled = true;
    try {
        await sendPasswordResetEmail(auth, em);
        localStorage.setItem('vipercell_last_reset', Date.now());
        window.customAlert('Terkirim', 'Tautan reset kata sandi telah dikirim ke email kamu.', 'success');
        window.switchAuthTab('login');
    } catch (e) { window.customAlert('Error', 'Gagal mengirim tautan reset.', 'error'); }
    finally {
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span>Kirim Tautan Reset</span>';
        btn.disabled = false;
    }
};

window.sendProfileResetPassword = async function() {
    if (!currentUser || userProfile.isGuest) return;
    if (!checkResetCooldown()) return;
    try {
        await sendPasswordResetEmail(auth, userProfile.email || currentUser.email);
        localStorage.setItem('vipercell_last_reset', Date.now());
        window.customAlert('Terkirim', 'Cek kotak masuk email kamu untuk mengatur kata sandi baru.', 'success');
    } catch (e) { window.customAlert('Gagal', 'Terjadi kesalahan saat mengirim email reset.', 'error'); }
};

window.processGoogleLogin = async function() {
    const provider = new GoogleAuthProvider();
    const btnText = document.getElementById('text-google-btn');
    const ogText = btnText ? btnText.innerText : 'Lanjutkan dengan Google';
    if (btnText) btnText.innerText = 'Memverifikasi...';
    
    try {
        const result = await signInWithPopup(auth, provider);
        const userDoc = await getDoc(doc(db, pathUsers, result.user.uid)).catch(() => null);
        
        if (!userDoc || !userDoc.exists()) {
            await setDoc(doc(db, pathUsers, result.user.uid), { 
                uid: result.user.uid,
                email: result.user.email, 
                name: result.user.displayName || 'Member Google', 
                phone: '',
                whatsapp: '',
                role: 'member',
                isAnonymous: false,
                isGuest: false, 
                isBlocked: false,
                isDeleted: false,
                verified: true, 
                deviceId: currentDeviceId,
                createdAt: Date.now() 
            }, { merge: true });
        }
        localStorage.setItem('vipercell_active_session_mode', 'member');
        await syncUserProfileFromAuth(result.user);
        const restricted = await checkRealtimeAccountRestriction();
        if (!restricted) {
            setAuthGateLock(false);
            window.switchMainTab('katalog');
            window.showToast('Berhasil Masuk', 'Login menggunakan Google berhasil!', 'success');
        }
    } catch (error) {
        console.error(error);
    } finally {
        if (btnText) btnText.innerText = ogText;
    }
};

window.logoutUser = async function() {
    localStorage.setItem('vipercell_active_session_mode', 'logged_out');

    if (currentUser && !currentUser.isAnonymous) {
        await signOut(auth).catch(() => {});
        currentUser = null;
    }

    setAuthGateLock(true);
    window.showToast('Berhasil Keluar', 'Anda telah keluar ke halaman Login utama.', 'info');
};

window.saveUserProfile = async function() {
    if (!currentUser) return;
    const name = document.getElementById('prof-name').value.trim();
    const phone = document.getElementById('prof-phone') ? document.getElementById('prof-phone').value.trim() : '';
    if (!name) { window.customAlert('Peringatan', 'Nama panggilan tidak boleh kosong.', 'warning'); return; }
    
    const effectiveUid = (currentUser.isAnonymous && boundLegacyGuestUid) ? boundLegacyGuestUid : currentUser.uid;
    try {
        await setDoc(doc(db, pathUsers, effectiveUid), {
            name: name,
            phone: phone,
            whatsapp: phone,
            updatedAt: Date.now()
        }, { merge: true });
        userProfile.name = name;
        userProfile.phone = phone;
        userProfile.whatsapp = phone;
        localStorage.setItem('vipercell_anon_name', name);
        if (phone) localStorage.setItem('vipercell_track_phone', phone);
        applyUserSessionToUI();
        window.showToast('Profil Disimpan', 'Data identitas & nomor WhatsApp berhasil diperbarui.', 'success');
    } catch (e) { window.customAlert('Error', 'Gagal menyimpan perubahan profil.', 'error'); }
};

function updateProfileStats() {
    const effectiveUid = boundLegacyGuestUid || currentUser?.uid || '';
    const savedTrackEmail = (localStorage.getItem('vipercell_track_email') || '').toLowerCase();
    const activeEmail = (!userProfile.isGuest && userProfile.email) ? userProfile.email.toLowerCase() : savedTrackEmail;

    const myOrders = orders.filter(o =>
        (effectiveUid && o.userId === effectiveUid) ||
        (currentUser && o.userId === currentUser.uid) ||
        (activeEmail && o.userEmail?.toLowerCase() === activeEmail)
    );
    const successOrders = myOrders.filter(o => o.status === 'SUCCESS');
    const totalSpent = successOrders.reduce((sum, o) => sum + (o.finalTotal || 0), 0);

    const totalEl = document.getElementById('prof-stat-total');
    const statEl = document.getElementById('prof-stat-success');
    const spentEl = document.getElementById('prof-stat-spent');

    if (totalEl) totalEl.innerText = myOrders.length;
    if (statEl) statEl.innerText = successOrders.length;
    if (spentEl) spentEl.innerText = `Rp${totalSpent.toLocaleString('id-ID')}`;
}

// ==========================================
// RENDER SETTINGS, BANNERS, BERITA & BARCODE TUNAI
// ==========================================
window.applySettingsToUI = function() {
    const logoDasar = siteSettings.logoText || 'VIPER';
    const logoAksen = siteSettings.logoAccent || 'CELL';
    
    const slt = document.getElementById('site-logo-text');
    const flt = document.getElementById('footer-logo-text-2');
    if (slt) slt.innerHTML = `${escapeHtml(logoDasar)}<span>${escapeHtml(logoAksen)}</span>`;
    if (flt) flt.innerHTML = `${escapeHtml(logoDasar)}<span>${escapeHtml(logoAksen)}</span>`;
    
    const imgEl = document.getElementById('site-logo-img');
    const fImgEl = document.getElementById('footer-logo-img-2');
    
    if (siteSettings.logoImgBase64) {
        if (imgEl) { imgEl.src = siteSettings.logoImgBase64; imgEl.style.display = 'block'; }
        if (fImgEl) { fImgEl.src = siteSettings.logoImgBase64; fImgEl.style.display = 'block'; }
    } else {
        if (imgEl) imgEl.style.display = 'none'; 
        if (fImgEl) fImgEl.style.display = 'none'; 
    }
    
    const mText = siteSettings.marquee || 'Selamat Datang di Vipercell';
    const mt1 = document.getElementById('marquee-text-1');
    const mt2 = document.getElementById('marquee-text-2');
    if (mt1) mt1.innerText = mText; if (mt2) mt2.innerText = mText;
    
    const igBtn = document.getElementById('footer-ig-btn');
    if (igBtn) {
        if (siteSettings.igLink) { igBtn.href = siteSettings.igLink; igBtn.style.display = 'inline-flex'; }
        else { igBtn.style.display = 'none'; }
    }
    
    const ttBtn = document.getElementById('footer-tt-btn');
    if (ttBtn) {
        if (siteSettings.ttLink) { ttBtn.href = siteSettings.ttLink; ttBtn.style.display = 'inline-flex'; }
        else { ttBtn.style.display = 'none'; }
    }
    
    let adminWaNum = siteSettings.adminWa || '085656321860';
    if (adminWaNum.startsWith('0')) adminWaNum = '62' + adminWaNum.substring(1);
    const waHref = `https://wa.me/${adminWaNum}?text=${encodeURIComponent('Halo Min Vipercell')}`;
    
    const fWaLink = document.getElementById('footer-wa-link');
    if (fWaLink) fWaLink.href = waHref;
    
    const waChanBtn = document.getElementById('btn-wa-channel');
    if (waChanBtn) waChanBtn.href = siteSettings.waChannelLink || waHref;
    
    const storeBadge = document.getElementById('store-status-badge');
    if (storeBadge) storeBadge.style.display = siteSettings.isStoreOpen === false ? 'inline-block' : 'none';
    
    checkChatUserState();
    window.renderBanners();
    window.renderNews();
};

window.renderBanners = function() {
    const container = document.getElementById('banner-container');
    const track = document.getElementById('banner-track');
    const dotsContainer = document.getElementById('banner-dots');
    
    if (!container || !track || !dotsContainer) return;
    const banners = siteSettings.banners || [];
    
    if (banners.length === 0) { container.style.display = 'none'; return; }
    
    container.style.display = 'block';
    setTimeout(() => { container.classList.add('reveal-visible'); }, 50);
    
    let trackHtml = ''; let dotsHtml = '';
    banners.forEach((b64, idx) => {
        trackHtml += `<img src="${b64}" class="banner-slide" alt="Promo Vipercell" loading="lazy" decoding="async">`;
        dotsHtml += `<div class="banner-dot ${idx === 0 ? 'active' : ''}" onclick="window.goToBanner(${idx})"></div>`;
    });
    track.innerHTML = trackHtml; dotsContainer.innerHTML = dotsHtml;
    window.startBannerAuto();
};

let currentBanner = 0;
window.goToBanner = function(idx) {
    currentBanner = idx;
    const track = document.getElementById('banner-track');
    const dots = document.querySelectorAll('.banner-dot');
    if (!track) return;
    
    track.style.transform = `translateX(-${currentBanner * 100}%)`;
    dots.forEach(d => d.classList.remove('active'));
    if (dots[currentBanner]) dots[currentBanner].classList.add('active');
};
window.startBannerAuto = function() {
    if (activeTimersRegistry.bannerSlider) clearInterval(activeTimersRegistry.bannerSlider);
    activeTimersRegistry.bannerSlider = setInterval(() => {
        const total = siteSettings.banners?.length || 0;
        if (total > 1) { currentBanner = (currentBanner + 1) % total; window.goToBanner(currentBanner); }
    }, 5000);
};

window.renderNews = function() {
    const grid = document.getElementById('public-news-list');
    if (!grid) return;
    
    const list = siteSettings.newsList || [];
    const visibleList = list.filter(t => !t.isHidden);
    
    if (visibleList.length === 0) {
        grid.innerHTML = '<div class="brutal-empty-box" style="grid-column: 1/-1;">Belum ada artikel berita atau pengumuman terbaru.</div>';
        return;
    }
    
    let html = '';
    visibleList.forEach((news, idx) => {
        const coverHtml = news.imageUrl
            ? `<img src="${news.imageUrl}" class="news-cover-img" alt="${escapeHtml(news.title)}" loading="lazy" decoding="async">`
            : `<div class="news-cover-placeholder"><i class="fa-solid fa-newspaper"></i></div>`;

        const hasLinkedProd = Boolean(news.enableProductBtn && news.linkedBrand);
        const safeJsLinked = hasLinkedProd ? escapeJsStr(news.linkedBrand) : '';
        const prodBadgeHtml = hasLinkedProd
            ? `<span class="brutal-tag tag-success" style="margin-left:6px;"><i class="fa-solid fa-tag"></i> ${escapeHtml(news.linkedBrand)}</span>`
            : '';

        const directBuyBtnHtml = hasLinkedProd
            ? `<button class="btn btn-primary btn-sm" style="flex:1;" onclick="event.stopPropagation(); window.openDirectBuyModal('${safeJsLinked}')">
                   <i class="fa-solid fa-cart-shopping"></i> Beli ${escapeHtml(news.linkedBrand)}
               </button>`
            : '';

        html += `
            <article class="news-article-card" onclick="window.openReadNewsFullPage(${idx})">
                <div>
                    ${coverHtml}
                    <div class="news-card-body">
                        <div>
                            <div style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
                                <span class="brutal-tag tag-primary"><i class="fa-solid fa-bullhorn"></i> INFO VIPERCELL</span>
                                ${prodBadgeHtml}
                            </div>
                            <h3 class="news-card-title">${escapeHtml(news.title)}</h3>
                            <p class="news-card-excerpt">${escapeHtml(news.desc)}</p>
                        </div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:4px;">
                            <button class="btn btn-outline btn-sm" style="flex:1;">
                                <i class="fa-solid fa-expand"></i> Baca Berita
                            </button>
                            ${directBuyBtnHtml}
                        </div>
                    </div>
                </div>
            </article>`;
    });
    grid.innerHTML = html;
};

window.openReadNewsFullPage = function(idx) {
    const list = (siteSettings.newsList || []).filter(t => !t.isHidden);
    const news = list[idx];
    if (!news) return;

    currentOpenedArticle = news;
    document.getElementById('full-news-title').innerText = news.title || 'Informasi Vipercell';
    document.getElementById('full-news-body').innerText = news.desc || '';
    const imgWrap = document.getElementById('full-news-img-wrap');
    const imgEl = document.getElementById('full-news-img');
    if (news.imageUrl && imgWrap && imgEl) {
        imgEl.src = news.imageUrl;
        imgWrap.style.display = 'block';
    } else if (imgWrap) {
        imgWrap.style.display = 'none';
    }

    const ctaBox = document.getElementById('full-news-product-cta');
    const ctaTitle = document.getElementById('full-news-cta-title');
    const ctaSub = document.getElementById('full-news-cta-sub');
    const ctaBtn = document.getElementById('btn-full-news-action');

    if (news.enableProductBtn && news.linkedBrand) {
        if (ctaBox) ctaBox.classList.add('linked-highlight');
        if (ctaTitle) ctaTitle.innerText = `Ingin langsung membeli produk ${news.linkedBrand}?`;
        if (ctaSub) ctaSub.innerText = `Klik tombol di samping untuk memilih varian ${news.linkedBrand} dan melakukan pembayaran instan!`;
        if (ctaBtn) {
            ctaBtn.className = 'btn btn-primary';
            ctaBtn.innerHTML = `<i class="fa-solid fa-bolt"></i> <span>Beli ${escapeHtml(news.linkedBrand)} Sekarang</span>`;
            ctaBtn.onclick = () => window.openDirectBuyModal(news.linkedBrand);
        }
    } else {
        if (ctaBox) ctaBox.classList.remove('linked-highlight');
        if (ctaTitle) ctaTitle.innerText = 'Tertarik dengan promo atau layanan di atas?';
        if (ctaSub) ctaSub.innerText = 'Langsung cek ketersediaan stoknya di katalog utama kami sekarang!';
        if (ctaBtn) {
            ctaBtn.className = 'btn btn-outline';
            ctaBtn.innerHTML = `<i class="fa-solid fa-store"></i> <span>Lihat Katalog Produk</span>`;
            ctaBtn.onclick = () => window.switchMainTab('katalog');
        }
    }

    window.switchMainTab('baca-berita');
};

window.shareCurrentArticle = function() {
    if (!currentOpenedArticle) return;
    if (navigator.share) {
        navigator.share({
            title: currentOpenedArticle.title,
            text: currentOpenedArticle.desc,
            url: window.location.href
        }).catch(() => {});
    } else {
        navigator.clipboard.writeText(`${currentOpenedArticle.title}\n\n${currentOpenedArticle.desc}`).then(() => {
            window.showToast('Artikel Disalin', 'Isi berita berhasil disalin untuk dibagikan.', 'success');
        });
    }
};

window.openCashBarcodeModal = function(orderObj = null) {
    window.closeModal('modal-order-detail');
    const session = orderObj || currentCheckoutSession;
    if (!session) return;

    const invCode = session.id;
    const itemTitle = session.itemName || (session.items && session.items[0] ? session.items[0].name : 'Pesanan Vipercell');
    const totalRp = session.finalTotal || 0;

    document.getElementById('cash-modal-inv').innerText = invCode;
    document.getElementById('cash-modal-item').innerText = itemTitle;
    document.getElementById('cash-modal-total').innerText = `Rp${totalRp.toLocaleString('id-ID')}`;

    const svgEl = document.getElementById('cash-barcode-svg');
    if (svgEl && typeof JsBarcode !== 'undefined') {
        svgEl.innerHTML = '';
        try {
            JsBarcode("#cash-barcode-svg", invCode, {
                format: "CODE128",
                lineColor: "#0f172a",
                background: "#ffffff",
                width: 2.2,
                height: 75,
                displayValue: true,
                font: "Space Grotesk",
                fontOptions: "bold",
                fontSize: 16,
                margin: 6
            });
        } catch (err) {
            console.error("Barcode Render Error:", err);
        }
    }

    currentCheckoutSession = {
        dbId: session.dbId,
        id: invCode,
        brandName: session.brandName || (session.items && session.items[0] ? session.items[0].brandName : ''),
        itemName: itemTitle,
        finalTotal: totalRp,
        method: 'cash',
        date: session.date
    };

    window.openModal('modal-cash-barcode');
};

window.confirmCashBarcodeToChat = function() {
    const invToTrack = currentCheckoutSession ? currentCheckoutSession.id : '';
    window.closeModal('modal-cash-barcode');
    if (invToTrack) {
        window.sendPredefinedChat(`Halo Admin, saya ingin melakukan pembayaran TUNAI (Barcode Kasir) untuk Invoice #${invToTrack}. Mohon di-scan ya Min.`);
    } else {
        window.switchMainTab('bantuan');
    }
};

window.sendPredefinedChat = function(message) {
    window.closeAlert();
    window.closeModal('modal-order-detail');
    window.closeModal('modal-cash-barcode');
    window.switchMainTab('bantuan');
    const savedName = userProfile.name || localStorage.getItem('vipercell_anon_name') || '';
    if (savedName) {
        userProfile.name = savedName;
        checkChatUserState();
        document.getElementById('user-chat-input').value = message;
        window.sendUserChat();
    } else {
        document.getElementById('chat-anon-name').focus();
        window.pendingMsgToAdmin = message;
    }
};

window.copyNominal = function() {
    if (!currentCheckoutSession) return;
    const nominal = currentCheckoutSession.finalTotal.toString();
    navigator.clipboard.writeText(nominal).then(() => {
        window.showToast('Nominal Disalin', `Angka Rp${Number(nominal).toLocaleString('id-ID')} berhasil disalin.`, 'success');
    });
};

window.resumePayment = function(dbId) {
    const order = orders.find(o => o.dbId === dbId);
    if (!order) return;
    currentCheckoutSession = {
        dbId: order.dbId,
        id: order.id,
        brandName: order.items && order.items[0] ? order.items[0].brandName : '',
        itemName: order.items && order.items[0] ? order.items[0].name : 'Pesanan Vipercell',
        finalTotal: order.finalTotal,
        method: order.paymentMethod,
        date: order.date
    };
    if (order.paymentMethod === 'cash') window.openCashBarcodeModal(order);
    else window.openQRISModal();
};

window.goToPesananFromPay = function() {
    const orderIdToTrack = currentCheckoutSession ? currentCheckoutSession.id : '';
    window.switchMainTab('pesanan');
    if (orderIdToTrack) {
        window.openOrderDetailModalById(orderIdToTrack);
    }
};

// ==========================================
// FITUR ULASAN: 1X ULASAN PER TRANSAKSI
// ==========================================
function getUnreviewedSuccessOrdersForBrand(brandName) {
    const effectiveUid = boundLegacyGuestUid || currentUser?.uid || '';
    const userEmailToMatch = (userProfile.email || localStorage.getItem('vipercell_track_email') || '').toLowerCase();
    
    const mySuccessOrders = orders.filter(o => {
        if (o.status !== 'SUCCESS') return false;
        if (!o.items || o.items[0]?.brandName !== brandName) return false;
        const matchUid = (effectiveUid && o.userId === effectiveUid) || (currentUser && o.userId === currentUser.uid);
        const matchEmail = userEmailToMatch && o.userEmail && o.userEmail.toLowerCase() === userEmailToMatch;
        return matchUid || matchEmail;
    });

    const unreviewedOrders = mySuccessOrders.filter(o => {
        const reviewedByOrderId = reviewsData.some(r => r.orderId && r.orderId === o.id);
        return !reviewedByOrderId;
    });

    const legacyReviewsCount = reviewsData.filter(r =>
        !r.orderId &&
        r.brandName === brandName &&
        ((effectiveUid && r.userId === effectiveUid) || (currentUser && r.userId === currentUser.uid) || (userEmailToMatch && r.userEmail?.toLowerCase() === userEmailToMatch))
    ).length;

    if (legacyReviewsCount >= unreviewedOrders.length) {
        return [];
    }

    return unreviewedOrders.slice(0, unreviewedOrders.length - legacyReviewsCount);
}

window.renderReviewsUI = function() {
    if (!currentCheckoutBrand) return;

    const brandName = currentCheckoutBrand.brandName;
    const reviewListContainer = document.getElementById('review-list-container');
    const writeContainer = document.getElementById('review-write-container');
    
    const eligibleOrders = getUnreviewedSuccessOrdersForBrand(brandName);
    let activeOrderForReview = null;

    if (eligibleOrders.length > 0) {
        if (targetReviewOrderId) {
            activeOrderForReview = eligibleOrders.find(o => o.id === targetReviewOrderId) || eligibleOrders[0];
        } else {
            activeOrderForReview = eligibleOrders[0];
        }
        targetReviewOrderId = activeOrderForReview.id;
    } else {
        targetReviewOrderId = null;
    }

    if (writeContainer) {
        if (activeOrderForReview) {
            writeContainer.style.display = 'block';
            const stepHead = writeContainer.querySelector('.step-header h4');
            if (stepHead) {
                stepHead.innerHTML = `Tulis Ulasan <span class="brutal-tag tag-primary" style="margin-left:8px;">INVOICE #${escapeHtml(activeOrderForReview.id)}</span>`;
            }
        } else {
            writeContainer.style.display = 'none';
        }
    }

    const brandReviews = reviewsData.filter(r => r.brandName === brandName).sort((a, b) => b.timestamp - a.timestamp);
    
    if (brandReviews.length === 0) {
        reviewListContainer.innerHTML = `<div class="brutal-empty-box"><i class="fa-regular fa-comment-dots" style="font-size:2rem; margin-bottom:8px; display:block;"></i>Belum ada ulasan untuk produk ini.</div>`;
        return;
    }
    
    let html = '';
    brandReviews.forEach(r => {
        let starsHtml = '';
        for (let i = 0; i < 5; i++) {
            if (i < r.rating) starsHtml += `<i class="fa-solid fa-star" style="color:var(--warning); font-size:0.85rem;"></i>`;
            else starsHtml += `<i class="fa-regular fa-star" style="color:var(--text-muted); font-size:0.85rem;"></i>`;
        }

        const invBadge = r.orderId ? `<span class="brutal-tag tag-success" style="font-size:0.6rem; padding:2px 6px;">#${escapeHtml(r.orderId)}</span>` : '';
        
        const adminReplyHtml = r.adminReply ? `
            <div style="margin-top: 10px; padding: 10px 12px; background: var(--surface); border-left: 3.5px solid var(--primary); border-radius: 8px; border: 1.5px solid var(--border);">
                <div style="font-size: 0.74rem; font-weight: 800; color: var(--primary-light); margin-bottom: 3px;">
                    <i class="fa-solid fa-reply"></i> BALASAN ADMIN VIPERCELL:
                </div>
                <p style="font-size: 0.84rem; font-weight: 600; color: var(--text); margin: 0;">${escapeHtml(r.adminReply)}</p>
            </div>
        ` : '';

        html += `
        <div style="background:var(--bg); border:var(--brutal-border); padding:14px; border-radius:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:6px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <strong style="color:var(--text); font-size:0.9rem; font-weight:800;">${escapeHtml(r.userName || 'Pelanggan Vipercell')}</strong>
                    ${invBadge}
                </div>
                <span style="font-size:0.72rem; font-weight:700; color:var(--text-muted);">${new Date(r.timestamp).toLocaleDateString('id-ID')}</span>
            </div>
            <div style="margin-bottom:8px; display:flex; gap:3px;">${starsHtml}</div>
            <p style="font-size:0.86rem; font-weight:600; color:var(--text); margin:0;">"${escapeHtml(r.text)}"</p>
            ${adminReplyHtml}
        </div>`;
    });
    
    reviewListContainer.innerHTML = html;
};

window.submitReview = async function() {
    if (isSubmittingReview || !currentCheckoutBrand) return;

    const textInput = document.getElementById('review-text').value.trim();
    const rating = window.selectedReviewStar || 5;
    
    if (!textInput) { window.customAlert('Ulasan Kosong', 'Silakan tulis pengalaman belanjamu terlebih dahulu.', 'warning'); return; }
    
    const eligibleOrders = getUnreviewedSuccessOrdersForBrand(currentCheckoutBrand.brandName);
    if (eligibleOrders.length === 0) {
        window.customAlert('Sudah Diulas', 'Kamu sudah memberikan ulasan untuk transaksi ini (Maksimal 1x ulasan per transaksi).', 'warning');
        window.renderReviewsUI();
        return;
    }

    const orderToReview = (targetReviewOrderId && eligibleOrders.find(o => o.id === targetReviewOrderId)) || eligibleOrders[0];

    isSubmittingReview = true;
    const anonName = localStorage.getItem('vipercell_anon_name');
    const userName = userProfile.name ? userProfile.name : (anonName ? anonName : 'Pelanggan Vipercell');
    
    const btnSubmit = document.getElementById('btn-submit-review');
    const ogHtml = btnSubmit.innerHTML;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Mempublikasikan...</span>';
    btnSubmit.disabled = true;

    const effectiveUid = boundLegacyGuestUid || currentUser?.uid || null;
    const newReview = {
        orderId: orderToReview.id,
        brandName: currentCheckoutBrand.brandName,
        userEmail: userProfile.email || localStorage.getItem('vipercell_track_email') || orderToReview.userEmail || 'anonim',
        userId: effectiveUid,
        userName: userName,
        rating: rating,
        text: textInput,
        timestamp: Date.now()
    };
    
    try {
        await addDoc(collection(db, pathReviews), newReview);
        document.getElementById('review-text').value = '';
        targetReviewOrderId = null;
        window.setReviewStar(5);
        window.customAlert('Terima Kasih!', `Ulasanmu untuk transaksi <b>#${orderToReview.id}</b> berhasil dipublikasikan!`, 'success');
        window.renderReviewsUI();
    } catch (e) {
        window.customAlert('Gagal', 'Gagal mengirim ulasan. Pastikan jaringan kamu stabil.', 'error');
    } finally {
        isSubmittingReview = false;
        btnSubmit.innerHTML = ogHtml;
        btnSubmit.disabled = false;
    }
};

// ==========================================
// FUNGSI HELPER & FALLBACK TAMBAHAN (PENUTUP STORE.JS V25.1)
// ==========================================
window.togglePassVisibility = function(inputId, btnEl) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    const icon = btnEl ? btnEl.querySelector('i') : null;
    if (inp.type === 'password') {
        inp.type = 'text';
        if (icon) icon.className = 'fa-regular fa-eye-slash';
    } else {
        inp.type = 'password';
        if (icon) icon.className = 'fa-regular fa-eye';
    }
};

window.switchBuyModalTab = function(tabName) {
    document.getElementById('tab-buy-form')?.classList.remove('active');
    document.getElementById('tab-buy-reviews')?.classList.remove('active');
    
    const formEl = document.getElementById('buy-content-form');
    const revEl = document.getElementById('buy-content-reviews');
    if (formEl) formEl.style.display = 'none';
    if (revEl) revEl.style.display = 'none';
    
    document.getElementById('tab-buy-' + tabName)?.classList.add('active');
    const targetEl = document.getElementById('buy-content-' + tabName);
    if (targetEl) targetEl.style.display = 'block';
    
    if (tabName === 'reviews' && typeof window.renderReviewsUI === 'function') {
        window.renderReviewsUI();
    }
};

window.toggleDescMore = function() {
    const box = document.getElementById('buy-detail-fields');
    const fade = document.getElementById('buy-desc-fade');
    const btn = document.getElementById('btn-desc-more');
    if (box) box.style.maxHeight = '2000px'; 
    if (fade) fade.style.display = 'none'; 
    if (btn) btn.style.display = 'none'; 
};

window.selectedReviewStar = 5;
window.setReviewStar = function(val) {
    window.selectedReviewStar = val;
    const starWrap = document.getElementById('review-stars');
    if (!starWrap) return;
    const stars = starWrap.children;
    for (let i = 0; i < stars.length; i++) {
        if (i < val) {
            stars[i].style.color = 'var(--warning)';
            stars[i].classList.remove('fa-regular');
            stars[i].classList.add('fa-solid');
        } else {
            stars[i].style.color = 'var(--text-muted)';
            stars[i].classList.remove('fa-solid');
            stars[i].classList.add('fa-regular');
        }
    }
};

window.downloadQRIS = function() {
    const qrElement = document.getElementById('qris-capture-area') || document.getElementById('qrcode-container');
    if (!qrElement || typeof html2canvas === 'undefined') return;

    html2canvas(qrElement, { backgroundColor: '#ffffff', scale: 2 }).then(canvas => {
        const link = document.createElement('a');
        link.download = `QRIS_Vipercell_${currentCheckoutSession?.id || 'Pay'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    });
};

window.downloadCashBarcode = function() {
    const barcodeEl = document.getElementById('cash-barcode-capture');
    if (!barcodeEl || typeof html2canvas === 'undefined') return;

    html2canvas(barcodeEl, { backgroundColor: '#ffffff', scale: 2 }).then(canvas => {
        const link = document.createElement('a');
        link.download = `Tiket_Tunai_Vipercell_${currentCheckoutSession?.id || 'Cash'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    });
};

window.copyInvoiceIdModal = function() {
    const invIdEl = document.getElementById('pay-modal-invoice-id');
    if (invIdEl && invIdEl.innerText !== '-') {
        const cleanInv = invIdEl.innerText.replace(/^#/, '');
        navigator.clipboard.writeText(cleanInv).then(() => {
            if (window.showToast) window.showToast('Tersalin', 'ID Invoice berhasil disalin ke Papan Klip.', 'success');
        });
    }
};

// Jalankan Zero-Leak Pre-Loader & Inisialisasi Aplikasi V25.1
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAppWithLoader);
} else {
    initializeAppWithLoader();
}
