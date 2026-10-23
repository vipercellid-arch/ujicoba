/* ============================================================================
 * VIPERCELL - STOREFRONT ENGINE (WEB USER)
 * Nama File : js/store.js
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
const pathMutations = isWorkspace ? `artifacts/${appId}/public/data/payment_mutations` : 'payment_mutations';
const pathSuggestions = isWorkspace ? `artifacts/${appId}/public/data/product_suggestions` : 'product_suggestions';
const pathBalanceLogs = isWorkspace ? `artifacts/${appId}/public/data/balance_logs` : 'balance_logs';

const fallbackSettingsPath = isWorkspace ? 'settings' : `artifacts/${appId}/public/data/settings`;

// Durasi pembersihan sesi tamu otomatis di latar belakang (6 jam)
const ANON_AUTO_DELETE_TTL_MS = 6 * 60 * 60 * 1000;
const MUTATION_AUTO_CLEAN_1H_MS = 60 * 60 * 1000;

// SVG Default Favicon Vipercell
const DEFAULT_VIPERCELL_SVG_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' rx='116' fill='%232563eb' stroke='%230f172a' stroke-width='28'/%3E%3Cpath d='M298 88L136 288h116l-44 136 168-200H260l38-136z' fill='%23facc15' stroke='%230f172a' stroke-width='18' stroke-linejoin='round'/%3E%3C/svg%3E";

// ==========================================
// STATE & VARIABEL GLOBAL
// ==========================================
let products = [];
let groupedBrands = []; 
let orders = [];
let promos = [];
let reviewsData = [];
let liveReadyStocksMap = {};

let siteSettings = { 
    logoText: 'VIPER',
    logoAccent: 'CELL',
    logoImgBase64: '',
    pwaIconBase64: '',
    marquee: 'Selamat datang di Vipercell.',
    marqueeList: [],
    footerMarquee: 'TERIMA KASIH TELAH BERBELANJA DI VIPERCELL — LAYANAN APLIKASI PREMIUM, TOP UP GAME & PRODUK DIGITAL || TRANSAKSI OTOMATIS & BERGARANSI — HUBUNGI CS BANTUAN JIKA BUTUH PANDUAN',
    footerMarqueeList: [],
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
    anonAutoDelete6h: true,
    // Pengaturan Jam Operasional Toko (#4 & #5 — Tanpa Paksa Mode Stok Lokal)
    opHoursEnabled: false,
    opOpenTime: '08:00',
    opCloseTime: '22:00',
    // Efek Latar Belakang Sentuhan Air Berwarna (#9)
    waterRippleEnabled: false,
    footerMarqueeShowPrice: true,
    footerMarqueeShowStatus: true,
    footerMarqueeSpeed: 'normal',
    deletedUids: [],
    blockedUids: [],
    blockedDevices: [],
    digiflazzBridgeUrl: 'http://139.59.60.91:3100',
    digiflazzEnvMode: 'development',
    digiflazzBalanceGuard: true,
    digiflazzLastBalance: 1000000,
    memberPlusEnabled: true,
    memberPlusMonthlyPrice: 25000,
    memberPlusLocalDiscountPct: 5,
    memberPlusTagline: 'Harga lebih hemat di semua produk, akses voucher eksklusif Member Plus, dan prioritas layanan.'
};

let currentDeviceId = '';
let boundLegacyGuestUid = null;
let userProfile = {
    uid: '',
    name: '',
    email: '',
    role: 'anonymous',
    isAnonymous: true,
    isGuest: true,
    emailReceiptEnabled: true,
    sessionStartedAt: 0
};
let currentUser = null;
let currentCheckoutBrand = null;
let selectedProductForBuy = null;
let appliedPromo = null;
let verifiedPascaInquiry = null;
let verifiedPlnSubscriber = null; 
let currentCheckoutSession = null; 
let userChatMessages = [];
let initialOrderLoad = true;
let isSettingsLoaded = false; 
let isPreloaderFinished = false;
let previousOrdersData = {}; 
let lastSuccessOrderCount = -1;
let currentOpenedArticle = null;
let parsedMarqueeSlots = [];

// Filter & Accordion States
let currentBrandFilter = 'all';
let currentSearchQuery = '';
let isCatalogExpanded = true;
let isVariantsExpanded = false;
let currentVariantSearchQuery = '';
let currentUserHistoryFilter = 'ALL';
let currentBantuanSubTab = 'chat';

// Debounce Timers
let catalogSearchDebounceTimer = null;
let variantSearchDebounceTimer = null;

// State Verifikasi OTP 6-Digit (Tanpa No HP #3)
let pendingUpgradeState = {
    name: '',
    email: '',
    password: '',
    otpCode: '',
    otpExpiresAt: 0
};
let otpResendTimer = null;

// Registry Cleanup untuk Listener & Timer
const activeTimersRegistry = {
    qrisCountdown: null,
    bannerSlider: null,
    preloaderSafety: null,
    anonSixHourCountdown: null,
    opHoursWatcher: null
};
const activeListenersRegistry = {
    chat: null,
    deletedAccount: null,
    mutations: null,
    stocks: null
};

// Preferensi Notifikasi Browser & Opsi Kirim Struk ke Email (#3)
let isUserNotifEnabled = localStorage.getItem('vipercell_user_notif') !== 'off';
let isUserEmailReceiptEnabled = localStorage.getItem('vipercell_email_receipt_enabled') !== 'off';
let fastQrisWebhookPollInterval = null;
let isPollingGasPayment = false;

// Gembok Anti-Dobel Transaksi, Pengiriman Stok & Email
let isProcessingCheckout = false;
let isCancellingOrder = false;
let isCheckingPaymentNow = false;
let isSubmittingReview = false;
let isSubmittingSuggestion = false;
let isUpgradingAccount = false;
let targetReviewOrderId = null;
const deliveringOrderIds = new Set();
const sentEmailOrderIds = new Set();
const inFlightEmailOrderIds = new Set();

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

// ==========================================
// EFEK SENTUHAN AIR BERWARNA / WATER RIPPLE CANVAS (#9)
// ==========================================
let waterRippleEngine = {
    initialized: false,
    canvas: null,
    ctx: null,
    ripples: [],
    animFrameId: null,
    lastMoveTime: 0
};

const LIGHT_RIPPLE_COLORS = [
    'rgba(37, 99, 235, ',   // Biru
    'rgba(250, 204, 21, ',  // Kuning Neo
    'rgba(244, 63, 94, ',   // Pink
    'rgba(16, 185, 129, ',  // Emerald
    'rgba(139, 92, 246, '   // Ungu
];

const DARK_RIPPLE_COLORS = [
    'rgba(59, 130, 246, ',  // Biru Terang
    'rgba(250, 204, 21, ',  // Kuning
    'rgba(34, 211, 238, ',  // Cyan
    'rgba(251, 113, 133, ', // Rose
    'rgba(167, 139, 250, '  // Violet
];

function spawnWaterRippleAt(clientX, clientY, isClick = false) {
    if (siteSettings.waterRippleEnabled === false) return;
    const canvas = waterRippleEngine.canvas || document.getElementById('water-ripple-canvas');
    if (!canvas) return;
    if (!waterRippleEngine.ctx) {
        waterRippleEngine.canvas = canvas;
        waterRippleEngine.ctx = canvas.getContext('2d');
    }
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const palette = isDark ? DARK_RIPPLE_COLORS : LIGHT_RIPPLE_COLORS;
    const colorPrefix = palette[Math.floor(Math.random() * palette.length)];

    if (waterRippleEngine.ripples.length > 28) {
        waterRippleEngine.ripples.shift();
    }

    waterRippleEngine.ripples.push({
        x: clientX,
        y: clientY,
        radius: isClick ? 4 : 2,
        maxRadius: isClick ? (78 + Math.random() * 42) : (44 + Math.random() * 26),
        speed: isClick ? 2.4 : 1.75,
        alpha: isClick ? 0.58 : 0.36,
        lineWidth: isClick ? 2.6 : 1.8,
        colorPrefix: colorPrefix,
        secondRing: isClick
    });

    if (!waterRippleEngine.animFrameId) {
        waterRippleEngine.animFrameId = requestAnimationFrame(renderWaterRipplesLoop);
    }
}

function initWaterRippleBackground() {
    const canvas = document.getElementById('water-ripple-canvas');
    if (!canvas) return;
    waterRippleEngine.canvas = canvas;
    waterRippleEngine.ctx = canvas.getContext('2d');

    const resizeCanvas = () => {
        canvas.width = window.innerWidth || document.documentElement.clientWidth || 360;
        canvas.height = window.innerHeight || document.documentElement.clientHeight || 640;
    };
    resizeCanvas();

    if (!waterRippleEngine.initialized) {
        waterRippleEngine.initialized = true;
        window.addEventListener('resize', resizeCanvas, { passive: true });

        window.addEventListener('pointerdown', (e) => {
            if (siteSettings.waterRippleEnabled === false) return;
            spawnWaterRippleAt(e.clientX, e.clientY, true);
        }, { passive: true });

        window.addEventListener('pointermove', (e) => {
            if (siteSettings.waterRippleEnabled === false) return;
            const now = performance.now();
            if (now - waterRippleEngine.lastMoveTime < 55) return;
            waterRippleEngine.lastMoveTime = now;
            spawnWaterRippleAt(e.clientX, e.clientY, false);
        }, { passive: true });

        window.addEventListener('touchstart', (e) => {
            if (siteSettings.waterRippleEnabled === false) return;
            const t = e.touches && e.touches[0];
            if (t) spawnWaterRippleAt(t.clientX, t.clientY, true);
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (siteSettings.waterRippleEnabled === false) return;
            const now = performance.now();
            if (now - waterRippleEngine.lastMoveTime < 60) return;
            waterRippleEngine.lastMoveTime = now;
            const t = e.touches && e.touches[0];
            if (t) spawnWaterRippleAt(t.clientX, t.clientY, false);
        }, { passive: true });
    }
    updateWaterRippleVisibility();
}

function updateWaterRippleVisibility() {
    const canvas = document.getElementById('water-ripple-canvas');
    if (!canvas) return;
    if (siteSettings.waterRippleEnabled === false) {
        canvas.style.display = 'none';
        waterRippleEngine.ripples = [];
    } else {
        canvas.style.display = 'block';
    }
}

function renderWaterRipplesLoop() {
    const { canvas, ctx, ripples } = waterRippleEngine;
    if (!canvas || !ctx || siteSettings.waterRippleEnabled === false) {
        waterRippleEngine.animFrameId = null;
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.radius += r.speed;
        const progress = r.radius / r.maxRadius;
        const currentAlpha = Math.max(0, r.alpha * (1 - progress));

        if (currentAlpha <= 0.01 || r.radius >= r.maxRadius) {
            ripples.splice(i, 1);
            continue;
        }

        // Lingkaran Air Utama (GPU-friendly tanpa radialGradient berat)
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `${r.colorPrefix}${currentAlpha.toFixed(3)})`;
        ctx.lineWidth = r.lineWidth;
        ctx.stroke();

        if (r.secondRing && r.radius > 12) {
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.radius * 0.62, 0, Math.PI * 2);
            ctx.strokeStyle = `${r.colorPrefix}${(currentAlpha * 0.6).toFixed(3)})`;
            ctx.lineWidth = Math.max(1, r.lineWidth - 0.7);
            ctx.stroke();
        }
    }

    if (ripples.length > 0) {
        waterRippleEngine.animFrameId = requestAnimationFrame(renderWaterRipplesLoop);
    } else {
        waterRippleEngine.animFrameId = null;
    }
}

// ==========================================
// ISOLASI PENYIMPANAN EMAIL MEMBER VS TAMU (TANPA NO HP #3)
// ==========================================
function getActiveSessionStorageEmail() {
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    if (isMember) {
        return (userProfile.email || currentUser?.email || localStorage.getItem('vipercell_member_email') || '').trim().toLowerCase();
    }
    return (userProfile.email || localStorage.getItem('vipercell_guest_email') || '').trim().toLowerCase();
}

function saveActiveSessionContact(email) {
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    if (isMember) {
        if (email) localStorage.setItem('vipercell_member_email', email.trim().toLowerCase());
    } else {
        if (email) localStorage.setItem('vipercell_guest_email', email.trim().toLowerCase());
    }
}

// ==========================================
// PENGECEKAN JAM OPERASIONAL TOKO MATANG (#4 & #5)
// ==========================================
function isLocalStockOnlyRestrictionActive() {
    // Fitur Paksa Mode Stok Lokal sudah dihapus (#4); murni mengikuti jadwal jam operasional (#5)
    if (!siteSettings.opHoursEnabled) {
        return false;
    }
    const openStr = String(siteSettings.opOpenTime || '').trim();
    const closeStr = String(siteSettings.opCloseTime || '').trim();

    if (/^\d{1,2}:\d{2}$/.test(openStr) && /^\d{1,2}:\d{2}$/.test(closeStr)) {
        const [openH, openM] = openStr.split(':').map(Number);
        const [closeH, closeM] = closeStr.split(':').map(Number);
        const now = new Date();
        const curMins = now.getHours() * 60 + now.getMinutes();
        const openMins = openH * 60 + openM;
        const closeMins = closeH * 60 + closeM;

        if (openMins === closeMins) {
            return true;
        }
        let isWithinOpenHours = false;
        if (openMins < closeMins) {
            isWithinOpenHours = curMins >= openMins && curMins < closeMins;
        } else {
            // Lintas tengah malam (contoh 20:00 - 06:00)
            isWithinOpenHours = curMins >= openMins || curMins < closeMins;
        }
        // Jika waktu saat ini di luar jam operasional, hanya produk berstok lokal yang bisa dibeli (#5)
        return !isWithinOpenHours;
    }
    return false;
}

function getVariantLocalVaultStockCount(item) {
    if (!item) return 0;
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
    return vaultSlots + tabStocksSlots;
}

function isVariantInDigiflazzCutOff(item) {
    if (!item) return false;
    const startStr = String(item.cutOffStart || '').trim();
    const endStr = String(item.cutOffEnd || '').trim();
    if (!startStr || !endStr || (startStr === '00:00' && endStr === '00:00')) return false;
    if (!/^\d{1,2}:\d{2}$/.test(startStr) || !/^\d{1,2}:\d{2}$/.test(endStr)) return false;

    const [sh, sm] = startStr.split(':').map(Number);
    const [eh, em] = endStr.split(':').map(Number);
    const now = new Date();
    const curMins = now.getHours() * 60 + now.getMinutes();
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;
    if (startMins === endMins) return false;
    if (startMins < endMins) {
        return curMins >= startMins && curMins < endMins;
    } else {
        return curMins >= startMins || curMins < endMins;
    }
}

// Cek apakah varian memiliki layanan otomatis 24 jam (Digiflazz atau Gudang Stok Lokal)
function isVariantLocallyReadyForAutoProcess(item) {
    if (!item) return false;
    const procType = (item.processType || 'auto').toLowerCase();

    // Produk Digiflazz (Prabayar & Pascabayar) berjalan otomatis 24 jam selama tidak sedang jam cut-off
    if (procType === 'digiflazz' || procType === 'digiflazz_pasca' || item.isDigiflazz === true) {
        if (item.soldOut === true || item.manualLockSoldOut === true || item.sellerProductStatus === false) return false;
        if (isVariantInDigiflazzCutOff(item)) return false;
        return true;
    }

    // Produk manual atau top up game non-Digiflazz tanpa stok lokal membutuhkan Admin
    if (procType === 'manual' || (item.type === 'game' && procType !== 'auto')) {
        return false;
    }
    if (item.manualLockSoldOut === true) {
        return false;
    }
    const localVaultCount = getVariantLocalVaultStockCount(item);
    if (localVaultCount > 0) {
        return true;
    }
    if (procType === 'auto' && !item.soldOut && typeof item.stockCount === 'number' && item.stockCount > 0) {
        return true;
    }
    return false;
}

// Cek apakah varian sedang habis / gangguan / cut-off
function isVariantGangguanState(item) {
    if (!item) return false;
    if (item.isVariantGangguan === true || item.sellerProductStatus === false) return true;
    const procType = (item.processType || 'auto').toLowerCase();
    if ((procType === 'digiflazz' || procType === 'digiflazz_pasca' || procType === 'ewallet_custom' || item.isDigiflazz === true) && isVariantInDigiflazzCutOff(item)) {
        return true;
    }
    return false;
}

function isVariantOutOfDigiflazzBalance(item, customModalOverride = 0) {
    if (!item) return false;
    const procType = (item.processType || 'auto').toLowerCase();
    const isDf = (procType === 'digiflazz' || procType === 'ewallet_custom' || item.isDigiflazz === true) && procType !== 'digiflazz_pasca';
    if (!isDf) return false;
    if (siteSettings.digiflazzBalanceGuard === false) return false;

    const currentDfBal = Number(siteSettings.digiflazzLastBalance ?? 1000000);
    const reqModal = customModalOverride > 0
        ? customModalOverride
        : (procType === 'ewallet_custom'
            ? Number(item.minCustomNominal || 10000)
            : Number(item.digiflazzModalPrice || item.priceNum || 0));

    if (reqModal > 0 && currentDfBal < reqModal) {
        return true;
    }
    return false;
}

function isVariantMarkedSoldOutByAdmin(item) {
    if (!item) return true;
    if (isVariantGangguanState(item)) return false; // Gangguan dibedakan dari Stok Habis (#7)
    const procType = (item.processType || 'auto').toLowerCase();
    const localVaultCount = getVariantLocalVaultStockCount(item);

    if (procType === 'digiflazz' || procType === 'digiflazz_pasca' || procType === 'ewallet_custom' || item.isDigiflazz === true) {
        if (item.manualLockSoldOut === true || item.soldOut === true) return true;
        if (isVariantOutOfDigiflazzBalance(item)) return true;
        return false;
    }
    if (procType === 'manual') {
        return Boolean(item.manualLockSoldOut === true || item.soldOut === true);
    }
    if (procType === 'ask_auto' || procType === 'hybrid') {
        return Boolean(item.soldOut === true && localVaultCount <= 0);
    }
    if (localVaultCount > 0 && item.manualLockSoldOut !== true) return false;
    if (item.soldOut === true) return true;
    if (typeof item.stockCount === 'number' && item.stockCount <= 0) return true;
    return false;
}

function updateOpHoursBannerUI() {
    const restricted = isLocalStockOnlyRestrictionActive();

    // 1. Banner singkat di dasbor utama user (#2: hanya "Toko saat ini di luar jam layanan Admin.")
    const bannerEl = document.getElementById('operational-hours-banner');
    const textEl = document.getElementById('operational-hours-text');
    if (bannerEl && textEl) {
        if (restricted) {
            textEl.innerText = 'Toko saat ini di luar jam layanan Admin.';
            bannerEl.style.display = 'flex';
        } else {
            bannerEl.style.display = 'none';
        }
    }

    // 2. Indikator di Tab Chat Bantuan saat di luar jam operasional (#4)
    const chatOpBanner = document.getElementById('chat-op-hours-indicator');
    const chatOpText = document.getElementById('chat-op-hours-indicator-text');
    const chatHeaderStatus = document.getElementById('chat-header-status');
    if (chatOpBanner) {
        if (restricted) {
            if (chatOpText) {
                chatOpText.innerText = 'Mungkin pesan kamu akan direspon lebih lama karena saat ini berada di luar jam operasional.';
            }
            chatOpBanner.style.display = 'flex';
        } else {
            chatOpBanner.style.display = 'none';
        }
    }
    if (chatHeaderStatus) {
        chatHeaderStatus.innerText = restricted
            ? 'Di Luar Jam Operasional (Respon Lebih Lama)'
            : 'Layanan Bantuan';
        chatHeaderStatus.style.color = restricted ? 'var(--warning)' : 'var(--text-muted)';
    }
}

// ==========================================
// PRE-LOADER & PROTEKSI ANTI BOCOR KE TAB LOGIN (#7)
// ==========================================
function updatePreloaderStage(percent, statusText, subText = '') {
    const txtEl = document.getElementById('preloader-status-text');
    const fillEl = document.getElementById('preloader-bar-fill');
    const subEl = document.getElementById('preloader-stage-sub');

    if (txtEl && statusText) txtEl.innerText = statusText;
    if (fillEl) fillEl.style.width = `${Math.min(100, Math.max(8, percent))}%`;
    if (subEl && subText !== undefined) subEl.innerText = subText;
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
        }, 180);
    }
}

function setAuthGateLock(isLocked) {
    const authTab = document.getElementById('tab-auth');
    if (isLocked) {
        document.documentElement.classList.remove('has-saved-session');
        document.body.classList.add('auth-locked');
        document.body.classList.remove('is-member-session');
        const hWallet = document.getElementById('header-wallet-btn');
        const pWallet = document.getElementById('prof-wallet-card');
        const payBal = document.getElementById('pay-card-balance');
        if (hWallet) hWallet.style.display = 'none';
        if (pWallet) pWallet.style.display = 'none';
        if (payBal) payBal.style.display = 'none';
        document.querySelectorAll('.main-tab-content').forEach(el => {
            el.classList.remove('active');
            el.style.display = 'none';
        });
        if (authTab) {
            authTab.classList.add('active');
            authTab.style.display = 'block';
        }
        window.switchAuthTab('login');
        window.scrollTo({ top: 0, behavior: 'instant' });
    } else {
        document.documentElement.classList.add('has-saved-session');
        document.body.classList.remove('auth-locked');
        if (authTab) {
            authTab.classList.remove('active');
            authTab.style.display = 'none';
        }
        document.querySelectorAll('.main-tab-content').forEach(el => {
            if (el.id === 'tab-auth') {
                el.style.display = 'none';
            } else if (!el.classList.contains('active')) {
                el.style.display = '';
            }
        });
    }
}

function checkAuthStateFirstLoad() {
    return new Promise((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                resolve(auth.currentUser || null);
            }
        }, 850);
        const unsub = onAuthStateChanged(auth, (user) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                unsub();
                resolve(user);
            }
        }, () => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve(null);
            }
        });
    });
}

async function fetchInitialStoreDataWithGatekeeper() {
    updatePreloaderStage(50, 'Memuat toko...', '');
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
    initWaterRippleBackground();

    if (stocksSnap) {
        rebuildLiveReadyStocksMap(stocksSnap.docs);
    }

    updatePreloaderStage(85, 'Memuat produk...', '');
    if (ordersSnap) {
        orders = [];
        ordersSnap.forEach((d) => {
            const oData = { dbId: d.id, ...d.data() };
            if (oData.emailSent === true && oData.id) {
                sentEmailOrderIds.add(String(oData.id).toUpperCase());
            }
            orders.push(oData);
        });
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

function hydrateStoreFromFastCache() {
    try {
        const rawSettings = localStorage.getItem('vipercell_fast_settings_v273');
        if (rawSettings) {
            const parsedS = JSON.parse(rawSettings);
            siteSettings = { ...siteSettings, ...parsedS };
            isSettingsLoaded = true;
            window.applySettingsToUI();
        }
        const rawProducts = localStorage.getItem('vipercell_fast_products_v273');
        if (rawProducts) {
            const parsedP = JSON.parse(rawProducts);
            if (Array.isArray(parsedP) && parsedP.length > 0) {
                products = parsedP;
                rebuildGroupedBrands();
            }
        }
    } catch (e) {}
}

function saveStoreToFastCache() {
    try {
        const lightSettings = {
            logoText: siteSettings.logoText,
            logoAccent: siteSettings.logoAccent,
            marquee: siteSettings.marquee,
            marqueeList: siteSettings.marqueeList,
            footerMarquee: siteSettings.footerMarquee,
            footerMarqueeList: siteSettings.footerMarqueeList,
            isStoreOpen: siteSettings.isStoreOpen,
            opHoursEnabled: siteSettings.opHoursEnabled,
            opOpenTime: siteSettings.opOpenTime,
            opCloseTime: siteSettings.opCloseTime,
            emailWebhookUrl: siteSettings.emailWebhookUrl,
            webhookSecret: siteSettings.webhookSecret
        };
        localStorage.setItem('vipercell_fast_settings_v273', JSON.stringify(lightSettings));
        if (products.length > 0) {
            const lightProducts = products.slice(0, 60).map(p => ({
                dbId: p.dbId,
                brand: p.brand,
                name: p.name,
                priceNum: p.priceNum,
                type: p.type,
                processType: p.processType,
                soldOut: p.soldOut,
                stockCount: p.stockCount,
                isGangguan: p.isGangguan
            }));
            localStorage.setItem('vipercell_fast_products_v273', JSON.stringify(lightProducts));
        }
    } catch (e) {}
}

async function initializeAppWithLoader() {
    updateProfileNotifToggleUI();

    const savedTheme = localStorage.getItem('vipercell_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const icon = document.getElementById('theme-icon');
    if (icon) icon.className = savedTheme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    const themeLbl = document.getElementById('theme-label-text');
    if (themeLbl) themeLbl.innerText = savedTheme === 'dark' ? 'Gelap' : 'Terang';

    const savedSessionMode = localStorage.getItem('vipercell_active_session_mode');
    const hasSavedSession = (savedSessionMode === 'member' || savedSessionMode === 'guest');

    if (hasSavedSession) {
        document.documentElement.classList.add('has-saved-session');
        const authTab = document.getElementById('tab-auth');
        if (authTab) {
            authTab.classList.remove('active');
            authTab.style.display = 'none';
        }
    } else {
        setAuthGateLock(true);
    }

    if (!navigator.onLine) {
        updatePreloaderStage(20, 'Koneksi Terputus', 'Periksa sambungan internet kamu.');
        showPreloaderRetryUI('Perangkat sedang offline.');
        return;
    }

    // Muat cadangan tampilan awal di balik layar tanpa membuka preloader sebelum data katalog siap (#2)
    hydrateStoreFromFastCache();

    // Safety timer darurat (7.5 detik) hanya jika jaringan benar-benar macet:
    // Pastikan tab katalog/auth sudah ditampilkan lebih dulu sebelum membuka layar loading
    if (activeTimersRegistry.preloaderSafety) clearTimeout(activeTimersRegistry.preloaderSafety);
    activeTimersRegistry.preloaderSafety = setTimeout(() => {
        if (!isPreloaderFinished) {
            unlockAppUI();
            try {
                if (hasSavedSession) {
                    setAuthGateLock(false);
                    window.renderBrands(currentBrandFilter);
                    window.switchMainTab('katalog');
                } else {
                    setAuthGateLock(true);
                }
            } catch (e) {
                console.warn('Safety fallback render warning:', e);
            }
        }
    }, 6500);

    try {
        updatePreloaderStage(30, 'Menyiapkan toko...', 'Memuat katalog produk...');
        setPersistence(auth, browserLocalPersistence).catch(() => {});

        // Tunggu hingga data produk, pengaturan, dan sesi pengguna benar-benar siap
        const [, initialUser] = await Promise.all([
            initDeviceIdentity(),
            checkAuthStateFirstLoad(),
            fetchInitialStoreDataWithGatekeeper()
        ]);

        updatePreloaderStage(90, 'Menampilkan katalog...', 'Hampir selesai...');
        saveStoreToFastCache();
        listenData();
        setupAuthStateListener();
        startOpHoursWatcher();

        const sessionMode = localStorage.getItem('vipercell_active_session_mode');
        if (initialUser && !initialUser.isAnonymous && sessionMode !== 'logged_out') {
            boundLegacyGuestUid = null;
            await clearMultiLayerToken('vipercell_anon_uid');
            await syncUserProfileFromAuth(initialUser);

            const restricted = await checkRealtimeAccountRestriction(false);
            if (!restricted) {
                localStorage.setItem('vipercell_active_session_mode', 'member');
                setAuthGateLock(false);
                window.renderBrands(currentBrandFilter);
                window.switchMainTab('katalog');
            } else {
                setAuthGateLock(true);
            }
        } else if (sessionMode === 'guest') {
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
                    window.renderBrands(currentBrandFilter);
                    window.switchMainTab('katalog');
                    startSilentAnonSixHourCleanup();
                } else {
                    setAuthGateLock(true);
                }
            } else {
                setAuthGateLock(true);
            }
        } else {
            setAuthGateLock(true);
        }

        // Pastikan DOM Katalog sudah selesai ter-render penuh di layar baru tutup layar loading (#2)
        updatePreloaderStage(100, 'Toko Siap!', '');
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                unlockAppUI();
            });
        });
    } catch (error) {
        console.error("Init Error:", error);
        unlockAppUI();
        try {
            if (hasSavedSession && products.length > 0) {
                setAuthGateLock(false);
                window.renderBrands(currentBrandFilter);
                window.switchMainTab('katalog');
            } else {
                setAuthGateLock(true);
            }
        } catch (innerErr) {
            console.warn("Fallback UI error:", innerErr);
        }
    }
    observeReveals();
}

function startOpHoursWatcher() {
    if (activeTimersRegistry.opHoursWatcher) clearInterval(activeTimersRegistry.opHoursWatcher);
    updateOpHoursBannerUI();
    activeTimersRegistry.opHoursWatcher = setInterval(() => {
        updateOpHoursBannerUI();
        window.renderBrands(currentBrandFilter);
        if (currentCheckoutBrand) {
            renderCheckoutVariantCards();
            window.calculateDirectBuyTotal();
        }
    }, 30000);
}

// ==========================================
// IDENTITAS PERANGKAT & PEMBATASAN AKUN
// ==========================================
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

async function clearMultiLayerToken(key) {
    try { localStorage.removeItem(key); } catch (e) {}
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

    const isDeleted = !isMemberSession && deletedList.includes(effectiveUid);

    if (!isBlocked && !isDeleted) return false;

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
        userProfile = { uid: '', name: '', email: '', isGuest: true, isAnonymous: true };
        setAuthGateLock(true);

        if (isBlocked) {
            window.customAlert(
                'Akses Diblokir',
                'Maaf, akun atau perangkat kamu telah diblokir oleh Admin.',
                'error'
            );
        }
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
            userProfile.balance = Math.round(Number(uData.balance || 0));
            if (uData.trxPin !== undefined) userProfile.trxPin = uData.trxPin;
            if (uData.isMemberPlus !== undefined) userProfile.isMemberPlus = uData.isMemberPlus;
            if (uData.memberPlusExpiresAt !== undefined) userProfile.memberPlusExpiresAt = uData.memberPlusExpiresAt;
            window.updateUserWalletBalanceUI();
            if (typeof window.updateUserGreetingPanelUI === 'function') window.updateUserGreetingPanelUI();
            if (typeof window.updateUserTrxPinProfileUI === 'function') window.updateUserTrxPinProfileUI();
            if (uData.isBlocked === true) {
                if (!siteSettings.blockedUids) siteSettings.blockedUids = [];
                if (!siteSettings.blockedUids.includes(uid)) siteSettings.blockedUids.push(uid);
                await checkRealtimeAccountRestriction(true);
            }
        }
    }, () => {});
}

// ==========================================
// PEMBERSIHAN OTOMATIS TAMU 6 JAM
// ==========================================
async function checkAndExpireAnonSessionIf6Hours() {
    if (siteSettings.anonAutoDelete6h === false) {
        return false;
    }
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
        // Hapus juga akun anonim dari Firebase Authentication (#9)
        if (auth.currentUser && auth.currentUser.isAnonymous) {
            try {
                await deleteUser(auth.currentUser);
            } catch (delErr) {
                try {
                    const tok = await auth.currentUser.getIdToken();
                    await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=AIzaSyD3nBBicctpG8Ceukny5uNHqFMQjZsVipU`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ idToken: tok })
                    });
                } catch (e2) {}
            }
        }
        if (currentDeviceId) {
            await deleteDoc(doc(db, pathDeviceLocks, currentDeviceId)).catch(() => {});
        }
        boundLegacyGuestUid = null;
        await clearMultiLayerToken('vipercell_anon_uid');
        localStorage.removeItem('vipercell_anon_session_started_at');
        localStorage.removeItem('vipercell_guest_email');
        localStorage.removeItem('vipercell_anon_name');
        localStorage.setItem('vipercell_active_session_mode', 'logged_out');
        return true;
    }
    return false;
}

function startSilentAnonSixHourCleanup() {
    if (activeTimersRegistry.anonSixHourCountdown) {
        clearInterval(activeTimersRegistry.anonSixHourCountdown);
        activeTimersRegistry.anonSixHourCountdown = null;
    }

    const isGuest = Boolean(!currentUser || currentUser.isAnonymous || userProfile.isGuest);
    if (!isGuest || siteSettings.anonAutoDelete6h === false) {
        return;
    }

    let startedAt = parseInt(localStorage.getItem('vipercell_anon_session_started_at') || '0', 10);
    if (!startedAt || isNaN(startedAt)) {
        startedAt = userProfile.sessionStartedAt || Date.now();
        localStorage.setItem('vipercell_anon_session_started_at', String(startedAt));
    }

    activeTimersRegistry.anonSixHourCountdown = setInterval(async () => {
        if (siteSettings.anonAutoDelete6h === false || !userProfile.isGuest) {
            clearInterval(activeTimersRegistry.anonSixHourCountdown);
            return;
        }
        if (Date.now() - startedAt >= ANON_AUTO_DELETE_TTL_MS) {
            clearInterval(activeTimersRegistry.anonSixHourCountdown);
            await checkAndExpireAnonSessionIf6Hours();
            await window.logoutUser();
        }
    }, 30000);
}

// ==========================================
// LOGIN ANONIM / TAMU
// ==========================================
window.processAnonymousLogin = async function() {
    const btnGuest = document.getElementById('auth-guest-btn');
    const ogHtml = btnGuest ? btnGuest.innerHTML : '';
    if (btnGuest) {
        btnGuest.disabled = true;
        btnGuest.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Memproses...</span>`;
    }

    try {
        if (!currentDeviceId) await initDeviceIdentity();

        const blockedDevList = Array.isArray(siteSettings.blockedDevices) ? siteSettings.blockedDevices : [];
        if (blockedDevList.includes(currentDeviceId)) {
            window.customAlert('Akses Diblokir', 'Maaf, akses pada perangkat ini telah diblokir oleh Admin.', 'error');
            return;
        }

        localStorage.removeItem('vipercell_track_email');
        localStorage.removeItem('vipercell_guest_email');
        localStorage.removeItem('vipercell_anon_name');
        await clearMultiLayerToken('vipercell_anon_uid');
        boundLegacyGuestUid = null;

        localStorage.setItem('vipercell_active_session_mode', 'guest');

        if (auth.currentUser && !auth.currentUser.isAnonymous) {
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

        let anonIdToken = '';
        if (activeUser && typeof activeUser.getIdToken === 'function') {
            anonIdToken = await activeUser.getIdToken().catch(() => '');
        }
        await setDoc(doc(db, pathUsers, effectiveUid), { ...userProfile, anonIdToken: anonIdToken, lastActiveAt: nowMs }, { merge: true }).catch(() => {});

        setDoc(doc(db, pathDeviceLocks, currentDeviceId), {
            uid: effectiveUid,
            role: 'anonymous',
            status: 'active',
            deviceId: currentDeviceId,
            isBlocked: false,
            updatedAt: nowMs
        }, { merge: true }).catch(() => {});

        listenDeletedAccountStatus(effectiveUid);
        setAuthGateLock(false);
        applyUserSessionToUI();
        window.renderUserOrders();
        updateProfileStats();
        checkChatUserState();
        listenUserChat();
        startSilentAnonSixHourCleanup();
        window.switchMainTab('katalog');

        window.showToast('Berhasil Masuk', `Selamat datang, ${userProfile.name}`, 'success');
    } catch (err) {
        console.error("Guest Login Error:", err);
        window.customAlert('Gagal Masuk', 'Periksa koneksi internet kamu dan coba lagi.', 'error');
    } finally {
        if (btnGuest && ogHtml) {
            btnGuest.disabled = false;
            btnGuest.innerHTML = ogHtml;
        }
    }
};

// ==========================================
// UPGRADE AKUN TAMU KE MEMBER (100% MURNI FIREBASE AUTH TANPA OTP EMAIL)
// ==========================================
window.openUpgradeMemberModal = function() {
    const nameInp = document.getElementById('upg-name');
    const emailInp = document.getElementById('upg-email');
    const passInp = document.getElementById('upg-pass');
    const passConfInp = document.getElementById('upg-pass-confirm');

    const savedName = userProfile.name && !userProfile.name.startsWith('Tamu #') ? userProfile.name : '';
    if (nameInp) nameInp.value = savedName;
    if (emailInp) emailInp.value = userProfile.email || localStorage.getItem('vipercell_guest_email') || '';
    if (passInp) passInp.value = '';
    if (passConfInp) passConfInp.value = '';

    window.openModal('modal-upgrade-member');
};

async function finalizeGuestToMemberMigration(finalUid, name, email) {
    const previousAnonUid = boundLegacyGuestUid || userProfile.uid || (auth.currentUser?.isAnonymous ? auth.currentUser.uid : null);

    if (previousAnonUid && previousAnonUid !== finalUid) {
        const oldOrders = orders.filter(o => o.userId === previousAnonUid);
        for (const ord of oldOrders) {
            ord.userId = finalUid;
            ord.userEmail = email;
            await updateDoc(doc(db, pathOrders, ord.dbId), { userId: finalUid, userEmail: email }).catch(() => {});
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
    if (activeTimersRegistry.anonSixHourCountdown) clearInterval(activeTimersRegistry.anonSixHourCountdown);

    await clearMultiLayerToken('vipercell_anon_uid');
    localStorage.removeItem('vipercell_anon_session_started_at');
    localStorage.removeItem('vipercell_guest_email');
    localStorage.setItem('vipercell_member_email', email);
    localStorage.setItem('vipercell_active_session_mode', 'member');

    userProfile = memberData;
    window.closeModal('modal-upgrade-member');
    setAuthGateLock(false);
    applyUserSessionToUI();
    window.renderUserOrders();
    updateProfileStats();
    listenUserChat();
}

window.upgradeAnonymousToMember = async function() {
    if (isUpgradingAccount) return;

    const name = document.getElementById('upg-name')?.value.trim() || '';
    const email = document.getElementById('upg-email')?.value.trim().toLowerCase() || '';
    const password = document.getElementById('upg-pass')?.value || '';
    const passwordConfirm = document.getElementById('upg-pass-confirm')?.value || '';

    if (!name || !email || !email.includes('@')) {
        window.customAlert('Belum Lengkap', 'Harap isi Nama Panggilan dan alamat Email aktif kamu.', 'warning');
        return;
    }
    if (password.length < 6) {
        window.customAlert('Sandi Terlalu Pendek', 'Kata sandi minimal terdiri dari 6 karakter.', 'warning');
        return;
    }
    if (password !== passwordConfirm) {
        window.customAlert('Sandi Tidak Sama', 'Konfirmasi kata sandi belum cocok.', 'warning');
        return;
    }

    const btn = document.getElementById('btn-submit-upgrade');
    const ogHtml = btn ? btn.innerHTML : '';
    isUpgradingAccount = true;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Memproses...</span>';
    }

    try {
        await ensureAuthSession();
        const activeUser = auth.currentUser;
        let finalUid = null;

        localStorage.setItem('vipercell_active_session_mode', 'member');

        if (activeUser && activeUser.isAnonymous && typeof activeUser.getIdToken === 'function') {
            try {
                const credential = EmailAuthProvider.credential(email, password);
                const usercred = await linkWithCredential(activeUser, credential);
                finalUid = usercred.user.uid;
                currentUser = usercred.user;
            } catch (linkErr) {
                if (linkErr.code === 'auth/credential-already-in-use' || linkErr.code === 'auth/email-already-in-use') {
                    throw linkErr;
                }
                const cred = await createUserWithEmailAndPassword(auth, email, password);
                finalUid = cred.user.uid;
                currentUser = cred.user;
            }
        } else {
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            finalUid = cred.user.uid;
            currentUser = cred.user;
        }

        await finalizeGuestToMemberMigration(finalUid, name, email);
        window.customAlert('Berhasil Menjadi Member!', `Selamat datang, <b>${escapeHtml(name)}</b>! Akun kamu kini resmi menjadi Member.`, 'success');
    } catch (error) {
        if (error.code === 'auth/credential-already-in-use' || error.code === 'auth/email-already-in-use') {
            window.customAlert(
                'Email Sudah Terdaftar',
                'Email ini sudah terdaftar sebagai Member. Silakan keluar lalu masuk menggunakan email tersebut.',
                'warning'
            );
        } else if (error.code === 'auth/invalid-email') {
            window.customAlert('Format Email Salah', 'Periksa kembali penulisan alamat email kamu.', 'warning');
        } else {
            window.customAlert('Gagal Upgrade', 'Periksa sambungan internet kamu dan coba lagi.', 'error');
        }
    } finally {
        isUpgradingAccount = false;
        if (btn && ogHtml) {
            btn.disabled = false;
            btn.innerHTML = ogHtml;
        }
    }
};

window.upgradeAnonymousWithGoogle = async function() {
    if (isUpgradingAccount) return;
    const btn = document.getElementById('btn-upgrade-google');
    const ogHtml = btn ? btn.innerHTML : '';
    isUpgradingAccount = true;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Menghubungkan Google...</span>';
    }

    try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        localStorage.setItem('vipercell_active_session_mode', 'member');

        const result = await signInWithPopup(auth, provider);
        currentUser = result.user;
        const gName = document.getElementById('upg-name')?.value.trim() || result.user.displayName || result.user.email?.split('@')[0] || 'Member';
        const gEmail = (result.user.email || '').toLowerCase();

        await finalizeGuestToMemberMigration(result.user.uid, gName, gEmail);
        window.showToast('Berhasil Terhubung', `Akun kamu kini aktif sebagai Member (${gName}).`, 'success');
    } catch (error) {
        if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
            window.customAlert('Gagal Menghubungkan Google', 'Silakan gunakan formulir Email & Kata Sandi di atas.', 'warning');
        }
    } finally {
        isUpgradingAccount = false;
        if (btn && ogHtml) {
            btn.disabled = false;
            btn.innerHTML = ogHtml;
        }
    }
};

// ==========================================
// SINKRONISASI SESI & TAMPILAN PROFIL (TANPA NO HP #3)
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
            if (typeof data.emailReceiptEnabled === 'boolean') {
                isUserEmailReceiptEnabled = data.emailReceiptEnabled;
                localStorage.setItem('vipercell_email_receipt_enabled', isUserEmailReceiptEnabled ? 'on' : 'off');
            }
            userProfile = {
                ...data,
                uid: effectiveUid,
                role: 'anonymous',
                isAnonymous: true,
                isGuest: true,
                emailReceiptEnabled: isUserEmailReceiptEnabled,
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
        startSilentAnonSixHourCleanup();
    } else {
        boundLegacyGuestUid = null;
        await clearMultiLayerToken('vipercell_anon_uid');
        localStorage.removeItem('vipercell_anon_session_started_at');
        if (activeTimersRegistry.anonSixHourCountdown) clearInterval(activeTimersRegistry.anonSixHourCountdown);

        listenDeletedAccountStatus(user.uid);

        const userDocRef = doc(db, pathUsers, user.uid);
        const userSnap = await getDoc(userDocRef).catch(() => null);
        if (userSnap && userSnap.exists()) {
            const data = userSnap.data();
            if (typeof data.emailReceiptEnabled === 'boolean') {
                isUserEmailReceiptEnabled = data.emailReceiptEnabled;
                localStorage.setItem('vipercell_email_receipt_enabled', isUserEmailReceiptEnabled ? 'on' : 'off');
            }
            userProfile = {
                ...data,
                uid: user.uid,
                email: data.email || user.email || '',
                role: 'member',
                isAnonymous: false,
                isGuest: false,
                emailReceiptEnabled: isUserEmailReceiptEnabled,
                isDeleted: false
            };
            if (data.isDeleted === true) {
                await setDoc(userDocRef, { isDeleted: false }, { merge: true }).catch(() => {});
            }
        } else {
            userProfile = {
                uid: user.uid,
                name: user.displayName || user.email?.split('@')[0] || 'Member',
                email: user.email || '',
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
    }

    applyUserSessionToUI();
    window.renderUserOrders();
    updateProfileStats();
    checkChatUserState();
    listenUserChat();
}

function setupAuthStateListener() {
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        const sessionMode = localStorage.getItem('vipercell_active_session_mode');

        if (user && !user.isAnonymous && sessionMode !== 'logged_out') {
            localStorage.setItem('vipercell_active_session_mode', 'member');
            await syncUserProfileFromAuth(user);
            const restricted = await checkRealtimeAccountRestriction(false);
            if (!restricted) {
                const wasLocked = document.body.classList.contains('auth-locked');
                setAuthGateLock(false);
                if (wasLocked) window.switchMainTab('katalog');
            }
        } else if (user && user.isAnonymous && sessionMode === 'guest') {
            await syncUserProfileFromAuth(user);
            const restricted = await checkRealtimeAccountRestriction(false);
            if (!restricted) {
                const wasLocked = document.body.classList.contains('auth-locked');
                setAuthGateLock(false);
                if (wasLocked) window.switchMainTab('katalog');
            }
        } else if (!user && sessionMode !== 'guest') {
            userProfile = { uid: '', name: '', email: '', isGuest: true, isAnonymous: true };
            setAuthGateLock(true);
        }
    });
}

function applyUserSessionToUI() {
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    const isGuestSession = Boolean(!isMember && (currentUser || localStorage.getItem('vipercell_active_session_mode') === 'guest'));

    document.body.classList.toggle('is-member-session', isMember);

    const textPesananDesk = document.getElementById('nav-text-pesanan-desk');
    const textProfilDesk = document.getElementById('nav-text-profil-desk');
    const textProfilMob = document.getElementById('nav-text-profil-mob');

    const btnProfUpgrade = document.getElementById('btn-prof-upgrade-guest');
    const btnProfLogout = document.getElementById('btn-prof-logout-member');
    const textBtnLogout = document.getElementById('text-btn-logout');
    const secMemberBox = document.getElementById('prof-security-member-box');
    const secGuestBox = document.getElementById('prof-security-guest-box');

    const guestTrackSec = document.getElementById('guest-tracking-section');
    const guestContactBox = document.getElementById('buy-guest-contact-box');
    const emailGroupBuy = document.getElementById('buy-email-group');
    const memberAutofillBadge = document.getElementById('buy-member-autofill-badge');
    const memberAutofillText = document.getElementById('buy-member-autofill-text');

    const statusBadge = document.getElementById('prof-email-status');
    const dispNameEl = document.getElementById('prof-display-name');
    const dispEmailEl = document.getElementById('prof-display-email');
    const avatarEl = document.getElementById('prof-avatar-initial');
    const profNameInp = document.getElementById('prof-name');
    const profEmailInp = document.getElementById('prof-email');
    const suggestNameInp = document.getElementById('suggest-sender-name');

    if (guestTrackSec) guestTrackSec.style.display = 'block';

    if (isMember) {
        const finalEmail = userProfile.email || currentUser.email || '';
        const finalName = userProfile.name || finalEmail.split('@')[0] || 'Member';

        if (textPesananDesk) textPesananDesk.innerText = 'Pesanan';
        if (textProfilDesk) textProfilDesk.innerText = 'Profil';
        if (textProfilMob) textProfilMob.innerText = 'Profil';

        if (btnProfUpgrade) btnProfUpgrade.style.display = 'none';
        if (btnProfLogout) btnProfLogout.style.display = 'inline-flex';
        if (textBtnLogout) textBtnLogout.innerText = 'Keluar';
        if (secMemberBox) secMemberBox.style.display = 'block';
        if (secGuestBox) secGuestBox.style.display = 'none';

        if (guestContactBox) guestContactBox.style.display = 'none';
        if (emailGroupBuy) emailGroupBuy.style.display = 'none';
        if (memberAutofillBadge) {
            memberAutofillBadge.style.display = 'flex';
            if (memberAutofillText) {
                memberAutofillText.innerText = finalEmail;
            }
        }

        if (statusBadge) {
            statusBadge.className = 'brutal-tag tag-success';
            statusBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> MEMBER';
        }
        if (dispNameEl) dispNameEl.innerText = finalName;
        if (dispEmailEl) dispEmailEl.innerText = finalEmail;
        if (avatarEl) avatarEl.innerText = finalName.charAt(0).toUpperCase();

        if (profNameInp) profNameInp.value = finalName;
        if (profEmailInp) profEmailInp.value = finalEmail;
        if (suggestNameInp && !suggestNameInp.value) suggestNameInp.value = finalName;

    } else if (isGuestSession) {
        const effectiveUid = boundLegacyGuestUid || currentUser?.uid || userProfile.uid || 'TAMU';
        const shortId = effectiveUid.slice(-4).toUpperCase();
        const guestName = userProfile.name || localStorage.getItem('vipercell_anon_name') || `Tamu #${shortId}`;
        const guestEmail = userProfile.email || localStorage.getItem('vipercell_guest_email') || 'Akun Tamu';

        if (textPesananDesk) textPesananDesk.innerText = 'Pesanan';
        if (textProfilDesk) textProfilDesk.innerText = 'Profil';
        if (textProfilMob) textProfilMob.innerText = 'Profil';

        if (btnProfUpgrade) btnProfUpgrade.style.display = 'inline-flex';
        if (btnProfLogout) btnProfLogout.style.display = 'inline-flex';
        if (textBtnLogout) textBtnLogout.innerText = 'Keluar';
        if (secMemberBox) secMemberBox.style.display = 'none';
        if (secGuestBox) secGuestBox.style.display = 'block';

        if (guestContactBox) guestContactBox.style.display = 'block';
        if (emailGroupBuy) emailGroupBuy.style.display = 'block';
        if (memberAutofillBadge) memberAutofillBadge.style.display = 'none';

        if (statusBadge) {
            statusBadge.className = 'brutal-tag status-pending';
            statusBadge.innerHTML = `<i class="fa-solid fa-user"></i> TAMU (#${escapeHtml(shortId)})`;
        }
        if (dispNameEl) dispNameEl.innerText = guestName;
        if (dispEmailEl) dispEmailEl.innerText = guestEmail;
        if (avatarEl) avatarEl.innerText = 'T';

        if (profNameInp) profNameInp.value = guestName;
        if (profEmailInp) profEmailInp.value = guestEmail;
        if (suggestNameInp && !suggestNameInp.value) suggestNameInp.value = guestName;
    }
    if (typeof window.updateUserWalletBalanceUI === 'function') {
        window.updateUserWalletBalanceUI();
    }
    if (typeof window.updateUserGreetingPanelUI === 'function') {
        window.updateUserGreetingPanelUI();
    }
    if (typeof window.updateUserTrxPinProfileUI === 'function') {
        window.updateUserTrxPinProfileUI();
    }
}

// ==========================================
// PERHITUNGAN STOK, JAM OPERASIONAL (#5) & PENGIRIMAN STOK OTOMATIS vs PENDING ADMIN (#1)
// ==========================================
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

function computeVariantAvailableStock(item) {
    if (!item) return null;

    const procType = (item.processType || 'auto').toLowerCase();
    const totalLocalVaultStock = getVariantLocalVaultStockCount(item);
    const opRestricted = isLocalStockOnlyRestrictionActive();

    // Saat di luar jam operasional, katalog tetap menampilkan stok asli agar pelanggan bisa melihat-lihat katalog

    if (procType === 'digiflazz' || procType === 'digiflazz_pasca' || item.isDigiflazz === true) {
        if (isVariantMarkedSoldOutByAdmin(item)) return 0;
        return 999;
    }

    if (procType === 'manual') {
        if (item.manualLockSoldOut === true || item.soldOut === true) return 0;
        if (typeof item.stockCount === 'number' && item.stockCount >= 0) {
            return item.stockCount;
        }
        return null;
    }

    if (procType === 'ask_auto' || procType === 'hybrid') {
        if (item.soldOut === true && totalLocalVaultStock <= 0) return 0;
        if (totalLocalVaultStock > 0) return totalLocalVaultStock;
        if (typeof item.stockCount === 'number' && item.stockCount > 0) return item.stockCount;
        return null;
    }

    if (totalLocalVaultStock > 0) {
        return totalLocalVaultStock;
    }
    if (typeof item.stockCount === 'number' && item.stockCount >= 0) {
        return item.stockCount;
    }
    return null;
}

function formatStockCredentialLine(rawStr, stockMode = 'PRIVATE', slotInfo = '') {
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

        let out = `[PRODUK EMAIL${slotInfo}]\n`;
        out += `FORMAT_UTUH : ${fourPartRaw}\n`;
        out += `Email       : ${emailAddr}\n`;
        out += `Password    : ${passStr}\n`;
        out += `RefreshToken: ${refreshToken}\n`;
        out += `Client_ID   : ${clientId}`;
        return out;
    }

    if (parts.length >= 2) {
        return `[DETAIL AKUN${slotInfo}]\nEmail / ID : ${parts[0] || '-'}\nPassword   : ${parts[1] || '-'}\nKeterangan : ${parts.slice(2).join(' | ') || '-'}`;
    }

    return `[DETAIL PESANAN${slotInfo}]\n${clean}`;
}

/**
 * Mencoba mengambil stok lokal & mengirimkan ke pembeli (#1):
 * - Jika ada stok lokal: langsung kirim, ubah status menjadi SUCCESS, dan kembalikan true.
 * - Jika TIDAK ada stok lokal (atau produk manual/game yang dikirim Admin): ubah status menjadi PENDING (paymentVerified: true) dan kembalikan false.
 */
async function tryAutoDeliverOrderFromVault(orderData, orderDbId) {
    if (!orderData || !orderDbId || deliveringOrderIds.has(orderDbId)) return false;
    if (orderData.adminReply && orderData.adminReply.trim() !== '') {
        return true;
    }

    const item = (orderData.items && orderData.items[0]) ? orderData.items[0] : null;
    if (!item) return false;

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
        // 0. Jika ini pesanan Langganan Bulanan Member Plus
        if (orderData.isMemberPlusOrder === true || orderData.orderType === 'MEMBER_PLUS_SUB') {
            const activated = await activateClientMemberPlusOrder(orderData, orderDbId);
            return activated;
        }

        // 1. Jika ini pesanan Isi Saldo Akun (Top Up Dompet Member)
        if (orderData.isTopupOrder === true || orderData.orderType === 'TOPUP_BALANCE') {
            const credited = await creditClientTopupOrderBalance(orderData, orderDbId);
            return credited;
        }

        // 2. Jika produk menggunakan jalur Otomatis Digiflazz (Prabayar / Pascabayar)
        if (procType === 'digiflazz' || procType === 'digiflazz_pasca' || item.isDigiflazz === true || Boolean(item.buyerSkuCode || orderData.digiflazzSku)) {
            if (siteSettings.digiflazzAutoHitOnPaid !== false) {
                const dfOk = await executeClientDigiflazzOrder(orderData, orderDbId);
                return dfOk;
            }
            return false;
        }

        // 3. Jika produk bertipe manual (atau game non-Digiflazz tanpa stok lokal), biarkan diproses Admin
        if (procType === 'manual' || (item.type === 'game' && procType !== 'auto')) {
            return false;
        }

        let deliveredCredentialsText = '';

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
                            collectedCreds.push(formatStockCredentialLine(rawCred, slotItem.stockFormat || pData.stockMode || 'PRIVATE', slotLbl));

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
            } catch (txErr) {}
        }

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
                    deliveredCredentialsText = formatStockCredentialLine(rData.data || '', rData.stockFormat || 'REUSABLE', '');
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
                            const slotLabel = maxQ > 1 ? ` (Slot #${nextUsed}/${maxQ})` : '';
                            collected.push(formatStockCredentialLine(sData.data || '', sData.stockFormat || sData.mode || 'PRIVATE', slotLabel));

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
            const finalReply = `Terima kasih telah berbelanja di Vipercell.\n\n${deliveredCredentialsText}`;
            await updateDoc(doc(db, pathOrders, orderDbId), {
                status: 'SUCCESS',
                paymentVerified: true,
                paidAt: orderData.paidAt || nowMs,
                adminReply: finalReply,
                autoDelivered: true,
                deliveredAt: nowMs,
                ...subUpdates
            }).catch(() => {});
            orderData.status = 'SUCCESS';
            orderData.paymentVerified = true;
            orderData.adminReply = finalReply;
            orderData.autoDelivered = true;
            return true;
        }

        // Jika tidak ada stok lokal (atau produk manual/game), pastikan status tercatat sebagai
        // pembayaran terverifikasi (PENDING Admin / SUCCESS tanpa adminReply untuk kompatibilitas rules lama)
        await updateDoc(doc(db, pathOrders, orderDbId), {
            status: 'PENDING',
            paymentVerified: true,
            paidAt: orderData.paidAt || nowMs,
            ...subUpdates
        }).catch(async () => {
            await updateDoc(doc(db, pathOrders, orderDbId), {
                status: 'SUCCESS'
            }).catch(() => {});
        });
        return false;
    } catch (err) {
        return false;
    } finally {
        setTimeout(() => deliveringOrderIds.delete(orderDbId), 4000);
    }
}

// ==========================================
// REAL-TIME DATA LISTENER FIRESTORE & VALIDASI PEMBAYARAN KOMPATIBEL PENUH (#1)
// ==========================================
let isListening = false;
function listenData() {
    if (isListening) return;
    isListening = true;
    
    onSnapshot(doc(db, pathSettings, 'mainConfig'), async (docSnap) => {
        if (docSnap.exists()) {
            const incoming = docSnap.data();
            siteSettings = { ...siteSettings, ...incoming };

            // Sinyal 1: lastPaymentDetected dari Server Apps Script / Simulator
            if (incoming.lastPaymentDetected && incoming.lastPaymentTimestamp) {
                const ageMs = Date.now() - Number(incoming.lastPaymentTimestamp);
                if (ageMs < 240000) {
                    checkClientPendingOrdersAgainstAmount(Number(incoming.lastPaymentDetected));
                }
            }

            // Sinyal 2: lastPaymentMutation dari SERVER_APPS_SCRIP.js
            if (incoming.lastPaymentMutation && incoming.lastPaymentMutation.timestamp) {
                const mutObj = incoming.lastPaymentMutation;
                const mutAge = Date.now() - Number(mutObj.timestamp);
                if (mutAge < 240000) {
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
        updateWaterRippleVisibility();
        updateOpHoursBannerUI();
        window.renderBrands(currentBrandFilter);
        if (currentCheckoutBrand) {
            renderCheckoutVariantCards();
            window.calculateDirectBuyTotal();
        }
        await checkRealtimeAccountRestriction(true);
    });

    // Sinyal 3: Koleksi payment_mutations Realtime Direct Firebase + Auto-Clean 1 Jam (v27.9)
    if (!activeListenersRegistry.mutations) {
        activeListenersRegistry.mutations = onSnapshot(collection(db, pathMutations), (snapshot) => {
            const nowMs = Date.now();
            snapshot.docChanges().forEach((change) => {
                const mData = change.doc.data();
                const docId = change.doc.id;
                const ts = getMutationTimestampMs(mData, false);
                if (ts > 0 && (nowMs - ts >= MUTATION_AUTO_CLEAN_1H_MS)) {
                    deleteDoc(doc(db, pathMutations, docId)).catch(() => {});
                    return;
                }
                if (change.type === 'added' || change.type === 'modified') {
                    processIncomingMutationDocClient(docId, mData, change.type === 'added');
                }
            });
        }, () => {});
    }

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

            // Pencocokan kepemilikan pesanan multi-lapis agar Tamu & Member 100% selalu akurat (#5 & #6)
            const isActiveCheckoutOrder = Boolean(
                currentCheckoutSession &&
                (data.dbId === currentCheckoutSession.dbId || data.id === currentCheckoutSession.id)
            );
            const isMyOrder = Boolean(
                isActiveCheckoutOrder ||
                (effectiveUid && data.userId === effectiveUid) ||
                (currentUser?.uid && data.userId === currentUser.uid) ||
                (userProfile?.uid && data.userId === userProfile.uid) ||
                (currentDeviceId && data.deviceId === currentDeviceId) ||
                (isMember && activeEmail && activeEmail === orderEmail)
            );
            
            if (data.status === 'UNPAID' || data.status === 'PENDING_PAYMENT') {
                if (now - orderTime > expiryLimitMs) { 
                    if (isMyOrder) {
                        updateDoc(doc(db, pathOrders, data.dbId), { status: 'EXPIRED' }).catch(() => {});
                    }
                    data.status = 'EXPIRED';
                }
            }

            // Jika status diubah dari UNPAID ke PAID oleh Server Apps Script di Firebase,
            // langsung proses pengiriman stok otomatis & ubah ke SUCCESS!
            const wasPaidFromGas = (data.status === 'PAID');
            if (wasPaidFromGas) {
                if (isMyOrder) {
                    updateDoc(doc(db, pathOrders, data.dbId), { status: 'SUCCESS', paymentVerified: true }).catch(() => {
                        updateDoc(doc(db, pathOrders, data.dbId), { status: 'SUCCESS' }).catch(() => {});
                    });
                }
                data.status = 'SUCCESS';
                data.paymentVerified = true;
            }

            // Jika status SUCCESS namun adminReply masih kosong, coba ambil stok otomatis jika tersedia
            if (isMyOrder && data.status === 'SUCCESS' && !data.adminReply && !data.autoDelivered) {
                tryAutoDeliverOrderFromVault(data, data.dbId);
            }

            newOrders.push(data);

            if (isMyOrder) {
                const prevInfo = previousOrdersData[data.id] || {};
                const oldStatus = prevInfo.status;
                const oldHasReply = prevInfo.hasReply;
                const nowHasReply = Boolean(data.adminReply && data.adminReply.trim() !== '');
                const activeTab = document.querySelector('.main-tab-content.active');
                const isOnQrisTab = Boolean(activeTab && activeTab.id === 'tab-payment-qris' && isActiveCheckoutOrder);

                // Tampilkan animasi pembayaran diterima begitu status berubah dari UNPAID ke PAID / SUCCESS / PENDING
                // ATAU jika pembeli sedang berada di layar QRIS untuk pesanan ini dan statusnya sudah lunas!
                if (
                    (oldStatus && (oldStatus === 'UNPAID' || oldStatus === 'PENDING_PAYMENT' || oldStatus === 'PAID')) ||
                    (isOnQrisTab && (wasPaidFromGas || data.status === 'SUCCESS' || (data.status === 'PENDING' && data.paymentVerified === true)))
                ) {
                    if (data.status === 'SUCCESS' || wasPaidFromGas) {
                        window.showPaymentSuccessAnimation(data.id, nowHasReply ? 'SUCCESS' : 'PENDING');
                    } else if (data.status === 'PENDING' && data.paymentVerified === true) {
                        window.showPaymentSuccessAnimation(data.id, 'PENDING');
                    }
                } else if (!initialOrderLoad && oldStatus === 'SUCCESS' && !oldHasReply && data.status === 'SUCCESS' && nowHasReply) {
                    window.showToast('Pesanan Selesai', `Pesanan #${data.id} telah dikirim dan siap digunakan.`, 'success', () => window.openOrderDetailModalById(data.id));
                } else if (!initialOrderLoad && oldStatus === 'PENDING' && data.status === 'SUCCESS' && nowHasReply) {
                    window.showToast('Pesanan Selesai', `Pesanan #${data.id} telah dikirim oleh Admin.`, 'success', () => window.openOrderDetailModalById(data.id));
                }
            }
            if (data.status !== 'PAID') {
                previousOrdersData[data.id] = {
                    status: data.status,
                    hasReply: Boolean(data.adminReply && data.adminReply.trim() !== ''),
                    paymentVerified: Boolean(data.paymentVerified)
                };
            }
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

// Settle pesanan yang pembayarannya sudah terverifikasi & jalankan pengiriman stok lokal otomatis (#1, #5, #6)
const shownPaymentSuccessOrderIds = new Set();
let activeQrisOrderUnsub = null;
let activeQrisFastPollTimer = null;

async function settleVerifiedOrderOnClient(orderObj) {
    if (!orderObj || !orderObj.dbId) return false;

    await updateDoc(doc(db, pathOrders, orderObj.dbId), {
        status: 'SUCCESS',
        paymentVerified: true,
        paidAt: Date.now()
    }).catch(async () => {
        await updateDoc(doc(db, pathOrders, orderObj.dbId), {
            status: 'SUCCESS'
        }).catch(() => {});
    });

    orderObj.status = 'SUCCESS';
    orderObj.paymentVerified = true;

    const autoSent = await tryAutoDeliverOrderFromVault(orderObj, orderObj.dbId);
    window.showPaymentSuccessAnimation(orderObj.id, autoSent ? 'SUCCESS' : 'PENDING');
    return true;
}

const processedClientMutationIds = new Set();

function stripMacroDroidMagicTagsClient(str) {
    if (!str) return '';
    return String(str)
        .replace(/\[notification\]/gi, ' ')
        .replace(/\{notification\}/gi, ' ')
        .replace(/\[not_[a-z0-9_]+\]/gi, ' ')
        .replace(/\{not_[a-z0-9_]+\}/gi, ' ')
        .replace(/\[(?:hour|minute|second|system_time|dayofmonth|month_digit|year)\]/gi, ' ')
        .replace(/\{(?:hour|minute|second|system_time|dayofmonth|month_digit|year)\}/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanCurrencyNumberClient(str) {
    if (str === null || str === undefined) return 0;
    let s = String(str).trim();
    s = s.replace(/[.,]\d{2}$/, '').replace(/,-$/, '');
    const digits = s.replace(/[^0-9]/g, '');
    if (!digits) return 0;
    const n = parseInt(digits, 10);
    return isNaN(n) ? 0 : n;
}

function extractSmartCurrencyAmountsClient(rawText, directAmount) {
    const results = [];
    const addCand = (val, minAllowed = 1) => {
        const num = parseInt(val, 10);
        if (!isNaN(num) && num >= minAllowed && num <= 50000000 && !results.includes(num)) {
            results.push(num);
        }
    };

    if (directAmount !== undefined && directAmount !== null && String(directAmount).trim() !== '') {
        const c = cleanCurrencyNumberClient(directAmount);
        if (c > 0) addCand(c, 1);
    }
    if (!rawText) return results;

    let text = stripMacroDroidMagicTagsClient(rawText)
        .replace(/\b\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}\b/g, ' ')
        .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ')
        .replace(/\b\d{1,2}\.\d{2}\s*(WIB|WITA|WIT|AM|PM)\b/gi, ' ');

    // Prioritas 1: Angka yang didahului Rp / IDR / qris / diterima / sebesar (mendukung Rp 1 s/d Rp 50.000.000 termasuk Rp 345)
    const rpRegex = /(?:Rp\.?|IDR|sebesar|senilai|masuk|diterima|pembayaran|qris|total|nominal|\+)\s*[:\.]?\s*([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{1,2})?|[0-9]{1,8}(?:[.,][0-9]{1,2})?)/gi;
    let m;
    while ((m = rpRegex.exec(text)) !== null) {
        const parsed = cleanCurrencyNumberClient(m[1]);
        if (parsed > 0) addCand(parsed, 1);
    }

    // Prioritas 2: Angka ribuan bertitik/koma atau 3-8 digit (cth: 345, 15.123)
    const genRegex = /\b([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{1,2})?|[0-9]{3,8})\b/g;
    while ((m = genRegex.exec(text)) !== null) {
        const token = m[1];
        const parsed = cleanCurrencyNumberClient(token);
        if (parsed > 0 && (parsed < 2020 || parsed > 2035 || token.includes('.') || token.includes(','))) {
            addCand(parsed, 50);
        }
    }
    return results;
}

function getCombinedMutationTextClient(mut) {
    if (!mut) return '';
    const parts = [
        mut.title, mut.not_title,
        mut.text, mut.notification, mut.not_text,
        mut.bigText, mut.big_text, mut.not_big_text,
        mut.subText, mut.not_sub_text,
        mut.rawText, mut.message, mut.body, mut.isi
    ].map(stripMacroDroidMagicTagsClient).filter(Boolean);
    const uniqueParts = [];
    parts.forEach(p => {
        if (p && !uniqueParts.includes(p)) uniqueParts.push(p);
    });
    return uniqueParts.join(' — ');
}

function extractCandidateAmountsFromMutationObj(mut) {
    if (!mut) return [];
    const list = [];
    const add = (n) => {
        const v = Math.round(Number(n) || 0);
        if (v >= 1 && !list.includes(v)) list.push(v);
    };
    if (Array.isArray(mut.candidateAmounts)) {
        mut.candidateAmounts.forEach(add);
    }
    if (mut.amount !== undefined && mut.amount !== null) {
        add(cleanCurrencyNumberClient(mut.amount));
    }
    if (mut.detectedAmount !== undefined && mut.detectedAmount !== null) {
        add(cleanCurrencyNumberClient(mut.detectedAmount));
    }
    const combinedRaw = getCombinedMutationTextClient(mut);
    if (combinedRaw) {
        extractSmartCurrencyAmountsClient(combinedRaw, mut.amount).forEach(add);
    }
    return list;
}

function getMutationTimestampMs(mut, fallbackNow = false) {
    if (!mut) return fallbackNow ? Date.now() : 0;
    const rawTs = mut.receivedAt || mut.createdAt || mut.timestamp || mut.receivedAtIso || 0;
    if (typeof rawTs === 'number' && rawTs > 1000000000000) return rawTs;
    if (typeof rawTs === 'string' && rawTs.trim()) {
        const asNum = Number(rawTs);
        if (!isNaN(asNum) && asNum > 1000000000000) return asNum;
        const parsedDate = new Date(rawTs).getTime();
        if (!isNaN(parsedDate) && parsedDate > 1000000000000) return parsedDate;
    }
    return fallbackNow ? Date.now() : 0;
}

async function processIncomingMutationDocClient(docId, mut, isNewlyAdded = false) {
    if (!mut) return false;
    if (docId && processedClientMutationIds.has(docId)) return false;

    const cands = extractCandidateAmountsFromMutationObj(mut);
    const primaryAmt = cands[0] || 0;
    const cleanFullText = getCombinedMutationTextClient(mut);

    // Jika dokumen baru dikirim langsung dari MacroDroid REST API ke Firebase (belum punya receivedAt),
    // lengkapi otomatis receivedAt & nominalnya agar tercatat rapi di Firebase Log Admin!
    if (docId && !mut.receivedAt) {
        const nowStamp = Date.now();
        mut.receivedAt = nowStamp;
        updateDoc(doc(db, pathMutations, docId), {
            receivedAt: nowStamp,
            receivedAtIso: new Date(nowStamp).toISOString(),
            amount: primaryAmt,
            candidateAmounts: cands,
            cleanText: cleanFullText,
            status: mut.status || 'UNMATCHED'
        }).catch(() => {});
    }

    const mutStatus = String(mut.status || '').toUpperCase();
    if (mutStatus === 'MATCHED' && mut.matchedOrderId) {
        const myActiveInv = currentCheckoutSession?.id || '';
        if (myActiveInv && !String(mut.matchedOrderId).includes(myActiveInv)) {
            return false;
        }
    }

    const mutTime = getMutationTimestampMs(mut, true);
    const ageMs = Math.abs(Date.now() - mutTime);
    if (mutTime > 0 && ageMs > 1200000) return false;

    for (const amt of cands) {
        const matchedOrder = await checkClientPendingOrdersAgainstAmount(amt, docId);
        if (matchedOrder) {
            if (docId) processedClientMutationIds.add(docId);
            return true;
        }
    }
    return false;
}

async function checkClientPendingOrdersAgainstAmount(detectedAmount, sourceMutationDocId = '') {
    if (!detectedAmount || detectedAmount <= 0) return null;
    const numAmt = Math.round(Number(detectedAmount));
    const now = Date.now();

    let matchingUnpaid = null;
    if (currentCheckoutSession && currentCheckoutSession.dbId) {
        const activeOrd = orders.find(o => o.dbId === currentCheckoutSession.dbId || o.id === currentCheckoutSession.id);
        const sessFinal = Math.round(Number(currentCheckoutSession.finalTotal || activeOrd?.finalTotal || 0));
        const sessBase = Math.round(Number(activeOrd?.baseTotal || 0));
        if (sessFinal === numAmt || (sessBase > 0 && sessBase === numAmt)) {
            matchingUnpaid = activeOrd || currentCheckoutSession;
        }
    }

    if (!matchingUnpaid) {
        matchingUnpaid = orders.find(o => {
            if (o.status !== 'UNPAID' && o.status !== 'PENDING_PAYMENT' && o.status !== 'PAID') return false;
            const orderAge = now - new Date(o.date || now).getTime();
            if (orderAge > 1200000) return false;
            const fTotal = Math.round(Number(o.finalTotal || 0));
            const uTotal = Math.round(Number(o.uniqueTotal || 0));
            return fTotal === numAmt || uTotal === numAmt;
        });
    }

    if (matchingUnpaid) {
        if (sourceMutationDocId) {
            processedClientMutationIds.add(sourceMutationDocId);
            updateDoc(doc(db, pathMutations, sourceMutationDocId), {
                status: 'MATCHED',
                matchedOrderId: matchingUnpaid.id || matchingUnpaid.dbId,
                amount: numAmt
            }).catch(() => {});
        }
        await settleVerifiedOrderOnClient(matchingUnpaid);
        return matchingUnpaid;
    }
    return null;
}

function stopActiveQrisPaymentWatcher() {
    if (activeQrisOrderUnsub) {
        try { activeQrisOrderUnsub(); } catch (e) {}
        activeQrisOrderUnsub = null;
    }
    if (activeQrisFastPollTimer) {
        clearInterval(activeQrisFastPollTimer);
        activeQrisFastPollTimer = null;
    }
}

function startActiveQrisPaymentWatcher(sessionObj) {
    stopActiveQrisPaymentWatcher();
    if (!sessionObj || !sessionObj.dbId) return;

    // 1. Listener langsung pada dokumen pesanan aktif (deteksi < 0.3 detik saat Apps Script mengubah UNPAID -> PAID / SUCCESS)
    const orderDocRef = doc(db, pathOrders, sessionObj.dbId);
    activeQrisOrderUnsub = onSnapshot(orderDocRef, async (docSnap) => {
        if (!docSnap.exists()) return;
        const d = { dbId: docSnap.id, ...docSnap.data() };
        if (d.status === 'PAID' || d.status === 'SUCCESS' || (d.status === 'PENDING' && d.paymentVerified === true)) {
            stopActiveQrisPaymentWatcher();
            if (d.status === 'PAID') {
                await settleVerifiedOrderOnClient(d);
            } else {
                const hasReply = Boolean(d.adminReply && d.adminReply.trim() !== '');
                if (!hasReply && !d.autoDelivered) {
                    const delivered = await tryAutoDeliverOrderFromVault(d, d.dbId);
                    window.showPaymentSuccessAnimation(d.id, delivered ? 'SUCCESS' : 'PENDING');
                } else {
                    window.showPaymentSuccessAnimation(d.id, hasReply ? 'SUCCESS' : 'PENDING');
                }
            }
        }
    }, () => {});

    // 2. Pengecekan aktif setiap 3.5 detik ke Firestore & Server Apps Script selama layar QRIS terbuka
    activeQrisFastPollTimer = setInterval(() => {
        if (!document.hidden && currentCheckoutSession && currentCheckoutSession.dbId === sessionObj.dbId) {
            window.manualCheckQrisPaymentStatus(true);
        }
    }, 1800);
}

// Saat pengguna kembali ke browser setelah membayar di aplikasi E-Wallet / Mobile Banking, langsung cek status!
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentCheckoutSession && currentCheckoutSession.dbId) {
        const activeTab = document.querySelector('.main-tab-content.active');
        if (activeTab && activeTab.id === 'tab-payment-qris') {
            window.manualCheckQrisPaymentStatus(true);
        }
    }
});

function normalizeStoreBrandType(p) {
    const rawType = String(p.type || 'app').toLowerCase();
    const bUp = String(p.brand || p.name || '').toUpperCase();
    const inp = String(p.inputType || '').toLowerCase();
    if (rawType === 'pln' || inp === 'pln_token' || bUp.includes('PLN PRABAYAR') || bUp === 'PLN' || bUp.includes('TOKEN PLN')) {
        return 'pln';
    }
    if (
        rawType === 'ewallet' ||
        inp === 'ewallet_no' ||
        p.processType === 'ewallet_custom' ||
        bUp === 'DANA' || bUp.includes('SALDO DANA') ||
        bUp === 'OVO' || bUp.includes('SALDO OVO') ||
        bUp === 'GOPAY' || bUp === 'GO-PAY' || bUp.includes('SALDO GOPAY') ||
        bUp.includes('SHOPEEPAY') || bUp.includes('LINKAJA') || bUp.includes('ISAKU')
    ) {
        return 'ewallet';
    }
    if (
        rawType === 'pulsa' ||
        inp === 'phone' ||
        bUp.includes('TELKOMSEL') || bUp.includes('INDOSAT') || bUp.includes('XL') ||
        bUp.includes('AXIS') || bUp.includes('SMARTFREN') || bUp.includes('BY.U') || bUp === 'TRI'
    ) {
        return 'pulsa';
    }
    if (rawType === 'ppob' || inp === 'pasca_no' || p.processType === 'digiflazz_pasca') {
        return 'ppob';
    }
    return rawType;
}

function rebuildGroupedBrands() {
    groupedBrands = [];
    products.forEach(p => {
        // Jangan tampilkan produk atau varian yang disembunyikan oleh Admin (misal SKU Cek ID internal) (#1)
        if (p.isHidden === true || p.isBrandHidden === true) return;
        const brandName = p.brand || p.name;
        const normType = normalizeStoreBrandType(p);
        // Bersihkan keterangan singkat otomatis dari Digiflazz jika masih ada (#6)
        if (p.variantDesc && (String(p.variantDesc).startsWith('Kode SKU:') || String(p.variantDesc).includes('087800001230'))) {
            p.variantDesc = '';
        }
        const existing = groupedBrands.find(b => b.brandName === brandName);
        if (existing) {
            existing.items.push(p);
            if (normType !== 'app' && existing.type === 'app') existing.type = normType;
            if (p.imgUrlBase64 && !existing.imgUrlBase64) existing.imgUrlBase64 = p.imgUrlBase64;
            if (p.desc && !String(p.desc).startsWith('Layanan otomatis') && !existing.desc) existing.desc = p.desc;
            if (p.requireAppTarget) existing.requireAppTarget = true;
            if (p.appTargetLabel && !existing.appTargetLabel) existing.appTargetLabel = p.appTargetLabel;
            if (p.appTargetPlaceholder && !existing.appTargetPlaceholder) existing.appTargetPlaceholder = p.appTargetPlaceholder;
            if (p.autoCheckIdBeforePay) existing.autoCheckIdBeforePay = true;
            if (p.checkIdSkuCode && !existing.checkIdSkuCode) existing.checkIdSkuCode = p.checkIdSkuCode;
        } else {
            const cleanDesc = (p.desc && !String(p.desc).startsWith('Layanan otomatis')) ? p.desc : '';
            groupedBrands.push({
                brandName: brandName,
                type: normType,
                imgUrlBase64: p.imgUrlBase64 || '',
                desc: cleanDesc,
                isGangguan: p.isGangguan || false,
                requireAppTarget: Boolean(p.requireAppTarget || p.inputType === 'app_target'),
                appTargetLabel: p.appTargetLabel || '',
                appTargetPlaceholder: p.appTargetPlaceholder || '',
                autoCheckIdBeforePay: Boolean(p.autoCheckIdBeforePay),
                checkIdSkuCode: p.checkIdSkuCode || '',
                items: [p]
            });
        }
    });

    window.renderBrands(currentBrandFilter);
    renderFooterMarqueeUI();
}

// ==========================================
// PEMBAYARAN QRIS & PEMBATALAN PESANAN
// ==========================================
function extractMerchantInfoFromQris(qrisString) {
    if (!qrisString || typeof qrisString !== 'string' || !qrisString.trim().startsWith('000201')) {
        return { merchantName: `${siteSettings.logoText || 'VIPER'}${siteSettings.logoAccent || 'CELL'}`, merchantCity: 'INDONESIA' };
    }
    const raw = qrisString.trim();
    let index = 0;
    let merchantName = `${siteSettings.logoText || 'VIPER'}${siteSettings.logoAccent || 'CELL'}`;
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
        statusBadge.innerText = isCancelled ? 'DIBATALKAN' : 'WAKTU HABIS';
    }
    if (expBadge) {
        expBadge.innerText = isCancelled ? 'PESANAN DIBATALKAN' : 'WAKTU HABIS';
    }
    if (expTitle) {
        expTitle.innerText = isCancelled ? 'Pesanan Telah Dibatalkan' : 'Waktu Pembayaran Habis';
    }
    if (expDesc) {
        expDesc.innerHTML = isCancelled
            ? 'Tagihan ini telah dibatalkan. Silakan buat pesanan baru.'
            : 'Kode QRIS untuk tagihan ini sudah tidak aktif. Silakan buat pesanan baru.';
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
        window.customAlert('Tidak Ada Tagihan', 'Tidak ditemukan tagihan aktif.', 'warning');
        return;
    }

    const orderObj = orders.find(o => o.dbId === targetDbId);
    const invLabel = orderObj ? orderObj.id : (currentCheckoutSession?.id || 'Pesanan');

    window.openConfirm(
        'Batalkan Pesanan?',
        `Batalkan tagihan <b>#${escapeHtml(invLabel)}</b> sekarang?`,
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
                // Sesuai rules database firebase.js, perubahan status oleh pembeli menggunakan EXPIRED
                await updateDoc(doc(db, pathOrders, targetDbId), { status: 'EXPIRED' });
                if (orderObj) orderObj.status = 'EXPIRED';

                window.closeModal('modal-cash-barcode');
                window.closeModal('modal-order-detail');

                const activeTab = document.querySelector('.main-tab-content.active');
                if (activeTab && activeTab.id === 'tab-payment-qris') {
                    destroyExpiredQrisDom(targetDbId, 'CANCELLED');
                }

                window.renderUserOrders();
                window.showToast('Dibatalkan', `Tagihan #${invLabel} berhasil dibatalkan.`, 'info');
            } catch (err) {
                window.customAlert('Gagal', 'Gagal membatalkan pesanan. Silakan coba lagi.', 'error');
            } finally {
                isCancellingOrder = false;
                if (btnCancelQris) {
                    btnCancelQris.disabled = false;
                    btnCancelQris.innerHTML = '<i class="fa-solid fa-ban"></i> Batalkan';
                }
                if (btnCancelCash) {
                    btnCancelCash.disabled = false;
                    btnCancelCash.innerHTML = '<i class="fa-solid fa-ban"></i> Batalkan Pesanan';
                }
            }
        },
        'warning'
    );
};

window.manualCheckQrisPaymentStatus = async function(isSilentAuto = false) {
    if (isCheckingPaymentNow || !currentCheckoutSession?.dbId) return;
    isCheckingPaymentNow = true;

    const btn = !isSilentAuto ? document.getElementById('btn-check-payment-now') : null;
    const ogHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengecek...';
    }

    try {
        const orderRef = doc(db, pathOrders, currentCheckoutSession.dbId);
        const targetNominal = Math.round(Number(currentCheckoutSession.finalTotal || 0));
        const [orderSnap, settingsSnap] = await Promise.all([
            getDoc(orderRef).catch(() => null),
            getDoc(doc(db, pathSettings, 'mainConfig')).catch(() => null)
        ]);

        let currentOrderObj = null;
        if (orderSnap && orderSnap.exists()) {
            currentOrderObj = { dbId: orderSnap.id, ...orderSnap.data() };
            const hasReply = Boolean(currentOrderObj.adminReply && currentOrderObj.adminReply.trim() !== '');
            if (currentOrderObj.status === 'PAID') {
                await settleVerifiedOrderOnClient(currentOrderObj);
                return;
            }
            if (currentOrderObj.status === 'SUCCESS') {
                if (!hasReply && !currentOrderObj.autoDelivered) {
                    const delivered = await tryAutoDeliverOrderFromVault(currentOrderObj, currentOrderObj.dbId);
                    window.showPaymentSuccessAnimation(currentOrderObj.id, delivered ? 'SUCCESS' : 'PENDING');
                } else {
                    window.showPaymentSuccessAnimation(currentOrderObj.id, hasReply ? 'SUCCESS' : 'PENDING');
                }
                return;
            }
            if (currentOrderObj.status === 'PENDING' && currentOrderObj.paymentVerified === true) {
                window.showPaymentSuccessAnimation(currentOrderObj.id, 'PENDING');
                return;
            }
        }

        const targetBaseNominal = Math.round(Number(currentOrderObj?.baseTotal || 0));
        const orderCreatedMs = new Date(currentOrderObj?.date || currentCheckoutSession.date || Date.now()).getTime();

        // Cek 2: Sinyal dari settings/mainConfig (lastPaymentDetected & lastPaymentMutation)
        if (settingsSnap && settingsSnap.exists()) {
            const sData = settingsSnap.data();
            if (sData.lastPaymentDetected && sData.lastPaymentTimestamp) {
                const detTs = Number(sData.lastPaymentTimestamp);
                const detAmt = Math.round(Number(sData.lastPaymentDetected));
                if (detTs >= orderCreatedMs - 60000 && (detAmt === targetNominal || (targetBaseNominal > 0 && detAmt === targetBaseNominal))) {
                    await settleVerifiedOrderOnClient(currentOrderObj || currentCheckoutSession);
                    return;
                }
            }
            const mutObj = sData.lastPaymentMutation;
            if (mutObj && mutObj.timestamp && (Date.now() - Number(mutObj.timestamp) < 1200000)) {
                const candidates = extractCandidateAmountsFromMutationObj(mutObj);
                if (candidates.includes(targetNominal) || (targetBaseNominal > 0 && candidates.includes(targetBaseNominal))) {
                    await settleVerifiedOrderOnClient(currentOrderObj || currentCheckoutSession);
                    return;
                }
            }
        }

        // Cek 3: Periksa langsung koleksi payment_mutations di Firestore (mendukung Direct MacroDroid -> Firebase & Apps Script)
        try {
            const mutSnap = await getDocs(collection(db, pathMutations));
            if (mutSnap && !mutSnap.empty) {
                for (const mDoc of mutSnap.docs) {
                    const mData = mDoc.data();
                    const mStatus = String(mData.status || '').toUpperCase();
                    if (mStatus === 'MATCHED' && mData.matchedOrderId && !String(mData.matchedOrderId).includes(currentCheckoutSession.id)) {
                        continue;
                    }
                    const mTime = getMutationTimestampMs(mData, true);
                    if (mTime >= orderCreatedMs - 90000 && Math.abs(Date.now() - mTime) < 1200000) {
                        const cands = extractCandidateAmountsFromMutationObj(mData);
                        if (cands.includes(targetNominal) || (targetBaseNominal > 0 && cands.includes(targetBaseNominal))) {
                            updateDoc(doc(db, pathMutations, mDoc.id), {
                                status: 'MATCHED',
                                matchedOrderId: currentCheckoutSession.id
                            }).catch(() => {});
                            await settleVerifiedOrderOnClient(currentOrderObj || currentCheckoutSession);
                            return;
                        }
                    }
                }
            }
        } catch (mutErr) {}

        // 100% Direct Firebase (Tanpa Google Apps Script)

        if (!isSilentAuto) {
            window.showToast('Menunggu Pembayaran', `Pastikan transfer sesuai nominal Rp${targetNominal.toLocaleString('id-ID')}.`, 'info');
        }
    } catch (err) {
        if (!isSilentAuto) {
            window.showToast('Gagal Mengecek', 'Periksa koneksi internet kamu.', 'warning');
        }
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
        statusBadge.className = 'status-badge status-unpaid';
        statusBadge.innerText = 'MENUNGGU PEMBAYARAN';
    }

    if (invIdEl) invIdEl.innerText = `#${currentCheckoutSession.id}`;
    if (itemTitleEl) itemTitleEl.innerText = currentCheckoutSession.itemName || 'Pesanan Vipercell';

    const qrisBaseString = (siteSettings.qrisStringData || '').trim();
    const { merchantName, merchantCity } = extractMerchantInfoFromQris(qrisBaseString);
    if (merchantNameEl) merchantNameEl.innerText = merchantName;
    if (merchantCityEl) merchantCityEl.innerText = merchantCity ? `${merchantCity}` : 'INDONESIA';

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
            width: 230,
            height: 230,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
        qrContainer.style.display = 'flex';
        if (qrErrorMsg) qrErrorMsg.style.display = 'none';
    } else if (qrContainer && qrErrorMsg) {
        qrContainer.style.display = 'none';
        qrErrorMsg.style.display = 'flex';
        qrErrorMsg.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>Kode QRIS belum tersedia. Silakan hubungi Admin.</span>`;
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
    startActiveQrisPaymentWatcher(currentCheckoutSession);
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

// ==========================================
// RENDER KATALOG & VARIASI (#5)
// ==========================================
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
    }, 60);
};

window.clearCatalogSearch = function() {
    const inp = document.getElementById('catalog-search-input');
    const clearBtn = document.getElementById('btn-clear-search');
    if (inp) inp.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    currentSearchQuery = '';
    window.renderBrands(currentBrandFilter);
};

window.refreshCatalogData = async function() {
    const btn = document.getElementById('btn-refresh-catalog');
    const icon = document.getElementById('icon-refresh-catalog');
    if (btn) btn.disabled = true;
    if (icon) icon.classList.add('fa-spin');

    try {
        const [productsSnap, stocksSnap, settingsSnap] = await Promise.all([
            getDocs(collection(db, pathProducts)).catch(() => null),
            getDocs(query(collection(db, pathStocks), where("status", "==", "Ready"))).catch(() => null),
            getDoc(doc(db, pathSettings, 'mainConfig')).catch(() => null)
        ]);

        if (settingsSnap && settingsSnap.exists()) {
            siteSettings = { ...siteSettings, ...settingsSnap.data() };
            window.applySettingsToUI();
        }
        if (stocksSnap) {
            rebuildLiveReadyStocksMap(stocksSnap.docs);
        }
        if (productsSnap) {
            products = [];
            productsSnap.forEach((docSnap) => {
                products.push({ dbId: docSnap.id, ...docSnap.data() });
            });
        }
        rebuildGroupedBrands();
        updateOpHoursBannerUI();
        window.renderBrands(currentBrandFilter);
        window.showToast('Katalog Disegarkan', 'Data produk & stok terbaru berhasil dimuat.', 'success');
    } catch (e) {
        window.renderBrands(currentBrandFilter);
        window.showToast('Diperbarui', 'Tampilan katalog telah disegarkan.', 'info');
    } finally {
        setTimeout(() => {
            if (btn) btn.disabled = false;
            if (icon) icon.classList.remove('fa-spin');
        }, 350);
    }
};

window.toggleCatalogShowAll = function() {
    isCatalogExpanded = true;
    window.renderBrands(currentBrandFilter);
};

function getStoreCategoryBadgeMeta(type) {
    const t = String(type || 'app').toLowerCase();
    if (t === 'game') return { tagClass: 'tag-game', label: 'GAME' };
    if (t === 'pulsa') return { tagClass: 'tag-pulsa', label: 'PULSA & DATA' };
    if (t === 'pln') return { tagClass: 'tag-pln', label: 'LISTRIK PLN' };
    if (t === 'ewallet') return { tagClass: 'tag-ewallet', label: 'E-WALLET' };
    if (t === 'ppob') return { tagClass: 'tag-ppob', label: 'TAGIHAN' };
    if (t === 'tools') return { tagClass: 'tag-tools', label: 'TOOLS' };
    return { tagClass: 'tag-app', label: 'APLIKASI' };
}

function detectCellularOperatorName(phoneStr) {
    const clean = String(phoneStr || '').replace(/[^0-9]/g, '');
    let p = clean;
    if (p.startsWith('62')) p = '0' + p.slice(2);
    if (p.length < 4) return '';
    const pref = p.slice(0, 4);
    if (['0811', '0812', '0813', '0821', '0822', '0823', '0852', '0853'].includes(pref)) return 'Telkomsel';
    if (pref === '0851') return 'Telkomsel / by.U';
    if (['0814', '0815', '0816', '0855', '0856', '0857', '0858'].includes(pref)) return 'Indosat Ooredoo';
    if (['0817', '0818', '0819', '0859', '0877', '0878'].includes(pref)) return 'XL Axiata';
    if (['0831', '0832', '0833', '0838'].includes(pref)) return 'AXIS';
    if (['0895', '0896', '0897', '0898', '0899'].includes(pref)) return 'Tri (3)';
    if (['0881', '0882', '0883', '0884', '0885', '0886', '0887', '0888', '0889'].includes(pref)) return 'Smartfren';
    return '';
}

window.onInputPhoneDetectOperator = function() {
    const val = document.getElementById('buy-id')?.value || '';
    const badgeEl = document.getElementById('buy-operator-badge');
    if (!badgeEl) return;
    const op = detectCellularOperatorName(val);
    if (op) {
        badgeEl.style.display = 'inline-flex';
        badgeEl.innerHTML = `<i class="fa-solid fa-signal"></i> ${escapeHtml(op)}`;
    } else {
        badgeEl.style.display = 'none';
    }
};

window.renderBrands = function(filter = currentBrandFilter) {
    const grid = document.getElementById('brand-grid');
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
        const prices = b.items.map(i => i.processType === 'ewallet_custom' ? Number(i.minCustomNominal || 10000) : getEffectiveUserVariantPrice(i)).filter(p => p > 0);
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
        grid.innerHTML = `<div class="brutal-empty-box" style="grid-column: 1/-1;">Produk tidak ditemukan pada kategori ini.</div>`; 
        return; 
    }

    let html = '';

    filteredBrands.forEach((b) => {
        const safeJsBrand = escapeJsStr(b.brandName);
        const safeHtmlBrand = escapeHtml(b.brandName);
        
        // Bedakan dengan tegas antara GANGGUAN vs STOK HABIS (#7)
        const allVariantsGangguan = b.isGangguan || (b.items.length > 0 && b.items.every(it => isVariantGangguanState(it)));
        const allVariantsSoldOut = !allVariantsGangguan && b.items.length > 0 && b.items.every(it => isVariantMarkedSoldOutByAdmin(it));

        const catMeta = getStoreCategoryBadgeMeta(b.type);
        let tagClass = catMeta.tagClass;
        let tagLabel = catMeta.label;
        if (allVariantsGangguan) {
            tagClass = 'tag-maint';
            tagLabel = 'GANGGUAN';
        } else if (allVariantsSoldOut) {
            tagClass = 'tag-soldout';
            tagLabel = 'STOK HABIS';
        }

        const imgHtml = b.imgUrlBase64 
             ? `<img src="${b.imgUrlBase64}" alt="${safeHtmlBrand}" loading="lazy" decoding="async">` 
             : `<div style="width:100%; height:100%; background:var(--primary); display:flex; align-items:center; justify-content:center; font-size:1.7rem; font-weight:800; color:#ffffff;">${safeHtmlBrand.charAt(0)}</div>`;
             
        let clickAction = `window.openDirectBuyModal('${safeJsBrand}')`;
        if (b.isGangguan) {
            clickAction = `window.customAlert('Sedang Gangguan', 'Layanan ${safeJsBrand} sedang mengalami gangguan dari pusat.', 'warning')`;
        }

        const cssClass = b.isGangguan ? 'brand-card sold-out' : 'brand-card';
        
        html += `
            <div class="${cssClass}" onclick="${clickAction}">
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
                    <span class="buy-arrow-pill">Pilih <i class="fa-solid fa-arrow-right"></i></span>
                </div>
            </div>`;
    });
    grid.innerHTML = html;
};

window.filterCheckoutVariants = function() {
    const inp = document.getElementById('variant-quick-search');
    const val = inp ? inp.value.trim().toLowerCase() : '';
    if (variantSearchDebounceTimer) clearTimeout(variantSearchDebounceTimer);
    variantSearchDebounceTimer = setTimeout(() => {
        currentVariantSearchQuery = val;
        renderCheckoutVariantCards();
    }, 50);
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
            (item.variantDesc || '').toLowerCase().includes(currentVariantSearchQuery)
        );
    }

    const INITIAL_VARIANT_LIMIT = 8;
    const shouldCollapse = !currentVariantSearchQuery && filteredItems.length > INITIAL_VARIANT_LIMIT;
    const visibleItems = (shouldCollapse && !isVariantsExpanded)
        ? filteredItems.slice(0, INITIAL_VARIANT_LIMIT)
        : filteredItems;

    if (moreBtn && collapseBtn) {
        if (shouldCollapse) {
            const hiddenCount = filteredItems.length - INITIAL_VARIANT_LIMIT;
            if (!isVariantsExpanded) {
                moreBtn.style.display = 'inline-flex';
                moreBtn.innerHTML = `<i class="fa-solid fa-plus"></i> <span>Lihat ${hiddenCount} Variasi Lainnya</span> <i class="fa-solid fa-chevron-down"></i>`;
                collapseBtn.style.display = 'none';
            } else {
                moreBtn.style.display = 'none';
                collapseBtn.style.display = 'inline-flex';
                collapseBtn.innerHTML = `<i class="fa-solid fa-angles-up"></i> <span>Tutup Variasi</span>`;
            }
        } else {
            moreBtn.style.display = 'none';
            collapseBtn.style.display = 'none';
        }
    }

    if (visibleItems.length === 0) {
        itemGrid.innerHTML = `<div class="brutal-empty-box" style="grid-column: 1/-1; padding: 1.4rem;">Variasi tidak ditemukan.</div>`;
        return;
    }

    const opRestricted = isLocalStockOnlyRestrictionActive();
    let html = '';

    visibleItems.forEach((item) => {
        const normalPrice = item.priceNum || 0;
        const procType = (item.processType || 'auto').toLowerCase();
        const availQuota = computeVariantAvailableStock(item);
        const hasStockQuota = typeof availQuota === 'number' && availQuota >= 0;

        // 1. Cek apakah varian sedang GANGGUAN vs STOK HABIS (#5, #7, #8)
        const isGangguan = isVariantGangguanState(item);
        const isSoldByAdmin = !isGangguan && isVariantMarkedSoldOutByAdmin(item);
        const isDisabledVariant = isGangguan || isSoldByAdmin;

        // 2. Cek apakah varian memiliki stok lokal / API otomatis
        const hasLocalAutoStock = isVariantLocallyReadyForAutoProcess(item);
        const isWaitOpHours = !isDisabledVariant && opRestricted && !hasLocalAutoStock;

        const isSelected = !isDisabledVariant && selectedProductForBuy && selectedProductForBuy.dbId === item.dbId;

        let procBadge = '';
        if (isGangguan) {
            procBadge = '<span class="proc-mode-badge proc-mode-gangguan"><i class="fa-solid fa-triangle-exclamation"></i> GANGGUAN</span>';
        } else if (isSoldByAdmin) {
            procBadge = '<span class="proc-mode-badge proc-mode-soldout">STOK HABIS</span>';
        } else if (isWaitOpHours) {
            procBadge = '<span class="proc-mode-badge proc-mode-op-hours">SAAT JAM OPERASIONAL</span>';
        } else if (procType === 'ewallet_custom') {
            procBadge = '<span class="proc-mode-badge proc-mode-auto">BEBAS NOMINAL</span>';
        } else if (procType === 'manual') {
            procBadge = '<span class="proc-mode-badge proc-mode-manual">ADMIN</span>';
        } else if (procType === 'ask_auto' || procType === 'hybrid') {
            procBadge = hasLocalAutoStock
                ? '<span class="proc-mode-badge proc-mode-auto">OTOMATIS</span>'
                : '<span class="proc-mode-badge proc-mode-ask-auto">TANYA / AUTO</span>';
        } else {
            procBadge = '<span class="proc-mode-badge proc-mode-auto">OTOMATIS</span>';
        }

        // Hanya tampilkan keterangan singkat yang diisi manual oleh Admin (#6)
        const rawVarDesc = (item.variantDesc || '').trim();
        const varDescText = (rawVarDesc && !rawVarDesc.startsWith('Kode SKU:')) ? rawVarDesc : '';
        const varDescHtml = varDescText
            ? `<div class="item-variant-desc">${escapeHtml(varDescText)}</div>`
            : '';

        let badgesHtml = '';
        if (item.durationDays && item.durationDays > 0) {
            badgesHtml += `<span class="item-duration-pill"><i class="fa-regular fa-clock"></i> ${item.durationDays} Hari</span>`;
        }
        if (isGangguan) {
            badgesHtml += `<span class="item-stock-pill" style="color:var(--danger);">Status: <b>Sedang Gangguan</b></span>`;
        } else if (isSoldByAdmin) {
            badgesHtml += `<span class="item-stock-pill" style="color:var(--danger);">Stok: <b>Habis</b></span>`;
        } else if (procType === 'ewallet_custom') {
            badgesHtml += `<span class="item-stock-pill">Nominal: <b>Rp${Number(item.minCustomNominal||10000).toLocaleString('id-ID')} - Rp${Number(item.maxCustomNominal||500000).toLocaleString('id-ID')}</b></span>`;
        } else if (hasLocalAutoStock && hasStockQuota && availQuota > 0) {
            badgesHtml += `<span class="item-stock-pill">Stok: <b>${availQuota >= 999 ? 'Tersedia' : availQuota}</b></span>`;
        } else if (isWaitOpHours) {
            badgesHtml += `<span class="item-stock-pill" style="color:var(--warning);"><b>Dipesan Saat Jam Operasional</b></span>`;
        } else if (hasStockQuota && availQuota > 0) {
            badgesHtml += `<span class="item-stock-pill">Stok: <b>${availQuota >= 999 ? 'Tersedia' : availQuota}</b></span>`;
        }

        const isCheckUsernameFree = Boolean(item.isCheckUsernameProduct === true || normalPrice === 0);
        const effPrice = isCheckUsernameFree ? 0 : getEffectiveUserVariantPrice(item);
        const isMpSaving = !isCheckUsernameFree && effPrice > 0 && effPrice < normalPrice;
        const priceLabel = isCheckUsernameFree
            ? `<span style="color:var(--success); font-weight:900;">GRATIS (Rp0)</span>`
            : (procType === 'ewallet_custom'
                ? `Admin +Rp${Number(item.adminFeeNominal || 0).toLocaleString('id-ID')}`
                : (isMpSaving
                    ? `<span class="memberplus-price-strike">Rp${normalPrice.toLocaleString('id-ID')}</span>Rp${effPrice.toLocaleString('id-ID')} <span class="memberplus-saving-pill"><i class="fa-solid fa-crown"></i> PLUS</span>`
                    : `Rp${normalPrice.toLocaleString('id-ID')}`));

        const clickHandler = isDisabledVariant ? '' : `window.selectItemToBuy('${item.dbId}')`;

        html += `
            <div class="item-card ${isGangguan ? 'variant-gangguan' : ''} ${isSoldByAdmin ? 'sold-out' : ''} ${isWaitOpHours ? 'op-hours-locked' : ''} ${isSelected ? 'selected' : ''}" id="buy-card-${item.dbId}" onclick="${clickHandler}">
                <div>
                    <h4>${escapeHtml(item.name)}</h4>
                    ${varDescHtml}
                    ${badgesHtml ? `<div class="item-badges-row">${badgesHtml}</div>` : ''}
                </div>
                <div class="price-wrapper">
                    <span class="price-normal">${priceLabel}</span>
                    ${procBadge}
                </div>
            </div>
        `;
    });
    itemGrid.innerHTML = html;
}

// State Konfirmasi Pesanan & Cek Username/ID Otomatis Sebelum Bayar (#3, #14)
let verifiedEwalletAccount = null;
let pendingConfirmedCheckoutPayload = null;

function resolveBrandCheckIdSku(brandObj, variantObj) {
    if (variantObj && variantObj.isCheckUsernameProduct && variantObj.buyerSkuCode) return variantObj.buyerSkuCode;
    if (variantObj && variantObj.checkIdSkuCode) return variantObj.checkIdSkuCode;
    if (brandObj && Array.isArray(brandObj.items)) {
        const checkItem = brandObj.items.find(x => x.isCheckUsernameProduct === true && x.buyerSkuCode);
        if (checkItem && checkItem.buyerSkuCode) return checkItem.buyerSkuCode;
    }
    if (brandObj && brandObj.checkIdSkuCode) return brandObj.checkIdSkuCode;
    const b = String(brandObj?.brandName || '').toUpperCase();
    const t = String(brandObj?.type || '').toLowerCase();
    const inp = String(variantObj?.inputType || brandObj?.items?.[0]?.inputType || '').toLowerCase();
    if (t === 'pln' || inp === 'pln_token' || b.includes('PLN')) return 'pln';
    if (t === 'ewallet' || inp === 'ewallet_no' || b.includes('DANA') || b.includes('OVO') || b.includes('GOPAY') || b.includes('GO-PAY') || b.includes('SHOPEE') || b.includes('LINKAJA') || b.includes('ISAKU')) {
        if (b.includes('DANA')) return 'dana';
        if (b.includes('OVO')) return 'ovo';
        if (b.includes('GOPAY') || b.includes('GO-PAY')) return 'gopay';
        if (b.includes('SHOPEE')) return 'shopeepay';
        if (b.includes('LINKAJA')) return 'linkaja';
        if (b.includes('ISAKU')) return 'isaku';
        return 'ewallet';
    }
    if (b.includes('MOBILE LEGENDS') || b.includes('MLBB')) return 'ml';
    if (b.includes('FREE FIRE') || b === 'FF') return 'ff';
    if (b.includes('PUBG')) return 'pubgm';
    if (b.includes('GENSHIN')) return 'genshin';
    if (b.includes('HONKAI')) return 'hsr';
    if (b.includes('VALORANT')) return 'valorant';
    if (b.includes('HONOR OF KINGS') || b.includes('HOK')) return 'hok';
    if (b.includes('CALL OF DUTY') || b.includes('CODM')) return 'codm';
    if (b.includes('POINT BLANK') || b.includes('PB')) return 'pb';
    if (t === 'game') return 'game_auto';
    return '';
}

window.openDirectBuyModal = function(brandName) {
    const brandObj = groupedBrands.find(b => b.brandName === brandName);
    if (!brandObj) return;
    if (brandObj.isGangguan) {
        window.customAlert('Sedang Gangguan', 'Layanan produk ini sedang mengalami gangguan sementara.', 'warning');
        return;
    }
    
    currentCheckoutBrand = brandObj;
    selectedProductForBuy = null;
    appliedPromo = null;
    isVariantsExpanded = false;
    currentVariantSearchQuery = '';
    verifiedPascaInquiry = null;
    verifiedPlnSubscriber = null;
    verifiedEwalletAccount = null;
    pendingConfirmedCheckoutPayload = null;
    
    const varSearchInp = document.getElementById('variant-quick-search');
    if (varSearchInp) varSearchInp.value = '';
    document.getElementById('buy-promo-code').value = '';
    document.getElementById('buy-promo-msg').innerHTML = '';
    document.getElementById('buy-qty').value = 1;
    document.getElementById('manual-warning-msg').style.display = 'none';
    const askAutoWarn = document.getElementById('ask-auto-warning-msg');
    if (askAutoWarn) askAutoWarn.style.display = 'none';
    document.getElementById('cash-warning-msg').style.display = 'none';
    const ewBox = document.getElementById('buy-custom-ewallet-box');
    if (ewBox) ewBox.style.display = 'none';
    const qtySub = document.getElementById('buy-qty-subtext');
    if (qtySub) qtySub.innerText = 'Kuantitas item';
    window.switchBuyModalTab('form');
    
    document.getElementById('buy-detail-fields').style.maxHeight = '220px';
    document.getElementById('buy-desc-fade').style.display = 'block';
    document.getElementById('btn-desc-more').style.display = 'block';

    document.getElementById('buy-brand-name').innerText = brandObj.brandName;
    const catMeta = getStoreCategoryBadgeMeta(brandObj.type);
    document.getElementById('buy-brand-badge').innerText = catMeta.label;
    
    const totalSold = orders.filter(o => o.status === 'SUCCESS' && o.items && o.items[0]?.brandName === brandObj.brandName)
                            .reduce((sum, o) => sum + (o.items[0].qty || 1), 0);
    document.getElementById('buy-brand-sold').innerText = `${totalSold} Terjual`;
    
    const imgEl = document.getElementById('buy-brand-img');
    if (brandObj.imgUrlBase64) { imgEl.src = brandObj.imgUrlBase64; imgEl.style.display = 'block'; } 
    else { imgEl.style.display = 'none'; }
    
    renderCheckoutVariantCards();
    
    const fields = document.getElementById('buy-detail-fields');
    const firstItem = brandObj.items[0] || {};
    let inpType = firstItem.inputType || (brandObj.type === 'game' ? 'id_zone' : (brandObj.type === 'pln' ? 'pln_token' : (brandObj.type === 'ewallet' ? 'ewallet_no' : (brandObj.type === 'pulsa' ? 'phone' : 'none'))));
    const requireAppTarget = Boolean(brandObj.requireAppTarget || firstItem.requireAppTarget || (brandObj.type === 'app' && inpType && inpType !== 'none'));

    const cleanBrandDesc = (brandObj.desc && !String(brandObj.desc).startsWith('Layanan otomatis')) ? brandObj.desc : '';
    let fmtDesc = cleanBrandDesc ? escapeHtml(cleanBrandDesc).replace(/\n/g, '<br>') : '';
    let extraDesc = fmtDesc ? `<div style="font-size:0.84rem; font-weight:600; color:var(--text); background:var(--bg); padding:12px; border-radius:10px; border:1.5px solid var(--border); margin-bottom:12px;">${fmtDesc}</div>` : '';
    
    if (!fmtDesc || cleanBrandDesc.length < 130) {
        document.getElementById('buy-desc-fade').style.display = 'none';
        document.getElementById('btn-desc-more').style.display = 'none';
        document.getElementById('buy-detail-fields').style.maxHeight = '1200px';
    }

    if (brandObj.type === 'app' && requireAppTarget) {
        const customLbl = firstItem.appTargetLabel || brandObj.appTargetLabel || 'Email / Akun Tujuan';
        const customPh = firstItem.appTargetPlaceholder || brandObj.appTargetPlaceholder || 'Contoh: emailkamu@gmail.com';
        fields.innerHTML = `
            ${extraDesc}
            <div class="form-group" style="margin-bottom:0;">
                <label for="buy-id">${escapeHtml(customLbl)} <span style="color:var(--danger)">*</span></label>
                <input type="text" id="buy-id" class="form-control" placeholder="${escapeHtml(customPh)}" required>
            </div>`;
    } else if (inpType === 'pln_token' || brandObj.type === 'pln') {
        fields.innerHTML = `
            ${extraDesc}
            <div class="form-group" style="margin-bottom:0;">
                <label for="buy-id">Nomor Meter / ID Pelanggan PLN <span style="color:var(--danger)">*</span></label>
                <input type="text" id="buy-id" class="form-control" placeholder="Masukkan Nomor Meter / ID Pelanggan PLN (Cth: 530000000001)" required oninput="window.onInputAutoCheckPlnSubscriber()">
                <small style="font-size:0.72rem; color:var(--text-muted); display:block; margin-top:4px;">Nama pelanggan &amp; daya listrik tampil otomatis saat nomor dimasukkan.</small>
                <div id="user-pln-inquiry-box" class="pln-inquiry-result-card" style="display:none;"></div>
            </div>`;
    } else if (inpType === 'ewallet_no' || brandObj.type === 'ewallet') {
        fields.innerHTML = `
            ${extraDesc}
            <div class="form-group" style="margin-bottom:0;">
                <label for="buy-id">Nomor HP / Akun ${escapeHtml(brandObj.brandName)} <span style="color:var(--danger)">*</span></label>
                <input type="tel" id="buy-id" class="form-control" placeholder="Contoh: 081234567890" required oninput="window.resetPlnAndPascaCheck()">
                <small style="font-size:0.72rem; color:var(--text-muted); display:block; margin-top:4px;">Nama pengguna ${escapeHtml(brandObj.brandName)} akan dicek otomatis pada jendela konfirmasi saat menekan tombol Beli Sekarang.</small>
            </div>`;
    } else if (inpType === 'pasca_no' || brandObj.type === 'ppob' || firstItem.processType === 'digiflazz_pasca') {
        fields.innerHTML = `
            ${extraDesc}
            <div class="form-group" style="margin-bottom:0;">
                <label for="buy-id">Nomor Pelanggan / ID Tagihan ${escapeHtml(brandObj.brandName)} <span style="color:var(--danger)">*</span></label>
                <input type="text" id="buy-id" class="form-control" placeholder="Masukkan Nomor Pelanggan (Cth: 530000000001)" required oninput="window.onInputPascaCustomerNo()">
                <small style="font-size:0.74rem; color:var(--text-muted); font-weight:700; display:block; margin-top:5px;">Masukkan nomor pelanggan lalu klik tombol <b>Cek Tagihan</b> di samping untuk melihat nominal tagihan sebelum membayar.</small>
                <div id="user-pasca-inquiry-box" class="pln-inquiry-result-card" style="display:none;"></div>
            </div>`;
    } else if (inpType === 'phone' || brandObj.type === 'pulsa') {
        fields.innerHTML = `
            ${extraDesc}
            <div class="form-group" style="margin-bottom:0;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <label for="buy-id" style="margin-bottom:0;">Nomor HP Tujuan <span style="color:var(--danger)">*</span></label>
                    <span id="buy-operator-badge" class="operator-detect-pill" style="display:none;"></span>
                </div>
                <input type="tel" id="buy-id" class="form-control" placeholder="Contoh: 081234567890" required oninput="window.onInputPhoneDetectOperator()">
            </div>`;
    } else if (brandObj.type === 'game' || (brandObj.type === 'tools' && inpType && inpType !== 'none')) {
        if (inpType === 'id_only') {
            fields.innerHTML = `
                ${extraDesc}
                <div class="form-group" style="margin-bottom:0;">
                    <label for="buy-id">ID Player / UID Tujuan <span style="color:var(--danger)">*</span></label>
                    <input type="text" id="buy-id" class="form-control" placeholder="Masukkan ID Player" required>
                    <small style="font-size:0.72rem; color:var(--text-muted); display:block; margin-top:4px;">Username akun game akan dicek otomatis saat konfirmasi pesanan sebelum bayar.</small>
                </div>`;
        } else if (inpType === 'custom' || inpType === 'roblox') {
            fields.innerHTML = `
                ${extraDesc}
                <div class="form-group" style="margin-bottom:0;">
                    <label for="buy-id">Username / Email / Link Tujuan <span style="color:var(--danger)">*</span></label>
                    <input type="text" id="buy-id" class="form-control" placeholder="Masukkan data tujuan" required>
                </div>`;
        } else {
            fields.innerHTML = `
                ${extraDesc}
                <div style="display:grid; grid-template-columns: 2fr 1fr; gap:10px;">
                    <div class="form-group" style="margin-bottom:0;">
                        <label for="buy-id">ID Player <span style="color:var(--danger)">*</span></label>
                        <input type="text" id="buy-id" class="form-control" placeholder="ID Player" required>
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label for="buy-zone">Zone / Server</label>
                        <input type="text" id="buy-zone" class="form-control" placeholder="Zone">
                    </div>
                </div>
                <small style="font-size:0.72rem; color:var(--text-muted); display:block; margin-top:5px;">Username akun game akan dicek otomatis saat konfirmasi pesanan sebelum bayar.</small>`;
        }
    } else {
        fields.innerHTML = `
            ${extraDesc}
            <div class="brutal-alert-box" style="background:var(--bg); color:var(--text);">
                <i class="fa-solid fa-circle-check text-primary"></i>
                <span>Rincian akun akan langsung tampil di halaman Pesanan setelah pembayaran kamu diterima.</span>
            </div>`;
    }
    
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    const guestContactBox = document.getElementById('buy-guest-contact-box');
    const emailGroup = document.getElementById('buy-email-group');
    const emailInput = document.getElementById('buy-email');
    const memberAutofillBadge = document.getElementById('buy-member-autofill-badge');

    if (isMember) {
        const memEmail = userProfile.email || currentUser.email || localStorage.getItem('vipercell_member_email') || '';
        if (emailInput) emailInput.value = memEmail;
        if (guestContactBox) guestContactBox.style.display = 'none';
        if (emailGroup) emailGroup.style.display = 'none';
        if (memberAutofillBadge) memberAutofillBadge.style.display = 'flex';
    } else {
        if (emailInput) emailInput.value = localStorage.getItem('vipercell_guest_email') || '';
        if (guestContactBox) guestContactBox.style.display = 'block';
        if (emailGroup) emailGroup.style.display = 'block';
        if (memberAutofillBadge) memberAutofillBadge.style.display = 'none';
    }
    
    const defaultPayCard = document.querySelector('input[name="payment_method"][value="qris"]');
    if (defaultPayCard) window.selectPaymentUI('qris', defaultPayCard.parentElement);
    
    const isPascaBrand = Boolean(inpType === 'pasca_no' || brandObj.type === 'ppob' || firstItem.processType === 'digiflazz_pasca');
    const step02Card = document.getElementById('checkout-step-02-card');
    if (step02Card) {
        step02Card.style.display = isPascaBrand ? 'none' : 'block';
    }
    if (isPascaBrand && brandObj.items.length > 0) {
        selectedProductForBuy = brandObj.items[0];
    }

    window.calculateDirectBuyTotal();
    window.renderReviewsUI();
    window.switchMainTab('checkout');
};

window.setCustomEwalletNominal = function(amt) {
    const inp = document.getElementById('buy-custom-ewallet-amount');
    if (inp) {
        const minV = Number(selectedProductForBuy?.minCustomNominal || 10000);
        const maxV = Math.min(500000, Number(selectedProductForBuy?.maxCustomNominal || 500000));
        inp.value = Math.min(maxV, Math.max(minV, amt));
        window.calculateDirectBuyTotal();
    }
};

window.onInputCustomEwalletAmount = function() {
    window.calculateDirectBuyTotal();
};

window.selectItemToBuy = function(dbId) {
    const candidate = currentCheckoutBrand.items.find(i => i.dbId === dbId);
    if (!candidate) return;
    if (isVariantGangguanState(candidate)) {
        window.customAlert('Sedang Gangguan', 'Variasi produk ini sedang mengalami gangguan.', 'warning');
        return;
    }
    if (isVariantMarkedSoldOutByAdmin(candidate)) {
        window.customAlert('Stok Habis', 'Variasi produk ini sedang habis.', 'warning');
        return;
    }

    const availQuota = computeVariantAvailableStock(candidate);

    selectedProductForBuy = candidate;
    document.querySelectorAll('.item-card').forEach(el => el.classList.remove('selected'));
    const cardEl = document.getElementById(`buy-card-${dbId}`);
    if (cardEl) cardEl.classList.add('selected');
    
    const manualWarn = document.getElementById('manual-warning-msg');
    const askAutoWarn = document.getElementById('ask-auto-warning-msg');
    const ewCustomBox = document.getElementById('buy-custom-ewallet-box');
    const ewCustomInp = document.getElementById('buy-custom-ewallet-amount');
    const ewCustomHint = document.getElementById('buy-custom-ewallet-hint');
    const procType = (selectedProductForBuy?.processType || 'auto').toLowerCase();

    if (manualWarn) {
        manualWarn.style.display = procType === 'manual' ? 'flex' : 'none';
    }
    if (askAutoWarn) {
        askAutoWarn.style.display = (procType === 'ask_auto' || procType === 'hybrid') ? 'flex' : 'none';
    }
    if (ewCustomBox) {
        if (procType === 'ewallet_custom') {
            ewCustomBox.style.display = 'block';
            const minV = Number(selectedProductForBuy.minCustomNominal || 10000);
            const maxV = Math.min(500000, Number(selectedProductForBuy.maxCustomNominal || 500000));
            const feeV = Number(selectedProductForBuy.adminFeeNominal || 0);
            if (ewCustomInp) {
                ewCustomInp.min = minV;
                ewCustomInp.max = maxV;
                const curV = parseInt(ewCustomInp.value, 10) || 50000;
                if (curV < minV || curV > maxV) ewCustomInp.value = Math.min(maxV, Math.max(minV, 50000));
            }
            if (ewCustomHint) {
                ewCustomHint.innerText = `Minimal Rp${minV.toLocaleString('id-ID')} — Maksimal Rp${maxV.toLocaleString('id-ID')} (Biaya Admin +Rp${feeV.toLocaleString('id-ID')})`;
            }
        } else {
            ewCustomBox.style.display = 'none';
        }
    }

    const qtyInput = document.getElementById('buy-qty');
    const qtySub = document.getElementById('buy-qty-subtext');

    if (procType === 'ewallet_custom') {
        qtyInput.value = 1;
        if (qtySub) qtySub.innerText = '1x Transaksi Bebas Nominal';
    } else if (typeof availQuota === 'number' && availQuota < 999) {
        if (qtySub) qtySub.innerText = `Tersedia ${availQuota} stok`;
        if (parseInt(qtyInput.value) > availQuota) {
            qtyInput.value = Math.max(1, availQuota);
        }
    } else if (qtySub) {
        qtySub.innerText = 'Kuantitas item';
    }
    
    window.calculateDirectBuyTotal();
};

window.selectPaymentUI = function(val, el) {
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    // Proteksi mutlak: Tamu/Anonim tidak pernah boleh memilih metode pembayaran SALDO (#4)
    if (val === 'balance' && !isMember) {
        const qrisCard = document.getElementById('pay-card-qris');
        if (qrisCard) window.selectPaymentUI('qris', qrisCard);
        return;
    }

    document.querySelectorAll('input[name="payment_method"]').forEach(input => { input.parentElement.classList.remove('active'); });
    if (el) {
        el.classList.add('active');
        const rad = el.querySelector('input');
        if (rad) rad.checked = true;
    }
    
    const cashWarn = document.getElementById('cash-warning-msg');
    if (cashWarn) cashWarn.style.display = val === 'cash' ? 'flex' : 'none';

    const balWarn = document.getElementById('balance-warning-msg');
    if (balWarn) balWarn.style.display = (val === 'balance' && isMember) ? 'flex' : 'none';
    
    window.calculateDirectBuyTotal();
};

window.changeBuyQty = function(change) {
    if (selectedProductForBuy && selectedProductForBuy.processType === 'ewallet_custom') {
        window.showToast('Bebas Nominal', 'Silakan ubah nominal langsung pada kolom Nominal Top Up E-Wallet.', 'info');
        return;
    }
    const input = document.getElementById('buy-qty');
    let current = parseInt(input.value) || 1;
    let newVal = current + change;
    if (newVal < 1) newVal = 1;

    const availQuota = computeVariantAvailableStock(selectedProductForBuy);
    if (typeof availQuota === 'number' && availQuota > 0 && availQuota < 999) {
        if (newVal > availQuota) {
            newVal = availQuota;
            window.showToast('Batas Stok', `Maksimal stok tersedia adalah ${availQuota}.`, 'warning');
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

    if (!isMember) {
        appliedPromo = null;
        msgEl.innerHTML = `<span style="color:var(--danger)">Kode promo hanya dapat digunakan oleh Member.</span>`;
        window.calculateDirectBuyTotal();
        return;
    }

    const effectiveUid = currentUser.uid;
    const buyerEmail = (userProfile.email || currentUser?.email || '').trim().toLowerCase();

    const p = promos.find(x => x.code === codeInput);
    const qty = parseInt(document.getElementById('buy-qty')?.value) || 1;
    const rawSubtotal = selectedProductForBuy ? (selectedProductForBuy.priceNum * qty) : 0;
    const todayIso = new Date().toISOString().slice(0, 10);

    if (!p || !p.active) {
        appliedPromo = null;
        msgEl.innerHTML = `<span style="color:var(--danger)">Kode promo tidak ditemukan.</span>`;
        window.calculateDirectBuyTotal();
        return;
    }

    if (p.targetUser === 'member_plus' && !isUserMemberPlusActive()) {
        appliedPromo = null;
        msgEl.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-crown"></i> Kode promo ini khusus untuk pelanggan Member Plus aktif.</span>`;
        window.calculateDirectBuyTotal();
        return;
    }

    if (p.onePerEmail !== false && buyerEmail && buyerEmail.includes('@')) {
        const usedEmailsList = Array.isArray(p.usedEmails) ? p.usedEmails.map(e => String(e).toLowerCase()) : [];
        const hasUsedInOrders = orders.some(o =>
            o.promoCode && o.promoCode.toUpperCase() === p.code.toUpperCase() &&
            o.status !== 'CANCELLED' && o.status !== 'EXPIRED' && o.status !== 'FAILED' &&
            (o.userEmail || '').toLowerCase() === buyerEmail
        );
        const hasUsedLocal = localStorage.getItem(`vipercell_promo_used_${p.code}_${buyerEmail}`) === '1';

        if (usedEmailsList.includes(buyerEmail) || hasUsedInOrders || hasUsedLocal) {
            appliedPromo = null;
            msgEl.innerHTML = `<span style="color:var(--danger)">Kode promo sudah pernah digunakan pada akun ini.</span>`;
            window.calculateDirectBuyTotal();
            return;
        }
    }

    if (p.usedCount >= p.maxUses) {
        appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)">Kuota kode promo sudah habis.</span>`;
    } else if (p.expiryDate && p.expiryDate < todayIso) {
        appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)">Masa berlaku kode promo telah berakhir.</span>`;
    } else if (p.minOrder && p.minOrder > 0 && rawSubtotal < p.minOrder) {
        appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)">Minimal belanja Rp${p.minOrder.toLocaleString('id-ID')}.</span>`;
    } else if (p.targetBrand && p.targetBrand !== 'all' && currentCheckoutBrand && p.targetBrand !== currentCheckoutBrand.brandName) {
        appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)">Khusus produk ${escapeHtml(p.targetBrand)}.</span>`;
    } else if (p.targetUser === 'new') {
        const hasOrders = orders.some(o =>
            (effectiveUid && o.userId === effectiveUid) ||
            (buyerEmail && (o.userEmail || '').toLowerCase() === buyerEmail)
        );
        if (hasOrders) {
            appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)">Khusus transaksi pertama.</span>`;
        } else {
            setValidPromo(p, msgEl);
        }
    } else {
        setValidPromo(p, msgEl);
    }
    window.calculateDirectBuyTotal();
};

function setValidPromo(p, msgEl) {
    appliedPromo = { dbId: p.dbId, code: p.code, amount: p.amount, type: p.type || 'nominal', memberOnly: true };
    msgEl.innerHTML = `<span style="color:var(--success)"><i class="fa-solid fa-circle-check"></i> Promo ${escapeHtml(p.code)} diterapkan.</span>`;
}

window.calculateDirectBuyTotal = function() {
    const btnProc = document.getElementById('btn-process-buy');
    if (!btnProc) return;
    
    if (!selectedProductForBuy) {
        document.getElementById('buy-total-price').innerText = 'Rp0';
        btnProc.innerHTML = '<i class="fa-solid fa-cart-shopping"></i> <span>Pilih Variasi</span>';
        btnProc.disabled = true;
        return; 
    }
    
    const qty = parseInt(document.getElementById('buy-qty').value) || 1;
    const isPascaMode = (selectedProductForBuy.processType === 'digiflazz_pasca' || currentCheckoutBrand?.type === 'ppob');
    const isCustomEwallet = (selectedProductForBuy.processType === 'ewallet_custom');

    let unitPrice = getEffectiveUserVariantPrice(selectedProductForBuy);
    let customEwAmount = 0;

    if (isCustomEwallet) {
        customEwAmount = parseInt(document.getElementById('buy-custom-ewallet-amount')?.value || '0', 10) || 0;
        const fee = Number(selectedProductForBuy.adminFeeNominal || 0);
        unitPrice = customEwAmount > 0 ? (customEwAmount + fee) : 0;
    } else if (isPascaMode) {
        if (verifiedPascaInquiry && verifiedPascaInquiry.sku === selectedProductForBuy.buyerSkuCode) {
            unitPrice = Number(verifiedPascaInquiry.selling_price || verifiedPascaInquiry.price || 0);
        } else {
            unitPrice = 0;
        }
    }

    let baseTotal = unitPrice * (isCustomEwallet ? 1 : qty);
    
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

    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    const selectedPayMethod = document.querySelector('input[name="payment_method"]:checked')?.value || 'qris';
    const userBal = Math.round(Number(userProfile.balance || 0));
    const balWarnText = document.getElementById('balance-warning-text');
    if (selectedPayMethod === 'balance' && isMember && balWarnText) {
        if (userBal < baseTotal) {
            const kurang = baseTotal - userBal;
            balWarnText.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:var(--danger);"></i> Saldo kamu <b>Rp${userBal.toLocaleString('id-ID')}</b> (Kurang <b>Rp${kurang.toLocaleString('id-ID')}</b>).`;
        } else {
            balWarnText.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--success);"></i> Saldo mencukupi (<b>Rp${userBal.toLocaleString('id-ID')}</b>). Pesanan langsung diproses!`;
        }
    }
    
    if (siteSettings.isStoreOpen === false) {
        btnProc.innerHTML = '<i class="fa-solid fa-lock"></i> <span>Toko Sedang Tutup</span>';
        btnProc.disabled = true;
        return;
    }

    if (isVariantGangguanState(selectedProductForBuy)) {
        btnProc.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>Sedang Gangguan</span>`;
        btnProc.disabled = true;
        return;
    }

    if (isVariantMarkedSoldOutByAdmin(selectedProductForBuy) || (isCustomEwallet && isVariantOutOfDigiflazzBalance(selectedProductForBuy, customEwAmount))) {
        btnProc.innerHTML = `<i class="fa-solid fa-ban"></i> <span>Stok Habis</span>`;
        btnProc.disabled = true;
        return;
    }

    const opRestricted = isLocalStockOnlyRestrictionActive();
    const hasLocalAutoStock = isVariantLocallyReadyForAutoProcess(selectedProductForBuy);
    if (opRestricted && !hasLocalAutoStock) {
        const openStr = siteSettings.opOpenTime || '08:00';
        const closeStr = siteSettings.opCloseTime || '22:00';
        btnProc.innerHTML = `<i class="fa-regular fa-clock"></i> <span>Dipesan Saat Jam Operasional (${escapeHtml(openStr)} - ${escapeHtml(closeStr)})</span>`;
        btnProc.disabled = true;
        return;
    }
    
    if (isPascaMode) {
        if (!verifiedPascaInquiry || verifiedPascaInquiry.sku !== selectedProductForBuy.buyerSkuCode) {
            btnProc.className = 'btn btn-warning btn-checkout-submit';
            btnProc.innerHTML = '<i class="fa-solid fa-file-invoice-dollar"></i> <span id="btn-process-text">Cek Tagihan (Gratis)</span>';
            btnProc.disabled = false;
            return;
        } else {
            btnProc.className = 'btn btn-success btn-checkout-submit';
            btnProc.innerHTML = '<i class="fa-solid fa-bolt"></i> <span id="btn-process-text">Bayar Tagihan Sekarang</span>';
            btnProc.disabled = false;
            return;
        }
    }

    btnProc.className = 'btn btn-primary btn-checkout-submit';
    btnProc.innerHTML = '<i class="fa-solid fa-bolt"></i> <span id="btn-process-text">Beli Sekarang</span>'; 
    btnProc.disabled = false;
};

// Langkah 1: Validasi & Buka Pop-up Konfirmasi Pesanan + Cek Username/ID Otomatis Sebelum Bayar (#3, #14)
window.processDirectCheckout = async function() {
    if (isProcessingCheckout || !selectedProductForBuy) return;
    
    if (siteSettings.isStoreOpen === false) {
        window.customAlert('Toko Sedang Tutup', 'Maaf, toko sedang tutup sementara.', 'warning');
        return;
    }

    if (isVariantGangguanState(selectedProductForBuy)) {
        window.customAlert('Sedang Gangguan', 'Maaf, variasi produk ini sedang mengalami gangguan.', 'warning');
        return;
    }

    if (isVariantMarkedSoldOutByAdmin(selectedProductForBuy)) {
        window.customAlert('Stok Habis', 'Maaf, variasi produk ini sedang habis.', 'warning');
        return;
    }

    const isCustomEwallet = (selectedProductForBuy.processType === 'ewallet_custom');
    let customEwAmount = 0;
    if (isCustomEwallet) {
        customEwAmount = parseInt(document.getElementById('buy-custom-ewallet-amount')?.value || '0', 10) || 0;
        const minV = Number(selectedProductForBuy.minCustomNominal || 10000);
        const maxV = Math.min(500000, Number(selectedProductForBuy.maxCustomNominal || 500000));
        if (customEwAmount < minV || customEwAmount > maxV) {
            window.customAlert('Nominal Tidak Sesuai', `Nominal pengisian E-Wallet bebas harus di antara <b>Rp${minV.toLocaleString('id-ID')}</b> hingga <b>Rp${maxV.toLocaleString('id-ID')}</b>.`, 'warning');
            return;
        }
        if (isVariantOutOfDigiflazzBalance(selectedProductForBuy, customEwAmount)) {
            window.customAlert('Stok Tidak Mencukupi', 'Maaf, stok saldo pusat sedang tidak mencukupi untuk nominal ini.', 'warning');
            return;
        }
    }

    const opRestricted = isLocalStockOnlyRestrictionActive();
    const hasLocalAutoStock = isVariantLocallyReadyForAutoProcess(selectedProductForBuy);
    const availQuota = computeVariantAvailableStock(selectedProductForBuy);

    if (opRestricted && !hasLocalAutoStock) {
        const openStr = siteSettings.opOpenTime || '08:00';
        const closeStr = siteSettings.opCloseTime || '22:00';
        window.customAlert(
            'Dipesan Saat Jam Operasional',
            `Saat ini toko berada di luar jam layanan Admin. Produk ini baru dapat dipesan pada jam operasional (<b>${escapeHtml(openStr)} - ${escapeHtml(closeStr)}</b>).`,
            'warning'
        );
        return;
    }

    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);

    let emailInput = isMember
        ? (userProfile.email || currentUser?.email || document.getElementById('buy-email')?.value || '').trim()
        : (document.getElementById('buy-email')?.value || '').trim();

    if (!emailInput || !emailInput.includes('@')) { 
        window.customAlert('Email Diperlukan', 'Harap masukkan alamat email aktif untuk pengiriman pesanan.', 'warning'); 
        return; 
    }

    const paymentMethod = document.querySelector('input[name="payment_method"]:checked')?.value || 'qris';
    if (paymentMethod === 'balance' && !isMember) {
        window.customAlert('Khusus Member', 'Pembayaran menggunakan Saldo Akun hanya tersedia untuk Member yang sudah masuk.', 'warning');
        return;
    }

    if (appliedPromo) {
        if (!isMember) {
            appliedPromo = null;
            window.calculateDirectBuyTotal();
            window.customAlert('Khusus Member', 'Kode promo hanya dapat digunakan oleh Member.', 'warning');
            return;
        }
        const promoDoc = promos.find(x => x.code === appliedPromo.code);
        if (promoDoc && promoDoc.onePerEmail !== false) {
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
                window.customAlert('Promo Sudah Digunakan', `Kode promo ${escapeHtml(promoDoc.code)} sudah pernah digunakan pada email ini.`, 'warning');
                return;
            }
        }
    }
    
    const qty = isCustomEwallet ? 1 : (parseInt(document.getElementById('buy-qty').value) || 1);
    if (!isCustomEwallet && typeof availQuota === 'number' && availQuota < qty) {
        window.customAlert('Stok Tidak Cukup', `Sisa stok tersedia untuk variasi ini adalah ${availQuota}.`, 'warning');
        return;
    }
    
    const buyIdEl = document.getElementById('buy-id');
    const pidVal = buyIdEl ? buyIdEl.value.trim() : '';
    const zolVal = document.getElementById('buy-zone') ? document.getElementById('buy-zone').value.trim() : '';

    if (buyIdEl && !pidVal) {
        window.customAlert('Data Tujuan Kosong', 'Harap isi kolom Nomor / ID Tujuan terlebih dahulu.', 'warning');
        return;
    }

    const isPascaProduct = (selectedProductForBuy.processType === 'digiflazz_pasca' || currentCheckoutBrand.type === 'ppob');
    if (isPascaProduct && (!verifiedPascaInquiry || verifiedPascaInquiry.sku !== selectedProductForBuy.buyerSkuCode)) {
        // Cek tagihan gratis terlebih dahulu; setelah rincian tagihan muncul, tombol berubah menjadi "Bayar Tagihan Sekarang" (#14)
        await window.userCheckPascaBill();
        return;
    }

    // Hitung harga untuk ditampilkan di Konfirmasi Pesanan
    let unitPrice = getEffectiveUserVariantPrice(selectedProductForBuy);
    if (isCustomEwallet) {
        unitPrice = customEwAmount + Number(selectedProductForBuy.adminFeeNominal || 0);
    } else if (isPascaProduct && verifiedPascaInquiry && verifiedPascaInquiry.sku === selectedProductForBuy.buyerSkuCode) {
        unitPrice = Number(verifiedPascaInquiry.selling_price || verifiedPascaInquiry.price || unitPrice);
    }
    let rawTotal = unitPrice * qty;
    let discountPromo = 0;
    if (appliedPromo) {
        if (appliedPromo.type === 'percent') discountPromo = Math.round(rawTotal * (appliedPromo.amount / 100));
        else discountPromo = appliedPromo.amount;
        if (discountPromo > rawTotal) discountPromo = rawTotal;
    }
    let baseTotal = Math.max(0, rawTotal - discountPromo);

    if (paymentMethod === 'balance') {
        const savedUserPin = String(userProfile.trxPin || localStorage.getItem(`vipercell_trx_pin_${currentUser?.uid || ''}`) || '').trim();
        if (!savedUserPin || savedUserPin.length !== 6) {
            window.customAlert(
                'PIN Transaksi Belum Disetel',
                'Untuk keamanan saldo, silakan atur <b>6 Digit PIN Transaksi</b> terlebih dahulu di menu <b>Profil</b> sebelum membayar menggunakan Saldo Akun.',
                'warning',
                `<button class="btn btn-outline btn-sm" style="width:100%; margin-top:8px;" onclick="window.closeAlert(); window.switchMainTab('profil')"><i class="fa-solid fa-shield-halved"></i> Buka Pengaturan PIN di Profil</button>`
            );
            return;
        }
        const curBal = Math.round(Number(userProfile.balance || 0));
        if (curBal < baseTotal) {
            window.customAlert(
                'Saldo Akun Tidak Cukup',
                `Saldo kamu saat ini <b>Rp${curBal.toLocaleString('id-ID')}</b>, sedangkan total pembayaran <b>Rp${baseTotal.toLocaleString('id-ID')}</b>. Silakan isi saldo terlebih dahulu.`,
                'warning'
            );
            return;
        }
    }

    const inpType = selectedProductForBuy.inputType || currentCheckoutBrand.items[0]?.inputType || 'none';
    const checkIdSku = resolveBrandCheckIdSku(currentCheckoutBrand, selectedProductForBuy);
    const shouldShowConfirmCheckModal = Boolean(
        paymentMethod === 'balance' ||
        buyIdEl &&
        (
            currentCheckoutBrand.type === 'game' ||
            currentCheckoutBrand.type === 'pln' ||
            currentCheckoutBrand.type === 'ewallet' ||
            currentCheckoutBrand.type === 'pulsa' ||
            currentCheckoutBrand.type === 'ppob' ||
            selectedProductForBuy.autoCheckIdBeforePay ||
            currentCheckoutBrand.autoCheckIdBeforePay ||
            checkIdSku
        )
    );

    pendingConfirmedCheckoutPayload = {
        pidVal,
        zolVal,
        qty,
        unitPrice,
        baseTotal,
        discountPromo,
        emailInput,
        paymentMethod,
        isCustomEwallet,
        customEwAmount,
        isPascaProduct,
        inpType,
        checkIdSku,
        verifiedTargetName: ''
    };

    if (shouldShowConfirmCheckModal) {
        await window.openCheckoutConfirmWithAutoCheckId();
    } else {
        await window.confirmAndExecuteCheckout();
    }
};

// Pop-Up Konfirmasi Pesanan + Cek Username / Nama Pelanggan Otomatis Sebelum Bayar (#3, #9, #14)
window.openCheckoutConfirmWithAutoCheckId = async function() {
    if (!pendingConfirmedCheckoutPayload || !selectedProductForBuy || !currentCheckoutBrand) return;
    const p = pendingConfirmedCheckoutPayload;

    const prodEl = document.getElementById('chk-confirm-product');
    const varEl = document.getElementById('chk-confirm-variant');
    const targetEl = document.getElementById('chk-confirm-target');
    const userRow = document.getElementById('chk-confirm-username-row');
    const userEl = document.getElementById('chk-confirm-username');
    const extraRow = document.getElementById('chk-confirm-extra-row');
    const extraLbl = document.getElementById('chk-confirm-extra-label');
    const extraVal = document.getElementById('chk-confirm-extra-val');
    const payEl = document.getElementById('chk-confirm-paymethod');
    const totEl = document.getElementById('chk-confirm-total');
    const banner = document.getElementById('chk-confirm-checkid-banner');
    const bannerIcon = document.getElementById('chk-confirm-checkid-icon');
    const bannerTitle = document.getElementById('chk-confirm-checkid-title');
    const bannerSub = document.getElementById('chk-confirm-checkid-sub');
    const btnProceed = document.getElementById('btn-confirm-proceed-pay');

    const variantDisplay = p.isCustomEwallet
        ? `${selectedProductForBuy.name} (Rp${p.customEwAmount.toLocaleString('id-ID')})`
        : `${selectedProductForBuy.name}${p.qty > 1 ? ` (x${p.qty})` : ''}`;

    if (prodEl) prodEl.innerText = currentCheckoutBrand.brandName;
    if (varEl) varEl.innerText = variantDisplay;
    if (targetEl) targetEl.innerText = p.zolVal ? `${p.pidVal} (${p.zolVal})` : p.pidVal;
    if (payEl) payEl.innerText = p.paymentMethod === 'balance' ? 'SALDO AKUN' : (p.paymentMethod === 'cash' ? 'TUNAI (KASIR)' : 'QRIS OTOMATIS');
    if (totEl) totEl.innerText = `Rp${p.baseTotal.toLocaleString('id-ID')}`;
    if (extraRow) extraRow.style.display = 'none';

    const pinBoxEl = document.getElementById('chk-confirm-pin-box');
    const pinInpEl = document.getElementById('chk-confirm-trx-pin');
    if (pinBoxEl) {
        pinBoxEl.style.display = (p.paymentMethod === 'balance') ? 'block' : 'none';
    }
    if (pinInpEl) {
        pinInpEl.value = '';
    }
    window.openModal('modal-checkout-confirm');

    if (!p.pidVal) {
        if (userRow) userRow.style.display = 'none';
        if (banner) {
            banner.className = 'brutal-alert-box alert-info';
            if (bannerIcon) bannerIcon.className = 'fa-solid fa-shield-halved';
            if (bannerTitle) bannerTitle.innerText = 'Konfirmasi Pembayaran Saldo Akun';
            if (bannerSub) bannerSub.innerText = 'Masukkan 6 digit PIN Transaksi kamu di bawah untuk menyelesaikan pembelian.';
        }
        if (btnProceed) btnProceed.disabled = false;
        setTimeout(() => pinInpEl?.focus(), 120);
        return;
    }

    // Jika Pulsa Seluler, tampilkan Operator Seluler otomatis
    if (currentCheckoutBrand.type === 'pulsa' || p.inpType === 'phone') {
        const opName = detectCellularOperatorName(p.pidVal) || 'Operator Seluler';
        p.verifiedTargetName = opName;
        if (userRow) userRow.style.display = 'flex';
        if (userEl) {
            userEl.style.color = 'var(--primary)';
            userEl.innerText = opName;
        }
        if (banner) {
            banner.className = 'brutal-alert-box alert-info';
            if (bannerIcon) bannerIcon.className = 'fa-solid fa-signal';
            if (bannerTitle) bannerTitle.innerText = `Nomor Tujuan ${opName} Siap Diproses`;
            if (bannerSub) bannerSub.innerText = 'Pastikan nomor HP tujuan sudah benar sebelum membayar.';
        }
        if (btnProceed) btnProceed.disabled = false;
        return;
    }

    // Untuk Game, PLN, E-Wallet, dan Pascabayar: Jalankan Cek ID / Username Otomatis!
    if (userRow) userRow.style.display = 'flex';
    if (userEl) {
        userEl.style.color = 'var(--text-muted)';
        userEl.innerHTML = '<span class="checkid-shimmer-badge"><i class="fa-solid fa-spinner fa-spin"></i> Mengecek...</span>';
    }
    if (banner) {
        banner.className = 'brutal-alert-box alert-info';
        if (bannerIcon) bannerIcon.className = 'fa-solid fa-spinner fa-spin';
        if (bannerTitle) bannerTitle.innerText = 'Mengecek ID / Username Tujuan...';
        if (bannerSub) bannerSub.innerText = 'Menghubungi server untuk memverifikasi nama akun tujuan.';
    }
    if (btnProceed) {
        btnProceed.disabled = true;
        const isFreeCheckOnly = Boolean(selectedProductForBuy?.isCheckUsernameProduct === true || p.baseTotal === 0);
        btnProceed.innerHTML = isFreeCheckOnly
            ? '<i class="fa-solid fa-check-circle"></i> <span>Selesai Cek Username</span>'
            : '<i class="fa-solid fa-check-circle"></i> <span>Lanjut Bayar</span>';
    }

    try {
        if (currentCheckoutBrand.type === 'pln' || p.inpType === 'pln_token') {
            const username = (siteSettings.digiflazzUsername || 'username').trim();
            const sign = md5ClientDigiflazz(username + 'dev-apikey' + p.pidVal);
            const res = await callClientDigiflazzApi('/v1/inquiry-pln', {
                username: username,
                customer_no: p.pidVal,
                sign: sign
            });
            const d = res?.data || {};
            const realPlnName = String(d.name || d.customer_name || '').trim();
            if ((d.status === 'Sukses' || d.rc === '00') && realPlnName) {
                verifiedPlnSubscriber = d;
                p.verifiedTargetName = realPlnName;
                if (userEl) {
                    userEl.style.color = 'var(--success)';
                    userEl.innerText = p.verifiedTargetName;
                }
                if (extraRow && extraLbl && extraVal) {
                    extraRow.style.display = 'flex';
                    extraLbl.innerText = 'Tarif / Daya Listrik';
                    extraVal.innerText = d.segment_power || '-';
                }
                if (banner) {
                    banner.className = 'brutal-alert-box alert-info';
                    if (bannerIcon) bannerIcon.className = 'fa-solid fa-circle-check text-success';
                    if (bannerTitle) bannerTitle.innerText = 'ID Pelanggan PLN Ditemukan';
                    if (bannerSub) bannerSub.innerText = `Atas Nama: ${p.verifiedTargetName} (${d.segment_power || '-'})`;
                }
                if (btnProceed) btnProceed.disabled = false;
            } else {
                if (userEl) {
                    userEl.style.color = 'var(--danger)';
                    userEl.innerText = 'ID PLN Tidak Ditemukan';
                }
                if (banner) {
                    banner.className = 'brutal-alert-box alert-danger';
                    if (bannerIcon) bannerIcon.className = 'fa-solid fa-circle-xmark';
                    if (bannerTitle) bannerTitle.innerText = 'Nomor Meter / ID PLN Tidak Ditemukan';
                    if (bannerSub) bannerSub.innerText = d.message || 'Periksa kembali Nomor Meter / ID Pelanggan PLN Anda.';
                }
                if (btnProceed) btnProceed.disabled = true;
            }
            return;
        }

        if (p.isPascaProduct && verifiedPascaInquiry) {
            const realPascaName = String(verifiedPascaInquiry.customer_name || verifiedPascaInquiry.name || '').trim();
            p.verifiedTargetName = realPascaName || '-';
            if (userEl) {
                userEl.style.color = 'var(--success)';
                userEl.innerText = p.verifiedTargetName;
            }
            if (extraRow && extraLbl && extraVal) {
                extraRow.style.display = 'flex';
                extraLbl.innerText = 'Periode Tagihan';
                extraVal.innerText = verifiedPascaInquiry.periode || '-';
            }
            if (banner) {
                if (bannerIcon) bannerIcon.className = 'fa-solid fa-circle-check text-success';
                if (bannerTitle) bannerTitle.innerText = 'Tagihan Pelanggan Ditemukan';
                if (bannerSub) bannerSub.innerText = `Atas Nama: ${p.verifiedTargetName}`;
            }
            if (btnProceed) btnProceed.disabled = false;
            return;
        }

        const requireStrictCheck = Boolean(
            selectedProductForBuy?.isCheckUsernameProduct ||
            selectedProductForBuy?.autoCheckIdBeforePay ||
            currentCheckoutBrand?.autoCheckIdBeforePay ||
            currentCheckoutBrand?.type === 'ewallet' ||
            p.checkIdSku
        );

        // Cek Username Game / Nama Pengguna E-Wallet via /v1/check-id ke Digiflazz Bridge
        const res = await callClientDigiflazzApi('/v1/check-id', {
            sku: p.checkIdSku || selectedProductForBuy?.buyerSkuCode || '',
            buyer_sku_code: p.checkIdSku || selectedProductForBuy?.buyerSkuCode || '',
            brand: currentCheckoutBrand.brandName,
            type: currentCheckoutBrand.type,
            customer_no: p.pidVal,
            zone_id: p.zolVal || ''
        });
        const d = res?.data || {};
        const realUsername = String(d.name || d.username || d.customer_name || '').trim();
        if ((d.status === 'Sukses' || d.rc === '00') && realUsername) {
            p.verifiedTargetName = realUsername;
            if (currentCheckoutBrand.type === 'ewallet') {
                verifiedEwalletAccount = d;
            }
            if (userEl) {
                userEl.style.color = 'var(--success)';
                userEl.innerText = p.verifiedTargetName;
            }
            if (banner) {
                banner.className = 'brutal-alert-box alert-info';
                if (bannerIcon) bannerIcon.className = 'fa-solid fa-circle-check text-success';
                if (bannerTitle) bannerTitle.innerText = currentCheckoutBrand.type === 'ewallet' ? 'Nama Pengguna E-Wallet Ditemukan' : 'Username / ID Akun Ditemukan';
                if (bannerSub) bannerSub.innerText = `Atas Nama: ${p.verifiedTargetName}`;
            }
            if (btnProceed) btnProceed.disabled = false;
        } else {
            p.verifiedTargetName = '';
            if (userEl) {
                userEl.style.color = 'var(--danger)';
                userEl.innerText = 'Username Tidak Ditemukan';
            }
            if (banner) {
                banner.className = 'brutal-alert-box alert-danger';
                if (bannerIcon) bannerIcon.className = 'fa-solid fa-triangle-exclamation';
                if (bannerTitle) bannerTitle.innerText = 'Username / ID Tujuan Tidak Ditemukan';
                if (bannerSub) bannerSub.innerText = d.message || 'Pastikan ID / Nomor Tujuan benar atau SKU Cek Username sudah aktif di Digiflazz.';
            }
            if (btnProceed) btnProceed.disabled = requireStrictCheck ? true : false;
        }
    } catch (err) {
        p.verifiedTargetName = '';
        const errMsg = String(err?.message || 'Tidak dapat terhubung ke server pengecekan ID.');
        if (userEl) {
            userEl.style.color = 'var(--danger)';
            userEl.innerText = 'Gagal Mengecek ID';
        }
        if (banner) {
            banner.className = 'brutal-alert-box alert-danger';
            if (bannerIcon) bannerIcon.className = 'fa-solid fa-triangle-exclamation';
            if (bannerTitle) bannerTitle.innerText = 'Pengecekan ID Belum Berhasil';
            if (bannerSub) bannerSub.innerText = errMsg;
        }
        const isStrict = Boolean(selectedProductForBuy?.isCheckUsernameProduct || selectedProductForBuy?.autoCheckIdBeforePay || currentCheckoutBrand?.autoCheckIdBeforePay || currentCheckoutBrand?.type === 'pln' || currentCheckoutBrand?.type === 'ewallet');
        if (btnProceed) btnProceed.disabled = isStrict;
    }
};

window.confirmAndExecuteCheckout = async function() {
    if (isProcessingCheckout || !pendingConfirmedCheckoutPayload || !selectedProductForBuy) return;
    const p = pendingConfirmedCheckoutPayload;

    // Jika produk ini adalah Produk Cek Username Gratis (Rp 0), cukup tampilkan hasil cek tanpa membuat tagihan berbayar
    if (selectedProductForBuy.isCheckUsernameProduct === true || p.baseTotal === 0) {
        window.closeModal('modal-checkout-confirm');
        if (p.verifiedTargetName) {
            window.customAlert(
                'Username / ID Ditemukan',
                `ID Tujuan: <b>${escapeHtml(p.zolVal ? `${p.pidVal} (${p.zolVal})` : p.pidVal)}</b><br>Username / Atas Nama: <b style="color:var(--success);">${escapeHtml(p.verifiedTargetName)}</b>`,
                'success'
            );
        } else {
            window.showToast('Pengecekan Selesai', 'Silakan pilih nominal produk yang ingin dibeli.', 'info');
        }
        return;
    }

    if (p.paymentMethod === 'balance') {
        const savedUserPin = String(userProfile.trxPin || localStorage.getItem(`vipercell_trx_pin_${currentUser?.uid || ''}`) || '').trim();
        const enteredPin = (document.getElementById('chk-confirm-trx-pin')?.value || '').trim();
        if (!enteredPin || enteredPin !== savedUserPin) {
            window.customAlert('PIN Transaksi Salah', 'PIN Transaksi 6 digit yang kamu masukkan tidak sesuai.', 'error');
            return;
        }
    }

    window.closeModal('modal-checkout-confirm');

    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    await ensureAuthSession();
    const effectiveUid = isMember ? currentUser.uid : (boundLegacyGuestUid || currentUser?.uid || userProfile.uid || null);

    let playerInfo = '';
    if (p.pidVal) {
        const verifiedSuffix = p.verifiedTargetName ? ` (${p.verifiedTargetName})` : '';
        if (currentCheckoutBrand.type === 'app') playerInfo = `Tujuan: ${p.pidVal}`;
        else if (p.inpType === 'phone' || currentCheckoutBrand.type === 'pulsa') playerInfo = `No. HP: ${p.pidVal}${verifiedSuffix}`;
        else if (p.inpType === 'pln_token' || currentCheckoutBrand.type === 'pln') playerInfo = `ID PLN: ${p.pidVal}${verifiedSuffix}`;
        else if (p.inpType === 'ewallet_no' || currentCheckoutBrand.type === 'ewallet') playerInfo = `No. ${currentCheckoutBrand.brandName}: ${p.pidVal}${verifiedSuffix}`;
        else if (p.inpType === 'pasca_no' || currentCheckoutBrand.type === 'ppob') playerInfo = `No. Pelanggan: ${p.pidVal}${verifiedSuffix}`;
        else if (p.inpType === 'id_only') playerInfo = `ID: ${p.pidVal}${verifiedSuffix}`;
        else if (p.inpType === 'custom' || p.inpType === 'roblox') playerInfo = `Target: ${p.pidVal}`;
        else playerInfo = p.zolVal ? `ID: ${p.pidVal} | Zone: ${p.zolVal}${verifiedSuffix}` : `ID: ${p.pidVal}${verifiedSuffix}`;
    } else {
        playerInfo = currentCheckoutBrand.type === 'tools' ? 'Tools' : 'Aplikasi';
    }

    const now = Date.now();
    const paymentMethod = p.paymentMethod;

    const existingActiveOrder = orders.find(o => {
        const isSameUser = effectiveUid && o.userId === effectiveUid;
        const isStillActive = (o.status === 'UNPAID' || o.status === 'PENDING_PAYMENT') && (now - new Date(o.date).getTime() < 900000);
        const isSameItem = o.items && o.items[0] &&
                           o.items[0].productDbId === selectedProductForBuy.dbId &&
                           o.items[0].qty === p.qty &&
                           o.items[0].playerInfo === playerInfo &&
                           o.paymentMethod === paymentMethod;
        return isSameUser && isStillActive && isSameItem;
    });

    if (existingActiveOrder) {
        window.showToast('Tagihan Aktif', `Membuka tagihan #${existingActiveOrder.id}.`, 'info');
        window.resumePayment(existingActiveOrder.dbId);
        return;
    }

    isProcessingCheckout = true;
    const btnProc = document.getElementById('btn-process-buy');
    const ogHtml = btnProc ? btnProc.innerHTML : '';
    if (btnProc) {
        btnProc.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Memproses...</span>';
        btnProc.disabled = true;
    }

    saveActiveSessionContact(p.emailInput);

    let uniqueCode = 0;
    if (paymentMethod === 'qris' && p.baseTotal > 0) {
        uniqueCode = Math.floor(Math.random() * 250) + 1;
        let safetyTry = 0;
        while (orders.some(o => (o.status === 'UNPAID' || o.status === 'PENDING_PAYMENT') && o.finalTotal === (p.baseTotal + uniqueCode)) && safetyTry < 40) {
            uniqueCode = Math.floor(Math.random() * 450) + 1;
            safetyTry++;
        }
    }
    const finalTotal = p.baseTotal + uniqueCode;

    let invId = (p.isPascaProduct && verifiedPascaInquiry?.ref_id)
        ? verifiedPascaInquiry.ref_id
        : ('VP-' + Math.floor(100000 + Math.random() * 900000));
    while (!verifiedPascaInquiry?.ref_id && orders.some(o => o.id === invId)) {
        invId = 'VP-' + Math.floor(100000 + Math.random() * 900000);
    }

    const durationDays = parseInt(selectedProductForBuy.durationDays || 0, 10);
    const cleanDfCustNo = p.zolVal ? `${p.pidVal}${p.zolVal}` : p.pidVal;
    const itemDisplayName = p.isCustomEwallet
        ? `${currentCheckoutBrand.brandName} - Nominal Bebas Rp${p.customEwAmount.toLocaleString('id-ID')}`
        : `${currentCheckoutBrand.brandName} - ${selectedProductForBuy.name} (x${p.qty})`;

    const singleItem = { 
        cartId: now.toString(),
        productDbId: selectedProductForBuy.dbId,
        brandName: currentCheckoutBrand.brandName,
        exactItemName: selectedProductForBuy.name,
        name: itemDisplayName, 
        priceNum: p.unitPrice,
        customEwalletNominal: p.isCustomEwallet ? p.customEwAmount : 0,
        qty: p.qty,
        type: currentCheckoutBrand.type, 
        processType: selectedProductForBuy.processType || 'auto',
        isDigiflazz: Boolean(selectedProductForBuy.isDigiflazz || selectedProductForBuy.processType === 'digiflazz' || selectedProductForBuy.processType === 'digiflazz_pasca' || selectedProductForBuy.processType === 'ewallet_custom'),
        buyerSkuCode: selectedProductForBuy.buyerSkuCode || '',
        digiflazzModalPrice: p.isCustomEwallet ? p.customEwAmount : Number(selectedProductForBuy.digiflazzModalPrice || 0),
        stockMode: selectedProductForBuy.stockMode || 'PRIVATE',
        durationDays: durationDays,
        playerInfo: playerInfo 
    };

    const isPaidByBalance = (paymentMethod === 'balance' && isMember);

    const newOrder = {
        id: invId, 
        orderId: invId,
        isMemberPlusUser: isUserMemberPlusActive(),
        userEmail: p.emailInput,
        buyerEmail: p.emailInput,
        buyerName: userProfile.name || p.emailInput.split('@')[0],
        userPhone: '',
        userId: effectiveUid, 
        isAnonymousOrder: !isMember,
        deviceId: currentDeviceId,
        targetId: p.zolVal ? `${p.pidVal} (${p.zolVal})` : (p.pidVal || playerInfo),
        verifiedTargetName: p.verifiedTargetName || '',
        plnSubscriberName: verifiedPlnSubscriber?.name || '',
        plnSegmentPower: verifiedPlnSubscriber?.segment_power || '',
        customEwalletNominal: p.isCustomEwallet ? p.customEwAmount : 0,
        digiflazzRefId: invId,
        digiflazzSku: selectedProductForBuy.buyerSkuCode || '',
        digiflazzCustomerNo: cleanDfCustNo,
        digiflazzCommand: p.isPascaProduct ? 'pay-pasca' : 'topup',
        productName: currentCheckoutBrand.brandName,
        variantName: selectedProductForBuy.name,
        items: [singleItem],
        finalTotal: finalTotal,
        uniqueTotal: finalTotal,
        baseTotal: p.baseTotal,
        uniqueCode: uniqueCode,
        promoCode: appliedPromo ? appliedPromo.code : '',
        promoDiscount: p.discountPromo,
        durationDays: durationDays,
        status: isPaidByBalance ? 'SUCCESS' : 'UNPAID',
        paymentVerified: isPaidByBalance,
        paidAt: isPaidByBalance ? now : 0,
        paymentMethod: paymentMethod,
        adminReply: '',
        emailSent: false,
        emailReceiptEnabled: Boolean(isUserEmailReceiptEnabled),
        date: new Date(now).toISOString(),
        expiresAt: now + 900000
    };

    try {
        if (isPaidByBalance) {
            const userRef = doc(db, pathUsers, effectiveUid);
            await runTransaction(db, async (tx) => {
                const uSnap = await tx.get(userRef);
                const curBal = uSnap.exists() ? Math.round(Number(uSnap.data().balance || 0)) : 0;
                if (curBal < finalTotal) {
                    throw new Error('INSUFFICIENT_BALANCE');
                }
                const nextBal = curBal - finalTotal;
                tx.set(userRef, {
                    balance: nextBal,
                    balanceUpdatedAt: now
                }, { merge: true });
                userProfile.balance = nextBal;
            });
            window.updateUserWalletBalanceUI();

            await addDoc(collection(db, pathBalanceLogs), {
                uid: effectiveUid,
                userEmail: p.emailInput,
                type: 'PURCHASE',
                amount: -finalTotal,
                orderId: invId,
                note: `Pembelian ${singleItem.name}`,
                createdAt: now
            }).catch(() => {});
        }

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
            const lowerEm = p.emailInput.toLowerCase();
            localStorage.setItem(`vipercell_promo_used_${appliedPromo.code}_${lowerEm}`, '1');
            await updateDoc(doc(db, pathPromos, appliedPromo.dbId), {
                usedCount: increment(1),
                usedEmails: arrayUnion(lowerEm)
            }).catch(() => {});
        }
        
        if (isPaidByBalance) {
            const orderWithDbId = { ...newOrder, dbId: docRef.id };
            const autoSent = await tryAutoDeliverOrderFromVault(orderWithDbId, docRef.id);
            window.showPaymentSuccessAnimation(invId, autoSent ? 'SUCCESS' : 'PENDING');
        } else if (paymentMethod === 'qris') {
            setTimeout(() => window.openQRISModal(), 50);
        } else {
            setTimeout(() => window.openCashBarcodeModal(), 50);
        }
    } catch (e) { 
        window.customAlert("Gagal", "Gagal membuat pesanan, silakan coba lagi.", "error"); 
    } finally {
        setTimeout(() => {
            isProcessingCheckout = false;
            if (btnProc) {
                btnProc.innerHTML = ogHtml;
                btnProc.disabled = false;
            }
        }, 500);
    }
};

// ==========================================
// STRUK RINCIAN PESANAN MATANG & RAPI (#1)
// ==========================================
function buildQuickCopyCredentialButtons(rawReplyText) {
    if (!rawReplyText) return '';
    const lines = String(rawReplyText).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const extractedPairs = [];
    const emailOAuthBlocks = [];

    lines.forEach(line => {
        if (line.startsWith('[') && line.endsWith(']')) return;

        if (line.toUpperCase().startsWith('FORMAT_UTUH')) {
            const cIdx = line.indexOf(':');
            const rawPipe = cIdx > 0 ? line.substring(cIdx + 1).trim() : '';
            if (rawPipe) {
                emailOAuthBlocks.push({ rawPipe });
            }
            return;
        }

        if (line.toUpperCase().startsWith('LINK_AKSES')) {
            return;
        }

        if (line.includes('|') && line.split('|').length >= 4) {
            const segs = line.split('|').map(s => s.trim());
            const fourPart = `${segs[0]}|${segs[1]}|${segs[2]}|${segs[3]}`;
            emailOAuthBlocks.push({ rawPipe: fourPart });
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
            if (val && val !== '-' && !label.toLowerCase().includes('terima kasih') && !label.toUpperCase().includes('LINK_AKSES')) {
                extractedPairs.push({ label, val, isUrl: val.startsWith('http') });
            }
        } else if (line.includes('|')) {
            const parts = line.split('|').map(s => s.trim()).filter(Boolean);
            if (parts[0]) extractedPairs.push({ label: 'Email / ID', val: parts[0] });
            if (parts[1] && parts[1] !== '-') extractedPairs.push({ label: 'Password', val: parts[1] });
            if (parts[2] && parts[2] !== '-') extractedPairs.push({ label: 'Keterangan', val: parts[2] });
        }
    });

    let html = '';

    if (emailOAuthBlocks.length > 0) {
        emailOAuthBlocks.forEach((blk, bIdx) => {
            const safePipeJs = escapeJsStr(blk.rawPipe);
            html += `
            <div class="email-oauth-vault-box">
                <div class="email-oauth-head">
                    <span class="brutal-tag tag-amber">FORMAT EMAIL ${emailOAuthBlocks.length > 1 ? '#' + (bIdx + 1) : ''}</span>
                </div>
                <div class="raw-pipe-code">${escapeHtml(blk.rawPipe)}</div>
                <div class="email-oauth-actions">
                    <button type="button" class="btn btn-primary btn-sm" style="width:100%;" onclick="window.copyRawPipeFormat('${safePipeJs}')">
                        <i class="fa-regular fa-copy"></i> Salin Format Utuh
                    </button>
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
                       <a href="${escapeHtml(pair.val)}" target="_blank" rel="noopener noreferrer" class="btn btn-warning btn-sm" style="padding:4px 10px; min-height:28px; font-size:0.72rem;">
                           Buka
                       </a>
                       <button type="button" class="btn btn-primary btn-sm" style="padding:4px 10px; min-height:28px; font-size:0.72rem;" onclick="window.copyCredentialPart('${safeVal}', '${safeLbl}')">
                           <i class="fa-regular fa-copy"></i>
                       </button>
                   </div>`
                : `<button type="button" class="btn btn-primary btn-sm" style="padding:4px 10px; min-height:28px; font-size:0.72rem;" onclick="window.copyCredentialPart('${safeVal}', '${safeLbl}')">
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

window.copyRawPipeFormat = function(rawPipeStr) {
    if (!rawPipeStr) return;
    navigator.clipboard.writeText(rawPipeStr).then(() => {
        window.showToast('Disalin', 'Format email berhasil disalin.', 'success');
    });
};

window.copyCredentialPart = function(val, label) {
    if (!val) return;
    navigator.clipboard.writeText(val).then(() => {
        window.showToast(`${label} Disalin`, `${val} disalin.`, 'success');
    });
};

window.copyAccountReplyText = function(invId) {
    const order = orders.find(o => o.id === invId);
    if (!order || !order.adminReply) return;
    navigator.clipboard.writeText(order.adminReply).then(() => {
        window.showToast('Disalin', 'Seluruh detail pesanan berhasil disalin.', 'success');
    });
};

function generateHelpButtons(invId, orderStatus, item) {
    let actionBtn = '';
    if (orderStatus === 'PENDING') {
        const msg = `Halo Admin, pembayaran untuk pesanan #${invId} sudah diterima. Mohon bantuannya untuk memproses pesanan saya.`;
        actionBtn = `<button class="btn btn-primary" style="width:100%;" onclick="window.sendPredefinedChat('${escapeJsStr(msg)}')"><i class="fa-solid fa-comments"></i> Hubungi Admin</button>`;
    } else if (orderStatus === 'SUCCESS') {
        const msg = `Halo Admin, saya butuh bantuan untuk pesanan #${invId}.`;
        actionBtn = `<button class="btn btn-outline" style="width:100%;" onclick="window.sendPredefinedChat('${escapeJsStr(msg)}')"><i class="fa-solid fa-headset"></i> Bantuan Pesanan</button>`;
    } else if (orderStatus === 'EXPIRED' || orderStatus === 'FAILED') {
        const msg = `Halo Admin, saya butuh bantuan terkait pesanan #${invId}.`;
        actionBtn = `<button class="btn btn-outline" style="width:100%;" onclick="window.sendPredefinedChat('${escapeJsStr(msg)}')"><i class="fa-solid fa-headset"></i> Hubungi Admin</button>`;
    }
    
    if (!actionBtn) return '';
    return `
    <div style="margin-top: 0.9rem; padding-top: 0.9rem; border-top: 1.5px dashed var(--border-subtle);">
        ${actionBtn}
    </div>`;
}

function hasOrderBeenReviewed(order) {
    if (!order) return true;
    return reviewsData.some(r => r.orderId && r.orderId === order.id);
}

// Struk Rincian Pesanan Lebih Rapi & Matang dengan 3 Status Utama (#1)
function parsePlnTokenFromOrder(order) {
    if (!order) return null;
    if (order.plnTokenNumber) {
        return {
            token: order.plnTokenNumber,
            subscriberName: order.plnSubscriberName || order.verifiedTargetName || '-',
            segmentPower: order.plnSegmentPower || '-',
            kwh: order.plnKwh || '-'
        };
    }
    const item = order.items && order.items[0] ? order.items[0] : {};
    const isPlnOrder = item.type === 'pln' || item.inputType === 'pln_token' || String(order.digiflazzSku || item.buyerSkuCode || '').toLowerCase().includes('pln') || String(item.name || '').toUpperCase().includes('PLN');
    const rawSn = String(order.digiflazzSn || '').trim();
    if (rawSn && rawSn.includes('/')) {
        const parts = rawSn.split('/').map(s => s.trim()).filter(Boolean);
        const digitsOnly = (parts[0] || '').replace(/[^0-9]/g, '');
        if (digitsOnly.length >= 16 || isPlnOrder) {
            return {
                token: parts[0] || rawSn,
                subscriberName: parts[1] || order.plnSubscriberName || order.verifiedTargetName || '-',
                segmentPower: parts.slice(2, 4).join(' / ') || order.plnSegmentPower || '-',
                kwh: parts[4] || order.plnKwh || '-'
            };
        }
    }
    return null;
}

function buildFullReceiptHTML(order) {
    const isCashUnpaid = (order.paymentMethod === 'cash' && order.status === 'PENDING' && !order.paymentVerified);
    const isUnpaid = order.status === 'UNPAID' || order.status === 'PENDING_PAYMENT' || isCashUnpaid;
    const isPendingAdmin = (order.status === 'PENDING' && !isCashUnpaid) || (order.status === 'SUCCESS' && !order.adminReply);
    const isDeliveredSuccess = (order.status === 'SUCCESS' && Boolean(order.adminReply));
    const isCancelled = order.status === 'CANCELLED';
    const isFailed = order.status === 'FAILED' || order.status === 'EXPIRED' || isCancelled;

    let sBadge = 'status-unpaid';
    let sName = 'MENUNGGU PEMBAYARAN';
    let heroClass = 'hero-unpaid';
    let heroIcon = 'fa-hourglass-half';
    let heroTitle = 'Menunggu Pembayaran';
    let heroDesc = order.paymentMethod === 'cash'
        ? 'Tunjukkan tiket barcode tunai kepada kasir untuk menyelesaikan pembayaran.'
        : 'Selesaikan pembayaran sesuai nominal tepat agar pesanan segera diproses.';

    if (isDeliveredSuccess) {
        sBadge = 'status-success';
        sName = 'TERKIRIM & SELESAI';
        heroClass = 'hero-success';
        heroIcon = 'fa-circle-check';
        heroTitle = 'Transaksi Berhasil & Selesai';
        heroDesc = 'Pembayaran telah diterima dan rincian pesanan sudah tersedia di bawah ini.';
    } else if (isPendingAdmin) {
        sBadge = 'status-pending';
        sName = 'SEDANG DIPROSES';
        heroClass = 'hero-pending';
        heroIcon = 'fa-user-clock';
        heroTitle = 'Pembayaran Diterima — Pesanan Sedang Diproses';
        heroDesc = 'Pembayaran kamu sudah diterima dan pesanan sedang diproses.';
    } else if (isCancelled) {
        sBadge = 'status-cancelled';
        sName = 'DIBATALKAN';
        heroClass = 'hero-failed';
        heroIcon = 'fa-ban';
        heroTitle = 'Pesanan Dibatalkan';
        heroDesc = 'Tagihan pesanan ini telah dibatalkan.';
    } else if (isFailed) {
        sBadge = 'status-failed';
        sName = order.status === 'EXPIRED' ? 'WAKTU HABIS' : 'GAGAL';
        heroClass = 'hero-failed';
        heroIcon = 'fa-circle-xmark';
        heroTitle = order.status === 'EXPIRED' ? 'Batas Waktu Pembayaran Habis' : 'Pesanan Gagal';
        heroDesc = order.balanceRefunded
            ? 'Transaksi gagal dan dana telah dikembalikan otomatis ke Saldo Akun kamu.'
            : 'Silakan buat pesanan baru atau hubungi Admin jika membutuhkan bantuan.';
    }
    
    const brandName = order.items[0]?.brandName || '';
    const safeJsBrand = escapeJsStr(brandName);

    const step2Class = (isDeliveredSuccess || isPendingAdmin) ? 'done' : (isFailed ? 'failed' : 'active');
    const step3Class = isDeliveredSuccess ? 'done' : (isPendingAdmin ? 'active' : '');

    let actionHtml = '';
    if (isUnpaid) {
        if (order.paymentMethod === 'cash') {
            actionHtml = `
            <div class="ereceipt-action-grid">
                <button class="btn btn-warning" onclick="window.resumePayment('${order.dbId}')">
                    <i class="fa-solid fa-barcode"></i> Buka Barcode Tunai
                </button>
                <button class="btn btn-danger" onclick="window.cancelActiveOrder('${order.dbId}')">
                    <i class="fa-solid fa-ban"></i> Batalkan
                </button>
            </div>`;
        } else {
            actionHtml = `
            <div class="ereceipt-action-grid">
                <button class="btn btn-primary" onclick="window.resumePayment('${order.dbId}')">
                    <i class="fa-solid fa-qrcode"></i> Lanjut Bayar QRIS
                </button>
                <button class="btn btn-danger" onclick="window.cancelActiveOrder('${order.dbId}')">
                    <i class="fa-solid fa-ban"></i> Batalkan
                </button>
            </div>`;
        }
    } else if (isCancelled || order.status === 'EXPIRED' || order.status === 'FAILED') {
        if (brandName) {
            actionHtml = `<button class="btn btn-primary" style="width:100%; margin-top:0.9rem;" onclick="window.closeModal('modal-order-detail'); window.openDirectBuyModal('${safeJsBrand}')"><i class="fa-solid fa-rotate-right"></i> Pesan Ulang Produk Ini</button>`;
        }
    } else if (isDeliveredSuccess) {
        const alreadyReviewed = hasOrderBeenReviewed(order);
        if (!alreadyReviewed && brandName) {
            actionHtml = `
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:8px; margin-top:0.9rem;">
                    <button class="btn btn-warning btn-sm" onclick="window.goToReview('${safeJsBrand}', '${order.id}')"><i class="fa-solid fa-star"></i> Beri Ulasan</button>
                    <button class="btn btn-primary btn-sm" onclick="window.shareOrderReceipt('${escapeJsStr(order.id)}')"><i class="fa-solid fa-share-nodes"></i> Bagikan Struk</button>
                    <button class="btn btn-outline btn-sm" onclick="window.downloadOrderReceiptImage('${escapeJsStr(order.id)}')"><i class="fa-solid fa-download"></i> Unduh Struk</button>
                </div>`;
        } else {
            actionHtml = `
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:8px; margin-top:0.9rem;">
                    <button class="btn btn-primary btn-sm" onclick="window.shareOrderReceipt('${escapeJsStr(order.id)}')"><i class="fa-solid fa-share-nodes"></i> Bagikan Struk</button>
                    <button class="btn btn-outline btn-sm" onclick="window.downloadOrderReceiptImage('${escapeJsStr(order.id)}')"><i class="fa-solid fa-download"></i> Unduh Struk</button>
                </div>`;
        }
    }

    let durationReceiptHtml = '';
    const durDays = order.durationDays || order.items[0]?.durationDays || 0;
    if (durDays > 0 && (isDeliveredSuccess || isPendingAdmin)) {
        const endMs = order.subscriptionEndAt || (new Date(order.date).getTime() + durDays * 86400000);
        durationReceiptHtml = `
            <div style="margin-top:8px; padding-top:8px; border-top:1.5px dashed var(--border-subtle); font-size:0.75rem; font-weight:800; color:var(--primary); display:flex; justify-content:space-between; flex-wrap:wrap;">
                <span><i class="fa-regular fa-clock"></i> Masa Aktif: ${durDays} Hari</span>
                <span>Berakhir: ${new Date(endMs).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' })}</span>
            </div>`;
    }

    // Kartu Khusus Token Listrik PLN 20 Digit (#9)
    let plnCardHtml = '';
    const parsedPln = isDeliveredSuccess ? parsePlnTokenFromOrder(order) : null;
    if (parsedPln && parsedPln.token) {
        const safeTokenJs = escapeJsStr(parsedPln.token);
        plnCardHtml = `
        <div class="pln-token-highlight-card">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                <span style="font-size:0.75rem; font-weight:900; color:var(--text); display:flex; align-items:center; gap:6px;">
                    <i class="fa-solid fa-bolt text-warning"></i> TOKEN LISTRIK PLN PRABAYAR
                </span>
                <span class="status-badge status-success" style="font-size:0.6rem;">RESMI</span>
            </div>
            <div class="pln-token-digits-box">${escapeHtml(parsedPln.token)}</div>
            <div class="pln-token-meta-grid">
                <div>
                    <span>ID PELANGGAN / METER</span>
                    <strong>${escapeHtml(order.digiflazzCustomerNo || order.targetId || '-')}</strong>
                </div>
                <div>
                    <span>NAMA PELANGGAN</span>
                    <strong>${escapeHtml(parsedPln.subscriberName || '-')}</strong>
                </div>
                <div>
                    <span>TARIF / DAYA</span>
                    <strong>${escapeHtml(parsedPln.segmentPower || '-')}</strong>
                </div>
                <div>
                    <span>JUMLAH KWH</span>
                    <strong>${escapeHtml(parsedPln.kwh || '-')}</strong>
                </div>
            </div>
            <button type="button" class="btn btn-primary btn-sm" style="width:100%;" onclick="window.copyCredentialPart('${safeTokenJs}', 'Nomor Token PLN')">
                <i class="fa-regular fa-copy"></i> Salin Nomor Token PLN
            </button>
        </div>`;
    }
    
    let replyHtml = '';
    if (isDeliveredSuccess && order.adminReply) {
        const quickCopyButtonsHtml = buildQuickCopyCredentialButtons(order.adminReply);
        replyHtml = `
        ${plnCardHtml}
        <div class="ereceipt-cred-vault">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                <span style="font-weight: 900; color: var(--success); font-size: 0.82rem; display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-receipt"></i> BUKTI &amp; RINCIAN PESANAN:
                </span>
                <button class="btn btn-outline btn-sm" style="padding:3px 10px; min-height:28px; font-size:0.7rem;" onclick="window.copyAccountReplyText('${escapeJsStr(order.id)}')">
                    <i class="fa-regular fa-copy"></i> Salin Semua
                </button>
            </div>
            ${quickCopyButtonsHtml}
            <div class="ereceipt-cred-content">${escapeHtml(order.adminReply)}</div>
        </div>`;
    }
    
    const helpHtml = generateHelpButtons(order.id, isPendingAdmin ? 'PENDING' : order.status, order.items[0]);

    const storeBrandFirst = escapeHtml(siteSettings.logoText || 'VIPER');
    const storeBrandSecond = escapeHtml(siteSettings.logoAccent || 'CELL');
    const storeLogoSrc = siteSettings.logoImgBase64 || siteSettings.pwaIconBase64 || DEFAULT_VIPERCELL_SVG_ICON;

    return `
    <div class="ereceipt-ticket" id="ereceipt-capture-card-${escapeHtml(order.id)}">
        <div class="ereceipt-brand-header">
            <div class="ereceipt-brand-identity">
                <img src="${storeLogoSrc}" alt="Logo" class="ereceipt-brand-logo">
                <div>
                    <div class="ereceipt-brand-title">${storeBrandFirst}<span>${storeBrandSecond}</span></div>
                    <small style="font-size:0.65rem; font-weight:700; color:#cbd5e1; display:block;">BUKTI TRANSAKSI RESMI</small>
                </div>
            </div>
            <button type="button" data-html2canvas-ignore="true" class="btn btn-warning btn-sm" style="padding:4px 10px; font-size:0.72rem;" onclick="window.shareOrderReceipt('${escapeJsStr(order.id)}')">
                <i class="fa-solid fa-share-nodes"></i> Bagikan Struk
            </button>
        </div>
        <div class="ereceipt-top-banner">
            <div>
                <span style="font-size:0.65rem; font-weight:900; color:var(--text-muted); display:block; letter-spacing:0.04em;">NOMOR INVOICE</span>
                <div class="ereceipt-inv-code">
                    <span>#${escapeHtml(order.id)}</span>
                    <button class="mini-copy-btn" onclick="navigator.clipboard.writeText('${escapeJsStr(order.id)}'); window.showToast('Disalin','Nomor Invoice berhasil disalin','success');" title="Salin ID"><i class="fa-regular fa-copy"></i></button>
                </div>
            </div>
            <span class="status-badge ${sBadge}">${sName}</span>
        </div>

        <div class="ereceipt-status-hero ${heroClass}">
            <div class="ereceipt-status-hero-icon">
                <i class="fa-solid ${heroIcon}"></i>
            </div>
            <div class="ereceipt-status-hero-text">
                <strong>${escapeHtml(heroTitle)}</strong>
                <span>${escapeHtml(heroDesc)}</span>
            </div>
        </div>

        <div class="ereceipt-stepper">
            <div class="estep-item done">
                <div class="estep-dot"><i class="fa-solid fa-check"></i></div>
                <span class="estep-label">1. Pesanan</span>
            </div>
            <div class="estep-item ${step2Class}">
                <div class="estep-dot"><i class="fa-solid ${isFailed ? 'fa-xmark' : ((isDeliveredSuccess || isPendingAdmin) ? 'fa-check' : (order.paymentMethod === 'cash' ? 'fa-barcode' : 'fa-qrcode'))}"></i></div>
                <span class="estep-label">2. Pembayaran</span>
            </div>
            <div class="estep-item ${step3Class}">
                <div class="estep-dot"><i class="fa-solid ${isDeliveredSuccess ? 'fa-check' : 'fa-box-open'}"></i></div>
                <span class="estep-label">3. ${isPendingAdmin ? 'Diproses' : 'Selesai'}</span>
            </div>
        </div>

        <div class="ereceipt-body">
            <div class="ereceipt-meta-grid">
                <div class="ereceipt-meta-cell">
                    <span>WAKTU TRANSAKSI</span>
                    <strong>${new Date(order.date).toLocaleString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</strong>
                </div>
                <div class="ereceipt-meta-cell">
                    <span>METODE BAYAR</span>
                    <strong>${order.paymentMethod === 'cash' ? 'TUNAI (KASIR)' : (order.paymentMethod === 'balance' ? 'SALDO AKUN' : 'QRIS OTOMATIS')}</strong>
                </div>
                ${order.verifiedTargetName ? `
                <div class="ereceipt-meta-cell">
                    <span>ATAS NAMA / NICKNAME</span>
                    <strong style="color:var(--success);">${escapeHtml(order.verifiedTargetName)}</strong>
                </div>` : ''}
                ${order.digiflazzSn ? `
                <div class="ereceipt-meta-cell">
                    <span>SN / REFERENSI</span>
                    <strong class="code-mono">${escapeHtml(order.digiflazzSn)}</strong>
                </div>` : ''}
                <div class="ereceipt-meta-cell" style="grid-column: 1 / -1;">
                    <span>EMAIL PEMBELI</span>
                    <strong>${escapeHtml(order.userEmail || '-')}</strong>
                </div>
            </div>

            <div class="ereceipt-product-box">
                <span style="font-size:0.65rem; font-weight:900; color:var(--text-muted); display:block; margin-bottom:2px;">RINCIAN PRODUK</span>
                ${order.items.map(i => `<div style="font-weight: 900; font-size: 0.96rem; color: var(--text);">${escapeHtml(i.name)}</div>`).join('')}
                <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); margin-top:4px;">${escapeHtml(order.items[0]?.playerInfo || '')}</div>
                ${durationReceiptHtml}
            </div>
            ${replyHtml}
        </div>

        <div class="ereceipt-footer">
            <div class="receipt-row">
                <span style="color:var(--text-muted);">Harga Produk</span>
                <span>Rp${(order.baseTotal + (order.promoDiscount || 0)).toLocaleString('id-ID')}</span>
            </div>
            ${order.promoDiscount > 0 ? `
            <div class="receipt-row">
                <span style="color:var(--success);">Diskon Promo (${escapeHtml(order.promoCode)})</span>
                <span style="color:var(--success);">-Rp${order.promoDiscount.toLocaleString('id-ID')}</span>
            </div>` : ''}
            ${order.uniqueCode > 0 ? `
            <div class="receipt-row">
                <span style="color:var(--warning);">Kode Unik QRIS</span>
                <span style="color:var(--warning);">+Rp${order.uniqueCode}</span>
            </div>` : ''}
            <div class="receipt-row" style="margin-top: 8px; padding-top: 8px; border-top: 2px solid var(--border);">
                <strong style="font-size: 0.92rem; font-weight: 900; color: var(--text);">TOTAL PEMBAYARAN</strong>
                <strong style="font-size: 1.2rem; font-weight: 900; color: var(--primary);">Rp${order.finalTotal.toLocaleString('id-ID')}</strong>
            </div>
            ${actionHtml}
            ${helpHtml}
        </div>
    </div>`;
}

function buildCompactOrderItemHTML(order) {
    const isCashUnpaid = (order.paymentMethod === 'cash' && order.status === 'PENDING' && !order.paymentVerified);
    const isUnpaid = order.status === 'UNPAID' || order.status === 'PENDING_PAYMENT' || isCashUnpaid;
    const isPendingAdmin = (order.status === 'PENDING' && !isCashUnpaid) || (order.status === 'SUCCESS' && !order.adminReply);
    const isCancelled = order.status === 'CANCELLED';
    const isFailed = order.status === 'FAILED' || order.status === 'EXPIRED' || isCancelled;

    let sBadge = 'status-unpaid';
    let sName = 'MENUNGGU BAYAR';

    if (isPendingAdmin) {
        sBadge = 'status-pending';
        sName = 'DIPROSES ADMIN';
    } else if (isCancelled) {
        sBadge = 'status-cancelled';
        sName = 'DIBATALKAN';
    } else if (isFailed) {
        sBadge = 'status-failed';
        sName = order.status === 'EXPIRED' ? 'WAKTU HABIS' : 'GAGAL';
    } else if (!isUnpaid) {
        sBadge = 'status-success';
        sName = 'TERKIRIM & SELESAI';
    }
    
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
                    <span class="status-badge ${sBadge}" style="font-size:0.6rem; padding:2px 7px;">${sName}</span>
                    <span class="order-compact-date">${new Date(order.date).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                </div>
                <div class="order-compact-title">${escapeHtml(item.name || 'Pesanan Vipercell')}</div>
                <div class="order-compact-sub">${escapeHtml(item.playerInfo || '')}</div>
            </div>
        </div>
        <div class="order-compact-right">
            <span class="order-compact-price">Rp${(order.finalTotal || 0).toLocaleString('id-ID')}</span>
            <span class="order-tap-hint">Rincian <i class="fa-solid fa-chevron-right"></i></span>
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
    window.showToast('Diperbarui', 'Daftar pesanan telah diperbarui.', 'info');
};

window.trackOrder = async function() {
    const trackInp = document.getElementById('track-id');
    if (!trackInp) return;
    const invId = trackInp.value.trim().replace(/^#/, '').toUpperCase();
    trackInp.value = invId;

    if (!invId) {
        window.customAlert('ID Kosong', 'Masukkan Nomor ID Transaksi (contoh: VP-123456).', 'warning');
        return;
    }

    const resBox = document.getElementById('track-result');
    let order = orders.find(o => (o.id || '').toUpperCase() === invId);

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
            resBox.innerHTML = `<div class="brutal-alert-box alert-danger"><i class="fa-solid fa-circle-xmark"></i> <span>ID Transaksi <b>#${escapeHtml(invId)}</b> tidak ditemukan.</span></div>`;
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
            return Boolean(effectiveUid && o.userId === effectiveUid);
        }
    });

    if (currentUserHistoryFilter !== 'ALL') {
        userOrders = userOrders.filter(o => {
            const isCashUnpaid = (o.paymentMethod === 'cash' && o.status === 'PENDING' && !o.paymentVerified);
            const isPendingAdmin = (o.status === 'PENDING' && !isCashUnpaid) || (o.status === 'SUCCESS' && !o.adminReply);
            if (currentUserHistoryFilter === 'UNPAID') return o.status === 'UNPAID' || o.status === 'PENDING_PAYMENT' || isCashUnpaid;
            if (currentUserHistoryFilter === 'PENDING') return isPendingAdmin;
            if (currentUserHistoryFilter === 'SUCCESS') return o.status === 'SUCCESS' && Boolean(o.adminReply);
            if (currentUserHistoryFilter === 'FAILED') return o.status === 'FAILED' || o.status === 'EXPIRED' || o.status === 'CANCELLED';
            return o.status === currentUserHistoryFilter;
        });
    }
    
    if (userOrders.length === 0) {
        grid.innerHTML = `<div class="brutal-empty-box">Belum ada riwayat pesanan pada kategori ini.</div>`;
        return;
    }
    
    let html = '';
    userOrders.slice(0, 50).forEach((o) => {
        html += buildCompactOrderItemHTML(o);
    });
    grid.innerHTML = html;
};

// ==========================================
// SUB-TAB TERPISAH: CHAT BANTUAN VS SARAN PRODUK (#14)
// ==========================================
window.switchBantuanSubTab = function(subTab) {
    currentBantuanSubTab = subTab === 'saran' ? 'saran' : 'chat';
    const btnChat = document.getElementById('subtab-btn-chat');
    const btnSaran = document.getElementById('subtab-btn-saran');
    const panelChat = document.getElementById('bantuan-panel-chat');
    const panelSaran = document.getElementById('bantuan-panel-saran');

    if (btnChat) btnChat.classList.toggle('active', currentBantuanSubTab === 'chat');
    if (btnSaran) btnSaran.classList.toggle('active', currentBantuanSubTab === 'saran');

    if (panelChat && panelSaran) {
        if (currentBantuanSubTab === 'chat') {
            panelSaran.style.display = 'none';
            panelChat.style.display = 'block';
            checkChatUserState();
        } else {
            panelChat.style.display = 'none';
            panelSaran.style.display = 'block';
            const senderInp = document.getElementById('suggest-sender-name');
            if (senderInp && !senderInp.value && userProfile.name) {
                senderInp.value = userProfile.name;
            }
        }
    }
};

window.submitProductSuggestion = async function() {
    if (isSubmittingSuggestion) return;

    const senderName = (document.getElementById('suggest-sender-name')?.value || userProfile.name || 'Pelanggan').trim();
    const productName = (document.getElementById('suggest-product-name')?.value || '').trim();
    const category = (document.getElementById('suggest-product-category')?.value || 'Aplikasi').trim();
    const notes = (document.getElementById('suggest-product-notes')?.value || '').trim();

    if (!productName) {
        window.customAlert('Nama Produk Kosong', 'Masukkan nama produk atau layanan yang ingin kamu usulkan.', 'warning');
        return;
    }

    isSubmittingSuggestion = true;
    const btn = document.getElementById('btn-submit-suggestion');
    const ogHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Mengirim Saran...</span>';
    }

    try {
        await ensureAuthSession();
        const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
        const effectiveUid = isMember ? currentUser.uid : (boundLegacyGuestUid || currentUser?.uid || 'guest');
        const nowMs = Date.now();
        const suggestionId = `saran_${nowMs}_${Math.floor(100 + Math.random() * 899)}`;

        const suggestionPayload = {
            id: suggestionId,
            dbId: suggestionId,
            senderName: senderName || 'Pelanggan',
            senderEmail: getActiveSessionStorageEmail() || '',
            userId: effectiveUid,
            isMember: isMember,
            productName: productName,
            category: category,
            notes: notes,
            isProductSuggestion: true,
            createdAt: nowMs
        };

        // Simpan khusus ke koleksi Saran Produk (product_suggestions) & daftar saran di settings/mainConfig
        // TANPA menulis ke koleksi chats agar tidak pernah masuk ke tab Chat Bantuan Admin (#3)
        let savedSuccess = false;

        try {
            await setDoc(doc(db, pathSuggestions, suggestionId), suggestionPayload);
            savedSuccess = true;
        } catch (primaryErr) {
            console.warn("Primary suggestion write fallback:", primaryErr);
        }

        try {
            await setDoc(doc(db, pathSettings, 'mainConfig'), {
                suggestionsList: arrayUnion(suggestionPayload)
            }, { merge: true });
            savedSuccess = true;
        } catch (settingsFallbackErr) {}



        if (!savedSuccess) {
            throw new Error('ALL_SUGGESTION_CHANNELS_FAILED');
        }

        const prodInp = document.getElementById('suggest-product-name');
        const notesInp = document.getElementById('suggest-product-notes');
        if (prodInp) prodInp.value = '';
        if (notesInp) notesInp.value = '';

        window.showToast('Saran Terkirim', `Terima kasih! Usulan "${productName}" telah diterima Admin.`, 'success');
    } catch (err) {
        window.customAlert('Gagal Mengirim', 'Pastikan koneksi internet kamu aktif dan coba lagi.', 'error');
    } finally {
        isSubmittingSuggestion = false;
        if (btn && ogHtml) {
            btn.disabled = false;
            btn.innerHTML = ogHtml;
        }
    }
};

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
    const userLabel = document.getElementById('chat-current-user-label');

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
        window.customAlert('Nama Diperlukan', 'Masukkan nama panggilan kamu terlebih dahulu.', 'warning');
        return;
    }
    
    const btn = document.getElementById('btn-start-chat');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Membuka...</span>';
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
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span>Mulai Chat</span>';
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
            const isBantuanOpen = activeTab && activeTab.id === 'tab-bantuan' && currentBantuanSubTab === 'chat';

            if (oldLen > 0 && userChatMessages.length > oldLen && lastMsg && lastMsg.sender === 'admin') {
                sendNativeNotification('Pesan Baru dari Admin', lastMsg.text);
                if (!isBantuanOpen) {
                    window.showToast('Pesan Admin', lastMsg.text, 'info', () => {
                        window.switchMainTab('bantuan');
                        window.switchBantuanSubTab('chat');
                    });
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
                <div style="width:52px; height:52px; border-radius:14px; background:var(--surface); border:var(--brutal-border); display:flex; align-items:center; justify-content:center; font-size:1.4rem; color:var(--primary); margin-bottom:10px;">
                    <i class="fa-solid fa-comments"></i>
                </div>
                <strong style="color:var(--text); font-size:0.95rem; font-weight:800;">Belum ada pesan</strong>
                <small style="margin-top:4px; font-weight:600;">Tulis pesan di bawah untuk menghubungi Admin.</small>
            </div>`;
        return;
    }
    
    let html = '';
    userChatMessages.forEach(msg => {
        const isUser = msg.sender === 'user';
        const msgClass = isUser ? 'user' : 'admin';
        const senderLabel = isUser
            ? `<span class="chat-sender-label">${escapeHtml(userProfile.name || 'Kamu')}</span>`
            : `<span class="chat-sender-label" style="color:var(--primary-light);">Admin</span>`;

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
    if (body) setTimeout(() => { body.scrollTop = body.scrollHeight; }, 60);
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
            : (localStorage.getItem('vipercell_anon_name') || (userProfile.isGuest ? 'Tamu' : (currentUser?.email || 'Pelanggan')));

        await setDoc(chatRef, {
            uid: chatId,
            userInfo: displayName,
            userEmail: getActiveSessionStorageEmail(),
            isMemberPlusUser: isUserMemberPlusActive(),
            deviceId: currentDeviceId,
            updatedAt: msgTimestamp,
            messages: arrayUnion(newMsg)
        }, { merge: true });

        scrollToBottomUserChat();
    } catch (e) {
        input.value = text;
        window.customAlert('Gagal Mengirim', 'Periksa koneksi internet kamu dan coba lagi.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = ogBtnHtml;
    }
};

// ==========================================
// TEMA, NOTIFIKASI POP-UP MATANG (#13) & TRANSISI HALUS (#15)
// ==========================================
window.toggleTheme = function() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('vipercell_theme', newTheme);
    
    const metaTheme = document.getElementById('meta-theme-color');
    if (metaTheme) metaTheme.setAttribute('content', newTheme === 'dark' ? '#090d16' : '#f4f1ea');
    
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
        setTimeout(() => curtain.classList.remove('active'), 400);
    }

    html.classList.add('theme-transitioning');
    if (btn) btn.classList.add('spin-theme-icon');

    window.toggleTheme();

    setTimeout(() => {
        html.classList.remove('theme-transitioning');
        if (btn) btn.classList.remove('spin-theme-icon');
    }, 420);
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
        statusText.innerText = 'Aktif';
        statusText.style.color = 'var(--success)';
        toggleBtn.innerText = 'Matikan';
        toggleBtn.className = 'btn btn-sm btn-danger';
        iconEl.className = 'fa-solid fa-bell';
        if (iconBox) {
            iconBox.style.background = 'rgba(16, 185, 129, 0.15)';
            iconBox.style.color = 'var(--success)';
        }
    } else {
        statusText.innerText = 'Nonaktif';
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
        window.customAlert('Tidak Didukung', 'Browser kamu belum mendukung notifikasi.', 'warning');
        return;
    }

    const browserGranted = Notification.permission === 'granted';

    if (isUserNotifEnabled && browserGranted) {
        isUserNotifEnabled = false;
        localStorage.setItem('vipercell_user_notif', 'off');
        updateProfileNotifToggleUI();
        window.showToast('Nonaktif', 'Notifikasi dimatikan.', 'info');
        return;
    }

    if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
            window.showToast('Izin Ditolak', 'Izinkan notifikasi pada pengaturan browser.', 'warning');
            updateProfileNotifToggleUI();
            return;
        }
    } else if (Notification.permission === 'denied') {
        window.customAlert('Izin Diblokir', 'Ubah izin Notifikasi menjadi Izinkan di pengaturan browser.', 'warning');
        return;
    }

    isUserNotifEnabled = true;
    localStorage.setItem('vipercell_user_notif', 'on');
    updateProfileNotifToggleUI();
    window.showToast('Aktif', 'Notifikasi diaktifkan.', 'success');
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
                badge: iconUrl
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
        try { localStorage.setItem('vipercell_cached_icon', customIcon); } catch (e) {}
    }

    try {
        const mimeType = customIcon.startsWith('data:image/svg')
            ? "image/svg+xml"
            : (customIcon.startsWith('data:image/webp') ? "image/webp" : "image/png");

        const manifestObj = {
            id: "/",
            name: `${siteSettings.logoText || 'Viper'}${siteSettings.logoAccent || 'cell'}`,
            short_name: `${siteSettings.logoText || 'Viper'}${siteSettings.logoAccent || 'cell'}`,
            description: "Layanan aplikasi premium, top up game, dan produk digital.",
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

function triggerSuccessConfetti() {
    const container = document.getElementById('confetti-container');
    if (!container) return;
    container.innerHTML = '';

    const colors = ['#2563eb', '#facc15', '#10b981', '#ec4899', '#8b5cf6'];
    for (let i = 0; i < 45; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + 'vw';
        piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        piece.style.width = (Math.floor(Math.random() * 8) + 6) + 'px';
        piece.style.height = (Math.floor(Math.random() * 12) + 6) + 'px';
        piece.style.animationDuration = (Math.random() * 1.6 + 1.2) + 's';
        piece.style.animationDelay = (Math.random() * 0.4) + 's';
        container.appendChild(piece);
    }
}

window.showPaymentSuccessAnimation = function(orderId, resultStatus = 'SUCCESS') {
    if (orderId && shownPaymentSuccessOrderIds.has(orderId)) return;
    if (orderId) shownPaymentSuccessOrderIds.add(orderId);

    stopActiveQrisPaymentWatcher();
    if (activeTimersRegistry.qrisCountdown) {
        clearInterval(activeTimersRegistry.qrisCountdown);
        activeTimersRegistry.qrisCountdown = null;
    }
    window.closeModal('modal-cash-barcode');

    const titleEl = document.getElementById('pay-success-title');
    const descEl = document.getElementById('pay-success-desc');
    if (resultStatus === 'PENDING') {
        if (titleEl) titleEl.innerText = 'Pembayaran Diterima!';
        if (descEl) descEl.innerText = 'Pesanan sedang diproses dan akan dikirim oleh Admin.';
        sendNativeNotification('Pembayaran Diterima', `Pesanan #${orderId} sedang diproses oleh Admin.`);
    } else {
        if (titleEl) titleEl.innerText = 'Pembayaran Berhasil!';
        if (descEl) descEl.innerText = 'Stok pesanan kamu telah dikirim dan selesai.';
        sendNativeNotification('Pesanan Selesai', `Pesanan #${orderId} telah terkirim.`);
    }

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
            }, 320);
        }, 1800);
    }
};

// Pop-Up Toast Notifikasi Neo-Brutalist Matang (#13)
window.showToast = function(title, msg, type = 'info', actionCallback = null) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    
    let icon = '<i class="fa-solid fa-circle-info"></i>';
    if (type === 'success') icon = '<i class="fa-solid fa-circle-check"></i>';
    if (type === 'warning') icon = '<i class="fa-solid fa-triangle-exclamation"></i>';
    if (type === 'error') icon = '<i class="fa-solid fa-circle-xmark"></i>';

    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            <h4>${escapeHtml(title)}</h4>
            <p>${escapeHtml(msg)}</p>
        </div>
        <div class="toast-progress-bar"></div>
    `;
    
    let autoRemoveTimer = null;
    const dismissToast = () => {
        if (autoRemoveTimer) clearTimeout(autoRemoveTimer);
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 220);
    };

    toast.addEventListener('click', () => {
        if (actionCallback) actionCallback();
        dismissToast();
    });

    toast.style.cursor = 'pointer';
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    autoRemoveTimer = setTimeout(() => {
        if (document.body.contains(toast)) {
            dismissToast();
        }
    }, 3400);
};

window.openModal = (id) => {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('active');
        if (el.classList.contains('modal-overlay')) {
            document.body.classList.add('no-scroll');
        }
    }
};
window.closeModal = (id) => {
    const el = document.getElementById(id);
    if (el) { 
        el.classList.remove('active');
        const anyOpenModal = document.querySelector('.modal-overlay.active');
        if (!anyOpenModal) {
            document.body.classList.remove('no-scroll'); 
        }
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
            confirmBtn.className = 'btn btn-success btn-sm';
        } else {
            iconContainer.className = 'msg-icon warning';
            iconContainer.innerHTML = '<i class="fa-solid fa-circle-question"></i>';
            confirmBtn.className = 'btn btn-danger btn-sm';
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
}, { threshold: 0.08 });
function observeReveals() { document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el)); }

window.openAuthModal = function() {
    setAuthGateLock(true);
};

window.switchAuthTab = function(tab) {
    const fLogin = document.getElementById('form-login');
    const fReg = document.getElementById('form-register');
    const fReset = document.getElementById('form-reset');
    if (fLogin) fLogin.style.display = tab === 'login' ? 'block' : 'none';
    if (fReg) fReg.style.display = tab === 'register' ? 'block' : 'none';
    if (fReset) fReset.style.display = tab === 'reset' ? 'block' : 'none';
    
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
        if (authTitle) authTitle.innerText = 'Ganti Kata Sandi'; 
        if (authSub) authSub.innerText = 'Link ganti sandi akan dikirim ke email kamu.';
    } else {
        if (authTabsContainer) authTabsContainer.style.display = 'flex';
        if (authDivider) authDivider.style.display = 'flex';
        if (googleBtn) googleBtn.style.display = 'inline-flex';
        if (guestBtn) guestBtn.style.display = 'inline-flex';
        if (authTitle) authTitle.innerText = tab === 'login' ? 'Masuk Akun' : 'Daftar Member';
        if (authSub) authSub.innerText = tab === 'login' ? 'Masuk ke akunmu atau lanjut sebagai tamu.' : 'Buat akun member untuk menyimpan riwayat & memakai promo.';
        
        const btnL = document.getElementById('tab-login');
        const btnR = document.getElementById('tab-register');
        if (btnL) btnL.className = tab === 'login' ? 'active' : '';
        if (btnR) btnR.className = tab === 'register' ? 'active' : '';
    }
};
window.showResetPassword = () => window.switchAuthTab('reset');

// Transisi Tab Smooth & Anti Bocor ke Tab Auth Saat Sudah Login (#7 & #15)
window.switchMainTab = function(tab) {
    const isAuthLocked = document.body.classList.contains('auth-locked');
    if (isAuthLocked && tab !== 'auth') {
        return;
    }
    // Jika pengguna sudah login, cegah perpindahan ke tab auth (#7)
    if (!isAuthLocked && tab === 'auth') {
        tab = 'katalog';
    }

    if (tab !== 'payment-qris') {
        stopActiveQrisPaymentWatcher();
        if (activeTimersRegistry.qrisCountdown) {
            clearInterval(activeTimersRegistry.qrisCountdown);
            activeTimersRegistry.qrisCountdown = null;
        }
    }

    document.querySelectorAll('.main-tab-content').forEach(el => {
        el.classList.remove('active');
        if (el.id === 'tab-auth') el.style.display = 'none';
        else el.style.display = '';
    });
    document.querySelectorAll('nav a').forEach(el => el.classList.remove('active'));
    
    const navKey = tab === 'baca-berita' ? 'berita' : (tab === 'payment-qris' ? 'pesanan' : tab);
    const navEl = document.getElementById('nav-' + navKey);
    if (navEl) navEl.classList.add('active');
    const botNavEl = document.getElementById('nav-bot-' + navKey);
    if (botNavEl) botNavEl.classList.add('active');
    
    const tabEl = document.getElementById('tab-' + tab);
    if (tabEl) {
        tabEl.style.display = 'block';
        tabEl.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'instant' }); 
    }
    
    requestAnimationFrame(() => {
        if (tab === 'bantuan') {
            updateOpHoursBannerUI();
            window.switchBantuanSubTab(currentBantuanSubTab);
        } else if (tab === 'profil') {
            applyUserSessionToUI();
            updateProfileStats();
            updateProfileNotifToggleUI();
        } else if (tab === 'pesanan') {
            window.renderUserOrders();
        }
        observeReveals();
    });
};

window.goToReview = function(brandName, orderId = null) {
    window.closeModal('modal-order-detail');
    targetReviewOrderId = orderId;
    window.openDirectBuyModal(brandName);
    setTimeout(() => {
        window.switchBuyModalTab('reviews');
    }, 150); 
};

// ==========================================
// LOGIN EMAIL/PASSWORD, GOOGLE & GANTI SANDI VIA EMAIL (TANPA NO HP #3)
// ==========================================
window.processLogin = async function() {
    const em = (document.getElementById('auth-l-email')?.value || '').trim();
    const pw = (document.getElementById('auth-l-pass')?.value || '').trim();
    if (!em || !pw) {
        window.customAlert('Belum Lengkap', 'Masukkan email dan kata sandi kamu.', 'warning');
        return;
    }
    
    const btn = document.getElementById('btn-do-login');
    const ogHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Memproses...</span>'; 
        btn.disabled = true;
    }
    try {
        boundLegacyGuestUid = null;
        await clearMultiLayerToken('vipercell_anon_uid');
        localStorage.removeItem('vipercell_anon_session_started_at');
        localStorage.setItem('vipercell_active_session_mode', 'member');

        if (auth.currentUser && auth.currentUser.isAnonymous) {
            await signOut(auth).catch(() => {});
        }

        const cred = await signInWithEmailAndPassword(auth, em, pw);
        currentUser = cred.user;
        await syncUserProfileFromAuth(cred.user);

        const restricted = await checkRealtimeAccountRestriction(false);
        if (!restricted) {
            setAuthGateLock(false);
            window.switchMainTab('katalog');
            window.showToast('Berhasil Masuk', `Selamat datang kembali!`, 'success');
        }
    } catch (e) {
        console.error("Login Error:", e);
        let msg = 'Email atau kata sandi tidak sesuai.';
        if (e.code === 'auth/too-many-requests') {
            msg = 'Terlalu banyak percobaan. Silakan coba beberapa saat lagi atau gunakan Lupa Sandi.';
        } else if (e.code === 'auth/invalid-email') {
            msg = 'Format alamat email tidak valid.';
        }
        window.customAlert('Gagal Masuk', msg, 'error');
    } finally { 
        if (btn) {
            btn.innerHTML = ogHtml || '<i class="fa-solid fa-right-to-bracket"></i> <span>Masuk Sekarang</span>'; 
            btn.disabled = false; 
        }
    }
};

window.processRegister = async function() {
    const name = (document.getElementById('auth-r-name')?.value || '').trim();
    const em = (document.getElementById('auth-r-email')?.value || '').trim();
    const pw = (document.getElementById('auth-r-pass')?.value || '').trim();
    
    if (!name || !em || pw.length < 6) { 
        window.customAlert('Belum Lengkap', 'Lengkapi Nama Panggilan, Email, dan Kata Sandi minimal 6 karakter.', 'warning');
        return; 
    }
    
    const btn = document.getElementById('btn-do-register');
    const ogHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Memproses...</span>'; 
        btn.disabled = true;
    }
    try {
        boundLegacyGuestUid = null;
        await clearMultiLayerToken('vipercell_anon_uid');
        localStorage.removeItem('vipercell_anon_session_started_at');
        localStorage.setItem('vipercell_active_session_mode', 'member');

        if (auth.currentUser && auth.currentUser.isAnonymous) {
            await signOut(auth).catch(() => {});
        }
        const cred = await createUserWithEmailAndPassword(auth, em, pw);
        const newMemberObj = { 
            uid: cred.user.uid,
            email: em, 
            name: name, 
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
        setAuthGateLock(false);
        applyUserSessionToUI();
        window.switchMainTab('katalog');
        window.showToast('Pendaftaran Berhasil', `Selamat datang, ${name}!`, 'success');
    } catch (e) {
        let errMsg = 'Email sudah terdaftar atau format email salah.';
        if (e.code === 'auth/email-already-in-use') {
            errMsg = 'Email ini sudah terdaftar. Silakan masuk menggunakan tab Masuk.';
        }
        window.customAlert('Gagal Daftar', errMsg, 'error');
    } finally { 
        if (btn) {
            btn.innerHTML = ogHtml || '<i class="fa-solid fa-user-check"></i> <span>Buat Akun Member</span>'; 
            btn.disabled = false; 
        }
    }
};

function checkResetCooldown() {
    const lastResetTime = Number(localStorage.getItem('vipercell_last_reset') || 0);
    const COOLDOWN = 60 * 1000;
    const now = Date.now();
    if (now - lastResetTime < COOLDOWN) {
        const remaining = Math.ceil((COOLDOWN - (now - lastResetTime)) / 1000);
        window.customAlert('Tunggu Sebentar', `Harap tunggu <b>${remaining} detik</b> sebelum mengirim ulang link.`, 'warning');
        return false;
    }
    return true;
}

async function sendPasswordResetToAccountEmail(source = 'auth') {
    const rawEmail = source === 'profile'
        ? (userProfile.email || currentUser?.email || document.getElementById('prof-email')?.value || '')
        : (document.getElementById('auth-res-email')?.value || document.getElementById('auth-l-email')?.value || '');

    const email = String(rawEmail).trim().toLowerCase();
    if (!email || !email.includes('@')) {
        window.customAlert('Email Diperlukan', 'Masukkan alamat email akun kamu.', 'warning');
        return;
    }
    if (!checkResetCooldown()) return;

    const btn = source === 'profile' ? null : document.getElementById('btn-do-reset');
    const ogHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Mengirim ke Email...</span>';
    }

    try {
        await sendPasswordResetEmail(auth, email);
        localStorage.setItem('vipercell_last_reset', String(Date.now()));
        if (source === 'auth') {
            window.switchAuthTab('login');
        }
        window.customAlert(
            'Link Terkirim ke Email',
            `Tautan untuk mengganti kata sandi telah dikirim ke <b>${escapeHtml(email)}</b>. Silakan buka kotak masuk atau folder spam email kamu.`,
            'success'
        );
    } catch (e) {
        console.error("Reset Password Error:", e);
        window.customAlert('Gagal Mengirim', 'Pastikan alamat email sudah terdaftar dan aktif.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = ogHtml || '<i class="fa-solid fa-paper-plane"></i> <span>Kirim Link ke Email</span>';
        }
    }
}

window.processReset = function() {
    return sendPasswordResetToAccountEmail('auth');
};

window.sendProfileResetPassword = function() {
    return sendPasswordResetToAccountEmail('profile');
};

window.processGoogleLogin = async function() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    const btn = document.getElementById('auth-google-btn');
    const btnText = document.getElementById('text-google-btn');
    const ogText = btnText ? btnText.innerText : 'Lanjut dengan Google';
    if (btnText) btnText.innerText = 'Memproses...';
    if (btn) btn.disabled = true;
    
    try {
        boundLegacyGuestUid = null;
        await clearMultiLayerToken('vipercell_anon_uid');
        localStorage.removeItem('vipercell_anon_session_started_at');
        localStorage.setItem('vipercell_active_session_mode', 'member');

        if (auth.currentUser && auth.currentUser.isAnonymous) {
            await signOut(auth).catch(() => {});
        }

        const result = await signInWithPopup(auth, provider);
        const userDoc = await getDoc(doc(db, pathUsers, result.user.uid)).catch(() => null);
        
        if (!userDoc || !userDoc.exists()) {
            await setDoc(doc(db, pathUsers, result.user.uid), { 
                uid: result.user.uid,
                email: result.user.email || '', 
                name: result.user.displayName || 'Member', 
                role: 'member',
                isAnonymous: false,
                isGuest: false, 
                isBlocked: false,
                isDeleted: false,
                verified: true, 
                deviceId: currentDeviceId,
                createdAt: Date.now() 
            }, { merge: true });
        } else if (userDoc.data()?.isDeleted === true) {
            await setDoc(doc(db, pathUsers, result.user.uid), { isDeleted: false }, { merge: true }).catch(() => {});
        }

        currentUser = result.user;
        await syncUserProfileFromAuth(result.user);
        const restricted = await checkRealtimeAccountRestriction(false);
        if (!restricted) {
            setAuthGateLock(false);
            window.switchMainTab('katalog');
            window.showToast('Berhasil Masuk', 'Selamat datang di Vipercell!', 'success');
        }
    } catch (error) {
        console.error("Google Login Error:", error);
        if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
            window.customAlert('Gagal Masuk Google', 'Pastikan pop-up browser diizinkan atau gunakan masuk dengan Email dan Kata Sandi.', 'warning');
        }
    } finally {
        if (btnText) btnText.innerText = ogText;
        if (btn) btn.disabled = false;
    }
};

window.logoutUser = async function() {
    localStorage.setItem('vipercell_active_session_mode', 'logged_out');
    localStorage.removeItem('vipercell_track_email');
    localStorage.removeItem('vipercell_guest_email');
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
    userProfile = { uid: '', name: '', email: '', isGuest: true, isAnonymous: true };

    setAuthGateLock(true);
    window.showToast('Keluar', 'Kamu telah keluar dari sesi akun.', 'info');
};

window.saveUserProfile = async function() {
    if (!currentUser) return;
    const name = document.getElementById('prof-name').value.trim();
    if (!name) { window.customAlert('Peringatan', 'Nama panggilan tidak boleh kosong.', 'warning'); return; }
    
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    const effectiveUid = isMember ? currentUser.uid : (boundLegacyGuestUid || currentUser.uid);

    try {
        await setDoc(doc(db, pathUsers, effectiveUid), {
            name: name,
            updatedAt: Date.now()
        }, { merge: true });
        userProfile.name = name;

        if (!isMember) {
            localStorage.setItem('vipercell_anon_name', name);
        }

        applyUserSessionToUI();
        window.showToast('Tersimpan', 'Profil berhasil diperbarui.', 'success');
    } catch (e) { window.customAlert('Error', 'Gagal menyimpan profil.', 'error'); }
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

    // [FITUR #7] Total Pesanan yang dihitung di tab profil hanya transaksi berhasil (SUCCESS)
    if (totalEl) totalEl.innerText = successOrders.length;
    if (statEl) statEl.innerText = successOrders.length;
    if (spentEl) spentEl.innerText = `Rp${totalSpent.toLocaleString('id-ID')}`;
}

// ==========================================
// RUNNING TEXT NEO-BRUTALISM RESMI (15 - 20 TEKS #2)
// ==========================================
function buildStructuredMarqueeSlots() {
    const slots = [];

    if (Array.isArray(siteSettings.marqueeList) && siteSettings.marqueeList.length > 0) {
        siteSettings.marqueeList.slice(0, 20).forEach((item) => {
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

    if (slots.length === 0) {
        const rawMarquee = String(siteSettings.marquee || 'Selamat datang di Vipercell.').trim();
        const rawParts = rawMarquee.includes('||')
            ? rawMarquee.split('||')
            : rawMarquee.split(/\r?\n/);

        rawParts.map(s => s.trim()).filter(Boolean).slice(0, 20).forEach(part => {
            slots.push({
                text: part,
                type: 'info',
                promoCode: '',
                targetBrand: '',
                newsIndex: -1
            });
        });
    }

    parsedMarqueeSlots = slots.slice(0, 20);
    return parsedMarqueeSlots;
}

let parsedFooterMarqueeSlots = [];
let lastTopMarqueeSignature = '';
let lastFooterMarqueeSignature = '';

// [PERBAIKAN v27.8] Teks Running Bawah Otomatis Menampilkan Item Katalog Aktif & Bebas Lag Saat Pindah Tab
function buildStructuredFooterMarqueeSlots() {
    const slots = [];
    const showPrice = siteSettings.footerMarqueeShowPrice !== false;
    const showStatus = siteSettings.footerMarqueeShowStatus !== false;

    // Ambil seluruh item katalog yang aktif (tidak sedang gangguan)
    const activeBrands = groupedBrands.filter(b => !b.isGangguan);

    if (activeBrands.length > 0) {
        activeBrands.forEach((b) => {
            const prices = (b.items || []).map(i => Number(i.priceNum || 0)).filter(p => p > 0);
            const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
            const allSold = b.items.length > 0 && b.items.every(it => isVariantMarkedSoldOutByAdmin(it));
            const priceLabel = (showPrice && minPrice > 0) ? ` — Mulai Rp${minPrice.toLocaleString('id-ID')}` : '';
            const statusText = allSold ? (showStatus ? ' (Stok Habis)' : '') : priceLabel;

            slots.push({
                text: `${b.brandName}${statusText}`,
                type: 'product',
                promoCode: '',
                targetBrand: b.brandName,
                categoryType: b.type || 'app',
                isSoldOut: allSold,
                showBadge: showStatus,
                newsIndex: -1
            });
        });
    } else {
        const defaultCatalogNames = [
            'Viu Premium', 'Prime Video', 'Netflix Premium', 'Spotify Premium',
            'YouTube Premium', 'Canva Pro', 'CapCut Pro', 'Vidio Premier',
            'Disney+ Hotstar', 'Mobile Legends', 'Free Fire', 'ChatGPT Plus'
        ];
        defaultCatalogNames.forEach((name) => {
            slots.push({
                text: name,
                type: 'info',
                promoCode: '',
                targetBrand: '',
                categoryType: 'app',
                isSoldOut: false,
                showBadge: showStatus,
                newsIndex: -1
            });
        });
    }

    parsedFooterMarqueeSlots = slots;
    return parsedFooterMarqueeSlots;
}

function renderInteractiveMarqueeUI() {
    const marqueeContent = document.getElementById('marquee-content');
    if (!marqueeContent) return;

    const slots = buildStructuredMarqueeSlots();
    const sig = JSON.stringify(slots);
    if (sig !== lastTopMarqueeSignature) {
        lastTopMarqueeSignature = sig;
        const repeatFactor = slots.length > 0 && slots.length < 5 ? Math.ceil(6 / slots.length) : 1;
        const expandedCount = slots.length * repeatFactor;
        const durationSec = Math.max(48, expandedCount * 8.5);
        marqueeContent.style.setProperty('--marquee-duration', `${durationSec}s`);

        const buildSinglePass = () => slots.map((slot, idx) => {
            const safePromo = escapeJsStr(slot.promoCode || '');
            const safeBrand = escapeJsStr(slot.targetBrand || '');
            const newsIdx = typeof slot.newsIndex === 'number' ? slot.newsIndex : -1;

            let badgeHtml = '';
            if (slot.promoCode) {
                badgeHtml = `<span class="marquee-item-badge badge-promo">PROMO</span>`;
            } else if (slot.newsIndex >= 0 || slot.type === 'news') {
                badgeHtml = `<span class="marquee-item-badge badge-news">BERITA</span>`;
            } else if (slot.targetBrand) {
                badgeHtml = `<span class="marquee-item-badge badge-product">${escapeHtml(slot.targetBrand)}</span>`;
            }

            return `
                <span class="marquee-item-pill" onclick="window.handleMarqueeItemClick(${idx}, '${safePromo}', '${safeBrand}', ${newsIdx})">
                    ${badgeHtml}
                    <span>${escapeHtml(slot.text)}</span>
                </span>
                <span class="marquee-sep-star" aria-hidden="true">✦</span>
            `;
        }).join('');

        const oneHalf = Array.from({ length: repeatFactor }, () => buildSinglePass()).join("");
        marqueeContent.innerHTML = oneHalf + oneHalf;
    }

    renderFooterMarqueeUI();
}

function renderFooterMarqueeUI() {
    const footerTrack = document.getElementById('footer-marquee-content');
    if (!footerTrack) return;

    const slots = buildStructuredFooterMarqueeSlots();
    const speedMode = siteSettings.footerMarqueeSpeed || 'normal';
    const sig = JSON.stringify({ slots, speedMode });

    // Jangan pernah mereset innerHTML jika data katalog tidak berubah agar animasi berjalan 100% mulus tanpa lompatan
    if (sig === lastFooterMarqueeSignature && footerTrack.children.length > 1) {
        return;
    }
    lastFooterMarqueeSignature = sig;

    const repeatFactor = slots.length > 0 && slots.length < 5 ? Math.ceil(6 / slots.length) : 1;
    const expandedCount = slots.length * repeatFactor;
    const speedMultiplier = speedMode === 'fast' ? 5.5 : (speedMode === 'slow' ? 11.5 : 8.0);
    const durationSec = Math.max(36, expandedCount * speedMultiplier);
    footerTrack.style.setProperty('--footer-marquee-duration', `${durationSec}s`);

    const buildSinglePass = () => slots.map((slot, idx) => {
        const safePromo = escapeJsStr(slot.promoCode || '');
        const safeBrand = escapeJsStr(slot.targetBrand || '');
        const newsIdx = typeof slot.newsIndex === 'number' ? slot.newsIndex : -1;

        let badgeHtml = '';
        if (slot.showBadge !== false) {
            if (slot.isSoldOut) {
                badgeHtml = `<span class="marquee-item-badge badge-news">HABIS</span>`;
            } else if (slot.categoryType === 'game') {
                badgeHtml = `<span class="marquee-item-badge badge-promo">GAME</span>`;
            } else if (slot.categoryType === 'tools') {
                badgeHtml = `<span class="marquee-item-badge badge-product">TOOLS</span>`;
            } else {
                badgeHtml = `<span class="marquee-item-badge badge-product">KATALOG</span>`;
            }
        }

        return `
            <span class="marquee-item-pill footer-dark-pill" onclick="window.handleFooterMarqueeItemClick(${idx}, '${safePromo}', '${safeBrand}', ${newsIdx})">
                ${badgeHtml}
                <span class="footer-catalog-text">${escapeHtml(slot.text)}</span>
            </span>
            <span class="marquee-sep-star footer-dark-sep" aria-hidden="true">✦</span>
        `;
    }).join('');

    const oneHalf = Array.from({ length: repeatFactor }, () => buildSinglePass()).join('');
    footerTrack.innerHTML = oneHalf + oneHalf;
}

window.handleFooterMarqueeItemClick = function(slotIndex = 0, explicitPromo = '', explicitBrand = '', explicitNewsIdx = -1) {
    const slot = parsedFooterMarqueeSlots[slotIndex] || {};
    const promoCode = (explicitPromo || slot.promoCode || '').trim().toUpperCase();
    const targetBrand = (explicitBrand || slot.targetBrand || '').trim();
    const newsIndex = explicitNewsIdx >= 0 ? explicitNewsIdx : (typeof slot.newsIndex === 'number' ? slot.newsIndex : -1);

    if (promoCode || targetBrand || newsIndex >= 0 || slot.type === 'news') {
        window.handleMarqueeItemClick(slotIndex, promoCode, targetBrand, newsIndex);
    } else {
        window.switchMainTab('katalog');
    }
};

window.handleMarqueeItemClick = function(slotIndex = 0, explicitPromo = '', explicitBrand = '', explicitNewsIdx = -1) {
    const slot = parsedMarqueeSlots[slotIndex] || {};
    const promoCode = (explicitPromo || slot.promoCode || '').trim().toUpperCase();
    let targetBrand = (explicitBrand || slot.targetBrand || '').trim();
    const newsIndex = explicitNewsIdx >= 0 ? explicitNewsIdx : (typeof slot.newsIndex === 'number' ? slot.newsIndex : -1);

    if (promoCode) {
        const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
        if (!isMember) {
            window.showToast('Khusus Member', 'Upgrade atau masuk ke akun Member untuk menggunakan promo.', 'warning');
            return;
        }

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
                window.showToast(`Promo Dipasang`, `Kode promo berhasil diterapkan.`, 'success');
            }, 140);
            return;
        }
    }

    if (targetBrand) {
        window.openDirectBuyModal(targetBrand);
        return;
    }

    const visibleNews = (siteSettings.newsList || []).filter(t => !t.isHidden);
    if (newsIndex >= 0 && newsIndex < visibleNews.length) {
        window.openReadNewsFullPage(newsIndex);
        return;
    }

    if (visibleNews.length > 0) {
        window.openReadNewsFullPage(0);
    } else {
        window.switchMainTab('berita');
    }
};

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
    updateOpHoursBannerUI();
    updateWaterRippleVisibility();
    
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
    const waHref = `https://wa.me/${adminWaNum}?text=${encodeURIComponent('Halo Admin Vipercell')}`;
    
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
    
    if (!container || !track) return;
    const banners = siteSettings.banners || [];
    
    if (banners.length === 0) { container.style.display = 'none'; return; }
    
    container.style.display = 'block';
    setTimeout(() => { container.classList.add('reveal-visible'); }, 40);
    
    let trackHtml = '';
    banners.forEach((b64) => {
        trackHtml += `<img src="${b64}" class="banner-slide" alt="Promo Vipercell" loading="lazy" decoding="async">`;
    });
    track.innerHTML = trackHtml;
    window.startBannerAuto();
};

let currentBanner = 0;
window.goToBanner = function(idx) {
    currentBanner = idx;
    const track = document.getElementById('banner-track');
    if (!track) return;
    track.style.transform = `translate3d(-${currentBanner * 100}%, 0, 0)`;
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
        grid.innerHTML = '<div class="brutal-empty-box" style="grid-column: 1/-1;">Belum ada berita terbaru.</div>';
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
                                <span class="brutal-tag tag-primary">INFO</span>
                                ${prodBadgeHtml}
                            </div>
                            <h3 class="news-card-title">${escapeHtml(news.title)}</h3>
                            <p class="news-card-excerpt">${escapeHtml(news.desc)}</p>
                        </div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:4px;">
                            <button class="btn btn-outline btn-sm" style="flex:1;">
                                Baca Selengkapnya
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
        if (ctaTitle) ctaTitle.innerText = `Ingin membeli ${news.linkedBrand}?`;
        if (ctaSub) ctaSub.innerText = `Pilih variasi ${news.linkedBrand} di halaman produk.`;
        if (ctaBtn) {
            ctaBtn.className = 'btn btn-primary';
            ctaBtn.innerHTML = `<i class="fa-solid fa-bolt"></i> <span>Beli ${escapeHtml(news.linkedBrand)}</span>`;
            ctaBtn.onclick = () => window.openDirectBuyModal(news.linkedBrand);
        }
    } else {
        if (ctaBox) ctaBox.classList.remove('linked-highlight');
        if (ctaTitle) ctaTitle.innerText = 'Tertarik dengan promo ini?';
        if (ctaSub) ctaSub.innerText = 'Lihat daftar produk di katalog.';
        if (ctaBtn) {
            ctaBtn.className = 'btn btn-outline';
            ctaBtn.innerHTML = `<i class="fa-solid fa-store"></i> <span>Lihat Katalog</span>`;
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
            window.showToast('Disalin', 'Isi berita berhasil disalin.', 'success');
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
                width: 2.1,
                height: 70,
                displayValue: true,
                font: "Space Grotesk",
                fontOptions: "bold",
                fontSize: 15,
                margin: 6
            });
        } catch (err) {}
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
        window.sendPredefinedChat(`Halo Admin, saya ingin membayar tunai untuk Invoice #${invToTrack}.`);
    } else {
        window.switchMainTab('bantuan');
        window.switchBantuanSubTab('chat');
    }
};

window.sendPredefinedChat = function(message) {
    window.closeAlert();
    window.closeModal('modal-order-detail');
    window.closeModal('modal-cash-barcode');
    currentBantuanSubTab = 'chat';
    window.switchMainTab('bantuan');
    window.switchBantuanSubTab('chat');
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
        window.showToast('Disalin', `Rp${Number(nominal).toLocaleString('id-ID')} disalin.`, 'success');
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
// FITUR ULASAN PEMBELI (TANPA MENAMPILKAN ID TRX / NOMOR INVOICE #8)
// ==========================================
function getUnreviewedSuccessOrdersForBrand(brandName) {
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    const effectiveUid = isMember ? currentUser.uid : (boundLegacyGuestUid || currentUser?.uid || '');
    const userEmailToMatch = getActiveSessionStorageEmail();
    
    const mySuccessOrders = orders.filter(o => {
        if (o.status !== 'SUCCESS' || !o.adminReply) return false;
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
                stepHead.innerHTML = `Beri Ulasan Pembeli`;
            }
        } else {
            writeContainer.style.display = 'none';
        }
    }

    const brandReviews = reviewsData.filter(r => r.brandName === brandName).sort((a, b) => b.timestamp - a.timestamp);
    
    if (brandReviews.length === 0) {
        reviewListContainer.innerHTML = `<div class="brutal-empty-box">Belum ada ulasan untuk produk ini.</div>`;
        return;
    }
    
    let html = '';
    brandReviews.forEach(r => {
        let starsHtml = '';
        for (let i = 0; i < 5; i++) {
            if (i < r.rating) starsHtml += `<i class="fa-solid fa-star" style="color:var(--warning); font-size:0.85rem;"></i>`;
            else starsHtml += `<i class="fa-regular fa-star" style="color:var(--text-muted); font-size:0.85rem;"></i>`;
        }

        // [PRIVASI #8] Jangan pernah menampilkan ID Transaksi / Nomor Invoice (r.orderId) di ulasan publik!
        const verifiedBadge = `<span class="brutal-tag tag-success" style="font-size:0.58rem; padding:2px 7px;"><i class="fa-solid fa-circle-check"></i> Pembeli Terverifikasi</span>`;
        
        const adminReplyHtml = r.adminReply ? `
            <div style="margin-top: 10px; padding: 10px 12px; background: var(--surface); border-left: 3.5px solid var(--primary); border-radius: 8px; border: 1.5px solid var(--border);">
                <div style="font-size: 0.72rem; font-weight: 800; color: var(--primary); margin-bottom: 3px;">
                    <i class="fa-solid fa-reply"></i> Balasan Admin:
                </div>
                <p style="font-size: 0.82rem; font-weight: 600; color: var(--text); margin: 0;">${escapeHtml(r.adminReply)}</p>
            </div>
        ` : '';

        html += `
        <div style="background:var(--bg); border:var(--brutal-border-thin); box-shadow:var(--brutal-shadow-sm); padding:14px; border-radius:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:6px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <strong style="color:var(--text); font-size:0.88rem; font-weight:800;">${escapeHtml(r.userName || 'Pelanggan')}</strong>
                    ${verifiedBadge}
                </div>
                <span style="font-size:0.72rem; font-weight:700; color:var(--text-muted);">${new Date(r.timestamp).toLocaleDateString('id-ID')}</span>
            </div>
            <div style="margin-bottom:8px; display:flex; gap:3px;">${starsHtml}</div>
            <p style="font-size:0.85rem; font-weight:600; color:var(--text); margin:0;">"${escapeHtml(r.text)}"</p>
            ${adminReplyHtml}
        </div>`;
    });
    
    reviewListContainer.innerHTML = html;
};

window.submitReview = async function() {
    if (isSubmittingReview || !currentCheckoutBrand) return;

    const textInput = document.getElementById('review-text').value.trim();
    const rating = window.selectedReviewStar || 5;
    
    if (!textInput) { window.customAlert('Ulasan Kosong', 'Tulis ulasan kamu terlebih dahulu.', 'warning'); return; }
    
    const eligibleOrders = getUnreviewedSuccessOrdersForBrand(currentCheckoutBrand.brandName);
    if (eligibleOrders.length === 0) {
        window.customAlert('Sudah Diulas', 'Transaksi ini sudah pernah diulas.', 'warning');
        window.renderReviewsUI();
        return;
    }

    const orderToReview = (targetReviewOrderId && eligibleOrders.find(o => o.id === targetReviewOrderId)) || eligibleOrders[0];

    isSubmittingReview = true;
    const anonName = localStorage.getItem('vipercell_anon_name');
    const userName = userProfile.name ? userProfile.name : (anonName ? anonName : 'Pelanggan');
    
    const btnSubmit = document.getElementById('btn-submit-review');
    const ogHtml = btnSubmit.innerHTML;
    btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Mengirim...</span>';
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
        window.showToast('Terkirim', `Terima kasih atas ulasan kamu!`, 'success');
        window.renderReviewsUI();
    } catch (e) {
        window.customAlert('Gagal', 'Gagal mengirim ulasan.', 'error');
    } finally {
        isSubmittingReview = false;
        btnSubmit.innerHTML = ogHtml;
        btnSubmit.disabled = false;
    }
};

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
            if (window.showToast) window.showToast('Disalin', 'ID Transaksi berhasil disalin.', 'success');
        });
    }
};

// Inisialisasi dijalankan di akhir file setelah seluruh fungsi terdaftar

// ============================================================================
// DOMPET SALDO AKUN & INTEGRASI OTOMATIS DIGIFLAZZ (WEB USER)
// ============================================================================

function md5ClientDigiflazz(inputStr) {
    function rotateLeft(lValue, iShiftBits) {
        return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
    }
    function addUnsigned(lX, lY) {
        const lX8 = (lX & 0x80000000);
        const lY8 = (lY & 0x80000000);
        const lX4 = (lX & 0x40000000);
        const lY4 = (lY & 0x40000000);
        const lResult = (lX & 0x3FFFFFFF) + (lY & 0x3FFFFFFF);
        if (lX4 & lY4) return (lResult ^ 0x80000000 ^ lX8 ^ lY8);
        if (lX4 | lY4) {
            if (lResult & 0x40000000) return (lResult ^ 0xC0000000 ^ lX8 ^ lY8);
            else return (lResult ^ 0x40000000 ^ lX8 ^ lY8);
        } else {
            return (lResult ^ lX8 ^ lY8);
        }
    }
    function F(x, y, z) { return (x & y) | ((~x) & z); }
    function G(x, y, z) { return (x & z) | (y & (~z)); }
    function H(x, y, z) { return (x ^ y ^ z); }
    function I(x, y, z) { return (y ^ (x | (~z))); }
    function FF(a, b, c, d, x, s, ac) {
        a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac));
        return addUnsigned(rotateLeft(a, s), b);
    }
    function GG(a, b, c, d, x, s, ac) {
        a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac));
        return addUnsigned(rotateLeft(a, s), b);
    }
    function HH(a, b, c, d, x, s, ac) {
        a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac));
        return addUnsigned(rotateLeft(a, s), b);
    }
    function II(a, b, c, d, x, s, ac) {
        a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac));
        return addUnsigned(rotateLeft(a, s), b);
    }
    function convertToWordArray(str) {
        let lWordCount;
        const lMessageLength = str.length;
        const lNumberOfWordsTemp1 = lMessageLength + 8;
        const lNumberOfWordsTemp2 = (lNumberOfWordsTemp1 - (lNumberOfWordsTemp1 % 64)) / 64;
        const lNumberOfWords = (lNumberOfWordsTemp2 + 1) * 16;
        const lWordArray = Array(lNumberOfWords - 1).fill(0);
        let lBytePosition = 0;
        let lByteCount = 0;
        while (lByteCount < lMessageLength) {
            lWordCount = (lByteCount - (lByteCount % 4)) / 4;
            lBytePosition = (lByteCount % 4) * 8;
            lWordArray[lWordCount] = (lWordArray[lWordCount] | (str.charCodeAt(lByteCount) << lBytePosition));
            lByteCount++;
        }
        lWordCount = (lByteCount - (lByteCount % 4)) / 4;
        lBytePosition = (lByteCount % 4) * 8;
        lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
        lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
        lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
        return lWordArray;
    }
    function wordToHex(lValue) {
        let wordToHexValue = "", wordToHexValueTemp = "", lByte, lCount;
        for (lCount = 0; lCount <= 3; lCount++) {
            lByte = (lValue >>> (lCount * 8)) & 255;
            wordToHexValueTemp = "0" + lByte.toString(16);
            wordToHexValue = wordToHexValue + wordToHexValueTemp.substr(wordToHexValueTemp.length - 2, 2);
        }
        return wordToHexValue;
    }
    const utf8Str = unescape(encodeURIComponent(String(inputStr || '')));
    const x = convertToWordArray(utf8Str);
    let a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;
    const S11 = 7, S12 = 12, S13 = 17, S14 = 22;
    const S21 = 5, S22 = 9, S23 = 14, S24 = 20;
    const S31 = 4, S32 = 11, S33 = 16, S34 = 23;
    const S41 = 6, S42 = 10, S43 = 15, S44 = 21;
    for (let k = 0; k < x.length; k += 16) {
        const AA = a, BB = b, CC = c, DD = d;
        a = FF(a, b, c, d, x[k + 0], S11, 0xD76AA478); d = FF(d, a, b, c, x[k + 1], S12, 0xE8C7B756);
        c = FF(c, d, a, b, x[k + 2], S13, 0x242070DB); b = FF(b, c, d, a, x[k + 3], S14, 0xC1BDCEEE);
        a = FF(a, b, c, d, x[k + 4], S11, 0xF57C0FAF); d = FF(d, a, b, c, x[k + 5], S12, 0x4787C62A);
        c = FF(c, d, a, b, x[k + 6], S13, 0xA8304613); b = FF(b, c, d, a, x[k + 7], S14, 0xFD469501);
        a = FF(a, b, c, d, x[k + 8], S11, 0x698098D8); d = FF(d, a, b, c, x[k + 9], S12, 0x8B44F7AF);
        c = FF(c, d, a, b, x[k + 10], S13, 0xFFFF5BB1); b = FF(b, c, d, a, x[k + 11], S14, 0x895CD7BE);
        a = FF(a, b, c, d, x[k + 12], S11, 0x6B901122); d = FF(d, a, b, c, x[k + 13], S12, 0xFD987193);
        c = FF(c, d, a, b, x[k + 14], S13, 0xA679438E); b = FF(b, c, d, a, x[k + 15], S14, 0x49B40821);
        a = GG(a, b, c, d, x[k + 1], S21, 0xF61E2562); d = GG(d, a, b, c, x[k + 6], S22, 0xC040B340);
        c = GG(c, d, a, b, x[k + 11], S23, 0x265E5A51); b = GG(b, c, d, a, x[k + 0], S24, 0xE9B6C7AA);
        a = GG(a, b, c, d, x[k + 5], S21, 0xD62F105D); d = GG(d, a, b, c, x[k + 10], S22, 0x02441453);
        c = GG(c, d, a, b, x[k + 15], S23, 0xD8A1E681); b = GG(b, c, d, a, x[k + 4], S24, 0xE7D3FBC8);
        a = GG(a, b, c, d, x[k + 9], S21, 0x21E1CDE6); d = GG(d, a, b, c, x[k + 14], S22, 0xC33707D6);
        c = GG(c, d, a, b, x[k + 3], S23, 0xF4D50D87); b = GG(b, c, d, a, x[k + 8], S24, 0x455A14ED);
        a = GG(a, b, c, d, x[k + 13], S21, 0xA9E3E905); d = GG(d, a, b, c, x[k + 2], S22, 0xFCEFA3F8);
        c = GG(c, d, a, b, x[k + 7], S23, 0x676F02D9); b = GG(b, c, d, a, x[k + 12], S24, 0x8D2A4C8A);
        a = HH(a, b, c, d, x[k + 5], S31, 0xFFFA3942); d = HH(d, a, b, c, x[k + 8], S32, 0x8771F681);
        c = HH(c, d, a, b, x[k + 11], S33, 0x6D9D6122); b = HH(b, c, d, a, x[k + 14], S34, 0xFDE5380C);
        a = HH(a, b, c, d, x[k + 1], S31, 0xA4BEEA44); d = HH(d, a, b, c, x[k + 4], S32, 0x4BDECFA9);
        c = HH(c, d, a, b, x[k + 7], S33, 0xF6BB4B60); b = HH(b, c, d, a, x[k + 10], S34, 0xBEBFBC70);
        a = HH(a, b, c, d, x[k + 13], S31, 0x289B7EC6); d = HH(d, a, b, c, x[k + 0], S32, 0xEAA127FA);
        c = HH(c, d, a, b, x[k + 3], S33, 0xD4EF3085); b = HH(b, c, d, a, x[k + 6], S34, 0x04881D05);
        a = HH(a, b, c, d, x[k + 9], S31, 0xD9D4D039); d = HH(d, a, b, c, x[k + 12], S32, 0xE6DB99E5);
        c = HH(c, d, a, b, x[k + 15], S33, 0x1FA27CF8); b = HH(b, c, d, a, x[k + 2], S34, 0xC4AC5665);
        a = II(a, b, c, d, x[k + 0], S41, 0xF4292244); d = II(d, a, b, c, x[k + 7], S42, 0x432AFF97);
        c = II(c, d, a, b, x[k + 14], S43, 0xAB9423A7); b = II(b, c, d, a, x[k + 5], S44, 0xFC93A039);
        a = II(a, b, c, d, x[k + 12], S41, 0x655B59C3); d = II(d, a, b, c, x[k + 3], S42, 0x8F0CCC92);
        c = II(c, d, a, b, x[k + 10], S43, 0xFFEFF47D); b = II(b, c, d, a, x[k + 1], S44, 0x85845DD1);
        a = II(a, b, c, d, x[k + 8], S41, 0x6FA87E4F); d = II(d, a, b, c, x[k + 15], S42, 0xFE2CE6E0);
        c = II(c, d, a, b, x[k + 6], S43, 0xA3014314); b = II(b, c, d, a, x[k + 13], S44, 0x4E0811A1);
        a = II(a, b, c, d, x[k + 4], S41, 0xF7537E82); d = II(d, a, b, c, x[k + 11], S42, 0xBD3AF235);
        c = II(c, d, a, b, x[k + 2], S43, 0x2AD7D2BB); b = II(b, c, d, a, x[k + 9], S44, 0xEB86D391);
        a = addUnsigned(a, AA); b = addUnsigned(b, BB); c = addUnsigned(c, CC); d = addUnsigned(d, DD);
    }
    return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
}

window.updateUserWalletBalanceUI = function() {
    const isMember = Boolean(
        currentUser &&
        !currentUser.isAnonymous &&
        !userProfile.isGuest &&
        localStorage.getItem('vipercell_active_session_mode') === 'member'
    );

    const hBtn = document.getElementById('header-wallet-btn');
    const pCard = document.getElementById('prof-wallet-card');
    const payBalCard = document.getElementById('pay-card-balance');
    const payGrid = document.getElementById('checkout-pay-grid');

    if (!isMember) {
        // User belum login atau Tamu/Anonim: Hilangkan 100% akses & tampilan saldo (#4)
        if (hBtn) hBtn.style.display = 'none';
        if (pCard) pCard.style.display = 'none';
        if (payBalCard) payBalCard.style.display = 'none';
        if (payGrid) payGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
        window.closeModal('modal-topup-balance');
        const checkedPay = document.querySelector('input[name="payment_method"]:checked');
        if (checkedPay && checkedPay.value === 'balance') {
            const qrisCard = document.getElementById('pay-card-qris');
            if (qrisCard) window.selectPaymentUI('qris', qrisCard);
        }
        return;
    }

    if (hBtn) hBtn.style.display = 'none';
    if (pCard) pCard.style.display = 'flex';
    if (payBalCard) payBalCard.style.display = 'flex';
    if (payGrid) payGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';

    const bal = Math.round(Number(userProfile.balance || 0));
    const fmt = `Rp${bal.toLocaleString('id-ID')}`;
    const hEl = document.getElementById('header-balance-text');
    const pEl = document.getElementById('prof-wallet-balance');
    const cEl = document.getElementById('checkout-balance-badge');
    const mEl = document.getElementById('topup-modal-current-balance');
    if (hEl) hEl.innerText = fmt;
    if (pEl) pEl.innerText = fmt;
    if (cEl) cEl.innerText = fmt;
    if (mEl) mEl.innerText = fmt;
};

window.openTopupBalanceModal = function(defaultSubTab = 'topup') {
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    if (!isMember) {
        window.openUpgradeMemberModal();
        window.showToast('Khusus Member', 'Upgrade akun Tamu ke Member terlebih dahulu untuk mengakses Saldo Akun & Member Plus.', 'info');
        return;
    }
    window.closeModal('modal-topup-balance');
    window.updateUserWalletBalanceUI();
    window.switchMainTab('topup');
    window.switchTopupSubTab(defaultSubTab === 'memberplus' ? 'memberplus' : 'topup');
};

window.selectTopupPresetAmount = function(amt, btnEl) {
    document.querySelectorAll('#topup-panel-wallet .topup-nom-chip').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    const inp = document.getElementById('topup-custom-amount');
    if (inp) inp.value = amt;
    if (typeof window.updateTopupSummaryDisplay === 'function') window.updateTopupSummaryDisplay();
};

window.selectTopupPaymentMethod = function(method, cardEl) {
    document.querySelectorAll('#topup-panel-wallet .type-card').forEach(c => c.classList.remove('active'));
    if (cardEl) {
        cardEl.classList.add('active');
        const rad = cardEl.querySelector('input[type="radio"]');
        if (rad) rad.checked = true;
    }
};

window.processTopupBalanceCheckout = async function() {
    if (isProcessingCheckout) return;
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    if (!isMember) {
        window.closeModal('modal-topup-balance');
        window.customAlert('Khusus Member', 'Pengisian saldo hanya tersedia untuk akun Member resmi.', 'warning');
        return;
    }

    const rawAmt = parseInt(document.getElementById('topup-custom-amount')?.value || '0', 10);
    if (isNaN(rawAmt) || rawAmt < 1000) {
        window.customAlert('Nominal Minimal Rp1.000', 'Masukkan nominal pengisian saldo minimal Rp1.000.', 'warning');
        return;
    }

    await ensureAuthSession();
    const effectiveUid = currentUser.uid;
    if (!effectiveUid) return;

    const payMethod = document.querySelector('input[name="topup_payment_method"]:checked')?.value || 'qris';
    const now = Date.now();
    let uniqueCode = 0;
    if (payMethod === 'qris') {
        uniqueCode = Math.floor(Math.random() * 250) + 1;
        let safetyTry = 0;
        while (orders.some(o => (o.status === 'UNPAID' || o.status === 'PENDING_PAYMENT') && o.finalTotal === (rawAmt + uniqueCode)) && safetyTry < 40) {
            uniqueCode = Math.floor(Math.random() * 450) + 1;
            safetyTry++;
        }
    }
    const finalTotal = rawAmt + uniqueCode;
    let invId = 'TOPUP-' + Math.floor(100000 + Math.random() * 900000);
    while (orders.some(o => o.id === invId)) {
        invId = 'TOPUP-' + Math.floor(100000 + Math.random() * 900000);
    }

    const userEm = userProfile.email || currentUser?.email || 'member@vipercell.com';
    const topupItem = {
        cartId: now.toString(),
        productDbId: 'TOPUP_WALLET',
        brandName: 'Dompet Vipercell',
        exactItemName: `Isi Saldo Rp${rawAmt.toLocaleString('id-ID')}`,
        name: `Isi Saldo Akun Rp${rawAmt.toLocaleString('id-ID')}`,
        priceNum: rawAmt,
        qty: 1,
        type: 'wallet',
        processType: 'auto',
        playerInfo: `Akun Member: ${userProfile.name || userEm}`
    };

    const newTopupOrder = {
        id: invId,
        orderId: invId,
        isMemberPlusUser: isUserMemberPlusActive(),
        isTopupOrder: true,
        orderType: 'TOPUP_BALANCE',
        topupAmount: rawAmt,
        balanceCredited: false,
        userEmail: userEm,
        buyerEmail: userEm,
        buyerName: userProfile.name || 'Member',
        userPhone: '',
        userId: effectiveUid,
        isAnonymousOrder: false,
        deviceId: currentDeviceId,
        targetId: effectiveUid,
        productName: 'Dompet Vipercell',
        variantName: `Isi Saldo Rp${rawAmt.toLocaleString('id-ID')}`,
        items: [topupItem],
        finalTotal: finalTotal,
        uniqueTotal: finalTotal,
        baseTotal: rawAmt,
        uniqueCode: uniqueCode,
        promoCode: '',
        promoDiscount: 0,
        durationDays: 0,
        status: 'UNPAID',
        paymentVerified: false,
        paymentMethod: payMethod,
        adminReply: '',
        emailSent: false,
        date: new Date(now).toISOString(),
        expiresAt: now + 900000
    };

    const btn = document.getElementById('btn-submit-topup-balance');
    const ogHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses...';
    }

    try {
        const docRef = await addDoc(collection(db, pathOrders), newTopupOrder);
        currentCheckoutSession = {
            dbId: docRef.id,
            id: invId,
            brandName: 'Dompet Vipercell',
            itemName: topupItem.name,
            finalTotal: finalTotal,
            method: payMethod,
            date: newTopupOrder.date
        };
        window.closeModal('modal-topup-balance');
        if (payMethod === 'qris') {
            setTimeout(() => window.openQRISModal(), 60);
        } else {
            setTimeout(() => window.openCashBarcodeModal(), 60);
        }
    } catch (e) {
        window.customAlert('Gagal', 'Tidak dapat membuat tagihan pengisian saldo.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = ogHtml;
        }
    }
};

async function creditClientTopupOrderBalance(orderData, orderDbId) {
    if (!orderData || !orderDbId) return false;
    const uid = orderData.userId;
    const topupAmt = Math.round(Number(orderData.topupAmount || orderData.baseTotal || orderData.finalTotal || 0));
    if (!uid || topupAmt <= 0) return false;

    const orderRef = doc(db, pathOrders, orderDbId);
    const userRef = doc(db, pathUsers, uid);
    const nowMs = Date.now();
    let creditedOk = false;

    try {
        await runTransaction(db, async (tx) => {
            const ordSnap = await tx.get(orderRef);
            if (!ordSnap.exists()) return;
            const oData = ordSnap.data();
            if (oData.balanceCredited === true) {
                creditedOk = true;
                return;
            }
            const uSnap = await tx.get(userRef);
            if (uSnap.exists() && (uSnap.data().isAnonymous || uSnap.data().isGuest)) {
                return;
            }
            const curBal = uSnap.exists() ? Math.round(Number(uSnap.data().balance || 0)) : 0;
            const nextBal = curBal + topupAmt;

            tx.set(userRef, {
                balance: nextBal,
                balanceUpdatedAt: nowMs
            }, { merge: true });

            const replyMsg = `[PENGISIAN SALDO BERHASIL]\nNominal Masuk : Rp${topupAmt.toLocaleString('id-ID')}\nSaldo Akhir   : Rp${nextBal.toLocaleString('id-ID')}\nWaktu         : ${new Date(nowMs).toLocaleString('id-ID')}`;
            tx.update(orderRef, {
                status: 'SUCCESS',
                paymentVerified: true,
                paidAt: oData.paidAt || nowMs,
                balanceCredited: true,
                balanceCreditedAt: nowMs,
                autoDelivered: true,
                deliveredAt: nowMs,
                adminReply: replyMsg
            });
            userProfile.balance = nextBal;
            creditedOk = true;
        });

        if (creditedOk) {
            window.updateUserWalletBalanceUI();
            await addDoc(collection(db, pathBalanceLogs), {
                uid: uid,
                userEmail: orderData.userEmail || '',
                type: 'TOPUP',
                amount: topupAmt,
                orderId: orderData.id,
                note: `Isi Saldo via ${(orderData.paymentMethod || 'qris').toUpperCase()}`,
                createdAt: nowMs
            }).catch(() => {});
        }
        return creditedOk;
    } catch (e) {
        return false;
    }
}

// Pemanggil API Digiflazz dari Client ke VPS Bridge (Menjamin Kredensial API Sinkron & Tanpa Username Palsu)
async function callClientDigiflazzApi(endpointPath, payloadData) {
    const bridgeUrl = (siteSettings.digiflazzBridgeUrl || 'http://139.59.60.91:3100').trim();
    const username = (siteSettings.digiflazzUsername || '').trim();
    const envMode = siteSettings.digiflazzEnvMode || 'development';
    const isTesting = envMode === 'development';

    if (!bridgeUrl || !bridgeUrl.startsWith('http')) {
        throw new Error('URL VPS Bridge Digiflazz belum dikonfigurasi di Pengaturan Admin.');
    }

    const cleanBase = bridgeUrl.replace(/\/+$/, '');
    const res = await fetch(cleanBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            endpoint: endpointPath,
            username: username,
            envMode: envMode,
            testing: isTesting,
            syncToken: siteSettings.digiflazzBridgeSyncToken || '',
            payload: payloadData
        })
    });

    const json = await res.json();
    if (json && json.data !== undefined) {
        return json;
    }
    throw new Error(json?.data?.message || json?.message || 'Respons server Digiflazz tidak valid.');
}

window.resetPlnAndPascaCheck = function() {
    verifiedPascaInquiry = null;
    verifiedPlnSubscriber = null;
    verifiedEwalletAccount = null;
    const plnBox = document.getElementById('user-pln-inquiry-box');
    const pascaBox = document.getElementById('user-pasca-inquiry-box');
    const ewBox = document.getElementById('user-ewallet-inquiry-box');
    if (plnBox) plnBox.style.display = 'none';
    if (pascaBox) pascaBox.style.display = 'none';
    if (ewBox) ewBox.style.display = 'none';
    window.calculateDirectBuyTotal();
};

window.userCheckEwalletAccount = async function() {
    const cNo = (document.getElementById('buy-id')?.value || '').trim();
    const box = document.getElementById('user-ewallet-inquiry-box');
    const btn = document.getElementById('btn-user-check-ewallet');
    if (!cNo || cNo.length < 8) {
        window.customAlert('Nomor Belum Lengkap', 'Masukkan nomor HP akun E-Wallet yang valid.', 'warning');
        return;
    }

    const ogHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }
    try {
        const checkSku = resolveBrandCheckIdSku(currentCheckoutBrand, selectedProductForBuy);
        const res = await callClientDigiflazzApi('/v1/check-id', {
            sku: checkSku || 'ewallet',
            brand: currentCheckoutBrand?.brandName || 'E-Wallet',
            type: 'ewallet',
            customer_no: cNo
        });
        const d = res?.data || {};
        if (box) {
            box.style.display = 'block';
            if (d.status === 'Sukses' || d.rc === '00') {
                verifiedEwalletAccount = d;
                box.style.borderColor = 'var(--success)';
                box.innerHTML = `
                    <div style="font-weight:800; color:var(--success); margin-bottom:2px;"><i class="fa-solid fa-circle-check"></i> Akun ${escapeHtml(currentCheckoutBrand?.brandName || 'E-Wallet')} Terverifikasi</div>
                    <div>Nama Pengguna: <b>${escapeHtml(d.name || d.username || '-')}</b></div>
                `;
            } else {
                verifiedEwalletAccount = null;
                box.style.borderColor = 'var(--danger)';
                box.innerHTML = `<div style="font-weight:800; color:var(--danger);"><i class="fa-solid fa-circle-xmark"></i> ${escapeHtml(d.message || 'Nomor E-Wallet tidak ditemukan')}</div>`;
            }
        }
    } catch (e) {
        window.customAlert('Gagal', escapeHtml(e.message), 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = ogHtml;
        }
    }
};

window.userCheckPlnSubscriber = async function() {
    const cNo = (document.getElementById('buy-id')?.value || '').trim();
    const box = document.getElementById('user-pln-inquiry-box');
    const btn = document.getElementById('btn-user-check-pln');
    if (!cNo) {
        window.customAlert('Nomor Kosong', 'Masukkan Nomor Meter atau ID Pelanggan PLN terlebih dahulu.', 'warning');
        return;
    }

    const ogHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }
    try {
        const username = (siteSettings.digiflazzUsername || 'username').trim();
        const sign = md5ClientDigiflazz(username + 'dev-apikey' + cNo);
        const res = await callClientDigiflazzApi('/v1/inquiry-pln', {
            username: username,
            customer_no: cNo,
            sign: sign
        });
        const d = res?.data || {};
        if (box) {
            box.style.display = 'block';
            if (d.status === 'Sukses' || d.rc === '00') {
                verifiedPlnSubscriber = d;
                box.style.borderColor = 'var(--success)';
                box.innerHTML = `
                    <div style="font-weight:800; color:var(--success); margin-bottom:2px;"><i class="fa-solid fa-circle-check"></i> Pelanggan PLN Terverifikasi</div>
                    <div>Nama: <b>${escapeHtml(d.name || '-')}</b> &bull; Daya: <b>${escapeHtml(d.segment_power || '-')}</b></div>
                `;
            } else {
                verifiedPlnSubscriber = null;
                box.style.borderColor = 'var(--danger)';
                box.innerHTML = `<div style="font-weight:800; color:var(--danger);"><i class="fa-solid fa-circle-xmark"></i> ${escapeHtml(d.message || 'Nomor PLN tidak ditemukan')}</div>`;
            }
        }
    } catch (e) {
        window.customAlert('Gagal', escapeHtml(e.message), 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = ogHtml;
        }
    }
};

window.userCheckPascaBill = async function() {
    const cNo = (document.getElementById('buy-id')?.value || '').trim();
    const box = document.getElementById('user-pasca-inquiry-box');
    const btn = document.getElementById('btn-user-check-pasca');
    if (!cNo) {
        window.customAlert('Nomor Kosong', 'Masukkan Nomor Pelanggan terlebih dahulu.', 'warning');
        return;
    }
    if (!selectedProductForBuy && currentCheckoutBrand?.items?.length > 0) {
        window.selectItemToBuy(currentCheckoutBrand.items[0].dbId);
    }
    const sku = selectedProductForBuy?.buyerSkuCode || 'pln';
    const refId = 'VP-' + Math.floor(100000 + Math.random() * 900000);
    const username = (siteSettings.digiflazzUsername || 'username').trim();
    const sign = md5ClientDigiflazz(username + 'dev-apikey' + refId);
    const isTesting = (siteSettings.digiflazzEnvMode || 'development') === 'development';

    const ogHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengecek...';
    }

    try {
        const res = await callClientDigiflazzApi('/v1/transaction', {
            commands: 'inq-pasca',
            username: username,
            buyer_sku_code: sku,
            customer_no: cNo,
            ref_id: refId,
            testing: isTesting,
            sign: sign
        });
        const d = res?.data || {};
        if (box) {
            box.style.display = 'block';
            if (d.status === 'Sukses' || d.rc === '00') {
                verifiedPascaInquiry = { ...d, sku: sku, ref_id: refId };
                box.style.borderColor = 'var(--success)';
                box.innerHTML = `
                    <div style="font-weight:800; color:var(--success); margin-bottom:4px;"><i class="fa-solid fa-circle-check"></i> Rincian Tagihan Ditemukan</div>
                    <div>Nama Pelanggan: <b>${escapeHtml(d.customer_name || '-')}</b></div>
                    <div>Periode Tagihan: <b>${escapeHtml(d.periode || '-')}</b></div>
                    <div>Total Tagihan: <strong style="color:var(--primary); font-size:0.95rem;">Rp${Number(d.selling_price || d.price || 0).toLocaleString('id-ID')}</strong></div>
                `;
                window.calculateDirectBuyTotal();
            } else {
                verifiedPascaInquiry = null;
                box.style.borderColor = 'var(--danger)';
                box.innerHTML = `<div style="font-weight:800; color:var(--danger);"><i class="fa-solid fa-circle-xmark"></i> ${escapeHtml(d.message || 'Tagihan tidak ditemukan / sudah lunas')}</div>`;
            }
        }
    } catch (e) {
        window.customAlert('Gagal Cek Tagihan', escapeHtml(e.message), 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = ogHtml;
        }
    }
};

async function executeClientDigiflazzOrder(orderData, orderDbId) {
    if (!orderData || !orderDbId) return false;
    if (orderData.digiflazzInFlight === true || orderData.digiflazzStatus === 'Sukses') return true;

    const item = (orderData.items && orderData.items[0]) ? orderData.items[0] : {};
    const sku = String(orderData.digiflazzSku || item.buyerSkuCode || '').trim();
    const rawTarget = String(orderData.digiflazzCustomerNo || orderData.targetId || item.playerInfo || '').trim();
    const customerNo = normalizeClientDigiflazzCustomerNo(rawTarget);
    const refId = String(orderData.digiflazzRefId || orderData.id || '').trim();

    if (!sku || !customerNo || !refId) return false;

    const nowMs = Date.now();
    await updateDoc(doc(db, pathOrders, orderDbId), {
        digiflazzInFlight: true,
        digiflazzRefId: refId,
        digiflazzSku: sku,
        digiflazzCustomerNo: customerNo,
        digiflazzLastHitAt: nowMs
    }).catch(() => {});

    const username = (siteSettings.digiflazzUsername || 'username').trim();
    const sign = md5ClientDigiflazz(username + 'dev-apikey' + refId);
    const isTesting = (siteSettings.digiflazzEnvMode || 'development') === 'development';
    const isPasca = (item.processType === 'digiflazz_pasca' || orderData.digiflazzCommand === 'pay-pasca');

    const reqPayload = {
        username: username,
        buyer_sku_code: sku,
        customer_no: customerNo,
        ref_id: refId,
        sign: sign
    };
    if (isTesting) reqPayload.testing = true;
    if (isPasca) reqPayload.commands = 'pay-pasca';

    try {
        const res = await callClientDigiflazzApi('/v1/transaction', reqPayload);
        const d = res?.data || {};
        const statusStr = String(d.status || 'Pending');
        const rcStr = String(d.rc || '03');
        const snStr = String(d.sn || '');
        const msgStr = String(d.message || '');

        const plnFields = {};
        if (snStr && snStr.includes('/')) {
            const parts = snStr.split('/').map(s => s.trim()).filter(Boolean);
            const firstClean = (parts[0] || '').replace(/[^0-9]/g, '');
            if (firstClean.length >= 16 || sku.toLowerCase().includes('pln')) {
                plnFields.plnTokenNumber = parts[0] || snStr;
                if (parts[1]) plnFields.plnSubscriberName = parts[1];
                if (parts[2]) plnFields.plnSegmentPower = parts.slice(2, 4).join(' / ');
                if (parts[4]) plnFields.plnKwh = parts[4];
            }
        }

        if (statusStr === 'Sukses' || rcStr === '00') {
            let replyText = `[TRANSAKSI BERHASIL]\nProduk   : ${item.name || sku}\nTujuan   : ${customerNo}`;
            if (orderData.verifiedTargetName) {
                replyText += `\nAtas Nama: ${orderData.verifiedTargetName}`;
            }
            if (plnFields.plnTokenNumber) {
                replyText += `\nToken PLN: ${plnFields.plnTokenNumber}`;
                if (plnFields.plnSubscriberName) replyText += `\nPelanggan: ${plnFields.plnSubscriberName}`;
                if (plnFields.plnSegmentPower) replyText += `\nTarif/Daya: ${plnFields.plnSegmentPower}`;
                if (plnFields.plnKwh) replyText += `\nJumlah kWh: ${plnFields.plnKwh}`;
            } else {
                replyText += `\nSN/Ref   : ${snStr || 'Sukses Diproses'}`;
            }
            replyText += `\nStatus   : Sukses (RC ${rcStr})`;

            await updateDoc(doc(db, pathOrders, orderDbId), {
                status: 'SUCCESS',
                paymentVerified: true,
                paidAt: orderData.paidAt || nowMs,
                autoDelivered: true,
                deliveredAt: nowMs,
                adminReply: replyText,
                digiflazzInFlight: false,
                digiflazzStatus: 'Sukses',
                digiflazzRc: rcStr,
                digiflazzSn: snStr,
                digiflazzMessage: msgStr,
                ...plnFields
            }).catch(() => {});
            orderData.status = 'SUCCESS';
            orderData.adminReply = replyText;
            orderData.autoDelivered = true;
            return true;
        } else {
            await updateDoc(doc(db, pathOrders, orderDbId), {
                status: 'PENDING',
                paymentVerified: true,
                paidAt: orderData.paidAt || nowMs,
                digiflazzInFlight: false,
                digiflazzStatus: statusStr,
                digiflazzRc: rcStr,
                digiflazzMessage: msgStr
            }).catch(() => {});
            return false;
        }
    } catch (e) {
        await updateDoc(doc(db, pathOrders, orderDbId), {
            status: 'PENDING',
            paymentVerified: true,
            digiflazzInFlight: false
        }).catch(() => {});
        return false;
    }
}


// ============================================================================
// FITUR LENGKAP v28.2: MEMBER PLUS, HARGA SPESIAL, PIN TRANSAKSI 6-DIGIT,
// PANEL SAPAAN PENGGUNA, AUTO-CHECK PLN/PASCA, & BAGIKAN/UNDUH STRUK
// ============================================================================

let plnAutoCheckDebounceTimer = null;
let pascaInputDebounceTimer = null;

function isUserMemberPlusActive() {
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    if (!isMember) return false;
    const expMs = Number(userProfile.memberPlusExpiresAt || 0);
    if (expMs > Date.now()) return true;
    if (userProfile.isMemberPlus === true && expMs === 0) return true;
    return false;
}

function getEffectiveUserVariantPrice(item) {
    if (!item) return 0;
    const basePrice = Math.round(Number(item.priceNum || 0));
    if (basePrice <= 0) return 0;
    if (!isUserMemberPlusActive()) return basePrice;

    // 1. Jika variasi memiliki harga khusus Member Plus yang diatur eksplisit
    const customMpPrice = Math.round(Number(item.memberPlusPriceNum || 0));
    if (customMpPrice > 0 && customMpPrice < basePrice) {
        return customMpPrice;
    }

    const procType = String(item.processType || 'auto').toLowerCase();
    const isDf = (procType === 'digiflazz' || procType === 'digiflazz_pasca' || item.isDigiflazz === true);
    if (isDf) {
        // Untuk produk Digiflazz, pastikan tidak pernah di bawah harga modal
        const modal = Math.round(Number(item.digiflazzModalPrice || 0));
        const discPct = Math.max(0, Math.min(50, Number(siteSettings.memberPlusLocalDiscountPct ?? 5)));
        if (discPct > 0 && modal > 0 && basePrice > modal) {
            const profitMargin = basePrice - modal;
            const discounted = basePrice - Math.floor(profitMargin * (discPct / 100));
            return Math.max(modal, discounted);
        }
        return basePrice;
    }

    // 2. Untuk produk lokal / manual, gunakan diskon persentase Member Plus dari Pengaturan Toko
    const localDiscPct = Math.max(0, Math.min(50, Number(siteSettings.memberPlusLocalDiscountPct ?? 5)));
    if (localDiscPct > 0) {
        const cut = Math.round(basePrice * (localDiscPct / 100));
        return Math.max(100, basePrice - cut);
    }
    return basePrice;
}

function normalizeClientDigiflazzCustomerNo(rawTarget, zoneId = '') {
    let s = String(rawTarget || '').trim();
    const z = String(zoneId || '').trim();
    if (!s) return '';

    const idZonePipe = s.match(/ID\s*:\s*([^\s|]+)\s*\|\s*Zone\s*:\s*([^\s|(]+)/i);
    if (idZonePipe) {
        return `${idZonePipe[1].trim()}${idZonePipe[2].trim()}`;
    }

    const parenDigits = s.match(/^([0-9a-zA-Z_-]+)\s*\(\s*([0-9a-zA-Z_-]+)\s*\)$/);
    if (parenDigits) {
        return `${parenDigits[1].trim()}${parenDigits[2].trim()}`;
    }

    s = s.replace(/^(Tujuan|ID\s*Player|ID\s*PLN|ID|Target|No\.?\s*Pelanggan|No\.?\s*Meter|No\.?\s*HP|No\.?\s*Tujuan|No\.?\s*[A-Za-z0-9_-]+)\s*:\s*/i, '').trim();
    if (s.includes(' (')) {
        s = s.split(' (')[0].trim();
    }
    if (z && !s.endsWith(z)) {
        return `${s}${z}`;
    }
    return s;
}

async function activateClientMemberPlusOrder(orderData, orderDbId) {
    if (!orderData || !orderDbId) return false;
    const uid = orderData.userId;
    if (!uid) return false;

    const orderRef = doc(db, pathOrders, orderDbId);
    const userRef = doc(db, pathUsers, uid);
    const nowMs = Date.now();
    const durDays = parseInt(orderData.durationDays || 30, 10) || 30;
    let activatedOk = false;

    try {
        await runTransaction(db, async (tx) => {
            const ordSnap = await tx.get(orderRef);
            if (!ordSnap.exists()) return;
            const oData = ordSnap.data();
            if (oData.memberPlusActivated === true) {
                activatedOk = true;
                return;
            }
            const uSnap = await tx.get(userRef);
            const curExp = uSnap.exists() ? Number(uSnap.data().memberPlusExpiresAt || 0) : 0;
            const baseStart = curExp > nowMs ? curExp : nowMs;
            const nextExp = baseStart + (durDays * 86400000);

            tx.set(userRef, {
                isMemberPlus: true,
                memberPlusSince: uSnap.exists() && uSnap.data().memberPlusSince ? uSnap.data().memberPlusSince : nowMs,
                memberPlusExpiresAt: nextExp,
                updatedAt: nowMs
            }, { merge: true });

            const expDateFmt = new Date(nextExp).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
            const replyText = `[LANGGANAN MEMBER PLUS AKTIF]\nStatus      : MEMBER PLUS VIP\nDurasi      : ${durDays} Hari\nBerlaku s/d : ${expDateFmt}\nKeuntungan  : Harga Spesial Member Plus & Voucher Eksklusif otomatis aktif.`;

            tx.update(orderRef, {
                status: 'SUCCESS',
                paymentVerified: true,
                paidAt: oData.paidAt || nowMs,
                memberPlusActivated: true,
                autoDelivered: true,
                deliveredAt: nowMs,
                subscriptionStartAt: nowMs,
                subscriptionEndAt: nextExp,
                subscriptionStatus: 'ACTIVE',
                adminReply: replyText
            });

            userProfile.isMemberPlus = true;
            userProfile.memberPlusExpiresAt = nextExp;
            activatedOk = true;
        });

        if (activatedOk) {
            window.updateUserGreetingPanelUI();
            window.renderBrands(currentBrandFilter);
            window.showToast('Member Plus Aktif!', 'Selamat! Langganan Member Plus kamu sudah aktif selama 30 hari.', 'success');
        }
        return activatedOk;
    } catch (e) {
        console.warn('Activate Member Plus Error:', e);
        return false;
    }
}

window.updateUserGreetingPanelUI = function() {
    const panel = document.getElementById('user-greeting-dashboard-panel');
    if (!panel) return;

    const now = new Date();
    const hour = now.getHours();
    let greetTime = 'Selamat Malam';
    let greetIcon = 'fa-moon';
    if (hour >= 4 && hour < 11) {
        greetTime = 'Selamat Pagi';
        greetIcon = 'fa-sun';
    } else if (hour >= 11 && hour < 15) {
        greetTime = 'Selamat Siang';
        greetIcon = 'fa-cloud-sun';
    } else if (hour >= 15 && hour < 18) {
        greetTime = 'Selamat Sore';
        greetIcon = 'fa-sun';
    }

    const timeBadgeEl = document.getElementById('user-greeting-time-badge');
    const timeTextEl = document.getElementById('user-greeting-time-text');
    const nameTextEl = document.getElementById('user-greeting-name-text');
    const roleBadgeEl = document.getElementById('user-greeting-role-badge');
    const subTextEl = document.getElementById('user-greeting-sub-text');
    const walletBoxEl = document.getElementById('greeting-wallet-box');
    const walletAmtEl = document.getElementById('greeting-wallet-amount');
    const btnMpEl = document.getElementById('btn-greeting-memberplus');
    const btnMpTxtEl = document.getElementById('btn-greeting-memberplus-text');
    const btnPinShortcut = document.getElementById('btn-greeting-pin-shortcut');

    if (timeBadgeEl) timeBadgeEl.innerHTML = `<i class="fa-regular ${greetIcon}"></i> ${greetTime.toUpperCase()}`;
    if (timeTextEl) timeTextEl.innerText = greetTime;

    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    const isMp = isUserMemberPlusActive();

    if (isMember) {
        const displayName = userProfile.name || (userProfile.email ? userProfile.email.split('@')[0] : 'Member');
        if (nameTextEl) nameTextEl.innerText = displayName;

        if (isMp) {
            const expStr = userProfile.memberPlusExpiresAt
                ? new Date(userProfile.memberPlusExpiresAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
                : 'Aktif';
            if (roleBadgeEl) {
                roleBadgeEl.className = 'memberplus-gold-badge';
                roleBadgeEl.innerHTML = `<i class="fa-solid fa-crown"></i> MEMBER PLUS (s/d ${escapeHtml(expStr)})`;
            }
            if (subTextEl) {
                subTextEl.innerText = 'Harga spesial Member Plus otomatis diterapkan di seluruh produk katalog.';
            }
            // Sembunyikan tombol upgrade Member Plus di panel selamat datang saat langganan masih aktif (#1)
            if (btnMpEl) btnMpEl.style.display = 'none';
        } else {
            if (roleBadgeEl) {
                roleBadgeEl.className = 'brutal-tag tag-success';
                roleBadgeEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> MEMBER RESMI`;
            }
            if (subTextEl) {
                subTextEl.innerText = 'Nikmati transaksi cepat dengan Saldo Akun atau aktifkan Member Plus untuk harga lebih hemat.';
            }
            if (btnMpTxtEl) btnMpTxtEl.innerText = 'Langganan Member Plus';
            if (btnMpEl) btnMpEl.style.display = siteSettings.memberPlusEnabled !== false ? 'inline-flex' : 'none';
        }

        if (walletBoxEl) walletBoxEl.style.display = 'flex';
        if (walletAmtEl) walletAmtEl.innerText = `Rp${Math.round(Number(userProfile.balance || 0)).toLocaleString('id-ID')}`;
        if (btnPinShortcut) btnPinShortcut.style.display = 'inline-flex';
    } else {
        const guestName = userProfile.name || localStorage.getItem('vipercell_anon_name') || 'Pelanggan Tamu';
        if (nameTextEl) nameTextEl.innerText = guestName;
        if (roleBadgeEl) {
            roleBadgeEl.className = 'brutal-tag status-pending';
            roleBadgeEl.innerHTML = `<i class="fa-solid fa-user-astronaut"></i> AKUN TAMU`;
        }
        if (subTextEl) {
            subTextEl.innerText = 'Upgrade ke akun Member gratis untuk membuka fitur Saldo Akun, Promo, dan Member Plus.';
        }
        if (walletBoxEl) walletBoxEl.style.display = 'none';
        if (btnMpEl) btnMpEl.style.display = 'inline-flex';
        if (btnMpTxtEl) btnMpTxtEl.innerText = 'Upgrade ke Member';
        if (btnPinShortcut) btnPinShortcut.style.display = 'none';
    }

    if (typeof window.updateProfileMemberPlusVisuals === 'function') {
        window.updateProfileMemberPlusVisuals();
    }
};

window.updateProfileMemberPlusVisuals = function() {
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    const isMp = isUserMemberPlusActive();

    const avatarWrap = document.getElementById('prof-avatar-box-wrap');
    const crownEl = document.getElementById('prof-avatar-crown');
    const goldBadgeEl = document.getElementById('prof-memberplus-gold-badge');
    const statusBadgeEl = document.getElementById('prof-email-status');
    const manageCardEl = document.getElementById('prof-memberplus-manage-card');
    const mpCardBadge = document.getElementById('prof-mp-card-badge');
    const mpCardDesc = document.getElementById('prof-mp-card-desc');
    const mpCardBtnTxt = document.getElementById('btn-prof-manage-memberplus-text');
    const topupSubtabTxt = document.getElementById('topup-subtab-text-memberplus');

    if (topupSubtabTxt) {
        topupSubtabTxt.innerText = isMp ? 'Kelola Langganan' : 'Member Plus';
    }

    if (!isMember) {
        if (avatarWrap) avatarWrap.classList.remove('memberplus-gold-avatar');
        if (crownEl) crownEl.style.display = 'none';
        if (goldBadgeEl) goldBadgeEl.style.display = 'none';
        if (manageCardEl) manageCardEl.style.display = 'none';
        return;
    }

    if (manageCardEl) {
        manageCardEl.style.display = siteSettings.memberPlusEnabled !== false ? 'block' : 'none';
    }

    if (isMp) {
        const expDateStr = userProfile.memberPlusExpiresAt
            ? new Date(userProfile.memberPlusExpiresAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
            : 'Aktif';
        if (avatarWrap) avatarWrap.classList.add('memberplus-gold-avatar');
        if (crownEl) crownEl.style.display = 'inline-flex';
        if (goldBadgeEl) goldBadgeEl.style.display = 'inline-flex';
        if (statusBadgeEl) {
            statusBadgeEl.className = 'brutal-tag tag-success';
            statusBadgeEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> MEMBER RESMI';
        }
        if (mpCardBadge) {
            mpCardBadge.className = 'memberplus-gold-badge';
            mpCardBadge.innerHTML = '<i class="fa-solid fa-crown"></i> AKTIF';
        }
        if (mpCardDesc) {
            mpCardDesc.innerHTML = `Selamat, kamu terdaftar sebagai <b>Member Plus</b>. Masa aktif langganan berlaku hingga <b>${escapeHtml(expDateStr)}</b>.`;
        }
        if (mpCardBtnTxt) {
            mpCardBtnTxt.innerText = 'Kelola Langganan Member Plus';
        }
    } else {
        if (avatarWrap) avatarWrap.classList.remove('memberplus-gold-avatar');
        if (crownEl) crownEl.style.display = 'none';
        if (goldBadgeEl) goldBadgeEl.style.display = 'none';
        if (mpCardBadge) {
            mpCardBadge.className = 'brutal-tag tag-amber';
            mpCardBadge.innerText = 'BELUM BERLANGGANAN';
        }
        if (mpCardDesc) {
            mpCardDesc.innerText = 'Upgrade ke Member Plus untuk menikmati potongan harga otomatis di seluruh produk katalog.';
        }
        if (mpCardBtnTxt) {
            mpCardBtnTxt.innerText = 'Lihat & Aktifkan Member Plus';
        }
    }
};

window.updateUserTrxPinProfileUI = function() {
    const pinCard = document.getElementById('prof-trx-pin-card');
    const badgeEl = document.getElementById('prof-pin-status-badge');
    const oldGroupEl = document.getElementById('prof-old-pin-group');
    const btnTxtEl = document.getElementById('text-save-user-trx-pin');
    const forgotBtnEl = document.getElementById('btn-forgot-user-trx-pin');
    if (!pinCard) return;

    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    pinCard.style.display = isMember ? 'block' : 'none';
    if (!isMember) return;

    const savedPin = String(userProfile.trxPin || localStorage.getItem(`vipercell_trx_pin_${currentUser?.uid || ''}`) || '').trim();
    const hasPin = savedPin.length === 6;

    if (badgeEl) {
        badgeEl.className = hasPin ? 'brutal-tag tag-success' : 'brutal-tag tag-amber';
        badgeEl.innerHTML = hasPin ? '<i class="fa-solid fa-shield-check"></i> PIN AKTIF' : 'BELUM DISETEL';
    }
    if (oldGroupEl) {
        oldGroupEl.style.display = hasPin ? 'block' : 'none';
    }
    if (forgotBtnEl) {
        forgotBtnEl.style.display = hasPin ? 'inline-flex' : 'none';
    }
    if (btnTxtEl) {
        btnTxtEl.innerText = hasPin ? 'Ubah PIN Transaksi' : 'Simpan PIN Transaksi';
    }
};

window.openForgotTrxPinModal = function() {
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    if (!isMember || !currentUser?.uid) {
        window.customAlert('Khusus Member', 'Silakan masuk ke akun Member terlebih dahulu.', 'warning');
        return;
    }
    const passInp = document.getElementById('reset-pin-account-password');
    const newInp = document.getElementById('reset-pin-new');
    const confInp = document.getElementById('reset-pin-confirm');
    if (passInp) passInp.value = '';
    if (newInp) newInp.value = '';
    if (confInp) confInp.value = '';
    window.openModal('modal-forgot-trx-pin');
};

window.submitResetTrxPinWithPassword = async function() {
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    if (!isMember || !currentUser?.uid) return;

    const accountEmail = (currentUser.email || userProfile.email || '').trim();
    const passVal = (document.getElementById('reset-pin-account-password')?.value || '').trim();
    const newPinVal = (document.getElementById('reset-pin-new')?.value || '').trim();
    const confPinVal = (document.getElementById('reset-pin-confirm')?.value || '').trim();

    if (!passVal) {
        window.customAlert('Kata Sandi Kosong', 'Masukkan kata sandi akun kamu untuk verifikasi keamanan.', 'warning');
        return;
    }
    if (!/^\d{6}$/.test(newPinVal)) {
        window.customAlert('Format PIN Harus 6 Angka', 'PIN Transaksi baru wajib terdiri dari tepat 6 digit angka (0-9).', 'warning');
        return;
    }
    if (newPinVal !== confPinVal) {
        window.customAlert('Konfirmasi PIN Berbeda', 'Ketik ulang 6 digit PIN baru yang sama pada kolom konfirmasi.', 'warning');
        return;
    }
    if (!accountEmail) {
        window.customAlert('Email Tidak Ditemukan', 'Alamat email akun tidak ditemukan. Silakan masuk ulang.', 'error');
        return;
    }

    const btn = document.getElementById('btn-submit-reset-trx-pin');
    const ogHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memverifikasi Sandi...';
    }

    try {
        await signInWithEmailAndPassword(auth, accountEmail, passVal);

        await setDoc(doc(db, pathUsers, currentUser.uid), {
            trxPin: newPinVal,
            trxPinUpdatedAt: Date.now()
        }, { merge: true });

        userProfile.trxPin = newPinVal;
        localStorage.setItem(`vipercell_trx_pin_${currentUser.uid}`, newPinVal);

        window.closeModal('modal-forgot-trx-pin');
        window.updateUserTrxPinProfileUI();
        window.showToast('PIN Berhasil Direset', 'PIN Transaksi 6 digit baru kamu sudah aktif.', 'success');
    } catch (err) {
        window.customAlert('Kata Sandi Salah', 'Kata sandi akun yang kamu masukkan tidak sesuai. Periksa kembali kata sandi login kamu.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = ogHtml;
        }
    }
};

window.saveUserTransactionPin = async function() {
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    if (!isMember || !currentUser?.uid) {
        window.customAlert('Khusus Member', 'Silakan masuk sebagai Member untuk mengatur PIN Transaksi.', 'warning');
        return;
    }

    const savedPin = String(userProfile.trxPin || localStorage.getItem(`vipercell_trx_pin_${currentUser.uid}`) || '').trim();
    const oldPinVal = (document.getElementById('prof-old-trx-pin')?.value || '').trim();
    const newPinVal = (document.getElementById('prof-new-trx-pin')?.value || '').trim();
    const confPinVal = (document.getElementById('prof-confirm-trx-pin')?.value || '').trim();

    if (savedPin.length === 6 && oldPinVal !== savedPin) {
        window.customAlert('PIN Lama Tidak Sesuai', 'Masukkan 6 digit PIN Transaksi lama kamu dengan benar.', 'error');
        return;
    }
    if (!/^\d{6}$/.test(newPinVal)) {
        window.customAlert('Format PIN Harus 6 Angka', 'PIN Transaksi wajib terdiri dari tepat 6 digit angka (0-9).', 'warning');
        return;
    }
    if (newPinVal !== confPinVal) {
        window.customAlert('Konfirmasi PIN Berbeda', 'Ketik ulang 6 digit PIN baru yang sama pada kolom konfirmasi.', 'warning');
        return;
    }

    const btn = document.getElementById('btn-save-user-trx-pin');
    const ogHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan PIN...';
    }

    try {
        await setDoc(doc(db, pathUsers, currentUser.uid), {
            trxPin: newPinVal,
            trxPinUpdatedAt: Date.now()
        }, { merge: true });

        userProfile.trxPin = newPinVal;
        localStorage.setItem(`vipercell_trx_pin_${currentUser.uid}`, newPinVal);

        const oldInp = document.getElementById('prof-old-trx-pin');
        const newInp = document.getElementById('prof-new-trx-pin');
        const confInp = document.getElementById('prof-confirm-trx-pin');
        if (oldInp) oldInp.value = '';
        if (newInp) newInp.value = '';
        if (confInp) confInp.value = '';

        window.updateUserTrxPinProfileUI();
        window.showToast('PIN Tersimpan', 'PIN Transaksi 6 digit kamu berhasil diaktifkan.', 'success');
    } catch (e) {
        window.customAlert('Gagal Menyimpan', 'Tidak dapat menyimpan PIN Transaksi. Periksa koneksi internet kamu.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = ogHtml;
        }
    }
};

window.updateTopupSummaryDisplay = function() {
    const rawAmt = parseInt(document.getElementById('topup-custom-amount')?.value || '0', 10) || 0;
    const dispEl = document.getElementById('topup-summary-total-display');
    if (dispEl) {
        dispEl.innerText = `Rp${Math.max(0, rawAmt).toLocaleString('id-ID')}`;
    }
};

window.renderTopupHistoryList = function() {
    const container = document.getElementById('topup-history-list-container');
    if (!container) return;

    const myUid = currentUser?.uid || userProfile.uid || '';
    const myEmail = (userProfile.email || currentUser?.email || '').toLowerCase();

    const topupOrders = orders.filter(o => {
        const isTopup = Boolean(o.isTopupOrder === true || o.orderType === 'TOPUP_BALANCE' || String(o.id || '').startsWith('TOPUP-'));
        if (!isTopup) return false;
        if (myUid && o.userId === myUid) return true;
        if (myEmail && String(o.userEmail || '').toLowerCase() === myEmail) return true;
        return false;
    }).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

    if (topupOrders.length === 0) {
        container.innerHTML = `
            <div class="brutal-panel" style="padding: 2rem 1rem; text-align: center; background: var(--bg);">
                <i class="fa-solid fa-wallet" style="font-size: 2rem; color: var(--text-muted); margin-bottom: 10px; display: block;"></i>
                <strong style="display:block; font-size:0.92rem; margin-bottom:4px;">Belum Ada Riwayat Isi Saldo</strong>
                <span style="font-size:0.78rem; color:var(--text-muted); font-weight:600;">Seluruh transaksi pengisian saldo kamu akan tercatat di halaman ini.</span>
            </div>`;
        return;
    }

    container.innerHTML = topupOrders.map(o => {
        const amt = Math.round(Number(o.topupAmount || o.baseTotal || o.finalTotal || 0));
        const payTotal = Math.round(Number(o.finalTotal || amt));
        const dtStr = o.date ? new Date(o.date).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
        const payLabel = o.paymentMethod === 'cash' ? 'TUNAI (KASIR)' : 'QRIS OTOMATIS';

        let badgeClass = 'status-pending';
        let badgeLabel = 'MENUNGGU BAYAR';
        if (o.status === 'SUCCESS') {
            badgeClass = 'status-success';
            badgeLabel = 'SALDO MASUK';
        } else if (o.status === 'CANCELLED' || o.status === 'EXPIRED' || o.status === 'FAILED') {
            badgeClass = 'status-failed';
            badgeLabel = o.status === 'EXPIRED' ? 'KEDALUWARSA' : 'DIBATALKAN';
        }

        return `
            <div class="topup-history-card" onclick="window.viewOrderDetail('${escapeJsStr(o.id)}')" style="cursor:pointer;">
                <div>
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
                        <strong class="code-mono" style="font-size:0.84rem;">#${escapeHtml(o.id)}</strong>
                        <span class="status-badge ${badgeClass}" style="font-size:0.65rem; padding:2px 8px;">${badgeLabel}</span>
                    </div>
                    <div style="font-size:0.9rem; font-weight:900; color:var(--text);">Isi Saldo Rp${amt.toLocaleString('id-ID')}</div>
                    <div style="font-size:0.73rem; color:var(--text-muted); font-weight:700; margin-top:2px;">
                        <i class="fa-regular fa-clock"></i> ${escapeHtml(dtStr)} &bull; ${payLabel}
                    </div>
                </div>
                <div style="text-align:right;">
                    <span style="font-size:0.68rem; font-weight:800; color:var(--text-muted); display:block;">TOTAL BAYAR</span>
                    <strong style="font-size:1rem; font-weight:900; color:var(--primary);">Rp${payTotal.toLocaleString('id-ID')}</strong>
                    <div style="margin-top:4px;">
                        <span class="btn btn-outline btn-sm" style="padding:2px 8px; min-height:24px; font-size:0.68rem;">Lihat Struk</span>
                    </div>
                </div>
            </div>`;
    }).join('');
};

function computeVariantComparisonPrices(item) {
    const regularPrice = Math.max(0, Math.round(Number(item?.priceNum || 0)));
    if (item?.isCheckUsernameProduct === true || regularPrice === 0) {
        return { regularPrice: 0, memberPlusPrice: 0, saving: 0 };
    }

    const customMp = Math.round(Number(item?.memberPlusPriceNum || 0));
    if (customMp > 0 && customMp < regularPrice) {
        return {
            regularPrice,
            memberPlusPrice: customMp,
            saving: Math.max(0, regularPrice - customMp)
        };
    }

    const procType = String(item?.processType || 'auto').toLowerCase();
    const isDf = (procType === 'digiflazz' || procType === 'digiflazz_pasca' || item?.isDigiflazz === true);
    const discPct = Math.max(0, Math.min(50, Number(siteSettings.memberPlusLocalDiscountPct ?? 5)));

    if (isDf) {
        const modal = Math.round(Number(item?.digiflazzModalPrice || 0));
        if (discPct > 0 && modal > 0 && regularPrice > modal) {
            const profitMargin = regularPrice - modal;
            const mpPrice = Math.max(modal, regularPrice - Math.floor(profitMargin * (discPct / 100)));
            return { regularPrice, memberPlusPrice: mpPrice, saving: Math.max(0, regularPrice - mpPrice) };
        }
        return { regularPrice, memberPlusPrice: regularPrice, saving: 0 };
    }

    if (discPct > 0) {
        const cut = Math.round(regularPrice * (discPct / 100));
        const mpPrice = Math.max(100, regularPrice - cut);
        return { regularPrice, memberPlusPrice: mpPrice, saving: Math.max(0, regularPrice - mpPrice) };
    }

    return { regularPrice, memberPlusPrice: regularPrice, saving: 0 };
}

window.onChangeMpCompareServiceType = function() {
    const srvSel = document.getElementById('mp-compare-service-type');
    const catSel = document.getElementById('mp-compare-category');
    const brandSel = document.getElementById('mp-compare-brand');
    if (!srvSel || !catSel || !brandSel) return;

    const srv = srvSel.value || 'prabayar';
    const isPasca = (srv === 'pascabayar');

    const catMap = {
        game: 'Top Up Game',
        pulsa: 'Pulsa & Paket Data',
        pln: 'Token Listrik PLN',
        ewallet: 'Saldo E-Wallet',
        app: 'Aplikasi Premium',
        ppob: 'Tagihan Pascabayar (PPOB)'
    };

    const availableCats = [];
    groupedBrands.forEach(b => {
        const bIsPasca = (b.type === 'ppob' || b.items?.some(i => i.processType === 'digiflazz_pasca'));
        if (isPasca && bIsPasca) {
            if (!availableCats.includes('ppob')) availableCats.push('ppob');
        } else if (!isPasca && !bIsPasca) {
            const t = b.type || 'game';
            if (!availableCats.includes(t)) availableCats.push(t);
        }
    });

    if (availableCats.length === 0) {
        catSel.innerHTML = `<option value="">Belum ada kategori ${isPasca ? 'Pascabayar' : 'Prabayar'}</option>`;
        brandSel.innerHTML = '<option value="">-- Pilih Brand --</option>';
        window.renderMpPriceComparisonTable();
        return;
    }

    catSel.innerHTML = availableCats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(catMap[c] || c.toUpperCase())}</option>`).join('');
    window.onChangeMpCompareCategory();
};

window.onChangeMpCompareCategory = function() {
    const srvSel = document.getElementById('mp-compare-service-type');
    const catSel = document.getElementById('mp-compare-category');
    const brandSel = document.getElementById('mp-compare-brand');
    if (!catSel || !brandSel) return;

    const srv = srvSel?.value || 'prabayar';
    const isPasca = (srv === 'pascabayar');
    const selectedCat = catSel.value;

    const matchingBrands = groupedBrands.filter(b => {
        const bIsPasca = (b.type === 'ppob' || b.items?.some(i => i.processType === 'digiflazz_pasca'));
        if (isPasca !== bIsPasca) return false;
        if (selectedCat && b.type !== selectedCat && !(isPasca && selectedCat === 'ppob')) return false;
        return true;
    });

    if (matchingBrands.length === 0) {
        brandSel.innerHTML = '<option value="">-- Belum Ada Brand --</option>';
    } else {
        brandSel.innerHTML = matchingBrands.map(b => `<option value="${escapeHtml(b.brandName)}">${escapeHtml(b.brandName)} (${b.items.length} Produk)</option>`).join('');
    }
    window.renderMpPriceComparisonTable();
};

window.renderMpPriceComparisonTable = function() {
    const wrap = document.getElementById('mp-compare-table-wrapper');
    const brandSel = document.getElementById('mp-compare-brand');
    if (!wrap || !brandSel) return;

    const brandName = brandSel.value;
    const brandObj = groupedBrands.find(b => b.brandName === brandName);
    if (!brandObj || !Array.isArray(brandObj.items) || brandObj.items.length === 0) {
        wrap.innerHTML = `
            <div style="padding: 1.25rem; text-align: center; color: var(--text-muted); font-size: 0.82rem; font-weight: 700;">
                Pilih kategori dan brand di atas untuk menampilkan perbandingan harga Member Biasa dan Member Plus.
            </div>`;
        return;
    }

    const sortedItems = [...brandObj.items].sort((a, b) => (a.priceNum || 0) - (b.priceNum || 0));
    const rowsHtml = sortedItems.map(item => {
        const { regularPrice, memberPlusPrice, saving } = computeVariantComparisonPrices(item);
        if (item.isCheckUsernameProduct === true || regularPrice === 0) {
            return `
                <tr>
                    <td><strong>${escapeHtml(item.name)}</strong> <span class="brutal-tag tag-success" style="font-size:0.62rem;">CEK USERNAME</span></td>
                    <td>GRATIS (Rp0)</td>
                    <td class="mp-price-col-gold">GRATIS (Rp0)</td>
                    <td>-</td>
                </tr>`;
        }
        return `
            <tr>
                <td><strong>${escapeHtml(item.name)}</strong></td>
                <td>Rp${regularPrice.toLocaleString('id-ID')}</td>
                <td class="mp-price-col-gold"><i class="fa-solid fa-crown" style="font-size:0.7rem;"></i> Rp${memberPlusPrice.toLocaleString('id-ID')}</td>
                <td>${saving > 0 ? `<span class="mp-saving-chip">Hemat Rp${saving.toLocaleString('id-ID')}</span>` : '<span style="color:var(--text-muted); font-size:0.74rem;">Harga Sama</span>'}</td>
            </tr>`;
    }).join('');

    wrap.innerHTML = `
        <table class="mp-compare-table">
            <thead>
                <tr>
                    <th>Variasi Produk (${escapeHtml(brandObj.brandName)})</th>
                    <th>Member Biasa</th>
                    <th>Member Plus</th>
                    <th>Selisih Hemat</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
        </table>`;
};

window.switchTopupSubTab = function(subTab = 'topup') {
    const isWalletTab = (subTab === 'topup');
    const isHistoryTab = (subTab === 'history');
    const isMpTab = (subTab === 'memberplus');

    const btnWallet = document.getElementById('topup-subtab-btn-wallet');
    const btnHistory = document.getElementById('topup-subtab-btn-history');
    const btnMp = document.getElementById('topup-subtab-btn-memberplus');
    const panelWallet = document.getElementById('topup-panel-wallet');
    const panelHistory = document.getElementById('topup-panel-history');
    const panelMp = document.getElementById('topup-panel-memberplus');

    if (btnWallet) btnWallet.classList.toggle('active', isWalletTab);
    if (btnHistory) btnHistory.classList.toggle('active', isHistoryTab);
    if (btnMp) btnMp.classList.toggle('active', isMpTab);

    if (panelWallet) panelWallet.style.display = isWalletTab ? 'grid' : 'none';
    if (panelHistory) panelHistory.style.display = isHistoryTab ? 'block' : 'none';
    if (panelMp) panelMp.style.display = isMpTab ? 'grid' : 'none';

    window.updateTopupSummaryDisplay();
    if (typeof window.updateProfileMemberPlusVisuals === 'function') {
        window.updateProfileMemberPlusVisuals();
    }

    if (isHistoryTab) {
        window.renderTopupHistoryList();
    }

    // Update informasi harga & status Kelola Langganan Member Plus
    const mpPrice = Math.max(1000, Math.round(Number(siteSettings.memberPlusMonthlyPrice || 25000)));
    const mpPriceEl = document.getElementById('memberplus-price-display');
    const mpTaglineEl = document.getElementById('memberplus-tagline-display');
    const mpBannerEl = document.getElementById('memberplus-status-banner');
    const mpStatusTxtEl = document.getElementById('memberplus-status-text');
    const mpCelebrationCard = document.getElementById('memberplus-active-celebration-card');
    const mpStartDateEl = document.getElementById('memberplus-active-start-date');
    const mpEndDateEl = document.getElementById('memberplus-active-end-date');
    const mpRemainPill = document.getElementById('memberplus-active-remaining-pill');
    const btnSubmitMp = document.getElementById('btn-submit-memberplus');

    if (mpPriceEl) mpPriceEl.innerText = `Rp${mpPrice.toLocaleString('id-ID')}`;
    if (mpTaglineEl && siteSettings.memberPlusTagline) {
        mpTaglineEl.innerText = siteSettings.memberPlusTagline;
    }

    const activeMp = isUserMemberPlusActive();
    if (mpCelebrationCard) {
        mpCelebrationCard.style.display = activeMp ? 'block' : 'none';
    }

    if (activeMp) {
        const expMs = Number(userProfile.memberPlusExpiresAt || 0);
        const startMs = Number(userProfile.memberPlusSince || (expMs > 0 ? expMs - (30 * 86400000) : Date.now()));
        const startStr = new Date(startMs).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
        const expStr = expMs > 0
            ? new Date(expMs).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
            : 'Aktif';
        const remDays = expMs > Date.now() ? Math.max(1, Math.ceil((expMs - Date.now()) / 86400000)) : 30;

        if (mpStartDateEl) mpStartDateEl.innerText = startStr;
        if (mpEndDateEl) mpEndDateEl.innerText = expStr;
        if (mpRemainPill) mpRemainPill.innerText = `Sisa ${remDays} Hari`;

        if (mpBannerEl && mpStatusTxtEl) {
            mpBannerEl.className = 'brutal-alert-box alert-info';
            mpStatusTxtEl.innerHTML = `Selamat, Anda sekarang <b>Member Plus</b>! Langganan Anda aktif hingga <b>${escapeHtml(expStr)}</b>. Anda dapat memperpanjang masa aktif +30 hari kapan saja.`;
        }
        if (btnSubmitMp) {
            btnSubmitMp.innerHTML = '<i class="fa-solid fa-crown"></i> <span>Perpanjang Member Plus (+30 Hari)</span>';
        }
    } else {
        if (mpBannerEl && mpStatusTxtEl) {
            mpBannerEl.className = 'brutal-alert-box alert-warning';
            mpStatusTxtEl.innerText = 'Kamu belum berlangganan Member Plus. Aktifkan sekarang untuk menikmati harga spesial di semua produk!';
        }
        if (btnSubmitMp) {
            btnSubmitMp.innerHTML = '<i class="fa-solid fa-crown"></i> <span>Aktifkan Member Plus Sekarang</span>';
        }
    }

    if (isMpTab) {
        window.onChangeMpCompareServiceType();
    }
};

window.selectMemberPlusPayMethod = function(method, cardEl) {
    document.querySelectorAll('#topup-panel-memberplus .type-card').forEach(c => c.classList.remove('active'));
    if (cardEl) {
        cardEl.classList.add('active');
        const rad = cardEl.querySelector('input[type="radio"]');
        if (rad) rad.checked = true;
    }
};

window.processMemberPlusSubscriptionCheckout = async function() {
    if (isProcessingCheckout) return;
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    if (!isMember || !currentUser?.uid) {
        window.openUpgradeMemberModal();
        window.showToast('Khusus Member', 'Daftar atau masuk ke akun Member terlebih dahulu untuk berlangganan Member Plus.', 'warning');
        return;
    }

    const mpPrice = Math.max(1000, Math.round(Number(siteSettings.memberPlusMonthlyPrice || 25000)));
    const payMethod = document.querySelector('input[name="mp_payment_method"]:checked')?.value || 'qris';

    if (payMethod === 'balance') {
        const curBal = Math.round(Number(userProfile.balance || 0));
        if (curBal < mpPrice) {
            window.customAlert(
                'Saldo Akun Tidak Cukup',
                `Saldo kamu saat ini <b>Rp${curBal.toLocaleString('id-ID')}</b>, sedangkan biaya Member Plus adalah <b>Rp${mpPrice.toLocaleString('id-ID')}</b>. Silakan isi saldo atau pilih metode QRIS.`,
                'warning'
            );
            return;
        }
    }

    const now = Date.now();
    let uniqueCode = 0;
    if (payMethod === 'qris') {
        uniqueCode = Math.floor(Math.random() * 250) + 1;
        let safetyTry = 0;
        while (orders.some(o => (o.status === 'UNPAID' || o.status === 'PENDING_PAYMENT') && o.finalTotal === (mpPrice + uniqueCode)) && safetyTry < 40) {
            uniqueCode = Math.floor(Math.random() * 450) + 1;
            safetyTry++;
        }
    }
    const finalTotal = mpPrice + uniqueCode;
    let invId = 'MPLUS-' + Math.floor(100000 + Math.random() * 900000);
    while (orders.some(o => o.id === invId)) {
        invId = 'MPLUS-' + Math.floor(100000 + Math.random() * 900000);
    }

    const userEm = userProfile.email || currentUser.email || 'member@vipercell.com';
    const mpItem = {
        cartId: now.toString(),
        productDbId: 'MEMBER_PLUS_30D',
        brandName: 'Vipercell VIP',
        exactItemName: 'Member Plus (30 Hari)',
        name: 'Langganan Member Plus (30 Hari)',
        priceNum: mpPrice,
        qty: 1,
        type: 'membership',
        processType: 'auto',
        durationDays: 30,
        playerInfo: `Member: ${userProfile.name || userEm}`
    };

    const isPaidByBalance = (payMethod === 'balance');

    const newMpOrder = {
        id: invId,
        orderId: invId,
        isMemberPlusOrder: true,
        memberPlusActivated: false,
        orderType: 'MEMBER_PLUS_SUB',
        userEmail: userEm,
        buyerEmail: userEm,
        buyerName: userProfile.name || 'Member',
        userPhone: '',
        userId: currentUser.uid,
        isAnonymousOrder: false,
        deviceId: currentDeviceId,
        targetId: currentUser.uid,
        productName: 'Vipercell VIP',
        variantName: 'Member Plus (30 Hari)',
        items: [mpItem],
        finalTotal: finalTotal,
        uniqueTotal: finalTotal,
        baseTotal: mpPrice,
        uniqueCode: uniqueCode,
        promoCode: '',
        promoDiscount: 0,
        durationDays: 30,
        status: isPaidByBalance ? 'SUCCESS' : 'UNPAID',
        paymentVerified: isPaidByBalance,
        paidAt: isPaidByBalance ? now : 0,
        paymentMethod: payMethod,
        adminReply: '',
        emailSent: false,
        date: new Date(now).toISOString(),
        expiresAt: now + 900000
    };

    const btn = document.getElementById('btn-submit-memberplus');
    const ogHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses...';
    }

    try {
        if (isPaidByBalance) {
            const userRef = doc(db, pathUsers, currentUser.uid);
            await runTransaction(db, async (tx) => {
                const uSnap = await tx.get(userRef);
                const curBal = uSnap.exists() ? Math.round(Number(uSnap.data().balance || 0)) : 0;
                if (curBal < finalTotal) throw new Error('INSUFFICIENT_BALANCE');
                const nextBal = curBal - finalTotal;
                tx.set(userRef, { balance: nextBal, balanceUpdatedAt: now }, { merge: true });
                userProfile.balance = nextBal;
            });
            window.updateUserWalletBalanceUI();

            await addDoc(collection(db, pathBalanceLogs), {
                uid: currentUser.uid,
                userEmail: userEm,
                type: 'MEMBER_PLUS',
                amount: -finalTotal,
                orderId: invId,
                note: 'Aktivasi Langganan Member Plus (30 Hari)',
                createdAt: now
            }).catch(() => {});
        }

        const docRef = await addDoc(collection(db, pathOrders), newMpOrder);
        currentCheckoutSession = {
            dbId: docRef.id,
            id: invId,
            brandName: 'Vipercell VIP',
            itemName: mpItem.name,
            finalTotal: finalTotal,
            method: payMethod,
            date: newMpOrder.date
        };

        if (isPaidByBalance) {
            await activateClientMemberPlusOrder({ ...newMpOrder, dbId: docRef.id }, docRef.id);
            window.showPaymentSuccessAnimation(invId, 'SUCCESS');
        } else if (payMethod === 'qris') {
            setTimeout(() => window.openQRISModal(), 60);
        } else {
            setTimeout(() => window.openCashBarcodeModal(), 60);
        }
    } catch (e) {
        window.customAlert('Gagal', 'Tidak dapat memproses aktivasi Member Plus.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = ogHtml;
        }
    }
};

window.onInputAutoCheckPlnSubscriber = function() {
    window.resetPlnAndPascaCheck();
    const val = (document.getElementById('buy-id')?.value || '').replace(/[^0-9]/g, '');
    const statusBox = document.getElementById('pln-auto-detect-status');
    const step2Card = document.getElementById('checkout-step-02-card');

    if (plnAutoCheckDebounceTimer) clearTimeout(plnAutoCheckDebounceTimer);

    if (val.length < 10) {
        if (statusBox) {
            statusBox.style.display = val.length > 0 ? 'inline-flex' : 'none';
            statusBox.innerHTML = `<i class="fa-solid fa-keyboard"></i> Ketik minimal 10-12 digit ID PLN...`;
        }
        return;
    }

    if (statusBox) {
        statusBox.style.display = 'inline-flex';
        statusBox.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Mengecek Pelanggan PLN...`;
    }

    plnAutoCheckDebounceTimer = setTimeout(async () => {
        await window.userCheckPlnSubscriber();
        if (verifiedPlnSubscriber && step2Card) {
            step2Card.style.opacity = '1';
            step2Card.style.pointerEvents = 'auto';
            if (statusBox) {
                statusBox.style.display = 'inline-flex';
                statusBox.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${escapeHtml(verifiedPlnSubscriber.name || 'Terverifikasi')}`;
            }
        } else if (statusBox) {
            statusBox.style.display = 'inline-flex';
            statusBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ID Tidak Ditemukan`;
        }
    }, 550);
};

window.onInputPascaCustomerNo = function() {
    window.resetPlnAndPascaCheck();
    const val = (document.getElementById('buy-id')?.value || '').trim();
    if (pascaInputDebounceTimer) clearTimeout(pascaInputDebounceTimer);
    if (val.length >= 8 && selectedProductForBuy) {
        pascaInputDebounceTimer = setTimeout(() => {
            window.userCheckPascaBill();
        }, 700);
    }
};

let currentShareReceiptInvId = '';

function renderOrderReceiptFallbackCanvas(order, cleanInv) {
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 960;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(32, 32, canvas.width - 64, canvas.height - 64);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;
    ctx.strokeRect(32, 32, canvas.width - 64, canvas.height - 64);

    // Header
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(32, 32, canvas.width - 64, 110);
    ctx.fillStyle = '#facc15';
    ctx.font = '900 32px sans-serif';
    const storeTitle = `${siteSettings.logoText || 'VIPER'}${siteSettings.logoAccent || 'CELL'}`;
    ctx.fillText(storeTitle, 64, 88);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 16px sans-serif';
    ctx.fillText('BUKTI TRANSAKSI RESMI', 64, 118);

    const statusStr = order?.status === 'SUCCESS' ? 'TRANSAKSI BERHASIL' : (order?.status || 'DIPROSES');
    ctx.fillStyle = order?.status === 'SUCCESS' ? '#16a34a' : '#d97706';
    ctx.font = '900 22px sans-serif';
    ctx.fillText(statusStr, 64, 190);

    const rows = [
        ['Nomor Invoice', `#${cleanInv}`],
        ['Waktu Transaksi', order?.date ? new Date(order.date).toLocaleString('id-ID') : new Date().toLocaleString('id-ID')],
        ['Produk & Layanan', order?.items?.[0]?.name || order?.productName || '-'],
        ['Data Tujuan', order?.items?.[0]?.playerInfo || order?.targetId || '-'],
        ['Atas Nama', order?.verifiedTargetName || order?.plnSubscriberName || '-'],
        ['Metode Pembayaran', order?.paymentMethod === 'balance' ? 'SALDO AKUN' : (order?.paymentMethod === 'cash' ? 'TUNAI (KASIR)' : 'QRIS OTOMATIS')],
        ['SN / Referensi', order?.digiflazzSn || '-'],
        ['Total Pembayaran', `Rp${Number(order?.finalTotal || 0).toLocaleString('id-ID')}`]
    ];

    let y = 245;
    rows.forEach(([label, val], idx) => {
        ctx.fillStyle = '#64748b';
        ctx.font = '700 17px sans-serif';
        ctx.fillText(label.toUpperCase(), 64, y);

        ctx.fillStyle = idx === rows.length - 1 ? '#2563eb' : '#0f172a';
        ctx.font = idx === rows.length - 1 ? '900 26px sans-serif' : '800 20px sans-serif';
        const safeVal = String(val || '-').slice(0, 44);
        ctx.fillText(safeVal, 64, y + 28);

        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(64, y + 46);
        ctx.lineTo(canvas.width - 64, y + 46);
        ctx.stroke();
        y += 74;
    });

    if (order?.adminReply) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(64, y - 10, canvas.width - 128, 86);
        ctx.fillStyle = '#0f172a';
        ctx.font = '700 15px monospace';
        const firstLine = String(order.adminReply).split('\n')[0].slice(0, 52);
        ctx.fillText(firstLine, 80, y + 35);
    }

    return canvas;
}

async function generateReceiptCanvasElement(invId) {
    const cleanInv = String(invId || '').trim().replace(/^#/, '');
    const order = orders.find(o => String(o.id || '').toUpperCase() === cleanInv.toUpperCase());
    const cardEl = document.getElementById(`ereceipt-capture-card-${cleanInv}`) || document.querySelector('.ereceipt-ticket');

    if (cardEl && typeof html2canvas !== 'undefined') {
        try {
            const canvas = await html2canvas(cardEl, {
                backgroundColor: document.documentElement.getAttribute('data-theme') === 'dark' ? '#131b2e' : '#ffffff',
                scale: 2,
                useCORS: true,
                allowTaint: true,
                logging: false,
                ignoreElements: (el) => el.hasAttribute && el.hasAttribute('data-html2canvas-ignore')
            });
            if (canvas && canvas.width > 10 && canvas.height > 10) {
                return canvas;
            }
        } catch (err) {}
    }
    return renderOrderReceiptFallbackCanvas(order, cleanInv);
}

function buildShareReceiptTextSummary(invId) {
    const cleanInv = String(invId || '').trim().replace(/^#/, '');
    const order = orders.find(o => String(o.id || '').toUpperCase() === cleanInv.toUpperCase());
    const itemTitle = order?.items?.[0]?.name || order?.productName || 'Produk Digital Vipercell';
    const targetInfo = order?.items?.[0]?.playerInfo || order?.targetId || '-';
    const totalFmt = `Rp${Number(order?.finalTotal || 0).toLocaleString('id-ID')}`;
    const snLine = order?.digiflazzSn ? `\nSN / Ref: ${order.digiflazzSn}` : '';
    const nameLine = order?.verifiedTargetName ? `\nAtas Nama: ${order.verifiedTargetName}` : '';
    return `*BUKTI TRANSAKSI RESMI VIPERCELL*\nNo. Invoice : #${cleanInv}\nProduk      : ${itemTitle}\nTujuan      : ${targetInfo}${nameLine}${snLine}\nTotal Bayar : ${totalFmt}\nStatus      : ${order?.status === 'SUCCESS' ? 'BERHASIL' : (order?.status || 'SELESAI')}`;
}

window.downloadOrderReceiptImage = async function(invId) {
    const cleanInv = String(invId || currentShareReceiptInvId || '').trim().replace(/^#/, '');
    if (!cleanInv) return;

    try {
        window.showToast('Menyiapkan Struk...', 'Sedang merender gambar struk transaksi.', 'info');
        const canvas = await generateReceiptCanvasElement(cleanInv);
        const dataUrl = canvas.toDataURL('image/png');

        const link = document.createElement('a');
        link.download = `Struk_Vipercell_${cleanInv}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => link.remove(), 250);

        window.showToast('Struk Tersimpan', `Gambar struk #${cleanInv}.png berhasil diunduh.`, 'success');
    } catch (e) {
        window.customAlert('Gagal Menyimpan Gambar', 'Browser kamu membatasi pengunduhan otomatis. Silakan coba lagi.', 'error');
    }
};

window.shareOrderReceipt = function(invId) {
    const cleanInv = String(invId || '').trim().replace(/^#/, '');
    if (!cleanInv) return;
    currentShareReceiptInvId = cleanInv;
    const subEl = document.getElementById('share-receipt-subtitle');
    if (subEl) {
        subEl.innerText = `Pilih tujuan untuk membagikan atau menyimpan struk transaksi #${cleanInv}.`;
    }
    window.openModal('modal-share-receipt');
};

window.executeShareReceiptAction = async function(actionType) {
    const cleanInv = String(currentShareReceiptInvId || '').trim().replace(/^#/, '');
    if (!cleanInv) return;
    const shareText = buildShareReceiptTextSummary(cleanInv);

    if (actionType === 'download_png') {
        window.closeModal('modal-share-receipt');
        await window.downloadOrderReceiptImage(cleanInv);
        return;
    }

    if (actionType === 'copy_text') {
        try {
            await navigator.clipboard.writeText(shareText.replace(/\*/g, ''));
            window.closeModal('modal-share-receipt');
            window.showToast('Rincian Struk Disalin', `Teks struk #${cleanInv} berhasil disalin.`, 'success');
        } catch (e) {
            window.customAlert('Rincian Struk', `<pre style="text-align:left; font-size:0.78rem; white-space:pre-wrap;">${escapeHtml(shareText.replace(/\*/g, ''))}</pre>`, 'info');
        }
        return;
    }

    if (actionType === 'whatsapp') {
        window.closeModal('modal-share-receipt');
        const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
        window.open(waUrl, '_blank', 'noopener,noreferrer');
        return;
    }

    if (actionType === 'telegram') {
        window.closeModal('modal-share-receipt');
        const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(window.location.origin)}&text=${encodeURIComponent(shareText.replace(/\*/g, ''))}`;
        window.open(tgUrl, '_blank', 'noopener,noreferrer');
        return;
    }

    if (actionType === 'native_image') {
        try {
            window.showToast('Menyiapkan Gambar...', 'Sedang menyiapkan gambar struk untuk dibagikan.', 'info');
            const canvas = await generateReceiptCanvasElement(cleanInv);
            const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
            if (blob && navigator.canShare) {
                const file = new File([blob], `Struk_Vipercell_${cleanInv}.png`, { type: 'image/png' });
                if (navigator.canShare({ files: [file] })) {
                    window.closeModal('modal-share-receipt');
                    await navigator.share({
                        title: `Struk Vipercell #${cleanInv}`,
                        text: shareText.replace(/\*/g, ''),
                        files: [file]
                    });
                    return;
                }
            }
            if (navigator.share) {
                window.closeModal('modal-share-receipt');
                await navigator.share({
                    title: `Struk Vipercell #${cleanInv}`,
                    text: shareText.replace(/\*/g, '')
                });
                return;
            }
            window.closeModal('modal-share-receipt');
            await window.downloadOrderReceiptImage(cleanInv);
        } catch (err) {
            if (err && err.name === 'AbortError') return;
            await window.downloadOrderReceiptImage(cleanInv);
        }
    }
};

// Jalankan Inisialisasi Aplikasi setelah seluruh fungsi dan modul siap
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAppWithLoader);
} else {
    initializeAppWithLoader();
}