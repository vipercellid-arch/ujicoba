/* ============================================================================
 * VIPERCELL V27.0 - STOREFRONT ENGINE (WEB USER - NEO-BRUTALISM V3)
 * Nama File : js/store.js
 * Standar Arsitektur : Modular Feature Blocks ([FEATURE-01] s/d [FEATURE-25])
 * Pembaruan Utama V27.0:
 *  1. Tanpa Panel Pop-Up Mengambang (Full-Page Seamless View & Top Inline Banner)
 *  2. Hapus Tombol Kirim Email di Riwayat Transaksi Web User (Khusus di Admin)
 *  3. Otomatis Kirim Email Saat Stok Lokal Terkirim + Lacak Cukup Input ID Trx Saja
 *  4. Akun Anonim Terhapus Otomatis Setiap 6 Jam (Bisa Dihidupkan/Dimatikan Admin)
 *  5. Halaman & Alur Ubah Kata Sandi via Link Google Apps Script (Neo-Brutalism V3)
 *  6. Navigasi Mode Desktop Kapsul Lingkaran Penuh
 *  7. Efek Transisi Halus Tema Terang <-> Gelap
 *  8. Katalog Utama Tampil Semua + Tombol "Lihat Selengkapnya" & "Tutup Kembali" Variasi
 *  9. Dukungan Mega Footer Enterprise & Status Server Real-Time
 * 10. Perbaikan Permanen Bug Tiba-Tiba Ter-Logout ("Akun Telah Dihapus oleh Admin")
 * 11. Running Text Info Multi-Pesan (Hingga 6 Pesan) Interaktif Klik ke Promo/Berita
 * 12. Frosted Glass Translucent Preloader (Anti-Bocor & Cepat)
 * 13. Kode Promo: Pilihan Semua User atau Khusus Member Resmi (Non-Anonim)
 * 14. Sembunyikan Kolom Isi Email & No HP Saat Checkout untuk Member Resmi
 * 15. Tombol Upgrade Akun Anonim ke Member Resmi HANYA Ada di Tab Profil
 * 16. Perbaikan Favicon & Meta Icon Logo Web agar Selalu Tampil di Link Web
 * 17. Format Stok Produk Email ("email|password|refresh_token|client_id" + Link Akses Tanpa Login + Copy Utuh)
 * 18. Stok Produk Otomatis dari Tab Stok + 3 Mode (Otomatis, Manual, Tanya & Otomatis)
 * 19. Kode Promo Hanya Bisa 1 Email 1x Pakai
 * 20, 23, 24. Tampilan Baru Tab CS Bantuan & Panel Chat (Tanpa Pesan Cepat di Sisi User)
 * 21, 25. Sistem UI Neo-Brutalism V3 & Tipografi Multi-Font Estetik
 * 22. Isolasi Penuh Data Email & Transaksi Sesi Anonim Baru vs Akun Member di HP Sama
 * ============================================================================ */

import { 
    db, auth,
    signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword,
    sendPasswordResetEmail, updatePassword, GoogleAuthProvider, EmailAuthProvider, linkWithCredential, deleteUser,
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

// Konstanta Durasi Auto-Delete Anonim 6 Jam (21.600.000 ms)
const ANON_AUTO_DELETE_TTL_MS = 6 * 60 * 60 * 1000;

// SVG Default Favicon Vipercell V27 ([FEATURE-16])
const DEFAULT_VIPERCELL_SVG_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' rx='116' fill='%232563eb' stroke='%230f172a' stroke-width='28'/%3E%3Cpath d='M298 88L136 288h116l-44 136 168-200H260l38-136z' fill='%23facc15' stroke='%230f172a' stroke-width='18' stroke-linejoin='round'/%3E%3C/svg%3E";

// ==========================================
// STATE & VARIABEL GLOBAL (V27.0)
// ==========================================
let products = [];
let groupedBrands = []; 
let orders = [];
let promos = [];
let reviewsData = [];
let liveReadyStocksMap = {}; // Peta stok Ready dari koleksi `stocks` ([FEATURE-18])

let siteSettings = { 
    logoText: 'VIPER',
    logoAccent: 'CELL',
    logoImgBase64: '',
    pwaIconBase64: '',
    marquee: 'Selamat Datang di Vipercell V27! Layanan Otomatis 24 Jam.',
    marqueeList: [], // Hingga 6 pesan interaktif ([FEATURE-11])
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
    anonAutoDelete6h: true, // Fitur Auto-Delete Anonim setiap 6 jam ([FEATURE-04])
    defaultEmailPortalUrl: '', // Link akses web ambil kode email tanpa login ([FEATURE-17])
    deletedUids: [],
    blockedUids: [],
    blockedDevices: []
};

let currentDeviceId = '';
let boundLegacyGuestUid = null;
let userProfile = {
    uid: '',
    name: '',
    email: '',
    phone: '',
    whatsapp: '',
    role: 'anonymous',
    isAnonymous: true,
    isGuest: true,
    sessionStartedAt: 0
};
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
let parsedMarqueeSlots = [];

// Smart Accordion & Filter States ([FEATURE-08])
let currentBrandFilter = 'all';
let currentSearchQuery = '';
let isCatalogExpanded = true; // Katalog utama tampil penuh di V27 ([FEATURE-08])
let isVariantsExpanded = false;
let currentVariantSearchQuery = '';
let currentUserHistoryFilter = 'ALL';

// Timer Debounce untuk Input Pencarian Cepat
let catalogSearchDebounceTimer = null;
let variantSearchDebounceTimer = null;

// State Verifikasi OTP 6-Digit ([FEATURE-02 & FEATURE-15])
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
    preloaderSafety: null,
    anonSixHourCountdown: null
};
const activeListenersRegistry = {
    chat: null,
    deletedAccount: null,
    mutations: null,
    stocks: null
};

// Preferensi Notifikasi User
let isUserNotifEnabled = localStorage.getItem('vipercell_user_notif') !== 'off';

// Gembok Anti-Dobel Transaksi, Pengiriman Vault & Ulasan
let isProcessingCheckout = false;
let isCancellingOrder = false;
let isCheckingPaymentNow = false;
let isSubmittingReview = false;
let isUpgradingAccount = false;
let isSubmittingPasswordReset = false;
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
 * [FEATURE-22] ISOLASI PENYIMPANAN LOKAL MEMBER VS ANONIM BARU
 * Deskripsi : Memastikan saat HP yang sudah pernah login Member masuk kembali
 *             menggunakan akun Anonim, data email, nomor HP, dan riwayat
 *             transaksinya benar-benar terpisah (dianggap akun Anonim baru).
 * ============================================================================ */
function getActiveSessionStorageEmail() {
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    if (isMember) {
        return (userProfile.email || currentUser?.email || localStorage.getItem('vipercell_member_email') || '').trim().toLowerCase();
    }
    return (userProfile.email || localStorage.getItem('vipercell_guest_email') || '').trim().toLowerCase();
}

function getActiveSessionStoragePhone() {
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    if (isMember) {
        return (userProfile.phone || userProfile.whatsapp || localStorage.getItem('vipercell_member_phone') || '').trim();
    }
    return (userProfile.phone || userProfile.whatsapp || localStorage.getItem('vipercell_guest_phone') || '').trim();
}

function saveActiveSessionContact(email, phone) {
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    if (isMember) {
        if (email) localStorage.setItem('vipercell_member_email', email.trim().toLowerCase());
        if (phone) localStorage.setItem('vipercell_member_phone', phone.trim());
    } else {
        if (email) localStorage.setItem('vipercell_guest_email', email.trim().toLowerCase());
        if (phone) localStorage.setItem('vipercell_guest_phone', phone.trim());
    }
}

/* ============================================================================
 * [FEATURE-13, 03, 05] CLIENT-SIDE UNIFIED GAS WEBHOOK CALLER (V27.0)
 * Deskripsi : Memanggil Google Apps Script untuk OTP Email, Link Ubah Sandi,
 *             dan Pengiriman Otomatis E-Receipt + Stok Lokal/Email.
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

// [FEATURE-03] Pengiriman Email Otomatis Saat Stok Lokal Terkirim + Tandai emailSent di Firestore
async function sendOrderReceiptAndAccountEmail(orderData, accountDetailsText, orderDbId = null) {
    const gasUrl = (siteSettings.emailWebhookUrl || '').trim();
    const buyerEmail = (orderData.userEmail || orderData.buyerEmail || '').trim();
    if (!gasUrl || !buyerEmail || !buyerEmail.includes('@')) return false;

    // Cegah pengiriman email ganda jika sudah pernah terkirim
    if (orderData.emailSent === true) return true;

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

        const resolvedDbId = orderDbId || orderData.dbId;
        if (resolvedDbId) {
            await updateDoc(doc(db, pathOrders, resolvedDbId), {
                emailSent: true,
                emailSentAt: Date.now()
            }).catch(() => {});
        }
        return true;
    } catch (e) {
        console.warn("Automated Email Delivery Info:", e.message);
        return false;
    }
}

// [FEATURE-02] Tombol kirim email di riwayat transaksi user telah dihapus (hanya ada di Admin)
window.resendOrderEmailReceipt = async function() {
    window.showToast('Otomatis Terkirim', 'Pengiriman email struk dikelola otomatis oleh sistem & Admin.', 'info');
};

/* ============================================================================
 * [FEATURE-01 & FEATURE-12] FROSTED GLASS TRANSLUCENT PRE-LOADER GATEKEEPER
 * Deskripsi : Latar belakang transparan agak buram sehingga siluet halaman
 *             terlihat, namun terkunci rapat tanpa bocor dan cepat selesai.
 * ============================================================================ */
function updatePreloaderStage(percent, statusText, subText = '') {
    const txtEl = document.getElementById('preloader-status-text');
    const fillEl = document.getElementById('preloader-bar-fill');
    const subEl = document.getElementById('preloader-stage-sub');

    if (txtEl && statusText) txtEl.innerText = statusText;
    if (fillEl) fillEl.style.width = `${Math.min(100, Math.max(8, percent))}%`;
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
        }, 220);
    }
}

function setAuthGateLock(isLocked) {
    if (isLocked) {
        document.body.classList.add('auth-locked');
        document.body.classList.remove('is-member-session');
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
    updatePreloaderStage(48, 'Menyiapkan ruang belanja...', 'Menarik konfigurasi toko & katalog produk...');
    const [settingsSnap, productsSnap, ordersSnap, stocksSnap] = await Promise.all([
        getDoc(doc(db, pathSettings, 'mainConfig')).catch(() => null),
        getDocs(collection(db, pathProducts)).catch(() => null),
        getDocs(collection(db, pathOrders)).catch(() => null),
        getDocs(query(collection(db, pathStocks), where("status", "==", "Ready"))).catch(() => null)
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

    // Hitung peta stok Ready dari koleksi `stocks` ([FEATURE-18])
    if (stocksSnap) {
        rebuildLiveReadyStocksMap(stocksSnap.docs);
    }

    updatePreloaderStage(82, 'Menyiapkan ruang belanja...', 'Menyusun katalog produk & variasi layanan...');
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
    const themeLbl = document.getElementById('theme-label-text');
    if (themeLbl) themeLbl.innerText = savedTheme === 'dark' ? 'Gelap' : 'Terang';

    if (!navigator.onLine) {
        updatePreloaderStage(20, 'Koneksi Terputus', 'Periksa sambungan internet perangkat Anda.');
        showPreloaderRetryUI('Perangkat sedang offline.');
        return;
    }

    // Safety Timeout Cepat 5.200ms agar preloader transparan tidak pernah terasa lama ([FEATURE-12])
    if (activeTimersRegistry.preloaderSafety) clearTimeout(activeTimersRegistry.preloaderSafety);
    activeTimersRegistry.preloaderSafety = setTimeout(() => {
        if (!isPreloaderFinished) {
            if (!navigator.onLine) {
                showPreloaderRetryUI('Waktu tunggu jaringan habis.');
            } else {
                unlockAppUI();
            }
        }
    }, 5200);

    try {
        updatePreloaderStage(25, 'Menyiapkan ruang belanja...', 'Memeriksa sesi perangkat & keamanan V27...');
        await setPersistence(auth, browserLocalPersistence).catch(() => {});
        await initDeviceIdentity();
        const initialUser = await checkAuthStateFirstLoad();

        await fetchInitialStoreDataWithGatekeeper();

        listenData();
        setupAuthStateListener();

        updatePreloaderStage(95, 'Hampir siap...', 'Menyelesaikan render antarmuka Neo-Brutalism V3...');
        if (document.fonts && document.fonts.ready) {
            await Promise.race([
                document.fonts.ready,
                new Promise(res => setTimeout(res, 220))
            ]);
        }

        // Cek apakah halaman dibuka melalui Link Ubah Sandi Apps Script ([FEATURE-05])
        const urlParams = new URLSearchParams(window.location.search);
        const urlAction = (urlParams.get('action') || urlParams.get('mode') || '').toLowerCase();
        const urlToken = urlParams.get('token') || urlParams.get('oobCode') || '';
        const urlEmail = urlParams.get('email') || '';
        const isResetLink = (urlAction === 'reset_password' || urlAction === 'resetpassword' || window.location.hash === '#ubah-sandi');

        const sessionMode = localStorage.getItem('vipercell_active_session_mode');
        if (initialUser && !initialUser.isAnonymous) {
            // Sesi Member Resmi
            boundLegacyGuestUid = null;
            await clearMultiLayerToken('vipercell_anon_uid');
            await syncUserProfileFromAuth(initialUser);

            const restricted = await checkRealtimeAccountRestriction(false);
            if (!restricted) {
                localStorage.setItem('vipercell_active_session_mode', 'member');
                setAuthGateLock(false);
                window.switchMainTab('katalog');
            }
        } else if (sessionMode === 'guest') {
            // Sesi Anonim
            const expired6h = await checkAndExpireAnonSessionIf6Hours();
            if (!expired6h) {
                const guestUidToUse = boundLegacyGuestUid || (initialUser?.isAnonymous ? initialUser.uid : `anon_${currentDeviceId}_${Date.now().toString(36).slice(-4)}`);
                const userObjToSync = {
                    uid: guestUidToUse,
                    isAnonymous: true,
                    email: ''
                };
                await syncUserProfileFromAuth(userObjToSync);

                const restricted = await checkRealtimeAccountRestriction(false);
                if (!restricted) {
                    localStorage.setItem('vipercell_active_session_mode', 'guest');
                    setAuthGateLock(false);
                    window.switchMainTab('katalog');
                    startAnonSixHourTimer();
                }
            } else {
                setAuthGateLock(true);
            }
        } else {
            setAuthGateLock(true);
        }

        if (isResetLink) {
            setTimeout(() => {
                window.openNeoResetPasswordPage(urlEmail, urlToken);
            }, 150);
        }

        updatePreloaderStage(100, 'Siap!', 'Membuka halaman Vipercell V27...');
        setTimeout(unlockAppUI, 80);
    } catch (error) {
        console.error("Gatekeeper Init Error:", error);
        setAuthGateLock(true);
        unlockAppUI();
    }
    observeReveals();
}

/* ============================================================================
 * [FEATURE-02, 04, 10, 22] AUTH GATE, PERBAIKAN BUG FALSE-LOGOUT ADMIN DELETE,
 * ISOLASI SESI ANONIM BARU VS MEMBER, & AUTO-DELETE ANONIM 6 JAM
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
                ctx.fillText('VipercellGuardV27', 14, 12);
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
}

async function readMultiLayerToken(key) {
    try {
        const lsVal = localStorage.getItem(key);
        if (lsVal) return lsVal;
    } catch (e) {}
    return null;
}

// [FEATURE-10] Pembersihan menyeluruh semua layer penyimpanan agar UID terhapus tidak pernah bangkit lagi
async function clearMultiLayerToken(key) {
    try { localStorage.removeItem(key); } catch (e) {}
    try {
        if ('caches' in window) {
            const cache = await caches.open('vipercell-guard-token-v25');
            await cache.delete(`/__guard/${key}`);
        }
    } catch (e) {}
    try {
        if ('indexedDB' in window) {
            const req = indexedDB.open('VipercellGuardDB', 1);
            req.onsuccess = (e) => {
                try {
                    const idb = e.target.result;
                    if (idb.objectStoreNames.contains('tokens')) {
                        const tx = idb.transaction('tokens', 'readwrite');
                        tx.objectStore('tokens').delete(key);
                    }
                } catch (err) {}
            };
        }
    } catch (e) {}
}

async function initDeviceIdentity() {
    currentDeviceId = computeDeviceFingerprint();
    await saveMultiLayerToken('vipercell_device_id', currentDeviceId);

    const activeMode = localStorage.getItem('vipercell_active_session_mode');
    if (activeMode === 'member') {
        boundLegacyGuestUid = null;
        await clearMultiLayerToken('vipercell_anon_uid');
    } else {
        const savedLegacyUid = await readMultiLayerToken('vipercell_anon_uid');
        const deletedList = Array.isArray(siteSettings.deletedUids) ? siteSettings.deletedUids : [];
        if (savedLegacyUid && !deletedList.includes(savedLegacyUid)) {
            boundLegacyGuestUid = savedLegacyUid;
        } else if (savedLegacyUid && deletedList.includes(savedLegacyUid)) {
            boundLegacyGuestUid = null;
            await clearMultiLayerToken('vipercell_anon_uid');
        }
    }
    return currentDeviceId;
}

/* ============================================================================
 * [FEATURE-10] PERBAIKAN MATANG BUG TIBA-TIBA TER-LOGOUT SENDIRI
 * Deskripsi :
 * 1. Memastikan jika user login sebagai Member Resmi, effectiveUid HANYA
 *    menggunakan UID Member (tidak pernah menggunakan boundLegacyGuestUid).
 * 2. Jika UID anonim lama sudah masuk deletedUids saat startup, cukup bersihkan
 *    token lama secara diam-diam dan izinkan sesi baru tanpa menampilkan pesan
 *    palsu "Akun Anda telah dihapus oleh Administrator".
 * 3. Pesan "Akun Dihapus" hanya ditampilkan jika dokumen user sesi aktif saat
 *    ini benar-benar dihapus secara real-time (`isLiveSnapshot === true`).
 * ============================================================================ */
async function checkRealtimeAccountRestriction(isLiveSnapshot = false) {
    if (!currentDeviceId) await initDeviceIdentity();

    const isMemberSession = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    const effectiveUid = isMemberSession
        ? currentUser.uid
        : (boundLegacyGuestUid || currentUser?.uid || userProfile?.uid || '');

    if (!effectiveUid) return false;

    const deletedList = Array.isArray(siteSettings.deletedUids) ? siteSettings.deletedUids : [];
    const blockedUidList = Array.isArray(siteSettings.blockedUids) ? siteSettings.blockedUids : [];
    const blockedDevList = Array.isArray(siteSettings.blockedDevices) ? siteSettings.blockedDevices : [];

    const isBlocked = blockedUidList.includes(effectiveUid) ||
                      (!isMemberSession && currentDeviceId && blockedDevList.includes(currentDeviceId));

    const isDeleted = deletedList.includes(effectiveUid);

    if (!isBlocked && !isDeleted) return false;

    // Jika bukan Member (yaitu sesi Anonim) dan terdeteksi isDeleted saat awal muat halaman (bukan live kick),
    // bersihkan saja UID anonim usang tanpa memunculkan alert palsu!
    if (!isMemberSession && isDeleted && !isLiveSnapshot) {
        boundLegacyGuestUid = null;
        await clearMultiLayerToken('vipercell_anon_uid');
        localStorage.removeItem('vipercell_anon_session_started_at');
        return false;
    }

    if (!document.body.classList.contains('auth-locked')) {
        boundLegacyGuestUid = null;
        await clearMultiLayerToken('vipercell_anon_uid');
        localStorage.removeItem('vipercell_anon_session_started_at');
        localStorage.setItem('vipercell_active_session_mode', 'logged_out');

        try {
            if (auth.currentUser) {
                await signOut(auth).catch(() => {});
            }
        } catch (e) {}

        currentUser = null;
        userProfile = { uid: '', name: '', email: '', phone: '', isGuest: true, isAnonymous: true };
        setAuthGateLock(true);

        if (isBlocked) {
            window.customAlert(
                'Akses Akun Diblokir',
                'Maaf, akun atau perangkat Anda telah diblokir oleh Administrator Vipercell.',
                'error'
            );
        } else if (isLiveSnapshot) {
            window.customAlert(
                'Sesi Akun Berakhir',
                'Sesi akun Anda telah ditutup atau dibersihkan oleh Administrator Vipercell. Silakan masuk kembali.',
                'warning'
            );
        }
        return true;
    }
    return false;
}

function listenDeletedAccountStatus(uid) {
    if (!uid) return;
    if (activeListenersRegistry.deletedAccount) activeListenersRegistry.deletedAccount();

    let isInitialDocSnap = true;
    activeListenersRegistry.deletedAccount = onSnapshot(doc(db, pathUsers, uid), async (docSnap) => {
        if (docSnap.exists()) {
            const uData = docSnap.data();
            if (uData.isBlocked === true || (uData.isDeleted === true && !isInitialDocSnap)) {
                if (!siteSettings.blockedUids) siteSettings.blockedUids = [];
                if (uData.isBlocked && !siteSettings.blockedUids.includes(uid)) siteSettings.blockedUids.push(uid);
                if (!siteSettings.deletedUids) siteSettings.deletedUids = [];
                if (uData.isDeleted && !siteSettings.deletedUids.includes(uid)) siteSettings.deletedUids.push(uid);
                await checkRealtimeAccountRestriction(true);
            }
        }
        isInitialDocSnap = false;
    }, () => {});
}

/* ============================================================================
 * [FEATURE-04] AUTO-DELETE AKUN ANONIM SETIAP 6 JAM (BISA ON/OFF DARI ADMIN)
 * ============================================================================ */
async function checkAndExpireAnonSessionIf6Hours() {
    if (siteSettings.anonAutoDelete6h === false) {
        localStorage.setItem('vipercell_anon_autodelete_disabled', 'true');
        const card = document.getElementById('anon-ttl-info-card');
        if (card) card.style.display = 'none';
        return false;
    }
    localStorage.setItem('vipercell_anon_autodelete_disabled', 'false');

    const startedRaw = localStorage.getItem('vipercell_anon_session_started_at');
    if (!startedRaw) return false;

    const startedMs = parseInt(startedRaw, 10);
    if (isNaN(startedMs) || startedMs <= 0) return false;

    if (Date.now() - startedMs >= ANON_AUTO_DELETE_TTL_MS) {
        const oldAnonUid = boundLegacyGuestUid || localStorage.getItem('vipercell_anon_uid') || '';
        if (oldAnonUid) {
            await deleteDoc(doc(db, pathUsers, oldAnonUid)).catch(() => {});
            await deleteDoc(doc(db, pathChats, oldAnonUid)).catch(() => {});
        }
        if (currentDeviceId) {
            await deleteDoc(doc(db, pathDeviceLocks, currentDeviceId)).catch(() => {});
        }
        boundLegacyGuestUid = null;
        await clearMultiLayerToken('vipercell_anon_uid');
        localStorage.removeItem('vipercell_anon_session_started_at');
        localStorage.removeItem('vipercell_guest_email');
        localStorage.removeItem('vipercell_guest_phone');
        localStorage.removeItem('vipercell_anon_name');
        localStorage.setItem('vipercell_active_session_mode', 'logged_out');
        return true;
    }
    return false;
}

function startAnonSixHourTimer() {
    if (activeTimersRegistry.anonSixHourCountdown) {
        clearInterval(activeTimersRegistry.anonSixHourCountdown);
        activeTimersRegistry.anonSixHourCountdown = null;
    }

    const card = document.getElementById('anon-ttl-info-card');
    const timerEl = document.getElementById('anon-ttl-countdown');

    const isGuest = Boolean(!currentUser || currentUser.isAnonymous || userProfile.isGuest);
    if (!isGuest || siteSettings.anonAutoDelete6h === false) {
        if (card) card.style.display = 'none';
        return;
    }

    let startedAt = parseInt(localStorage.getItem('vipercell_anon_session_started_at') || '0', 10);
    if (!startedAt || isNaN(startedAt)) {
        startedAt = userProfile.sessionStartedAt || Date.now();
        localStorage.setItem('vipercell_anon_session_started_at', String(startedAt));
    }

    if (card) card.style.display = 'flex';

    const tick = async () => {
        if (siteSettings.anonAutoDelete6h === false || !userProfile.isGuest) {
            if (card) card.style.display = 'none';
            clearInterval(activeTimersRegistry.anonSixHourCountdown);
            return;
        }
        const elapsed = Date.now() - startedAt;
        const remain = ANON_AUTO_DELETE_TTL_MS - elapsed;
        if (remain <= 0) {
            clearInterval(activeTimersRegistry.anonSixHourCountdown);
            await checkAndExpireAnonSessionIf6Hours();
            await window.logoutUser();
            window.showToast('Sesi Anonim 6 Jam Berakhir', 'Akun anonim otomatis dihapus setelah 6 jam. Silakan buat sesi baru.', 'warning');
            return;
        }
        if (timerEl) {
            const h = Math.floor(remain / 3600000);
            const m = Math.floor((remain % 3600000) / 60000);
            const s = Math.floor((remain % 60000) / 1000);
            timerEl.innerText = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
    };

    tick();
    activeTimersRegistry.anonSixHourCountdown = setInterval(tick, 1000);
}
window.initAnonSixHourCountdownV27 = startAnonSixHourTimer;

/* ============================================================================
 * [FEATURE-22] LOGIN ANONIM TERISOLASI PENUH (DATA BERBEDA DARI MEMBER)
 * ============================================================================ */
window.processAnonymousLogin = async function() {
    const btnGuest = document.getElementById('auth-guest-btn');
    const ogHtml = btnGuest ? btnGuest.innerHTML : '';
    if (btnGuest) {
        btnGuest.disabled = true;
        btnGuest.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Membuat Sesi Anonim Baru...</span>`;
    }

    try {
        if (!currentDeviceId) await initDeviceIdentity();

        const blockedDevList = Array.isArray(siteSettings.blockedDevices) ? siteSettings.blockedDevices : [];
        if (blockedDevList.includes(currentDeviceId)) {
            window.customAlert('Perangkat Diblokir', 'Maaf, akses sesi anonim pada perangkat ini telah diblokir oleh Administrator.', 'error');
            return;
        }

        // [FEATURE-22] Bersihkan jejak sesi Member sebelumnya agar akun Anonim benar-benar baru & terpisah
        localStorage.removeItem('vipercell_track_email');
        localStorage.removeItem('vipercell_track_phone');
        localStorage.removeItem('vipercell_guest_email');
        localStorage.removeItem('vipercell_guest_phone');
        localStorage.removeItem('vipercell_anon_name');
        await clearMultiLayerToken('vipercell_anon_uid');
        boundLegacyGuestUid = null;

        if (auth.currentUser) {
            await signOut(auth).catch(() => {});
        }

        let activeUser = null;
        try {
            const cred = await signInAnonymously(auth);
            activeUser = cred.user;
        } catch (authErr) {
            const salt = Date.now().toString(36).slice(-5) + Math.floor(10 + Math.random() * 89);
            activeUser = { uid: `anon_${currentDeviceId}_${salt}`, isAnonymous: true, email: '' };
        }

        // Pastikan UID anonim unik dan tidak berada di daftar deletedUids
        const deletedUidList = Array.isArray(siteSettings.deletedUids) ? siteSettings.deletedUids : [];
        let effectiveUid = activeUser.uid;
        if (deletedUidList.includes(effectiveUid)) {
            effectiveUid = `anon_${currentDeviceId}_${Date.now().toString(36).slice(-5)}`;
        }

        currentUser = activeUser;
        boundLegacyGuestUid = effectiveUid;
        await saveMultiLayerToken('vipercell_anon_uid', effectiveUid);

        const nowMs = Date.now();
        localStorage.setItem('vipercell_anon_session_started_at', String(nowMs));

        const shortId = effectiveUid.slice(-4).toUpperCase();
        const freshAnonName = `Tamu #${shortId}`;
        localStorage.setItem('vipercell_anon_name', freshAnonName);

        userProfile = {
            uid: effectiveUid,
            authUid: activeUser.uid,
            name: freshAnonName,
            email: '',
            phone: '',
            whatsapp: '',
            role: 'anonymous',
            isAnonymous: true,
            isGuest: true,
            isBlocked: false,
            isDeleted: false,
            deviceId: currentDeviceId,
            sessionStartedAt: nowMs,
            expiresAt: nowMs + ANON_AUTO_DELETE_TTL_MS,
            createdAt: nowMs
        };

        await setDoc(doc(db, pathUsers, effectiveUid), { ...userProfile, lastActiveAt: nowMs }, { merge: true }).catch(() => {});

        setDoc(doc(db, pathDeviceLocks, currentDeviceId), {
            uid: effectiveUid,
            role: 'anonymous',
            status: 'active',
            deviceId: currentDeviceId,
            isBlocked: false,
            updatedAt: nowMs
        }, { merge: true }).catch(() => {});

        localStorage.setItem('vipercell_active_session_mode', 'guest');
        listenDeletedAccountStatus(effectiveUid);
        setAuthGateLock(false);
        applyUserSessionToUI();
        window.renderUserOrders();
        updateProfileStats();
        checkChatUserState();
        listenUserChat();
        startAnonSixHourTimer();
        window.switchMainTab('katalog');

        window.showToast('Sesi Anonim Baru Aktif', `Selamat datang, ${userProfile.name}! Data sesi ini terpisah & aman.`, 'success');
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
window.startIsolatedAnonymousSessionV27 = window.processAnonymousLogin;

// ============================================================================
// [FEATURE-02 & FEATURE-15] UPGRADE AKUN ANONIM KE MEMBER RESMI (KHUSUS PROFIL)
// ============================================================================
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
    if (emailInp) emailInp.value = userProfile.email || localStorage.getItem('vipercell_guest_email') || '';
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
        const previousAnonUid = boundLegacyGuestUid || userProfile.uid || (auth.currentUser?.isAnonymous ? auth.currentUser.uid : null);
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

        // Migrasikan pesanan & riwayat chat milik sesi anonim saat ini ke akun Member baru
        if (previousAnonUid && previousAnonUid !== finalUid) {
            const oldOrders = orders.filter(o => o.userId === previousAnonUid);
            for (const ord of oldOrders) {
                await updateDoc(doc(db, pathOrders, ord.dbId), { userId: finalUid, userEmail: email, userPhone: whatsapp }).catch(() => {});
            }
            const oldChatSnap = await getDoc(doc(db, pathChats, previousAnonUid)).catch(() => null);
            if (oldChatSnap && oldChatSnap.exists()) {
                await setDoc(doc(db, pathChats, finalUid), {
                    ...oldChatSnap.data(),
                    uid: finalUid,
                    userInfo: name,
                    userEmail: email
                }, { merge: true }).catch(() => {});
                await deleteDoc(doc(db, pathChats, previousAnonUid)).catch(() => {});
            }
            await deleteDoc(doc(db, pathUsers, previousAnonUid)).catch(() => {});
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
        if (activeTimersRegistry.anonSixHourCountdown) clearInterval(activeTimersRegistry.anonSixHourCountdown);

        await clearMultiLayerToken('vipercell_anon_uid');
        localStorage.removeItem('vipercell_anon_session_started_at');
        localStorage.removeItem('vipercell_guest_email');
        localStorage.removeItem('vipercell_guest_phone');
        localStorage.setItem('vipercell_member_email', email);
        localStorage.setItem('vipercell_member_phone', whatsapp);
        localStorage.setItem('vipercell_active_session_mode', 'member');

        userProfile = memberData;
        window.closeModal('modal-upgrade-member');
        setAuthGateLock(false);
        applyUserSessionToUI();
        window.renderUserOrders();
        updateProfileStats();

        window.customAlert(
            'Upgrade Member Berhasil! 🎉',
            `Selamat <b>${escapeHtml(name)}</b>! Email kamu telah terverifikasi dengan OTP dan akunmu resmi menjadi <b>Member Resmi</b>. Akun kamu bebas dari penghapusan 6 jam dan seluruh riwayat pesanan tersimpan permanen.`,
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
        const fallbackUid = boundLegacyGuestUid || `anon_${currentDeviceId}_${Date.now().toString(36).slice(-4)}`;
        currentUser = { uid: fallbackUid, isAnonymous: true, email: '' };
        return currentUser;
    }
}

async function syncUserProfileFromAuth(user) {
    currentUser = user;
    if (!user) return;

    const deletedList = Array.isArray(siteSettings.deletedUids) ? siteSettings.deletedUids : [];

    if (user.isAnonymous) {
        const effectiveUid = (boundLegacyGuestUid && !deletedList.includes(boundLegacyGuestUid))
            ? boundLegacyGuestUid
            : user.uid;

        boundLegacyGuestUid = effectiveUid;
        await saveMultiLayerToken('vipercell_anon_uid', effectiveUid);
        listenDeletedAccountStatus(effectiveUid);

        const shortId = effectiveUid.slice(-4).toUpperCase();
        const userDocRef = doc(db, pathUsers, effectiveUid);
        const userSnap = await getDoc(userDocRef).catch(() => null);

        const savedStarted = parseInt(localStorage.getItem('vipercell_anon_session_started_at') || '0', 10) || Date.now();
        localStorage.setItem('vipercell_anon_session_started_at', String(savedStarted));

        if (userSnap && userSnap.exists() && !userSnap.data().isDeleted) {
            const data = userSnap.data();
            userProfile = {
                ...data,
                uid: effectiveUid,
                role: 'anonymous',
                isAnonymous: true,
                isGuest: true,
                sessionStartedAt: data.sessionStartedAt || savedStarted,
                deviceId: currentDeviceId
            };
            if (data.name) localStorage.setItem('vipercell_anon_name', data.name);
        } else {
            const savedName = localStorage.getItem('vipercell_anon_name') || `Tamu #${shortId}`;
            userProfile = {
                uid: effectiveUid,
                authUid: user.uid,
                name: savedName,
                email: localStorage.getItem('vipercell_guest_email') || '',
                phone: localStorage.getItem('vipercell_guest_phone') || '',
                whatsapp: localStorage.getItem('vipercell_guest_phone') || '',
                role: 'anonymous',
                isAnonymous: true,
                isGuest: true,
                isBlocked: false,
                isDeleted: false,
                deviceId: currentDeviceId,
                sessionStartedAt: savedStarted,
                expiresAt: savedStarted + ANON_AUTO_DELETE_TTL_MS,
                createdAt: Date.now()
            };
            await setDoc(userDocRef, userProfile, { merge: true }).catch(() => {});
        }
        startAnonSixHourTimer();
    } else {
        // Member Resmi: Bersihkan total atribut anonim agar tidak terjadi konflik false-logout (#10)
        boundLegacyGuestUid = null;
        await clearMultiLayerToken('vipercell_anon_uid');
        localStorage.removeItem('vipercell_anon_session_started_at');
        if (activeTimersRegistry.anonSixHourCountdown) clearInterval(activeTimersRegistry.anonSixHourCountdown);

        listenDeletedAccountStatus(user.uid);

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
        if (userProfile.email) localStorage.setItem('vipercell_member_email', userProfile.email.toLowerCase());
        if (userProfile.phone) localStorage.setItem('vipercell_member_phone', userProfile.phone);
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
            const restricted = await checkRealtimeAccountRestriction(false);
            if (!restricted) setAuthGateLock(false);
        } else if (!user && sessionMode !== 'guest') {
            userProfile = { uid: '', name: '', email: '', phone: '', isGuest: true, isAnonymous: true };
            setAuthGateLock(true);
        }
    });
}

function applyUserSessionToUI() {
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    const isGuestSession = Boolean(!isMember && (currentUser || localStorage.getItem('vipercell_active_session_mode') === 'guest'));

    document.body.classList.toggle('is-member-session', isMember);

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
    const anonTtlCard = document.getElementById('anon-ttl-info-card');

    const guestTrackSec = document.getElementById('guest-tracking-section');
    const guestContactBox = document.getElementById('buy-guest-contact-box');
    const emailGroupBuy = document.getElementById('buy-email-group');
    const phoneGroupBuy = document.getElementById('buy-phone-group');
    const memberAutofillBadge = document.getElementById('buy-member-autofill-badge');
    const memberAutofillText = document.getElementById('buy-member-autofill-text');

    const statusBadge = document.getElementById('prof-email-status');
    const dispNameEl = document.getElementById('prof-display-name');
    const dispEmailEl = document.getElementById('prof-display-email');
    const avatarEl = document.getElementById('prof-avatar-initial');
    const profNameInp = document.getElementById('prof-name');
    const profEmailInp = document.getElementById('prof-email');
    const profPhoneInp = document.getElementById('prof-phone');

    // [FEATURE-15] Pastikan tombol upgrade di Header dan di Tab Pesanan SELALU disembunyikan
    if (btnUpgradeHeader) btnUpgradeHeader.style.display = 'none';
    if (bannerUpgradeOrders) bannerUpgradeOrders.style.display = 'none';
    // Form lacak ID Trx 1-input selalu bisa dipakai oleh siapa saja (#03)
    if (guestTrackSec) guestTrackSec.style.display = 'block';

    if (isMember) {
        const finalEmail = userProfile.email || currentUser.email || '';
        const finalName = userProfile.name || finalEmail.split('@')[0] || 'Member Vipercell';
        const finalPhone = userProfile.phone || userProfile.whatsapp || '';

        if (textPesananDesk) textPesananDesk.innerText = 'Pesanan Saya';
        if (textProfilDesk) textProfilDesk.innerText = 'Profil Saya';
        if (textProfilMob) textProfilMob.innerText = 'Profil';

        if (bannerUpgradeProfile) bannerUpgradeProfile.style.display = 'none';
        if (btnProfUpgrade) btnProfUpgrade.style.display = 'none';
        if (anonTtlCard) anonTtlCard.style.display = 'none';
        if (btnProfLogout) btnProfLogout.style.display = 'inline-flex';
        if (textBtnLogout) textBtnLogout.innerText = 'Keluar Akun';
        if (secMemberBox) secMemberBox.style.display = 'block';
        if (secGuestBox) secGuestBox.style.display = 'none';

        // [FEATURE-14] Sembunyikan kolom isi Email & No HP saat checkout untuk Member Resmi
        if (guestContactBox) guestContactBox.style.display = 'none';
        if (emailGroupBuy) emailGroupBuy.style.display = 'none';
        if (phoneGroupBuy) phoneGroupBuy.style.display = 'none';
        if (memberAutofillBadge) {
            memberAutofillBadge.style.display = 'flex';
            if (memberAutofillText) {
                memberAutofillText.innerText = `Otomatis dikirim ke ${finalEmail}${finalPhone ? ' • WA: ' + finalPhone : ''}`;
            }
        }

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
        const effectiveUid = boundLegacyGuestUid || currentUser?.uid || userProfile.uid || 'ANON';
        const shortId = effectiveUid.slice(-4).toUpperCase();
        const guestName = userProfile.name || localStorage.getItem('vipercell_anon_name') || `Tamu #${shortId}`;
        const guestEmail = userProfile.email || localStorage.getItem('vipercell_guest_email') || 'Belum dikaitkan (Sesi Anonim Baru)';
        const guestPhone = userProfile.phone || userProfile.whatsapp || localStorage.getItem('vipercell_guest_phone') || '';

        if (textPesananDesk) textPesananDesk.innerText = 'Lacak Pesanan';
        if (textProfilDesk) textProfilDesk.innerText = 'Akun Anonim';
        if (textProfilMob) textProfilMob.innerText = 'Akun';

        // [FEATURE-15] Tombol & Banner Upgrade ke Member Resmi HANYA muncul di Tab Profil
        if (bannerUpgradeProfile) bannerUpgradeProfile.style.display = 'flex';
        if (btnProfUpgrade) btnProfUpgrade.style.display = 'inline-flex';
        if (btnProfLogout) btnProfLogout.style.display = 'inline-flex';
        if (textBtnLogout) textBtnLogout.innerText = 'Keluar Sesi';
        if (secMemberBox) secMemberBox.style.display = 'none';
        if (secGuestBox) secGuestBox.style.display = 'block';

        if (guestContactBox) guestContactBox.style.display = 'block';
        if (emailGroupBuy) emailGroupBuy.style.display = 'block';
        if (phoneGroupBuy) phoneGroupBuy.style.display = 'block';
        if (memberAutofillBadge) memberAutofillBadge.style.display = 'none';

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

        startAnonSixHourTimer();
    }
}

/* ============================================================================
 * [FEATURE-08, 09, 17, 18] SINKRONISASI STOK OTOMATIS DARI TAB STOK, 3 MODE
 * PENGIRIMAN (OTOMATIS, MANUAL, TANYA & OTOMATIS), FORMAT PRODUK EMAIL OAUTH
 * ("email|password|refresh_token|client_id|link_akses"), & AUTO-SEND EMAIL
 * ============================================================================ */
function makeStockKey(brandName, itemName) {
    return `${String(brandName || '').trim().toLowerCase()}__${String(itemName || '').trim().toLowerCase()}`;
}

function rebuildLiveReadyStocksMap(stockDocsArray) {
    const nextMap = {};
    (stockDocsArray || []).forEach(d => {
        const sData = typeof d.data === 'function' ? d.data() : d;
        if (!sData || sData.status !== 'Ready') return;
        const key = makeStockKey(sData.brand, sData.itemName);
        if (!nextMap[key]) nextMap[key] = 0;

        if (sData.isReusable === true) {
            nextMap[key] += 999;
        } else {
            const maxQ = parseInt(sData.maxQuota || 1, 10);
            const usedQ = parseInt(sData.usedQuota || 0, 10);
            nextMap[key] += Math.max(0, maxQ - usedQ);
        }
    });
    liveReadyStocksMap = nextMap;
}

// [FEATURE-18] Menghitung stok tersedia secara cerdas berdasarkan Mode Pengiriman (auto, manual, ask_auto)
function computeVariantAvailableStock(item) {
    if (!item) return null;

    const procType = (item.processType || 'auto').toLowerCase();

    // Hitung stok lokal yang ada di stockVault dokumen produk + koleksi `stocks`
    let vaultSlots = 0;
    if (Array.isArray(item.stockVault) && item.stockVault.length > 0) {
        vaultSlots = item.stockVault.reduce((sum, v) => {
            if (v.isReusable) return sum + 999;
            const maxQ = parseInt(v.maxQuota || item.defaultMaxQuota || 1, 10);
            const usedQ = parseInt(v.usedQuota || 0, 10);
            return sum + Math.max(0, maxQ - usedQ);
        }, 0);
    }

    const brandKey = makeStockKey(item.brand || item.brandName, item.name);
    const tabStocksSlots = liveReadyStocksMap[brandKey] || 0;
    const totalLocalVaultStock = vaultSlots + tabStocksSlots;

    // 1. Jika mode MANUAL murni: stok lokal gudang dikunci (tidak ikut terjual otomatis)
    //    mengikuti pengaturan manual Admin (`stockCount` atau `soldOut`).
    if (procType === 'manual') {
        if (item.manualLockSoldOut === true || item.soldOut === true) return 0;
        if (typeof item.stockCount === 'number' && item.stockCount >= 0) {
            return item.stockCount;
        }
        return null; // Unlimited manual
    }

    // 2. Jika mode TANYA & OTOMATIS (`ask_auto` / `hybrid`):
    //    Tetap bisa dibeli kapan saja (jika ada stok lokal langsung kirim otomatis, jika kosong diproses Admin)
    if (procType === 'ask_auto' || procType === 'hybrid') {
        if (item.soldOut === true && totalLocalVaultStock <= 0) return 0;
        if (totalLocalVaultStock > 0) return totalLocalVaultStock;
        if (typeof item.stockCount === 'number' && item.stockCount > 0) return item.stockCount;
        return null;
    }

    // 3. Jika mode OTOMATIS (`auto`):
    //    Jika ada stok ditambahkan di Tab Stok (`totalLocalVaultStock > 0`), stok produk OTOMATIS ADA & siap dijual!
    if (totalLocalVaultStock > 0) {
        return totalLocalVaultStock;
    }
    if (typeof item.stockCount === 'number' && item.stockCount >= 0) {
        return item.stockCount;
    }
    return null;
}

// [FEATURE-17] Formatter Kredensial Stok (Mendukung Format Standar, Sharing, dan Produk Email OAuth)
function formatStockCredentialLine(rawStr, stockMode = 'PRIVATE', slotInfo = '', customAccessUrl = '') {
    const clean = String(rawStr || '').trim();
    if (!clean) return '';

    const parts = clean.split('|').map(s => s.trim());
    const isEmailOAuthFormat = (stockMode === 'EMAIL_OAUTH' || parts.length >= 4);

    if (isEmailOAuthFormat && parts.length >= 4) {
        const emailAddr = parts[0] || '-';
        const passStr = parts[1] || '-';
        const refreshToken = parts[2] || '-';
        const clientId = parts[3] || '-';
        const fourPartRaw = `${emailAddr}|${passStr}|${refreshToken}|${clientId}`;
        const accessLink = parts[4] || customAccessUrl || siteSettings.defaultEmailPortalUrl || '';

        let out = `[PRODUK EMAIL OAUTH${slotInfo}]\n`;
        out += `FORMAT_UTUH : ${fourPartRaw}\n`;
        out += `Email       : ${emailAddr}\n`;
        out += `Password    : ${passStr}\n`;
        out += `RefreshToken: ${refreshToken}\n`;
        out += `Client_ID   : ${clientId}`;
        if (accessLink) {
            out += `\nLink_Akses  : ${accessLink}`;
        }
        return out;
    }

    if (parts.length >= 2) {
        return `[DETAIL AKUN ANDA${slotInfo}]\nEmail / ID : ${parts[0] || '-'}\nPassword   : ${parts[1] || '-'}\nKeterangan : ${parts.slice(2).join(' | ') || '-'}`;
    }

    return `[DETAIL PESANAN${slotInfo}]\n${clean}`;
}

async function tryAutoDeliverOrderFromVault(orderData, orderDbId) {
    if (!orderData || !orderDbId || deliveringOrderIds.has(orderDbId)) return;
    if (orderData.adminReply && orderData.adminReply.trim() !== '') {
        // Jika sudah ada adminReply tapi email belum terkirim, pastikan email terkirim otomatis (#03)
        if (!orderData.emailSent) {
            sendOrderReceiptAndAccountEmail(orderData, orderData.adminReply, orderDbId);
        }
        return;
    }

    const item = (orderData.items && orderData.items[0]) ? orderData.items[0] : null;
    if (!item) return;

    deliveringOrderIds.add(orderDbId);
    const neededQty = parseInt(item.qty || 1, 10);
    const durationDays = parseInt(item.durationDays || orderData.durationDays || 0, 10);
    const procType = (item.processType || 'auto').toLowerCase();
    const nowMs = Date.now();
    const subUpdates = durationDays > 0 ? {
        durationDays: durationDays,
        subscriptionStartAt: nowMs,
        subscriptionEndAt: nowMs + (durationDays * 86400000),
        subscriptionStatus: 'ACTIVE'
    } : {};

    try {
        // [FEATURE-18] Jika mode MANUAL murni (atau game), jangan ambil stok lokal otomatis
        // Namun jika mode `auto` ATAU `ask_auto` (Tanya & Otomatis), langsung cek stok lokal & kirim otomatis!
        if (procType === 'manual' || item.type === 'game') {
            if (Object.keys(subUpdates).length > 0 && !orderData.subscriptionEndAt) {
                await updateDoc(doc(db, pathOrders, orderDbId), subUpdates).catch(() => {});
            }
            return;
        }

        let deliveredCredentialsText = '';

        // 1. Cek apakah produk menyimpan stockVault di dokumen products/{productDbId}
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

                            const rawCred = slotItem.credentials || slotItem.data || '';
                            const slotLbl = maxQ > 1 ? ` (Slot #${newUsed}/${maxQ})` : '';
                            collectedCreds.push(formatStockCredentialLine(rawCred, slotItem.stockFormat || pData.stockMode || 'PRIVATE', slotLbl, slotItem.accessLink || pData.emailPortalUrl || ''));

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
                                soldOut: remainingTotal <= 0 && procType === 'auto'
                            });
                            deliveredCredentialsText = collectedCreds.join('\n\n');
                        }
                    }
                });
            } catch (txErr) {
                console.warn("Product Vault Transaction Fallback:", txErr.message);
            }
        }

        // 2. Jika belum terkirim dari product.stockVault, ambil dari koleksi `stocks` (Tab Stok Admin)
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
                    deliveredCredentialsText = formatStockCredentialLine(rData.data || '', rData.stockFormat || 'REUSABLE', ' (Akses Instan)', rData.accessLink || '');
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
                            const slotLabel = maxQ > 1 ? ` (Slot Sharing #${nextUsed}/${maxQ})` : '';
                            collected.push(formatStockCredentialLine(sData.data || '', sData.stockFormat || sData.mode || 'PRIVATE', slotLabel, sData.accessLink || ''));

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

        // [FEATURE-03 & 18] Jika stok lokal tersedia & terkirim, otomatis kirim ke Email juga!
        if (deliveredCredentialsText) {
            const finalReply = `Terima kasih! Pembayaran Anda telah diverifikasi otomatis.\n\n${deliveredCredentialsText}\n\nSimpan bukti E-Receipt ini sebagai garansi resmi Vipercell.`;
            await updateDoc(doc(db, pathOrders, orderDbId), {
                status: 'SUCCESS',
                adminReply: finalReply,
                autoDelivered: true,
                deliveredAt: nowMs,
                ...subUpdates
            }).catch(() => {});

            await sendOrderReceiptAndAccountEmail({
                ...orderData,
                ...subUpdates,
                adminReply: finalReply
            }, finalReply, orderDbId);
        } else if (Object.keys(subUpdates).length > 0 && !orderData.subscriptionEndAt) {
            await updateDoc(doc(db, pathOrders, orderDbId), subUpdates).catch(() => {});
        }
    } catch (err) {
        console.error("Vault Auto-Delivery Error:", err);
    } finally {
        setTimeout(() => deliveringOrderIds.delete(orderDbId), 3000);
    }
}

// ==========================================
// REAL-TIME DATA LISTENER (FIRESTORE + STOK LOKAL + MUTATIONS)
// ==========================================
let isListening = false;
function listenData() {
    if (isListening) return;
    isListening = true;
    
    onSnapshot(doc(db, pathSettings, 'mainConfig'), async (docSnap) => {
        if (docSnap.exists()) {
            const incoming = docSnap.data();
            siteSettings = { ...siteSettings, ...incoming };

            if (incoming.lastPaymentDetected && incoming.lastPaymentTimestamp) {
                const ageMs = Date.now() - Number(incoming.lastPaymentTimestamp);
                if (ageMs < 180000) {
                    checkClientPendingOrdersAgainstAmount(Number(incoming.lastPaymentDetected));
                }
            }

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
        startAnonSixHourTimer();
        await checkRealtimeAccountRestriction(true);
    });

    // [FEATURE-18] Listener Real-Time ke Koleksi `stocks` agar saat Admin menambah stok di Tab Stok,
    // ketersediaan stok di Web User langsung otomatis bertambah detik itu juga!
    if (!activeListenersRegistry.stocks) {
        activeListenersRegistry.stocks = onSnapshot(query(collection(db, pathStocks), where("status", "==", "Ready")), (snapshot) => {
            rebuildLiveReadyStocksMap(snapshot.docs);
            window.renderBrands(currentBrandFilter);
            if (currentCheckoutBrand) {
                renderCheckoutVariantCards();
                window.calculateDirectBuyTotal();
            }
        }, () => {});
    }

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
        const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
        const effectiveUid = isMember ? currentUser.uid : (boundLegacyGuestUid || currentUser?.uid || userProfile.uid || '');
        const activeEmail = getActiveSessionStorageEmail();
        
        snapshot.forEach((docSnap) => {
            let data = { dbId: docSnap.id, ...docSnap.data() };
            const orderTime = new Date(data.date).getTime();
            const expiryLimitMs = data.expiresAt ? (data.expiresAt - orderTime) : 900000;
            const orderEmail = (data.userEmail || '').toLowerCase();

            // [FEATURE-22] Isolasi kepemilikan pesanan:
            // Jika sesi Anonim, cocokkan berdasarkan UID sesi anonim ini (atau email guest sesi ini).
            const isMyOrder = isMember
                ? ((effectiveUid && data.userId === effectiveUid) || (activeEmail && activeEmail === orderEmail))
                : ((effectiveUid && data.userId === effectiveUid));
            
            if (data.status === 'UNPAID' || data.status === 'PENDING_PAYMENT') {
                if (now - orderTime > expiryLimitMs) { 
                    if (isMyOrder) {
                        updateDoc(doc(db, pathOrders, data.dbId), { status: 'EXPIRED' }).catch(() => {});
                    }
                    data.status = 'EXPIRED';
                }
            }

            if (data.status === 'PAID') {
                if (isMyOrder) {
                    updateDoc(doc(db, pathOrders, data.dbId), { status: 'SUCCESS' }).catch(() => {});
                }
                data.status = 'SUCCESS';
            }

            newOrders.push(data);

            // [FEATURE-03 & 18] Jika status SUCCESS dan belum ada adminReply, coba kirim otomatis dari Vault/Stok Lokal
            if (isMyOrder && data.status === 'SUCCESS' && !data.adminReply) {
                tryAutoDeliverOrderFromVault(data, data.dbId);
            } else if (isMyOrder && data.status === 'SUCCESS' && data.adminReply && !data.emailSent) {
                // Jika sudah ada adminReply (misal dari stok lokal) namun email belum terkirim, otomatis kirim email!
                sendOrderReceiptAndAccountEmail(data, data.adminReply, data.dbId);
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
        if (currentCheckoutBrand) {
            const updatedBrand = groupedBrands.find(b => b.brandName === currentCheckoutBrand.brandName);
            if (updatedBrand) {
                currentCheckoutBrand = updatedBrand;
                renderCheckoutVariantCards();
            }
        }
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
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    const effectiveUid = isMember ? currentUser.uid : (boundLegacyGuestUid || currentUser?.uid || userProfile.uid || '');
    const activeEmail = getActiveSessionStorageEmail();

    const hasActionNeeded = orders.some(o => {
        const isMine = isMember
            ? ((effectiveUid && o.userId === effectiveUid) || (activeEmail && o.userEmail?.toLowerCase() === activeEmail))
            : (effectiveUid && o.userId === effectiveUid);
        return isMine && (o.status === 'UNPAID' || o.status === 'PENDING_PAYMENT' || o.status === 'PENDING');
    });
    const badgeDesk = document.getElementById('user-order-badge-desktop');
    if (badgeDesk) badgeDesk.style.display = hasActionNeeded ? 'block' : 'none';
    const badgeMob = document.getElementById('user-order-badge-mobile');
    if (badgeMob) badgeMob.style.display = hasActionNeeded ? 'block' : 'none';
}

/* ============================================================================
 * [FEATURE-07] FULL-SCREEN QRIS PAYMENT VIEW & INSTANT ORDER CANCELLATION
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
            ? 'Tagihan dan kode QRIS untuk pesanan ini telah <b>dibatalkan dan dinonaktifkan</b> atas permintaan kamu. Kamu bisa langsung membuat pesanan baru sekarang!'
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

    const totalDurationMs = 900000;
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

/* ============================================================================
 * [FEATURE-08, 17, 18] KATALOG TAMPIL PENUH, AKORDEON VARIASI (LIHAT
 * SELENGKAPNYA & TUTUP KEMBALI), & 3 MODE PENGIRIMAN STOK
 * ============================================================================ */
window.filterBrands = function(type, btnEl) {
    currentBrandFilter = type;
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
    }, 100);
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
    isCatalogExpanded = true;
    window.renderBrands(currentBrandFilter);
};

// [FEATURE-08] Katalog di Dashboard Utama selalu muncul semua tanpa disembunyikan
window.renderBrands = function(filter = currentBrandFilter) {
    const grid = document.getElementById('brand-grid');
    const moreWrap = document.getElementById('catalog-more-wrap');
    if (!grid) return;
    if (moreWrap) moreWrap.style.display = 'none';
    
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
        return; 
    }

    let html = '';
    filteredBrands.forEach((b, idx) => {
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
            const hasEmailFormat = b.items.some(it => it.stockMode === 'EMAIL_OAUTH' || (it.name || '').toLowerCase().includes('email') || (it.name || '').toLowerCase().includes('mail'));
            tagClass = hasEmailFormat ? 'tag-email' : 'tag-tools';
            tagLabel = hasEmailFormat ? 'EMAIL / TOOLS' : 'TOOLS';
        }

        const imgHtml = b.imgUrlBase64 
             ? `<img src="${b.imgUrlBase64}" alt="${safeHtmlBrand}" loading="lazy" decoding="async">` 
             : `<div style="width:100%; height:100%; background:var(--primary); display:flex; align-items:center; justify-content:center; font-size:1.9rem; font-weight:900; color:#ffffff;">${safeHtmlBrand.charAt(0)}</div>`;
             
        const clickAction = b.isGangguan 
            ? `window.customAlert('Maintenance Server', 'Mohon maaf, layanan produk ini sedang dalam pemeliharaan jaringan.', 'warning')` 
            : `window.openDirectBuyModal('${safeJsBrand}')`;
        const cssClass = b.isGangguan ? 'brand-card stagger-card sold-out' : 'brand-card stagger-card';
        const animDelay = `${Math.min(idx * 25, 220)}ms`;
        
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

// [FEATURE-08] Render Daftar Variasi di Halaman Checkout dengan Tombol "Lihat Selengkapnya" & "Tutup Kembali"
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

window.collapseVariantsView = function() {
    isVariantsExpanded = false;
    renderCheckoutVariantCards();
    const step2El = document.getElementById('buy-item-grid');
    if (step2El) step2El.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

function renderCheckoutVariantCards() {
    if (!currentCheckoutBrand) return;
    const itemGrid = document.getElementById('buy-item-grid');
    const moreBtn = document.getElementById('btn-items-more');
    const collapseBtn = document.getElementById('btn-items-collapse');
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

    // [FEATURE-08] Tampilkan tombol "Lihat Variasi Selengkapnya" saat terlipat, dan "Tutup Kembali Variasi" saat terbuka
    if (moreBtn && collapseBtn) {
        if (shouldCollapse) {
            const hiddenCount = filteredItems.length - INITIAL_VARIANT_LIMIT;
            if (!isVariantsExpanded) {
                moreBtn.style.display = 'inline-flex';
                moreBtn.innerHTML = `<i class="fa-solid fa-plus"></i> <span>Lihat ${hiddenCount} Variasi Selengkapnya</span> <i class="fa-solid fa-chevron-down"></i>`;
                collapseBtn.style.display = 'none';
            } else {
                moreBtn.style.display = 'none';
                collapseBtn.style.display = 'inline-flex';
                collapseBtn.innerHTML = `<i class="fa-solid fa-angles-up"></i> <span>Tutup Kembali Variasi</span>`;
            }
        } else {
            moreBtn.style.display = 'none';
            collapseBtn.style.display = 'none';
        }
    }

    if (visibleItems.length === 0) {
        itemGrid.innerHTML = `<div class="brutal-empty-box" style="grid-column: 1/-1; padding: 1.4rem;">Variasi paket tidak ditemukan.</div>`;
        return;
    }

    let html = '';
    visibleItems.forEach((item, idx) => {
        const normalPrice = item.priceNum || 0;
        const procType = (item.processType || 'auto').toLowerCase();
        const availQuota = computeVariantAvailableStock(item);
        const hasStockQuota = typeof availQuota === 'number' && availQuota >= 0;
        const isQuotaEmpty = hasStockQuota && availQuota === 0;

        // Jika mode auto dan stok di tab stok ada (availQuota > 0), maka otomatis bisa dibeli walaupun item.soldOut lama bernilai true (#18)
        const isSold = procType === 'auto' && hasStockQuota && availQuota > 0
            ? false
            : Boolean(item.soldOut || isQuotaEmpty);

        const isSelected = selectedProductForBuy && selectedProductForBuy.dbId === item.dbId;

        let procBadge = '';
        if (procType === 'manual') {
            procBadge = '<span class="proc-mode-badge proc-mode-manual"><i class="fa-solid fa-user-gear"></i> MANUAL</span>';
        } else if (procType === 'ask_auto' || procType === 'hybrid') {
            procBadge = '<span class="proc-mode-badge proc-mode-ask-auto"><i class="fa-solid fa-comments"></i> TANYA / AUTO</span>';
        } else {
            procBadge = '<span class="proc-mode-badge proc-mode-auto"><i class="fa-solid fa-bolt"></i> OTOMATIS</span>';
        }

        const varDescText = (item.variantDesc || item.description || '').trim();
        const varDescHtml = varDescText
            ? `<div class="item-variant-desc">${escapeHtml(varDescText)}</div>`
            : '';

        let badgesHtml = '';
        if (item.stockMode === 'EMAIL_OAUTH') {
            badgesHtml += `<span class="item-email-format-pill"><i class="fa-solid fa-envelope-open-text"></i> FORMAT EMAIL</span>`;
        } else if (item.stockMode === 'SHARING' || (item.defaultMaxQuota && item.defaultMaxQuota > 1)) {
            badgesHtml += `<span class="item-sharing-pill"><i class="fa-solid fa-users"></i> SHARING</span>`;
        }
        if (item.durationDays && item.durationDays > 0) {
            badgesHtml += `<span class="item-duration-pill"><i class="fa-regular fa-clock"></i> ${item.durationDays} Hari</span>`;
        }
        if (hasStockQuota) {
            badgesHtml += `<span class="item-stock-pill"><i class="fa-solid fa-layer-group"></i> Stok: <b>${availQuota >= 999 ? '∞' : availQuota}</b></span>`;
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
    const askAutoWarn = document.getElementById('ask-auto-warning-msg');
    if (askAutoWarn) askAutoWarn.style.display = 'none';
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
    else if (brandObj.type === 'tools') badgeTypeLabel = 'TOOLS & EMAIL';
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
                <span>Detail <b>Akun / Format Email / Link Akses Tools</b> akan langsung dikirimkan otomatis ke menu <b>Pesanan (E-Receipt)</b> & Email kamu detik itu juga setelah pembayaran lunas!</span>
            </div>`;
    }
    
    // [FEATURE-14] Sembunyikan Kolom Email DAN No HP untuk Member Resmi
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    const guestContactBox = document.getElementById('buy-guest-contact-box');
    const emailGroup = document.getElementById('buy-email-group');
    const phoneGroup = document.getElementById('buy-phone-group');
    const emailInput = document.getElementById('buy-email');
    const phoneInput = document.getElementById('buy-phone');
    const memberAutofillBadge = document.getElementById('buy-member-autofill-badge');

    if (isMember) {
        const memEmail = userProfile.email || currentUser.email || localStorage.getItem('vipercell_member_email') || '';
        const memPhone = userProfile.phone || userProfile.whatsapp || localStorage.getItem('vipercell_member_phone') || '';
        if (emailInput) emailInput.value = memEmail;
        if (phoneInput) phoneInput.value = memPhone;
        if (guestContactBox) guestContactBox.style.display = 'none';
        if (emailGroup) emailGroup.style.display = 'none';
        if (phoneGroup) phoneGroup.style.display = 'none';
        if (memberAutofillBadge) memberAutofillBadge.style.display = 'flex';
    } else {
        // Sesi Anonim: hanya ambil email/phone milik sesi anonim saat ini (bukan milik Member)
        if (emailInput) emailInput.value = localStorage.getItem('vipercell_guest_email') || '';
        if (phoneInput) phoneInput.value = localStorage.getItem('vipercell_guest_phone') || '';
        if (guestContactBox) guestContactBox.style.display = 'block';
        if (emailGroup) emailGroup.style.display = 'block';
        if (phoneGroup) phoneGroup.style.display = 'block';
        if (memberAutofillBadge) memberAutofillBadge.style.display = 'none';
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
    const askAutoWarn = document.getElementById('ask-auto-warning-msg');
    const procType = (selectedProductForBuy?.processType || 'auto').toLowerCase();

    if (manualWarn) {
        manualWarn.style.display = procType === 'manual' ? 'flex' : 'none';
    }
    if (askAutoWarn) {
        askAutoWarn.style.display = (procType === 'ask_auto' || procType === 'hybrid') ? 'flex' : 'none';
    }

    const qtyInput = document.getElementById('buy-qty');
    const qtySub = document.getElementById('buy-qty-subtext');
    const availQuota = computeVariantAvailableStock(selectedProductForBuy);

    if (typeof availQuota === 'number' && availQuota < 999) {
        if (qtySub) qtySub.innerText = `Tersedia ${availQuota} stok/slot`;
        if (parseInt(qtyInput.value) > availQuota) {
            qtyInput.value = Math.max(1, availQuota);
        }
    } else if (qtySub) {
        qtySub.innerText = 'Kuantitas item';
    }
    
    window.calculateDirectBuyTotal();
};

/* ============================================================================
 * [FEATURE-06, 13, 19] PROMO ENGINE (SEMUA USER VS MEMBER RESMI & 1 EMAIL 1X)
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
    if (typeof availQuota === 'number' && availQuota > 0 && availQuota < 999) {
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
    
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    const effectiveUid = isMember ? currentUser.uid : (boundLegacyGuestUid || currentUser?.uid || '');
    const buyerEmail = (isMember ? (userProfile.email || currentUser?.email || '') : (document.getElementById('buy-email')?.value || '')).trim().toLowerCase();

    const p = promos.find(x => x.code === codeInput);
    const qty = parseInt(document.getElementById('buy-qty')?.value) || 1;
    const rawSubtotal = selectedProductForBuy ? (selectedProductForBuy.priceNum * qty) : 0;
    const todayIso = new Date().toISOString().slice(0, 10);

    if (!p || !p.active) {
        appliedPromo = null;
        msgEl.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-circle-xmark"></i> Kode promo tidak ditemukan atau tidak aktif.</span>`;
        window.calculateDirectBuyTotal();
        return;
    }

    // [FEATURE-13] Cek apakah Kode Promo Khusus Member Resmi (Anonim tidak bisa gunakan)
    const isMemberOnlyPromo = (p.targetUser === 'member' || p.targetUser === 'member_only' || p.memberOnly === true);
    if (isMemberOnlyPromo && !isMember) {
        appliedPromo = null;
        msgEl.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-user-lock"></i> Kode promo ini <b>Khusus Member Resmi</b>! Akun Anonim tidak dapat menggunakannya (Upgrade di tab Profil).</span>`;
        window.calculateDirectBuyTotal();
        return;
    }

    // [FEATURE-19] Cek aturan 1 Email = 1x Pakai
    if (buyerEmail && buyerEmail.includes('@')) {
        const usedEmailsList = Array.isArray(p.usedEmails) ? p.usedEmails.map(e => String(e).toLowerCase()) : [];
        const hasUsedInOrders = orders.some(o =>
            o.promoCode && o.promoCode.toUpperCase() === p.code.toUpperCase() &&
            o.status !== 'CANCELLED' && o.status !== 'EXPIRED' && o.status !== 'FAILED' &&
            (o.userEmail || '').toLowerCase() === buyerEmail
        );
        const hasUsedLocal = localStorage.getItem(`vipercell_promo_used_${p.code}_${buyerEmail}`) === '1';

        if (usedEmailsList.includes(buyerEmail) || hasUsedInOrders || hasUsedLocal) {
            appliedPromo = null;
            msgEl.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-ban"></i> Kode promo <b>${escapeHtml(p.code)}</b> hanya berlaku 1x per Email (Email ${escapeHtml(buyerEmail)} sudah pernah mengklaim).</span>`;
            window.calculateDirectBuyTotal();
            return;
        }
    }

    if (p.usedCount >= p.maxUses) {
        appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-circle-xmark"></i> Kuota kode promo sudah habis.</span>`;
    } else if (p.expiryDate && p.expiryDate < todayIso) {
        appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-circle-xmark"></i> Masa berlaku kode promo telah berakhir.</span>`;
    } else if (p.minOrder && p.minOrder > 0 && rawSubtotal < p.minOrder) {
        appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-circle-xmark"></i> Minimal belanja Rp${p.minOrder.toLocaleString('id-ID')}.</span>`;
    } else if (p.targetBrand && p.targetBrand !== 'all' && currentCheckoutBrand && p.targetBrand !== currentCheckoutBrand.brandName) {
        appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-circle-xmark"></i> Khusus produk ${escapeHtml(p.targetBrand)}.</span>`;
    } else if (p.targetUser === 'new') {
        const hasOrders = orders.some(o =>
            (effectiveUid && o.userId === effectiveUid) ||
            (buyerEmail && (o.userEmail || '').toLowerCase() === buyerEmail)
        );
        if (hasOrders) {
            appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-circle-xmark"></i> Khusus pengguna transaksi pertama.</span>`;
        } else {
            setValidPromo(p, msgEl, isMemberOnlyPromo);
        }
    } else {
        setValidPromo(p, msgEl, isMemberOnlyPromo);
    }
    window.calculateDirectBuyTotal();
};
window.applyPromoDirectV27 = window.applyPromoDirect;

function setValidPromo(p, msgEl, isMemberOnlyPromo = false) {
    appliedPromo = { dbId: p.dbId, code: p.code, amount: p.amount, type: p.type || 'nominal', memberOnly: isMemberOnlyPromo };
    const badgeTag = isMemberOnlyPromo ? ' (VIP Member)' : '';
    msgEl.innerHTML = `<span style="color:var(--success)"><i class="fa-solid fa-circle-check"></i> Promo ${escapeHtml(p.code)}${badgeTag} berhasil dipasang!</span>`;
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
    
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);

    // [FEATURE-14] Untuk Member Resmi, otomatis gunakan Email & No HP dari profil Member tanpa perlu input!
    let emailInput = isMember
        ? (userProfile.email || currentUser?.email || document.getElementById('buy-email')?.value || '').trim()
        : (document.getElementById('buy-email')?.value || '').trim();

    let phoneInput = isMember
        ? (userProfile.phone || userProfile.whatsapp || document.getElementById('buy-phone')?.value || '').trim()
        : (document.getElementById('buy-phone')?.value || '').trim();

    if (!emailInput || !emailInput.includes('@')) { 
        window.customAlert('Email Diperlukan', 'Harap masukkan alamat Email aktif untuk pengiriman struk & akun!', 'warning'); 
        return; 
    }

    // Validasi ulang Promo Member Only & 1 Email 1x Pakai tepat sebelum membuat order (#13 & #19)
    if (appliedPromo) {
        const promoDoc = promos.find(x => x.code === appliedPromo.code);
        if (promoDoc) {
            const isMemOnly = (promoDoc.targetUser === 'member' || promoDoc.targetUser === 'member_only' || promoDoc.memberOnly === true);
            if (isMemOnly && !isMember) {
                window.customAlert('Khusus Member Resmi', 'Kode promo yang kamu pasang hanya berlaku untuk Member Resmi.', 'warning');
                return;
            }
            const lowerEm = emailInput.toLowerCase();
            const usedEmails = Array.isArray(promoDoc.usedEmails) ? promoDoc.usedEmails.map(e => String(e).toLowerCase()) : [];
            const alreadyClaimed = usedEmails.includes(lowerEm) || orders.some(o =>
                o.promoCode && o.promoCode.toUpperCase() === promoDoc.code.toUpperCase() &&
                o.status !== 'CANCELLED' && o.status !== 'EXPIRED' && o.status !== 'FAILED' &&
                (o.userEmail || '').toLowerCase() === lowerEm
            );
            if (alreadyClaimed) {
                appliedPromo = null;
                window.calculateDirectBuyTotal();
                window.customAlert('Promo Sudah Pernah Dipakai', `Kode promo <b>${escapeHtml(promoDoc.code)}</b> hanya berlaku 1x untuk setiap alamat Email (${escapeHtml(emailInput)}).`, 'warning');
                return;
            }
        }
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
        const typeLabel = currentCheckoutBrand.type === 'tools' ? 'Tools / Email Digital' : 'Akun Premium';
        const modeLbl = selectedProductForBuy.processType === 'manual' ? 'Manual' : (selectedProductForBuy.processType === 'ask_auto' ? 'Tanya/Auto' : 'Auto');
        playerInfo = `${typeLabel} (Delivery: ${modeLbl})`;
    }

    await ensureAuthSession();
    const effectiveUid = isMember ? currentUser.uid : (boundLegacyGuestUid || currentUser?.uid || userProfile.uid || null);

    const now = Date.now();
    const paymentMethod = document.querySelector('input[name="payment_method"]:checked').value;

    const existingActiveOrder = orders.find(o => {
        const isSameUser = effectiveUid && o.userId === effectiveUid;
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

    // [FEATURE-22] Simpan kontak sesuai sesi (Member vs Guest Terpisah)
    saveActiveSessionContact(emailInput, phoneInput);
    
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
        stockMode: selectedProductForBuy.stockMode || 'PRIVATE',
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
        isAnonymousOrder: !isMember,
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
        emailSent: false,
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
            const lowerEm = emailInput.toLowerCase();
            localStorage.setItem(`vipercell_promo_used_${appliedPromo.code}_${lowerEm}`, '1');
            await updateDoc(doc(db, pathPromos, appliedPromo.dbId), {
                usedCount: increment(1),
                usedEmails: arrayUnion(lowerEm)
            }).catch(() => {});
        }
        
        if (paymentMethod === 'qris') {
            setTimeout(() => window.openQRISModal(), 80);
        } else {
            setTimeout(() => window.openCashBarcodeModal(), 80);
        }
    } catch (e) { 
        window.customAlert("Gagal", "Gagal membuat pesanan ke server, silakan coba lagi.", "error"); 
    } finally {
        setTimeout(() => {
            isProcessingCheckout = false;
            btnProc.innerHTML = ogHtml;
            btnProc.disabled = false;
        }, 700);
    }
};

/* ============================================================================
 * [FEATURE-02, 03, 15, 17, 22, 23, 24] E-RECEIPT TANPA TOMBOL EMAIL USER,
 * PARSER FORMAT PRODUK EMAIL OAUTH ("email|password|refresh_token|client_id"),
 * PELACAK 1-INPUT ID TRX, & LIVE CHAT SUPPORT STUDIO V27
 * ============================================================================ */
function buildQuickCopyCredentialButtons(rawReplyText, invId) {
    if (!rawReplyText) return '';
    const lines = String(rawReplyText).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const extractedPairs = [];
    const emailOAuthBlocks = [];

    let pendingEmailOAuth = null;

    lines.forEach(line => {
        if (line.startsWith('[') && line.endsWith(']')) return;

        // Deteksi baris FORMAT_UTUH khusus produk Email OAuth (#17)
        if (line.toUpperCase().startsWith('FORMAT_UTUH')) {
            const cIdx = line.indexOf(':');
            const rawPipe = cIdx > 0 ? line.substring(cIdx + 1).trim() : '';
            if (rawPipe) {
                pendingEmailOAuth = { rawPipe, accessLink: '' };
                emailOAuthBlocks.push(pendingEmailOAuth);
            }
            return;
        }

        if (line.toUpperCase().startsWith('LINK_AKSES')) {
            const cIdx = line.indexOf(':');
            const linkVal = cIdx > 0 ? line.substring(cIdx + 1).trim() : '';
            if (linkVal && pendingEmailOAuth) {
                pendingEmailOAuth.accessLink = linkVal;
            } else if (linkVal) {
                extractedPairs.push({ label: 'Link Akses Tanpa Login', val: linkVal, isUrl: linkVal.startsWith('http') });
            }
            return;
        }

        // Deteksi baris mentah yang langsung berformat email|password|refresh_token|client_id(|link)
        if (line.includes('|') && line.split('|').length >= 4) {
            const segs = line.split('|').map(s => s.trim());
            const fourPart = `${segs[0]}|${segs[1]}|${segs[2]}|${segs[3]}`;
            const linkSeg = segs[4] || siteSettings.defaultEmailPortalUrl || '';
            emailOAuthBlocks.push({ rawPipe: fourPart, accessLink: linkSeg });
            if (segs[0]) extractedPairs.push({ label: 'Email', val: segs[0] });
            if (segs[1] && segs[1] !== '-') extractedPairs.push({ label: 'Password', val: segs[1] });
            if (segs[2] && segs[2] !== '-') extractedPairs.push({ label: 'Refresh Token', val: segs[2] });
            if (segs[3] && segs[3] !== '-') extractedPairs.push({ label: 'Client ID', val: segs[3] });
            return;
        }

        const colonIdx = line.indexOf(':');
        if (colonIdx > 0 && colonIdx < 28) {
            const label = line.substring(0, colonIdx).trim();
            const val = line.substring(colonIdx + 1).trim();
            if (val && val !== '-' && !label.toLowerCase().includes('terima kasih')) {
                extractedPairs.push({ label, val, isUrl: val.startsWith('http') });
            }
        } else if (line.includes('|')) {
            const parts = line.split('|').map(s => s.trim()).filter(Boolean);
            if (parts[0]) extractedPairs.push({ label: 'Email / ID / Link', val: parts[0] });
            if (parts[1] && parts[1] !== '-') extractedPairs.push({ label: 'Password / Kode', val: parts[1] });
            if (parts[2] && parts[2] !== '-') extractedPairs.push({ label: 'Profil / Info', val: parts[2] });
        }
    });

    let html = '';

    // [FEATURE-17] Render Kartu Khusus Format Produk Email OAuth + Tombol Copy Seutuhnya + Link Akses Tanpa Login
    if (emailOAuthBlocks.length > 0) {
        emailOAuthBlocks.forEach((blk, bIdx) => {
            const safePipeJs = escapeJsStr(blk.rawPipe);
            const accessUrl = blk.accessLink || siteSettings.defaultEmailPortalUrl || '';
            const safeAccessHtml = escapeHtml(accessUrl);
            const openPortalBtn = accessUrl
                ? `<a href="${safeAccessHtml}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-open-mail-portal" style="flex:1;">
                       <i class="fa-solid fa-up-right-from-square"></i> Buka Link Akses Ambil Kode (Tanpa Login)
                   </a>`
                : '';

            html += `
            <div class="email-oauth-vault-box">
                <div class="email-oauth-head">
                    <span class="brutal-tag tag-amber"><i class="fa-solid fa-envelope-open-text"></i> FORMAT PRODUK EMAIL ${emailOAuthBlocks.length > 1 ? '#' + (bIdx + 1) : ''}</span>
                    <small style="font-size:0.7rem; font-weight:700; color:var(--text-muted);">Salin utuh lalu tempel di web ambil kode</small>
                </div>
                <div class="raw-pipe-code">${escapeHtml(blk.rawPipe)}</div>
                <div class="email-oauth-actions">
                    <button type="button" class="btn btn-primary btn-sm" style="flex:1;" onclick="window.copyRawPipeFormatV27('${safePipeJs}')">
                        <i class="fa-regular fa-copy"></i> Salin Format Utuh (1-Klik)
                    </button>
                    ${openPortalBtn}
                </div>
            </div>`;
        });
    }

    if (extractedPairs.length > 0) {
        html += `<div class="cred-parsed-grid">`;
        extractedPairs.forEach(pair => {
            const safeVal = escapeJsStr(pair.val);
            const safeLbl = escapeJsStr(pair.label);
            const actionBtn = pair.isUrl
                ? `<div style="display:flex; gap:6px;">
                       <a href="${escapeHtml(pair.val)}" target="_blank" rel="noopener noreferrer" class="btn btn-warning btn-sm" style="padding:4px 10px; min-height:30px; font-size:0.72rem;">
                           <i class="fa-solid fa-up-right-from-square"></i> Buka Link
                       </a>
                       <button type="button" class="btn btn-primary btn-sm" style="padding:4px 10px; min-height:30px; font-size:0.72rem;" onclick="window.copyCredentialPart('${safeVal}', '${safeLbl}')">
                           <i class="fa-regular fa-copy"></i>
                       </button>
                   </div>`
                : `<button type="button" class="btn btn-primary btn-sm" style="padding:4px 10px; min-height:30px; font-size:0.72rem;" onclick="window.copyCredentialPart('${safeVal}', '${safeLbl}')">
                       <i class="fa-regular fa-copy"></i> Salin
                   </button>`;

            html += `
                <div class="cred-copy-item">
                    <div class="cred-copy-meta">
                        <span>${escapeHtml(pair.label)}</span>
                        <strong>${escapeHtml(pair.val)}</strong>
                    </div>
                    ${actionBtn}
                </div>
            `;
        });
        html += `</div>`;
    }
    return html;
}

window.copyRawPipeFormatV27 = function(rawPipeStr) {
    if (!rawPipeStr) return;
    navigator.clipboard.writeText(rawPipeStr).then(() => {
        window.showToast('Format Email Utuh Disalin!', 'Format email|password|refresh_token|client_id berhasil disalin untuk ditempel di web akses kode tanpa login.', 'success');
    });
};

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

// [FEATURE-02 & 15] E-Receipt Bersih: Tanpa Tombol Kirim Email User & Tanpa Banner Upgrade Anonim
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
        // [FEATURE-02] Tombol kirim email telah dihapus dari sisi user (hanya ada di Admin)
        const alreadyReviewed = hasOrderBeenReviewed(order);
        if (!alreadyReviewed && brandName) {
            actionHtml = `
                <button class="btn btn-warning" style="width:100%; margin-top:1rem;" onclick="window.goToReview('${safeJsBrand}', '${order.id}')"><i class="fa-solid fa-star"></i> Beri Ulasan Transaksi Ini</button>`;
        } else if (alreadyReviewed) {
            actionHtml = `
                <div style="margin-top:1rem; text-align:center; font-size:0.78rem; font-weight:800; color:var(--success); padding:8px; border:1.5px dashed var(--success); border-radius:8px;"><i class="fa-solid fa-circle-check"></i> Transaksi ini sudah diulas</div>`;
        }
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
                        <i class="fa-solid fa-key"></i> DATA AKUN / FORMAT EMAIL / VOUCHER TERKIRIM:
                    </span>
                    <button class="btn btn-outline btn-sm" style="padding:3px 10px; min-height:28px; font-size:0.7rem;" onclick="window.copyAccountReplyText('${escapeJsStr(order.id)}')">
                        <i class="fa-regular fa-copy"></i> Salin Semua Teks
                    </button>
                </div>
                ${quickCopyButtonsHtml}
                <div class="ereceipt-cred-content">${escapeHtml(order.adminReply)}</div>
            </div>`;
        } else if (order.items[0]?.processType === 'manual') {
            replyHtml = `
            <div class="brutal-alert-box alert-warning" style="margin-top: 12px;">
                <i class="fa-solid fa-user-clock"></i>
                <span>Pembayaran terverifikasi! Pesanan manual sedang disiapkan oleh Admin dan akan langsung dikirim ke E-Receipt & Email kamu.</span>
            </div>`;
        } else {
            replyHtml = `
            <div class="brutal-alert-box alert-warning" style="margin-top: 12px;">
                <i class="fa-solid fa-clock"></i>
                <span>Pembayaran lunas! Sistem sedang menyiapkan pengiriman stok otomatis untukmu.</span>
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
    const cleanInv = String(invId || '').trim().replace(/^#/, '').toUpperCase();
    const order = orders.find(o => (o.id || '').toUpperCase() === cleanInv);
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

// [FEATURE-03] Pelacak Pesanan Matang: Cukup Masukkan ID Transaksi Saja (Tanpa Email!)
window.trackOrder = async function() {
    const trackInp = document.getElementById('track-id');
    if (!trackInp) return;
    const invId = trackInp.value.trim().replace(/^#/, '').toUpperCase();
    trackInp.value = invId;

    if (!invId) {
        window.customAlert('ID Transaksi Diperlukan', 'Silakan masukkan Nomor Invoice / ID Transaksi (contoh: VP-123456).', 'warning');
        return;
    }

    const resBox = document.getElementById('track-result');
    let order = orders.find(o => (o.id || '').toUpperCase() === invId);

    // Jika belum ada di memori lokal, cari langsung ke Firestore berdasarkan field `id`
    if (!order) {
        try {
            const q = query(collection(db, pathOrders), where("id", "==", invId));
            const snap = await getDocs(q);
            if (!snap.empty) {
                const d = snap.docs[0];
                order = { dbId: d.id, ...d.data() };
            }
        } catch (e) {}
    }

    if (!order) {
        if (resBox) {
            resBox.style.display = 'block';
            resBox.innerHTML = `<div class="brutal-alert-box alert-danger"><i class="fa-solid fa-circle-xmark"></i> <span>ID Transaksi <b>#${escapeHtml(invId)}</b> tidak ditemukan. Pastikan kode Invoice sudah benar.</span></div>`;
        }
        return;
    }

    if (resBox) {
        resBox.style.display = 'block';
        resBox.innerHTML = buildFullReceiptHTML(order);
        resBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
};
window.trackOrderByIdOnly = window.trackOrder;

// [FEATURE-22] Render Riwayat Pesanan Terisolasi (Sesi Anonim Baru tidak menarik riwayat Member)
window.renderUserOrders = function() {
    const grid = document.getElementById('user-order-grid');
    if (!grid) return;
    
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    const effectiveUid = isMember ? currentUser.uid : (boundLegacyGuestUid || currentUser?.uid || userProfile.uid || '');
    const activeMemberEmail = isMember ? (userProfile.email || currentUser?.email || '').toLowerCase() : '';

    let userOrders = orders.filter(o => {
        if (isMember) {
            const matchUid = effectiveUid && o.userId === effectiveUid;
            const matchEmail = activeMemberEmail && o.userEmail && o.userEmail.toLowerCase() === activeMemberEmail;
            return matchUid || matchEmail;
        } else {
            // Untuk akun Anonim: HANYA tampilkan transaksi milik UID sesi anonim ini!
            return Boolean(effectiveUid && o.userId === effectiveUid);
        }
    });

    if (currentUserHistoryFilter !== 'ALL') {
        userOrders = userOrders.filter(o => {
            if (currentUserHistoryFilter === 'UNPAID') return o.status === 'UNPAID' || o.status === 'PENDING_PAYMENT';
            if (currentUserHistoryFilter === 'FAILED') return o.status === 'FAILED' || o.status === 'EXPIRED' || o.status === 'CANCELLED';
            return o.status === currentUserHistoryFilter;
        });
    }
    
    if (userOrders.length === 0) {
        grid.innerHTML = `<div class="brutal-empty-box">Belum ada riwayat transaksi pada sesi ini. Gunakan kotak Lacak ID Transaksi di atas jika ingin mencari struk tertentu.</div>`;
        return;
    }
    
    let html = '';
    userOrders.slice(0, 50).forEach((o) => {
        html += buildCompactOrderItemHTML(o);
    });
    grid.innerHTML = html;
};

// ==========================================
// [FEATURE-20, 23, 24] FITUR LIVE CHAT BANTUAN BARU (TANPA PESAN CEPAT USER)
// ==========================================
async function getResolvedChatDocId() {
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    if (isMember && currentUser?.uid) return currentUser.uid;
    if (boundLegacyGuestUid) return boundLegacyGuestUid;
    const user = await ensureAuthSession();
    if (user && user.uid) {
        boundLegacyGuestUid = user.uid;
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
    
    // [FEATURE-23] Pastikan bar pesan cepat di sisi user selalu disembunyikan
    if (chatChips) chatChips.style.display = 'none';

    let savedName = userProfile.name || localStorage.getItem('vipercell_anon_name') || '';
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
        if (chatFooter) chatFooter.style.display = 'flex';
        scrollToBottomUserChat();
    } else {
        if (preForm) preForm.style.display = 'flex';
        if (chatHeader) chatHeader.style.display = 'none';
        if (chatBody) chatBody.style.display = 'none';
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
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span>Buka Ruang Obrolan CS</span>';
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

window.changeChatNamePrompt = function() {
    const preForm = document.getElementById('chat-pre-form');
    const chatHeader = document.getElementById('chat-wa-header');
    const chatBody = document.getElementById('user-chat-body');
    const chatFooter = document.getElementById('user-chat-footer');
    const nameInp = document.getElementById('chat-anon-name');

    if (nameInp) nameInp.value = userProfile.name || '';
    if (preForm) preForm.style.display = 'flex';
    if (chatHeader) chatHeader.style.display = 'none';
    if (chatBody) chatBody.style.display = 'none';
    if (chatFooter) chatFooter.style.display = 'none';
    if (nameInp) nameInp.focus();
};
window.changeChatNameInline = window.changeChatNamePrompt;

window.insertQuickUserChat = function(text) {
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
                <div style="width:64px; height:64px; border-radius:16px; background:var(--surface); border:var(--brutal-border); box-shadow:var(--brutal-shadow-xs); display:flex; align-items:center; justify-content:center; font-size:1.8rem; color:var(--primary); margin-bottom:12px;">
                    <i class="fa-solid fa-headset"></i>
                </div>
                <strong style="color:var(--text); font-size:1rem; font-weight:800;">Ruang Bantuan CS Siap Digunakan</strong>
                <small style="max-width:320px; margin-top:6px; font-weight:600; line-height:1.5;">Ketik pertanyaan, konsultasi stok, atau sebutkan Nomor Invoice pesananmu di kolom bawah.</small>
            </div>`;
        return;
    }
    
    let html = '';
    userChatMessages.forEach(msg => {
        const isUser = msg.sender === 'user';
        const msgClass = isUser ? 'user' : 'admin';
        const senderLabel = isUser
            ? `<span class="chat-sender-label"><i class="fa-solid fa-user"></i> ${escapeHtml(userProfile.name || 'Kamu')}</span>`
            : `<span class="chat-sender-label" style="color:var(--primary-light);"><i class="fa-solid fa-headset"></i> Admin Support Vipercell</span>`;

        html += `
            <div class="chat-msg ${msgClass}">
                ${senderLabel}
                <div>${escapeHtml(msg.text).replace(/\n/g, '<br>')}</div>
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
    const ogBtnHtml = btn.innerHTML;
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
            userEmail: getActiveSessionStorageEmail(),
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
        btn.innerHTML = ogBtnHtml;
    }
};

// ==========================================
// [FEATURE-07] TEMA DENGAN TRANSISI HALUS, NOTIFIKASI & NAVIGASI TAB
// ==========================================
window.toggleTheme = function() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('vipercell_theme', newTheme);
    
    const metaTheme = document.getElementById('meta-theme-color');
    if (metaTheme) metaTheme.setAttribute('content', newTheme === 'dark' ? '#090d16' : '#f4f6fb');
    
    const icon = document.getElementById('theme-icon');
    if (icon) icon.className = newTheme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';

    const lbl = document.getElementById('theme-label-text');
    if (lbl) lbl.innerText = newTheme === 'dark' ? 'Gelap' : 'Terang';
};

window.toggleThemeWithTransition = function(evt) {
    const html = document.documentElement;
    const curtain = document.getElementById('theme-transition-curtain');
    const btn = document.getElementById('btn-theme-toggle');

    if (evt && curtain) {
        const x = Math.round((evt.clientX / window.innerWidth) * 100);
        const y = Math.round((evt.clientY / window.innerHeight) * 100);
        curtain.style.setProperty('--theme-x', x + '%');
        curtain.style.setProperty('--theme-y', y + '%');
        curtain.classList.add('active');
        setTimeout(() => curtain.classList.remove('active'), 460);
    }

    html.classList.add('theme-transitioning');
    if (btn) btn.classList.add('spin-theme-icon');

    window.toggleTheme();

    setTimeout(() => {
        html.classList.remove('theme-transitioning');
        if (btn) btn.classList.remove('spin-theme-icon');
    }, 480);
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
    const iconUrl = siteSettings.pwaIconBase64 || siteSettings.logoImgBase64 || DEFAULT_VIPERCELL_SVG_ICON;
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

// [FEATURE-16] Perbaikan Icon Logo Web agar Selalu Tampil di Tab Browser & Link Web
let dynamicManifestBlobUrl = null;
function applyCustomPwaIcon() {
    const customIcon = siteSettings.pwaIconBase64 || siteSettings.logoImgBase64 || DEFAULT_VIPERCELL_SVG_ICON;

    const favicon = document.getElementById('favicon');
    const shortcutFav = document.getElementById('shortcut-favicon');
    const appleIcon = document.getElementById('apple-touch-icon');
    const ogImg = document.getElementById('og-meta-image');

    if (favicon) favicon.href = customIcon;
    if (shortcutFav) shortcutFav.href = customIcon;
    if (appleIcon) appleIcon.href = customIcon;
    if (ogImg) ogImg.setAttribute('content', customIcon);

    if (customIcon.startsWith('data:image')) {
        try { localStorage.setItem('vipercell_cached_icon_v27', customIcon); } catch (e) {}
    }

    try {
        const mimeType = customIcon.startsWith('data:image/svg')
            ? "image/svg+xml"
            : (customIcon.startsWith('data:image/webp') ? "image/webp" : "image/png");

        const manifestObj = {
            id: "/",
            name: `${siteSettings.logoText || 'Viper'}${siteSettings.logoAccent || 'cell'} V27 - Digital Store`,
            short_name: `${siteSettings.logoText || 'Viper'}${siteSettings.logoAccent || 'cell'}`,
            description: "Platform penyedia layanan aplikasi premium, akun email, top up game, dan tools digital otomatis 24/7.",
            start_url: window.location.origin + window.location.pathname,
            scope: window.location.origin + "/",
            display: "standalone",
            background_color: "#090d16",
            theme_color: "#2563eb",
            orientation: "any",
            icons: [
                { src: customIcon, sizes: "192x192", type: mimeType, purpose: "any" },
                { src: customIcon, sizes: "512x512", type: mimeType, purpose: "maskable" }
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
    "Produk Email & Tools Digital",
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

    const colors = ['#2563eb', '#facc15', '#10b981', '#ec4899', '#8b5cf6', '#ef4444'];
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
        }, 2100);
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

// [FEATURE-01] Seamless Full-Page View Controller (Menggantikan Pop-Up Mengambang)
window.openModal = (id) => {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('active');
        if (el.classList.contains('modal-overlay')) {
            document.body.classList.add('no-scroll');
            el.scrollTop = 0;
        }
    }
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
};

window.closeAlert = () => {
    const alertEl = document.getElementById('custom-alert');
    const extraEl = document.getElementById('ca-extra-action');
    if (alertEl) alertEl.classList.remove('active');
    if (extraEl) extraEl.innerHTML = '';
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
        authTitle.innerText = 'Pulihkan Kata Sandi (Apps Script)'; 
        authSub.innerText = 'Masukkan email terdaftar untuk menerima tautan & token ubah sandi.';
    } else {
        if (authTabsContainer) authTabsContainer.style.display = 'flex';
        if (authDivider) authDivider.style.display = 'flex';
        if (googleBtn) googleBtn.style.display = 'inline-flex';
        if (guestBtn) guestBtn.style.display = 'inline-flex';
        authTitle.innerText = tab === 'login' ? 'Masuk ke Vipercell' : 'Daftar Member Vipercell';
        authSub.innerText = tab === 'login' ? 'Silakan masuk ke akun kamu atau pilih akses cepat di bawah.' : 'Daftar gratis untuk menyimpan riwayat E-Receipt permanen & promo Member.';
        
        const btnL = document.getElementById('tab-login');
        const btnR = document.getElementById('tab-register');
        if (btnL) btnL.className = tab === 'login' ? 'active' : '';
        if (btnR) btnR.className = tab === 'register' ? 'active' : '';
    }
};
window.showResetPassword = () => window.switchAuthTab('reset');

window.switchMainTab = function(tab) {
    if (document.body.classList.contains('auth-locked') && tab !== 'auth' && tab !== 'ubah-sandi') {
        return;
    }

    if (tab !== 'payment-qris' && activeTimersRegistry.qrisCountdown) {
        clearInterval(activeTimersRegistry.qrisCountdown);
        activeTimersRegistry.qrisCountdown = null;
    }

    document.querySelectorAll('.main-tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('nav a').forEach(el => el.classList.remove('active'));
    
    const navKey = tab === 'baca-berita' ? 'berita' : (tab === 'payment-qris' ? 'pesanan' : (tab === 'ubah-sandi' ? 'profil' : tab));
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
    }, 200); 
};

// ==========================================
// [FEATURE-05, 10, 22] AUTHENTICATION, UBAH SANDI APPS SCRIPT & LOGOUT BERSIH
// ==========================================
window.processLogin = async function() {
    const em = document.getElementById('auth-l-email').value.trim();
    const pw = document.getElementById('auth-l-pass').value.trim();
    if (!em || !pw) { window.customAlert('Error', 'Email dan Kata Sandi wajib diisi!', 'error'); return; }
    
    const btn = document.getElementById('btn-do-login');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Memproses...</span>'; 
    btn.disabled = true;
    try {
        // Bersihkan total atribut anonim sebelum login Member (#10 & #22)
        boundLegacyGuestUid = null;
        await clearMultiLayerToken('vipercell_anon_uid');
        localStorage.removeItem('vipercell_anon_session_started_at');

        const cred = await signInWithEmailAndPassword(auth, em, pw);
        currentUser = cred.user;
        localStorage.setItem('vipercell_active_session_mode', 'member');
        await syncUserProfileFromAuth(cred.user);
        const restricted = await checkRealtimeAccountRestriction(false);
        if (!restricted) {
            setAuthGateLock(false);
            window.switchMainTab('katalog');
            window.showToast('Berhasil Masuk', 'Selamat datang kembali di Vipercell!', 'success');
        }
    } catch (e) {
        window.customAlert('Gagal Masuk', 'Email atau kata sandi tidak cocok.', 'error');
    } finally { 
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
        boundLegacyGuestUid = null;
        await clearMultiLayerToken('vipercell_anon_uid');
        localStorage.removeItem('vipercell_anon_session_started_at');

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
        currentUser = cred.user;
        userProfile = newMemberObj;
        localStorage.setItem('vipercell_member_email', em.toLowerCase());
        localStorage.setItem('vipercell_member_phone', phone);
        localStorage.setItem('vipercell_active_session_mode', 'member');
        setAuthGateLock(false);
        applyUserSessionToUI();
        window.switchMainTab('katalog');
        window.customAlert('Pendaftaran Berhasil', 'Akun Member Resmi kamu telah aktif dan siap digunakan!', 'success');
    } catch (e) {
        window.customAlert('Gagal Daftar', 'Email mungkin sudah terdaftar atau format salah.', 'error');
    } finally { 
        btn.innerHTML = '<i class="fa-solid fa-user-check"></i> <span>Buat Akun Member Resmi</span>'; 
        btn.disabled = false; 
    }
};

function checkResetCooldown() {
    const lastResetTime = localStorage.getItem('vipercell_last_reset') || 0;
    const COOLDOWN = 2 * 60 * 1000;
    const now = Date.now();
    if (now - lastResetTime < COOLDOWN) {
        const remaining = Math.ceil((COOLDOWN - (now - lastResetTime)) / 1000);
        const min = Math.floor(remaining / 60); const sec = remaining % 60;
        window.customAlert('Tunggu Sebentar', `Harap tunggu <b>${min}m ${sec}s</b> sebelum mengirim ulang link ubah sandi.`, 'warning');
        return false;
    }
    return true;
}

/* ============================================================================
 * [FEATURE-05] ALUR & HALAMAN UBAH SANDI VIA LINK GOOGLE APPS SCRIPT
 * ============================================================================ */
window.requestAppsScriptPasswordResetLink = async function(source = 'auth') {
    const rawEmail = source === 'profile'
        ? (userProfile.email || currentUser?.email || document.getElementById('prof-email')?.value || '')
        : (document.getElementById('auth-res-email')?.value || document.getElementById('reset-page-email')?.value || '');

    const email = String(rawEmail).trim().toLowerCase();
    if (!email || !email.includes('@')) {
        window.customAlert('Email Diperlukan', 'Masukkan alamat email akun Member yang terdaftar.', 'warning');
        return;
    }
    if (!checkResetCooldown()) return;

    const btn = source === 'profile' ? null : document.getElementById('btn-do-reset');
    const ogHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Mengirim Link via Apps Script...</span>';
    }

    const token6 = String(Math.floor(100000 + Math.random() * 900000));
    const resetUrl = `${window.location.origin}${window.location.pathname}?action=reset_password&email=${encodeURIComponent(email)}&token=${encodeURIComponent(token6)}#ubah-sandi`;

    localStorage.setItem(`vipercell_reset_token_${email}`, JSON.stringify({
        token: token6,
        email: email,
        expiresAt: Date.now() + 900000
    }));

    try {
        let gasSent = false;
        if ((siteSettings.emailWebhookUrl || '').trim().startsWith('https://script.google.com/')) {
            try {
                await callUnifiedGasWebhook({
                    action: 'SEND_PASSWORD_RESET_LINK',
                    email: email,
                    to: email,
                    otpCode: token6,
                    otp: token6,
                    token: token6,
                    resetLink: resetUrl,
                    userName: userProfile.name || email.split('@')[0],
                    expiryMinutes: 15
                });
                gasSent = true;
            } catch (gasActionErr) {
                // Fallback ke SEND_OTP_EMAIL jika Apps Script lama belum memiliki route SEND_PASSWORD_RESET_LINK
                await callUnifiedGasWebhook({
                    action: 'SEND_OTP_EMAIL',
                    email: email,
                    to: email,
                    otpCode: token6,
                    otp: token6,
                    userName: `${userProfile.name || email.split('@')[0]} (Token Ubah Sandi)`,
                    expiryMinutes: 15
                });
                gasSent = true;
            }
        }

        // Kirim juga Firebase Password Reset standar sebagai cadangan sinkronisasi Auth
        await sendPasswordResetEmail(auth, email).catch(() => {});

        localStorage.setItem('vipercell_last_reset', Date.now());
        window.openNeoResetPasswordPage(email, '');
        window.showToast(
            gasSent ? 'Link & Token Terkirim via Apps Script!' : 'Tautan Reset Terkirim!',
            `Cek kotak masuk/spam email ${email} untuk klik link atau masukkan kode token 6 digit.`,
            'success'
        );
    } catch (e) {
        window.customAlert('Gagal Mengirim Link', `Pastikan email terdaftar dan URL Webhook Apps Script aktif. (${escapeHtml(e.message)})`, 'error');
    } finally {
        if (btn && ogHtml) {
            btn.disabled = false;
            btn.innerHTML = ogHtml;
        }
    }
};

window.processReset = function() {
    return window.requestAppsScriptPasswordResetLink('auth');
};

window.sendProfileResetPassword = function() {
    return window.requestAppsScriptPasswordResetLink('profile');
};

window.openNeoResetPasswordPage = function(prefillEmail = '', prefillToken = '') {
    const wasAuthLocked = document.body.classList.contains('auth-locked');
    if (wasAuthLocked) {
        document.body.setAttribute('data-return-auth-lock', '1');
        document.body.classList.remove('auth-locked');
    }
    document.querySelectorAll('.main-tab-content').forEach(el => el.classList.remove('active'));
    const resetTab = document.getElementById('tab-ubah-sandi');
    if (resetTab) resetTab.classList.add('active');

    const emailInp = document.getElementById('reset-page-email');
    const tokenInp = document.getElementById('reset-page-token');
    const fallbackEmail = userProfile.email || document.getElementById('auth-res-email')?.value || '';

    if (emailInp) emailInp.value = prefillEmail || (fallbackEmail.includes('@') ? fallbackEmail : '');
    if (tokenInp && prefillToken) tokenInp.value = prefillToken;

    const banner = document.getElementById('reset-link-detected-banner');
    if (banner) banner.style.display = prefillToken ? 'flex' : 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.closeNeoResetPasswordPage = function() {
    const shouldRelock = document.body.getAttribute('data-return-auth-lock') === '1';
    document.body.removeAttribute('data-return-auth-lock');
    if (shouldRelock) {
        setAuthGateLock(true);
    } else {
        window.switchMainTab('profil');
    }
};

window.evaluateResetPasswordStrength = function(val) {
    const fill = document.getElementById('reset-pass-meter-fill');
    const txt = document.getElementById('reset-pass-meter-text');
    if (!fill || !txt) return;

    const s = String(val || '');
    let score = 0;
    if (s.length >= 6) score += 35;
    if (s.length >= 8) score += 25;
    if (/[A-Z]/.test(s) && /[a-z]/.test(s)) score += 20;
    if (/[0-9]/.test(s) || /[^A-Za-z0-9]/.test(s)) score += 20;

    fill.style.width = score + '%';
    if (score < 40) {
        fill.style.backgroundColor = 'var(--danger)';
        txt.innerText = 'Kekuatan sandi: Lemah (Minimal 6 karakter)';
    } else if (score < 75) {
        fill.style.backgroundColor = 'var(--warning)';
        txt.innerText = 'Kekuatan sandi: Cukup Kuat';
    } else {
        fill.style.backgroundColor = 'var(--success)';
        txt.innerText = 'Kekuatan sandi: Sangat Kuat & Aman';
    }
};

window.sendTokenFromResetPage = function() {
    const em = document.getElementById('reset-page-email')?.value.trim() || '';
    if (!em || !em.includes('@')) {
        window.customAlert('Isi Email Dahulu', 'Masukkan alamat email akun pada kolom di atas sebelum meminta token.', 'warning');
        return;
    }
    const resInp = document.getElementById('auth-res-email');
    if (resInp) resInp.value = em;
    window.requestAppsScriptPasswordResetLink('auth');
};

window.submitNewPasswordViaAppsScript = async function() {
    if (isSubmittingPasswordReset) return;

    const email = (document.getElementById('reset-page-email')?.value || '').trim().toLowerCase();
    const token = (document.getElementById('reset-page-token')?.value || '').trim();
    const pass1 = document.getElementById('reset-page-new-pass')?.value || '';
    const pass2 = document.getElementById('reset-page-confirm-pass')?.value || '';

    if (!email || !email.includes('@')) {
        window.customAlert('Email Tidak Valid', 'Masukkan alamat email akun yang benar.', 'warning');
        return;
    }
    if (!token || token.length < 4) {
        window.customAlert('Token Diperlukan', 'Masukkan kode token 6 digit dari link email Apps Script.', 'warning');
        return;
    }
    if (pass1.length < 6) {
        window.customAlert('Sandi Terlalu Pendek', 'Kata sandi baru minimal harus 6 karakter.', 'warning');
        return;
    }
    if (pass1 !== pass2) {
        window.customAlert('Sandi Tidak Cocok', 'Konfirmasi kata sandi baru tidak sama.', 'error');
        return;
    }

    const savedRaw = localStorage.getItem(`vipercell_reset_token_${email}`);
    if (savedRaw) {
        try {
            const parsed = JSON.parse(savedRaw);
            if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
                window.customAlert('Token Kedaluwarsa', 'Masa berlaku kode token (15 menit) telah habis. Silakan kirim ulang token.', 'error');
                return;
            }
            if (parsed.token && parsed.token !== token) {
                window.customAlert('Token Salah', 'Kode token reset tidak cocok dengan yang dikirim ke email kamu.', 'error');
                return;
            }
        } catch (e) {}
    }

    isSubmittingPasswordReset = true;
    const btn = document.getElementById('btn-submit-new-pass-v27');
    const ogHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Menyimpan Kata Sandi Baru...</span>';
    }

    try {
        // Jika user sedang login di sesi aktif dengan email yang sama, langsung update password di Firebase Auth
        if (auth.currentUser && !auth.currentUser.isAnonymous && (auth.currentUser.email || '').toLowerCase() === email) {
            await updatePassword(auth.currentUser, pass1);
        }

        // Jika Apps Script mendukung sinkronisasi password / konfirmasi reset, kirim sinyal ke GAS
        if ((siteSettings.emailWebhookUrl || '').trim().startsWith('https://script.google.com/')) {
            await callUnifiedGasWebhook({
                action: 'CONFIRM_PASSWORD_RESET',
                email: email,
                token: token,
                newPassword: pass1
            }).catch(() => {});
        }

        localStorage.removeItem(`vipercell_reset_token_${email}`);
        document.getElementById('reset-page-token').value = '';
        document.getElementById('reset-page-new-pass').value = '';
        document.getElementById('reset-page-confirm-pass').value = '';

        if (window.history && window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        window.customAlert(
            'Kata Sandi Berhasil Diubah! 🔐',
            `Kata sandi baru untuk akun <b>${escapeHtml(email)}</b> telah diperbarui menggunakan sistem keamanan Vipercell V27.`,
            'success'
        );
        window.closeNeoResetPasswordPage();
    } catch (err) {
        window.customAlert('Perlu Login Ulang', 'Untuk keamanan ekstra, silakan masuk terlebih dahulu atau gunakan tautan verifikasi di email kamu.', 'warning');
    } finally {
        isSubmittingPasswordReset = false;
        if (btn && ogHtml) {
            btn.disabled = false;
            btn.innerHTML = ogHtml;
        }
    }
};

window.processGoogleLogin = async function() {
    const provider = new GoogleAuthProvider();
    const btnText = document.getElementById('text-google-btn');
    const ogText = btnText ? btnText.innerText : 'Lanjutkan dengan Google';
    if (btnText) btnText.innerText = 'Memverifikasi...';
    
    try {
        boundLegacyGuestUid = null;
        await clearMultiLayerToken('vipercell_anon_uid');
        localStorage.removeItem('vipercell_anon_session_started_at');

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
        const restricted = await checkRealtimeAccountRestriction(false);
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

// [FEATURE-22] Logout Bersih (Memisahkan Data Sesi Member & Anonim)
window.logoutUser = async function() {
    localStorage.setItem('vipercell_active_session_mode', 'logged_out');
    localStorage.removeItem('vipercell_track_email');
    localStorage.removeItem('vipercell_track_phone');
    localStorage.removeItem('vipercell_guest_email');
    localStorage.removeItem('vipercell_guest_phone');
    localStorage.removeItem('vipercell_anon_name');
    localStorage.removeItem('vipercell_anon_session_started_at');
    boundLegacyGuestUid = null;
    await clearMultiLayerToken('vipercell_anon_uid');

    if (activeTimersRegistry.anonSixHourCountdown) {
        clearInterval(activeTimersRegistry.anonSixHourCountdown);
        activeTimersRegistry.anonSixHourCountdown = null;
    }

    if (auth.currentUser) {
        await signOut(auth).catch(() => {});
    }
    currentUser = null;
    userProfile = { uid: '', name: '', email: '', phone: '', isGuest: true, isAnonymous: true };

    setAuthGateLock(true);
    window.showToast('Berhasil Keluar', 'Anda telah keluar ke halaman Login utama.', 'info');
};
window.logoutUserCleanV27 = window.logoutUser;

window.saveUserProfile = async function() {
    if (!currentUser) return;
    const name = document.getElementById('prof-name').value.trim();
    const phone = document.getElementById('prof-phone') ? document.getElementById('prof-phone').value.trim() : '';
    if (!name) { window.customAlert('Peringatan', 'Nama panggilan tidak boleh kosong.', 'warning'); return; }
    
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    const effectiveUid = isMember ? currentUser.uid : (boundLegacyGuestUid || currentUser.uid);

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

        if (isMember) {
            if (phone) localStorage.setItem('vipercell_member_phone', phone);
        } else {
            localStorage.setItem('vipercell_anon_name', name);
            if (phone) localStorage.setItem('vipercell_guest_phone', phone);
        }

        applyUserSessionToUI();
        window.showToast('Profil Disimpan', 'Data identitas & nomor WhatsApp berhasil diperbarui.', 'success');
    } catch (e) { window.customAlert('Error', 'Gagal menyimpan perubahan profil.', 'error'); }
};

function updateProfileStats() {
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    const effectiveUid = isMember ? currentUser.uid : (boundLegacyGuestUid || currentUser?.uid || userProfile.uid || '');
    const activeMemberEmail = isMember ? (userProfile.email || currentUser?.email || '').toLowerCase() : '';

    const myOrders = orders.filter(o => {
        if (isMember) {
            return (effectiveUid && o.userId === effectiveUid) || (activeMemberEmail && o.userEmail?.toLowerCase() === activeMemberEmail);
        }
        return Boolean(effectiveUid && o.userId === effectiveUid);
    });

    const successOrders = myOrders.filter(o => o.status === 'SUCCESS');
    const totalSpent = successOrders.reduce((sum, o) => sum + (o.finalTotal || 0), 0);

    const totalEl = document.getElementById('prof-stat-total');
    const statEl = document.getElementById('prof-stat-success');
    const spentEl = document.getElementById('prof-stat-spent');

    if (totalEl) totalEl.innerText = myOrders.length;
    if (statEl) statEl.innerText = successOrders.length;
    if (spentEl) spentEl.innerText = `Rp${totalSpent.toLocaleString('id-ID')}`;
}

/* ============================================================================
 * [FEATURE-11] MULTI-MESSAGE RUNNING INFO (HINGGA 6 PESAN) INTERAKTIF
 * Deskripsi : Mendukung hingga 6 pesan berjalan dari Admin. Ketika diklik:
 *             - Jika berisi Kode Promo / Target Produk -> Otomatis tempel promo
 *               dan langsung masuk ke halaman Checkout produk tersebut!
 *             - Jika berisi tautan Berita -> Langsung membuka artikel berita!
 * ============================================================================ */
function buildStructuredMarqueeSlots() {
    const slots = [];

    if (Array.isArray(siteSettings.marqueeList) && siteSettings.marqueeList.length > 0) {
        siteSettings.marqueeList.slice(0, 6).forEach((item, idx) => {
            if (!item) return;
            if (typeof item === 'string' && item.trim()) {
                slots.push({ text: item.trim(), type: 'info', promoCode: '', targetBrand: '', newsIndex: -1 });
            } else if (typeof item === 'object' && item.text && String(item.text).trim() && !item.isHidden) {
                slots.push({
                    text: String(item.text).trim(),
                    type: item.type || (item.promoCode ? 'promo' : (item.newsIndex >= 0 ? 'news' : 'info')),
                    promoCode: (item.promoCode || '').trim().toUpperCase(),
                    targetBrand: (item.targetBrand || '').trim(),
                    newsIndex: typeof item.newsIndex === 'number' ? item.newsIndex : -1
                });
            }
        });
    }

    // Jika marqueeList belum diatur, ekstrak hingga 6 pesan dari string `siteSettings.marquee` (dipisah `||` atau baris baru)
    if (slots.length === 0) {
        const rawMarquee = String(siteSettings.marquee || 'Selamat Datang di Vipercell V27!').trim();
        const rawParts = rawMarquee.includes('||')
            ? rawMarquee.split('||')
            : rawMarquee.split(/\r?\n/);

        rawParts.map(s => s.trim()).filter(Boolean).slice(0, 6).forEach(part => {
            slots.push({
                text: part,
                type: 'info',
                promoCode: '',
                targetBrand: '',
                newsIndex: -1
            });
        });
    }

    parsedMarqueeSlots = slots.slice(0, 6);
    return parsedMarqueeSlots;
}

function renderInteractiveMarqueeUI() {
    const marqueeContent = document.getElementById('marquee-content');
    const slotCounter = document.getElementById('marquee-slot-counter');
    if (!marqueeContent) return;

    const slots = buildStructuredMarqueeSlots();
    if (slotCounter) {
        slotCounter.innerText = `${slots.length} INFO`;
    }

    const buildPassHtml = () => slots.map((slot, idx) => {
        const safePromo = escapeJsStr(slot.promoCode || '');
        const safeBrand = escapeJsStr(slot.targetBrand || '');
        const newsIdx = typeof slot.newsIndex === 'number' ? slot.newsIndex : -1;

        let badgeClass = '';
        let badgeLabel = `INFO #${idx + 1}`;
        let actionHint = '<span class="marquee-item-action"><i class="fa-solid fa-arrow-up-right-from-square"></i> Buka</span>';

        if (slot.promoCode) {
            badgeClass = 'badge-promo';
            badgeLabel = `PROMO: ${escapeHtml(slot.promoCode)}`;
            actionHint = `<span class="marquee-item-action"><i class="fa-solid fa-ticket"></i> Pakai Promo</span>`;
        } else if (slot.newsIndex >= 0 || slot.type === 'news') {
            badgeClass = 'badge-news';
            badgeLabel = 'BERITA';
            actionHint = `<span class="marquee-item-action"><i class="fa-solid fa-newspaper"></i> Baca Info</span>`;
        } else if (slot.targetBrand) {
            badgeLabel = escapeHtml(slot.targetBrand);
            actionHint = `<span class="marquee-item-action"><i class="fa-solid fa-cart-shopping"></i> Beli Sekarang</span>`;
        }

        return `
            <span class="marquee-item-pill" onclick="window.handleMarqueeItemClick(${idx}, '${safePromo}', '${safeBrand}', ${newsIdx})">
                <span class="marquee-item-badge ${badgeClass}">${badgeLabel}</span>
                <span>${escapeHtml(slot.text)}</span>
                ${actionHint}
            </span>
        `;
    }).join('');

    // Gandakan untuk efek animasi marquee tak berujung yang mulus
    marqueeContent.innerHTML = buildPassHtml() + buildPassHtml();
}

window.handleMarqueeItemClick = function(slotIndex = 0, explicitPromo = '', explicitBrand = '', explicitNewsIdx = -1) {
    const slot = parsedMarqueeSlots[slotIndex] || {};
    const promoCode = (explicitPromo || slot.promoCode || '').trim().toUpperCase();
    let targetBrand = (explicitBrand || slot.targetBrand || '').trim();
    const newsIndex = explicitNewsIdx >= 0 ? explicitNewsIdx : (typeof slot.newsIndex === 'number' ? slot.newsIndex : -1);

    // 1. Jika memiliki kode promo, cari produk yang memenuhi syarat promo tersebut
    if (promoCode) {
        navigator.clipboard.writeText(promoCode).catch(() => {});
        if (!targetBrand) {
            const matchedPromo = promos.find(p => p.code && p.code.toUpperCase() === promoCode);
            if (matchedPromo && matchedPromo.targetBrand && matchedPromo.targetBrand !== 'all') {
                targetBrand = matchedPromo.targetBrand;
            } else if (groupedBrands.length > 0) {
                targetBrand = groupedBrands[0].brandName;
            }
        }

        if (targetBrand) {
            window.openDirectBuyModal(targetBrand);
            setTimeout(() => {
                const promoInp = document.getElementById('buy-promo-code');
                if (promoInp) promoInp.value = promoCode;
                if (currentCheckoutBrand && currentCheckoutBrand.items.length > 0 && !selectedProductForBuy) {
                    const firstAvail = currentCheckoutBrand.items.find(i => !i.soldOut) || currentCheckoutBrand.items[0];
                    if (firstAvail) window.selectItemToBuy(firstAvail.dbId);
                }
                window.applyPromoDirect();
                window.showToast(`Kode Promo ${promoCode} Dipasang!`, `Menampilkan produk yang memenuhi syarat promo ${promoCode}.`, 'success');
            }, 180);
            return;
        }
    }

    // 2. Jika memiliki target brand langsung
    if (targetBrand) {
        window.openDirectBuyModal(targetBrand);
        return;
    }

    // 3. Jika tertaut ke artikel berita tertentu
    const visibleNews = (siteSettings.newsList || []).filter(t => !t.isHidden);
    if (newsIndex >= 0 && newsIndex < visibleNews.length) {
        window.openReadNewsFullPage(newsIndex);
        return;
    }

    // 4. Default: jika ada berita, buka berita terbaru atau tab berita
    if (visibleNews.length > 0) {
        window.openReadNewsFullPage(0);
    } else {
        window.switchMainTab('berita');
    }
};

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
    
    renderInteractiveMarqueeUI();
    
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
        if (ctaSub) ctaSub.innerText = `Klik tombol di samping untuk memilih variasi ${news.linkedBrand} dan melakukan pembayaran instan!`;
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
                font: "JetBrains Mono",
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
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    const effectiveUid = isMember ? currentUser.uid : (boundLegacyGuestUid || currentUser?.uid || '');
    const userEmailToMatch = getActiveSessionStorageEmail();
    
    const mySuccessOrders = orders.filter(o => {
        if (o.status !== 'SUCCESS') return false;
        if (!o.items || o.items[0]?.brandName !== brandName) return false;
        if (isMember) {
            return (effectiveUid && o.userId === effectiveUid) || (userEmailToMatch && o.userEmail?.toLowerCase() === userEmailToMatch);
        }
        return Boolean(effectiveUid && o.userId === effectiveUid);
    });

    const unreviewedOrders = mySuccessOrders.filter(o => {
        const reviewedByOrderId = reviewsData.some(r => r.orderId && r.orderId === o.id);
        return !reviewedByOrderId;
    });

    const legacyReviewsCount = reviewsData.filter(r =>
        !r.orderId &&
        r.brandName === brandName &&
        (effectiveUid && r.userId === effectiveUid)
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

    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    const effectiveUid = isMember ? currentUser.uid : (boundLegacyGuestUid || currentUser?.uid || null);
    const newReview = {
        orderId: orderToReview.id,
        brandName: currentCheckoutBrand.brandName,
        userEmail: getActiveSessionStorageEmail() || orderToReview.userEmail || 'anonim',
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
// FUNGSI HELPER & INISIALISASI AKHIR STORE.JS V27.0
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

// Jalankan Inisialisasi Gatekeeper V27
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAppWithLoader);
} else {
    initializeAppWithLoader();
}