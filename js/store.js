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

const fallbackSettingsPath = isWorkspace ? 'settings' : `artifacts/${appId}/public/data/settings`;

// Durasi pembersihan sesi tamu otomatis di latar belakang (6 jam)
const ANON_AUTO_DELETE_TTL_MS = 6 * 60 * 60 * 1000;

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
    waterRippleEnabled: true,
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

function initWaterRippleBackground() {
    if (waterRippleEngine.initialized) {
        updateWaterRippleVisibility();
        return;
    }
    const canvas = document.getElementById('water-ripple-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    waterRippleEngine.initialized = true;
    waterRippleEngine.canvas = canvas;
    waterRippleEngine.ctx = ctx;

    const SCALE = 0.65;
    const resizeCanvas = () => {
        canvas.width = Math.max(1, Math.round(window.innerWidth * SCALE));
        canvas.height = Math.max(1, Math.round(window.innerHeight * SCALE));
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, { passive: true });

    const spawnRipple = (x, y, isBurst = false) => {
        if (siteSettings.waterRippleEnabled === false || document.hidden) return;
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const palette = isDark ? DARK_RIPPLE_COLORS : LIGHT_RIPPLE_COLORS;
        const colorPrefix = palette[Math.floor(Math.random() * palette.length)];

        waterRippleEngine.ripples.push({
            x: x * SCALE,
            y: y * SCALE,
            radius: isBurst ? 4 : 2,
            maxRadius: isBurst ? 86 : 52,
            speed: isBurst ? 1.8 : 1.3,
            alpha: isBurst ? 0.48 : 0.30,
            lineWidth: isBurst ? 2.2 : 1.5,
            colorPrefix,
            secondRing: isBurst
        });

        if (waterRippleEngine.ripples.length > 16) {
            waterRippleEngine.ripples.shift();
        }

        if (!waterRippleEngine.animFrameId) {
            waterRippleEngine.animFrameId = requestAnimationFrame(renderWaterRipplesLoop);
        }
    };

    window.addEventListener('pointerdown', (e) => {
        spawnRipple(e.clientX, e.clientY, true);
    }, { passive: true });

    window.addEventListener('pointermove', (e) => {
        const now = performance.now();
        if (now - waterRippleEngine.lastMoveTime > 55) {
            waterRippleEngine.lastMoveTime = now;
            spawnRipple(e.clientX, e.clientY, false);
        }
    }, { passive: true });

    window.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches[0]) {
            spawnRipple(e.touches[0].clientX, e.touches[0].clientY, true);
        }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        const now = performance.now();
        if (now - waterRippleEngine.lastMoveTime > 65 && e.touches && e.touches[0]) {
            waterRippleEngine.lastMoveTime = now;
            spawnRipple(e.touches[0].clientX, e.touches[0].clientY, false);
        }
    }, { passive: true });

    updateWaterRippleVisibility();
}

function updateWaterRippleVisibility() {
    const canvas = waterRippleEngine.canvas || document.getElementById('water-ripple-canvas');
    if (!canvas) return;
    if (siteSettings.waterRippleEnabled === false) {
        canvas.style.display = 'none';
        waterRippleEngine.ripples = [];
        if (waterRippleEngine.ctx) {
            waterRippleEngine.ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
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

function updateOpHoursBannerUI() {
    const bannerEl = document.getElementById('operational-hours-banner');
    const textEl = document.getElementById('operational-hours-text');
    if (!bannerEl || !textEl) return;

    const restricted = isLocalStockOnlyRestrictionActive();
    if (restricted) {
        const openStr = siteSettings.opOpenTime || '08:00';
        const closeStr = siteSettings.opCloseTime || '22:00';
        textEl.innerText = `Saat ini di luar jam operasional (${openStr} - ${closeStr}). Hanya produk yang memiliki stok lokal tersedia yang dapat dibeli langsung.`;
        bannerEl.style.display = 'flex';
    } else {
        bannerEl.style.display = 'none';
    }
}

// ==========================================
// WEBHOOK CALLER & ANTI-DUPLIKAT EMAIL
// ==========================================
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
            throw new Error('Respons server email tidak valid.');
        }

        if (!result || (result.ok === false && result.status !== 'ok')) {
            throw new Error((result && result.message) || (result && result.error) || 'Gagal menghubungi server email.');
        }
        return result;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function sendOrderReceiptAndAccountEmail(orderData, accountDetailsText, orderDbId = null) {
    if (!orderData || !orderData.id) return false;
    // [FITUR #3] Jika opsi notifikasi & kirim struk ke email dimatikan oleh pengguna, batalkan pengiriman otomatis
    if (orderData.emailReceiptEnabled === false || userProfile.emailReceiptEnabled === false || !isUserEmailReceiptEnabled) {
        return false;
    }
    const invKey = String(orderData.id).trim().toUpperCase();
    const localSentKey = `vipercell_email_sent_${invKey}`;

    if (
        orderData.emailSent === true ||
        orderData.emailSending === true ||
        sentEmailOrderIds.has(invKey) ||
        inFlightEmailOrderIds.has(invKey) ||
        localStorage.getItem(localSentKey) === '1'
    ) {
        return true;
    }

    const gasUrl = (siteSettings.emailWebhookUrl || '').trim();
    const buyerEmail = (orderData.userEmail || orderData.buyerEmail || '').trim();
    if (!gasUrl || !buyerEmail || !buyerEmail.includes('@')) return false;

    const resolvedDbId = orderDbId || orderData.dbId;

    inFlightEmailOrderIds.add(invKey);
    sentEmailOrderIds.add(invKey);
    try { localStorage.setItem(localSentKey, '1'); } catch (e) {}

    if (resolvedDbId) {
        try {
            const latestSnap = await getDoc(doc(db, pathOrders, resolvedDbId));
            if (latestSnap.exists()) {
                const latestData = latestSnap.data();
                if (latestData.emailSent === true || latestData.emailSending === true) {
                    inFlightEmailOrderIds.delete(invKey);
                    return true;
                }
            }
            await updateDoc(doc(db, pathOrders, resolvedDbId), {
                emailSent: true,
                emailSending: false,
                emailSentAt: Date.now()
            }).catch(() => {});
        } catch (e) {}
    }

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
            itemName: itemObj.name || 'Produk Vipercell',
            totalAmount: finalNominal,
            uniqueTotal: finalNominal,
            totalFormatted: `Rp ${finalNominal.toLocaleString('id-ID')}`,
            targetId: itemObj.playerInfo || orderData.targetId || '-',
            accountDetails: accountDetailsText || orderData.adminReply || 'Pesanan selesai diproses.',
            durationDays: Number(itemObj.durationDays || orderData.durationDays || 0),
            subscriptionEndAt: Number(orderData.subscriptionEndAt || 0),
            emailReceiptEnabled: true
        });
        return true;
    } catch (e) {
        sentEmailOrderIds.delete(invKey);
        try { localStorage.removeItem(localSentKey); } catch (err) {}
        if (resolvedDbId) {
            await updateDoc(doc(db, pathOrders, resolvedDbId), { emailSent: false }).catch(() => {});
        }
        return false;
    } finally {
        inFlightEmailOrderIds.delete(invKey);
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
    updateProfileEmailReceiptToggleUI();

    const savedTheme = localStorage.getItem('vipercell_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const icon = document.getElementById('theme-icon');
    if (icon) icon.className = savedTheme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
    const themeLbl = document.getElementById('theme-label-text');
    if (themeLbl) themeLbl.innerText = savedTheme === 'dark' ? 'Gelap' : 'Terang';

    const savedSessionMode = localStorage.getItem('vipercell_active_session_mode');
    const hasSavedSession = (savedSessionMode === 'member' || savedSessionMode === 'guest');

    // Jangan tampilkan tab-auth jika pengguna memiliki sesi tersimpan (#7)
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

    // Hidrasi instan dari cache lokal agar First Contentful Paint & LCP sangat cepat (< 0.6s) (#5)
    hydrateStoreFromFastCache();

    if (activeTimersRegistry.preloaderSafety) clearTimeout(activeTimersRegistry.preloaderSafety);
    activeTimersRegistry.preloaderSafety = setTimeout(() => {
        if (!isPreloaderFinished) {
            unlockAppUI();
        }
    }, 950);

    try {
        updatePreloaderStage(40, 'Memuat toko...', '');
        setPersistence(auth, browserLocalPersistence).catch(() => {});

        // Jalankan pengecekan identitas, sesi Auth, dan pengambilan data awal secara PARALEL (#5)
        const [, initialUser] = await Promise.all([
            initDeviceIdentity(),
            checkAuthStateFirstLoad(),
            fetchInitialStoreDataWithGatekeeper()
        ]);

        saveStoreToFastCache();
        listenData();
        setupAuthStateListener();
        startOpHoursWatcher();
        startFastQrisWebhookPolling();

        const sessionMode = localStorage.getItem('vipercell_active_session_mode');
        if (initialUser && !initialUser.isAnonymous && sessionMode !== 'logged_out') {
            boundLegacyGuestUid = null;
            await clearMultiLayerToken('vipercell_anon_uid');
            await syncUserProfileFromAuth(initialUser);

            const restricted = await checkRealtimeAccountRestriction(false);
            if (!restricted) {
                localStorage.setItem('vipercell_active_session_mode', 'member');
                setAuthGateLock(false);
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

        updatePreloaderStage(100, 'Siap', '');
        setTimeout(unlockAppUI, 50);
    } catch (error) {
        console.error("Init Error:", error);
        setAuthGateLock(true);
        unlockAppUI();
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

        await setDoc(doc(db, pathUsers, effectiveUid), { ...userProfile, lastActiveAt: nowMs }, { merge: true }).catch(() => {});

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
// UPGRADE AKUN TAMU KE MEMBER (TANPA MEMINTA NO HP #3)
// ==========================================
window.openUpgradeMemberModal = function() {
    const nameInp = document.getElementById('upg-name');
    const emailInp = document.getElementById('upg-email');
    const passInp = document.getElementById('upg-pass');
    const passConfInp = document.getElementById('upg-pass-confirm');
    const otpInp = document.getElementById('upg-otp-input');

    const savedName = userProfile.name && !userProfile.name.startsWith('Tamu #') ? userProfile.name : '';
    if (nameInp) nameInp.value = savedName;
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
    const email = document.getElementById('upg-email')?.value.trim().toLowerCase() || '';
    const password = document.getElementById('upg-pass')?.value || '';
    const passwordConfirm = document.getElementById('upg-pass-confirm')?.value || '';

    if (!name || !email || !email.includes('@')) {
        window.customAlert('Data Belum Lengkap', 'Harap isi Nama Panggilan dan Email aktif.', 'warning');
        return;
    }
    if (password.length < 6) {
        window.customAlert('Sandi Terlalu Pendek', 'Kata sandi minimal 6 karakter.', 'warning');
        return;
    }
    if (password !== passwordConfirm) {
        window.customAlert('Sandi Tidak Cocok', 'Konfirmasi kata sandi tidak sama.', 'warning');
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
        window.showToast('Kode OTP Terkirim', `Cek kotak masuk atau spam email ${email}`, 'success');
    } catch (err) {
        window.customAlert('Gagal Mengirim OTP', 'Pastikan alamat email aktif dan coba lagi.', 'error');
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
        window.customAlert('Kode OTP Belum Lengkap', 'Masukkan 6 digit kode OTP dari email kamu.', 'warning');
        return;
    }

    if (!pendingUpgradeState.otpCode || Date.now() > pendingUpgradeState.otpExpiresAt) {
        window.customAlert('Kode OTP Kedaluwarsa', 'Masa berlaku kode OTP telah habis. Silakan kirim ulang.', 'error');
        return;
    }

    if (inputOtp !== pendingUpgradeState.otpCode) {
        window.customAlert('Kode OTP Salah', 'Kode OTP yang dimasukkan tidak sesuai.', 'error');
        return;
    }

    const { name, email, password } = pendingUpgradeState;
    const btn = document.getElementById('btn-submit-upgrade');
    const ogHtml = btn ? btn.innerHTML : '';
    isUpgradingAccount = true;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Memproses...</span>';
    }

    try {
        const previousAnonUid = boundLegacyGuestUid || userProfile.uid || (auth.currentUser?.isAnonymous ? auth.currentUser.uid : null);
        await ensureAuthSession();
        const activeUser = auth.currentUser;
        let finalUid = activeUser ? activeUser.uid : null;

        localStorage.setItem('vipercell_active_session_mode', 'member');

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

        if (previousAnonUid && previousAnonUid !== finalUid) {
            const oldOrders = orders.filter(o => o.userId === previousAnonUid);
            for (const ord of oldOrders) {
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
        pendingUpgradeState = { name: '', email: '', password: '', otpCode: '', otpExpiresAt: 0 };
        if (otpResendTimer) clearInterval(otpResendTimer);
        if (activeTimersRegistry.anonSixHourCountdown) clearInterval(activeTimersRegistry.anonSixHourCountdown);

        await clearMultiLayerToken('vipercell_anon_uid');
        localStorage.removeItem('vipercell_anon_session_started_at');
        localStorage.removeItem('vipercell_guest_email');
        localStorage.setItem('vipercell_member_email', email);

        userProfile = memberData;
        window.closeModal('modal-upgrade-member');
        setAuthGateLock(false);
        applyUserSessionToUI();
        window.renderUserOrders();
        updateProfileStats();

        window.customAlert(
            'Upgrade Berhasil',
            `Akun kamu kini telah aktif sebagai Member.`,
            'success'
        );
    } catch (error) {
        if (error.code === 'auth/credential-already-in-use' || error.code === 'auth/email-already-in-use') {
            window.customAlert(
                'Email Sudah Terdaftar',
                'Email ini sudah terdaftar sebelumnya. Silakan gunakan email lain atau masuk ke akun kamu.',
                'warning'
            );
        } else {
            window.customAlert('Gagal Upgrade', 'Pastikan format email benar dan koneksi internet stabil.', 'error');
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

    // [FITUR #5] Saat di luar jam operasional toko, hanya produk yang memiliki stok lokal tersedia yang bisa dibeli
    if (opRestricted) {
        if (procType === 'manual' || item.type === 'game') {
            return 0;
        }
        return totalLocalVaultStock > 0 ? totalLocalVaultStock : 0;
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
        if (orderData.status !== 'SUCCESS') {
            await updateDoc(doc(db, pathOrders, orderDbId), { status: 'SUCCESS', paymentVerified: true }).catch(() => {});
        }
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
        // Jika produk bertipe manual atau game (dikirim oleh Admin), setelah bayar statusnya wajib PENDING (#1)
        if (procType === 'manual' || item.type === 'game') {
            await updateDoc(doc(db, pathOrders, orderDbId), {
                status: 'PENDING',
                paymentVerified: true,
                paidAt: orderData.paidAt || nowMs,
                ...subUpdates
            }).catch(() => {});
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

            await sendOrderReceiptAndAccountEmail({
                ...orderData,
                ...subUpdates,
                adminReply: finalReply
            }, finalReply, orderDbId);
            return true;
        } else {
            // Tidak ada stok lokal tersedia -> akan dikirim oleh Admin, sehingga status menjadi PENDING (#1)
            await updateDoc(doc(db, pathOrders, orderDbId), {
                status: 'PENDING',
                paymentVerified: true,
                paidAt: orderData.paidAt || nowMs,
                ...subUpdates
            }).catch(() => {});
            return false;
        }
    } catch (err) {
        console.error("Auto-Delivery Error:", err);
        return false;
    } finally {
        setTimeout(() => deliveringOrderIds.delete(orderDbId), 4000);
    }
}

// ==========================================
// REAL-TIME DATA LISTENER FIRESTORE & LOGIKA STATUS PEMBAYARAN (#1)
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
        updateWaterRippleVisibility();
        updateOpHoursBannerUI();
        window.renderBrands(currentBrandFilter);
        if (currentCheckoutBrand) {
            renderCheckoutVariantCards();
            window.calculateDirectBuyTotal();
        }
        await checkRealtimeAccountRestriction(true);
    });

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
                            mutObjListMatch(mut.candidateAmounts);
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
            if (data.emailSent === true && data.id) {
                sentEmailOrderIds.add(String(data.id).toUpperCase());
            }

            const orderTime = new Date(data.date).getTime();
            const expiryLimitMs = data.expiresAt ? (data.expiresAt - orderTime) : 900000;
            const orderEmail = (data.userEmail || '').toLowerCase();

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

            // [FITUR #1] Jika pembayaran diterima (status PAID atau baru saja terverifikasi tapi belum dikirim stok):
            // Coba kirim stok lokal otomatis. Jika ada stok lokal -> SUCCESS, jika tidak ada stok lokal -> PENDING.
            if (data.status === 'PAID' || (data.status === 'SUCCESS' && !data.adminReply && !data.autoDelivered)) {
                if (isMyOrder) {
                    tryAutoDeliverOrderFromVault(data, data.dbId);
                }
            }

            newOrders.push(data);

            if (!initialOrderLoad && isMyOrder) {
                const prevInfo = previousOrdersData[data.id] || {};
                const oldStatus = prevInfo.status;
                const oldPaid = prevInfo.paymentVerified;

                // Tampilkan animasi pembayaran diterima saat beralih dari UNPAID/PAID ke SUCCESS atau ke PENDING (yang sudah dibayar)
                if (oldStatus && (oldStatus === 'UNPAID' || oldStatus === 'PENDING_PAYMENT' || oldStatus === 'PAID')) {
                    if (data.status === 'SUCCESS') {
                        window.showPaymentSuccessAnimation(data.id, 'SUCCESS');
                    } else if (data.status === 'PENDING' && data.paymentVerified === true) {
                        window.showPaymentSuccessAnimation(data.id, 'PENDING');
                    }
                } else if (oldStatus === 'PENDING' && !oldPaid && data.status === 'PENDING' && data.paymentVerified === true) {
                    window.showPaymentSuccessAnimation(data.id, 'PENDING');
                } else if (oldStatus === 'PENDING' && data.status === 'SUCCESS') {
                    window.showToast('Pesanan Selesai', `Pesanan #${data.id} telah dikirim oleh Admin.`, 'success', () => window.openOrderDetailModalById(data.id));
                }
            }
            if (data.status !== 'PAID') {
                previousOrdersData[data.id] = {
                    status: data.status,
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

function mutObjListMatch(candidateAmounts) {
    (candidateAmounts || []).forEach(amt => checkClientPendingOrdersAgainstAmount(Number(amt)));
}

// Saat nominal mutasi QRIS cocok dengan tagihan UNPAID (#1 & #4):
// Cek apakah produk punya stok lokal. Jika ada -> langsung kirim & SUCCESS. Jika tidak ada -> PENDING (Menunggu Dikirim Admin).
async function checkClientPendingOrdersAgainstAmount(detectedAmount, rawNotifText = '') {
    const numAmt = Math.round(Number(detectedAmount) || 0);
    const matchingUnpaid = orders.find(o => {
        if (o.status !== 'UNPAID' && o.status !== 'PENDING_PAYMENT') return false;
        const fTotal = Math.round(Number(o.finalTotal) || 0);
        const uTotal = Math.round(Number(o.uniqueTotal) || 0);
        if (numAmt > 0 && (fTotal === numAmt || uTotal === numAmt)) return true;
        if (rawNotifText && fTotal > 0) {
            const dotStr = fTotal.toLocaleString('id-ID');
            const commaStr = dotStr.replace(/\./g, ',');
            if (rawNotifText.includes(dotStr) || rawNotifText.includes(commaStr) || rawNotifText.includes(String(fTotal))) {
                return true;
            }
        }
        return false;
    });
    if (matchingUnpaid) {
        const delivered = await tryAutoDeliverOrderFromVault(matchingUnpaid, matchingUnpaid.dbId);
        const activeTab = document.querySelector('.main-tab-content.active');
        if (activeTab && activeTab.id === 'tab-payment-qris' && currentCheckoutSession?.id === matchingUnpaid.id) {
            window.showPaymentSuccessAnimation(matchingUnpaid.id, delivered ? 'SUCCESS' : 'PENDING');
        }
        return true;
    }
    return false;
}

// Engine Polling Cepat ke Google Apps Script untuk Verifikasi QRIS Otomatis Anti-Gagal (#4)
async function pollGasWebhookForPaymentVerification() {
    if (isPollingGasPayment) return false;
    const gasUrl = (siteSettings.emailWebhookUrl || '').trim();
    if (!gasUrl || !gasUrl.startsWith('https://script.google.com/')) return false;

    const now = Date.now();
    const myUnpaidQrisOrders = orders.filter(o =>
        (o.status === 'UNPAID' || o.status === 'PENDING_PAYMENT') &&
        (o.paymentMethod || 'qris') === 'qris' &&
        (now - new Date(o.date).getTime() < 900000)
    );

    if (myUnpaidQrisOrders.length === 0 && (!currentCheckoutSession || currentCheckoutSession.method !== 'qris')) {
        return false;
    }

    const targetOrder = (currentCheckoutSession && myUnpaidQrisOrders.find(o => o.dbId === currentCheckoutSession.dbId))
        || myUnpaidQrisOrders[0];

    if (!targetOrder) return false;

    isPollingGasPayment = true;
    try {
        const targetAmt = Math.round(Number(targetOrder.finalTotal || targetOrder.uniqueTotal || 0));
        const orderStartMs = new Date(targetOrder.date).getTime();
        const sep = gasUrl.includes('?') ? '&' : '?';
        const checkUrl = `${gasUrl}${sep}action=CHECK_PAYMENT&amount=${targetAmt}&since=${orderStartMs}&t=${now}`;

        const resp = await fetch(checkUrl, {
            method: 'GET',
            redirect: 'follow',
            cache: 'no-store'
        });
        const raw = await resp.text();
        let data = null;
        try { data = JSON.parse(raw); } catch (e) {}

        if (data && data.ok) {
            if (data.matched && data.matchedMutation) {
                await checkClientPendingOrdersAgainstAmount(targetAmt, data.matchedMutation.rawText || '');
                return true;
            }
            if (Array.isArray(data.recentMutations)) {
                for (const mut of data.recentMutations) {
                    if (!mut) continue;
                    const mutTime = Number(mut.timestamp || 0);
                    if (mutTime > 0 && mutTime < (orderStartMs - 90000)) continue;

                    const cands = Array.isArray(mut.candidateAmounts) ? mut.candidateAmounts : [mut.amount];
                    for (const cAmt of cands) {
                        const hit = await checkClientPendingOrdersAgainstAmount(Number(cAmt), mut.rawText || '');
                        if (hit) return true;
                    }
                }
            }
        }
    } catch (e) {
        // Silent ignore on network jitter
    } finally {
        isPollingGasPayment = false;
    }
    return false;
}

function startFastQrisWebhookPolling() {
    if (fastQrisWebhookPollInterval) clearInterval(fastQrisWebhookPollInterval);
    fastQrisWebhookPollInterval = setInterval(() => {
        if (!document.hidden) {
            pollGasWebhookForPaymentVerification();
        }
    }, 2800);
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

    window.renderBrands(currentBrandFilter);
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
        // Cek langsung ke Google Apps Script Memory + Firestore secara paralel (#4)
        const gasMatched = await pollGasWebhookForPaymentVerification();
        if (gasMatched) return;

        const orderRef = doc(db, pathOrders, currentCheckoutSession.dbId);
        const [orderSnap, settingsSnap] = await Promise.all([
            getDoc(orderRef).catch(() => null),
            getDoc(doc(db, pathSettings, 'mainConfig')).catch(() => null)
        ]);

        if (orderSnap && orderSnap.exists()) {
            const oData = { dbId: orderSnap.id, ...orderSnap.data() };
            if (oData.status === 'SUCCESS') {
                window.showPaymentSuccessAnimation(oData.id, 'SUCCESS');
                return;
            }
            if (oData.status === 'PENDING' && oData.paymentVerified === true) {
                window.showPaymentSuccessAnimation(oData.id, 'PENDING');
                return;
            }
            if (oData.status === 'PAID') {
                const delivered = await tryAutoDeliverOrderFromVault(oData, oData.dbId);
                window.showPaymentSuccessAnimation(oData.id, delivered ? 'SUCCESS' : 'PENDING');
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
                    const orderObj = orders.find(o => o.dbId === currentCheckoutSession.dbId) || { id: currentCheckoutSession.id, dbId: currentCheckoutSession.dbId };
                    const delivered = await tryAutoDeliverOrderFromVault(orderObj, currentCheckoutSession.dbId);
                    window.showPaymentSuccessAnimation(currentCheckoutSession.id, delivered ? 'SUCCESS' : 'PENDING');
                    return;
                }
            }
        }

        window.showToast('Menunggu Pembayaran', `Pastikan transfer sesuai nominal Rp${(currentCheckoutSession.finalTotal || 0).toLocaleString('id-ID')}.`, 'info');
    } catch (err) {
        window.showToast('Gagal Mengecek', 'Periksa koneksi internet kamu.', 'warning');
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

window.toggleCatalogShowAll = function() {
    isCatalogExpanded = true;
    window.renderBrands(currentBrandFilter);
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
        grid.innerHTML = `<div class="brutal-empty-box" style="grid-column: 1/-1;">Produk tidak ditemukan.</div>`; 
        return; 
    }

    const opRestricted = isLocalStockOnlyRestrictionActive();
    let html = '';

    filteredBrands.forEach((b) => {
        const safeJsBrand = escapeJsStr(b.brandName);
        const safeHtmlBrand = escapeHtml(b.brandName);
        
        const hasAnyPurchasableVariant = b.items.some(it => {
            const avail = computeVariantAvailableStock(it);
            if (opRestricted) return typeof avail === 'number' && avail > 0;
            return !it.soldOut || (typeof avail === 'number' && avail > 0);
        });

        let tagClass = 'tag-app';
        let tagLabel = 'APLIKASI';
        if (b.isGangguan) {
            tagClass = 'tag-maint';
            tagLabel = 'GANGGUAN';
        } else if (opRestricted && !hasAnyPurchasableVariant) {
            tagClass = 'tag-maint';
            tagLabel = 'TUTUP JAM OPS';
        } else if (b.type === 'game') {
            tagClass = 'tag-game';
            tagLabel = 'GAME';
        } else if (b.type === 'tools') {
            tagClass = 'tag-tools';
            tagLabel = 'TOOLS';
        }

        const imgHtml = b.imgUrlBase64 
             ? `<img src="${b.imgUrlBase64}" alt="${safeHtmlBrand}" loading="lazy" decoding="async">` 
             : `<div style="width:100%; height:100%; background:var(--primary); display:flex; align-items:center; justify-content:center; font-size:1.7rem; font-weight:800; color:#ffffff;">${safeHtmlBrand.charAt(0)}</div>`;
             
        let clickAction = `window.openDirectBuyModal('${safeJsBrand}')`;
        if (b.isGangguan) {
            clickAction = `window.customAlert('Maintenance', 'Layanan produk ini sedang dalam pemeliharaan.', 'warning')`;
        } else if (opRestricted && !hasAnyPurchasableVariant) {
            clickAction = `window.showToast('Di Luar Jam Operasional', 'Saat ini di luar jam operasional (${escapeJsStr(siteSettings.opOpenTime || '08:00')} - ${escapeJsStr(siteSettings.opCloseTime || '22:00')}). Produk ini belum memiliki stok lokal.', 'warning')`;
        }

        const cssClass = (b.isGangguan || (opRestricted && !hasAnyPurchasableVariant)) ? 'brand-card sold-out' : 'brand-card';
        
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
            (item.variantDesc || item.description || '').toLowerCase().includes(currentVariantSearchQuery)
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
        const isQuotaEmpty = hasStockQuota && availQuota === 0;

        // Jika di luar jam operasional toko, variasi yang tidak memiliki stok lokal dikunci (#5)
        const isLockedByOpHours = opRestricted && (availQuota === null || availQuota <= 0);
        const isSold = isLockedByOpHours
            ? true
            : (procType === 'auto' && hasStockQuota && availQuota > 0 ? false : Boolean(item.soldOut || isQuotaEmpty));

        const isSelected = !isSold && selectedProductForBuy && selectedProductForBuy.dbId === item.dbId;

        let procBadge = '';
        if (isLockedByOpHours) {
            procBadge = '<span class="proc-mode-badge proc-mode-manual">DI LUAR JAM OPS</span>';
        } else if (procType === 'manual') {
            procBadge = '<span class="proc-mode-badge proc-mode-manual">ADMIN</span>';
        } else if (procType === 'ask_auto' || procType === 'hybrid') {
            procBadge = '<span class="proc-mode-badge proc-mode-ask-auto">TANYA / AUTO</span>';
        } else {
            procBadge = '<span class="proc-mode-badge proc-mode-auto">INSTAN</span>';
        }

        const varDescText = (item.variantDesc || item.description || '').trim();
        const varDescHtml = varDescText
            ? `<div class="item-variant-desc">${escapeHtml(varDescText)}</div>`
            : '';

        let badgesHtml = '';
        if (item.durationDays && item.durationDays > 0) {
            badgesHtml += `<span class="item-duration-pill"><i class="fa-regular fa-clock"></i> ${item.durationDays} Hari</span>`;
        }
        if (hasStockQuota) {
            badgesHtml += `<span class="item-stock-pill">Stok: <b>${availQuota >= 999 ? 'Tersedia' : availQuota}</b></span>`;
        }

        const clickHandler = isSold
            ? (isLockedByOpHours ? `window.showToast('Di Luar Jam Operasional', 'Varian ini membutuhkan pengiriman Admin dan baru dapat dibeli pada jam operasional (${escapeJsStr(siteSettings.opOpenTime || '08:00')} - ${escapeJsStr(siteSettings.opCloseTime || '22:00')}).', 'warning')` : '')
            : `window.selectItemToBuy('${item.dbId}')`;

        html += `
            <div class="item-card ${isSold ? 'sold-out' : ''} ${isSelected ? 'selected' : ''}" id="buy-card-${item.dbId}" onclick="${clickHandler}">
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

// ==========================================
// CHECKOUT, PROMO KHUSUS MEMBER (#11), TANPA NO HP (#3) & JAM OPERASIONAL (#5)
// ==========================================
window.openDirectBuyModal = function(brandName) {
    const brandObj = groupedBrands.find(b => b.brandName === brandName);
    if (!brandObj) return;
    if (brandObj.isGangguan) {
        window.customAlert('Maintenance', 'Layanan produk ini sedang dalam pemeliharaan.', 'warning');
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
    let badgeTypeLabel = 'APLIKASI';
    if (brandObj.type === 'game') badgeTypeLabel = 'GAME';
    else if (brandObj.type === 'tools') badgeTypeLabel = 'TOOLS';
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
    let extraDesc = fmtDesc ? `<div style="font-size:0.84rem; font-weight:600; color:var(--text); background:var(--bg); padding:12px; border-radius:10px; border:1.5px solid var(--border); margin-bottom:12px;">${fmtDesc}</div>` : '';
    
    if (!fmtDesc || brandObj.desc.length < 130) {
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
    } else if (brandObj.type === 'game' || (brandObj.type === 'tools' && inpType && inpType !== 'none')) {
        if (inpType === 'id_only') {
            fields.innerHTML = `
                ${extraDesc}
                <div class="form-group" style="margin-bottom:0;">
                    <label for="buy-id">ID Player / UID Tujuan <span style="color:var(--danger)">*</span></label>
                    <input type="text" id="buy-id" class="form-control" placeholder="Masukkan ID Player" required>
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
                </div>`;
        }
    } else {
        fields.innerHTML = `
            ${extraDesc}
            <div class="brutal-alert-box" style="background:var(--bg); color:var(--text);">
                <i class="fa-solid fa-circle-check text-primary"></i>
                <span>Detail akun akan dikirim ke halaman Pesanan & Email kamu setelah pembayaran diterima.</span>
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
    
    window.calculateDirectBuyTotal();
    window.renderReviewsUI();
    window.switchMainTab('checkout');
};

window.selectItemToBuy = function(dbId) {
    const candidate = currentCheckoutBrand.items.find(i => i.dbId === dbId);
    if (!candidate) return;

    const opRestricted = isLocalStockOnlyRestrictionActive();
    const availQuota = computeVariantAvailableStock(candidate);

    if (opRestricted && (availQuota === null || availQuota <= 0)) {
        window.showToast('Di Luar Jam Operasional', 'Saat ini di luar jam operasional. Hanya variasi yang memiliki stok lokal tersedia yang bisa dibeli.', 'warning');
        return;
    }

    selectedProductForBuy = candidate;
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

    if (typeof availQuota === 'number' && availQuota < 999) {
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
            window.showToast('Batas Stok', `Maksimal stok tersedia adalah ${availQuota}.`, 'warning');
        }
    }

    input.value = newVal;
    window.calculateDirectBuyTotal();
};

// [FITUR #11] Kode Promo Wajib Hanya Bisa Digunakan oleh Member (Tanpa Teks Aturan di Web)
window.applyPromoDirect = function() {
    const codeInput = document.getElementById('buy-promo-code').value.trim().toUpperCase();
    const msgEl = document.getElementById('buy-promo-msg');
    
    if (!codeInput) {
        appliedPromo = null; window.calculateDirectBuyTotal(); return;
    }
    
    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);

    // Semua kode promo wajib khusus Member (#11)
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

    const opRestricted = isLocalStockOnlyRestrictionActive();
    const availQuota = computeVariantAvailableStock(selectedProductForBuy);
    if (opRestricted && (availQuota === null || availQuota <= 0)) {
        btnProc.innerHTML = '<i class="fa-solid fa-clock"></i> <span>Di Luar Jam Operasional</span>';
        btnProc.disabled = true;
        return;
    }
    
    btnProc.innerHTML = '<i class="fa-solid fa-bolt"></i> <span id="btn-process-text">Beli Sekarang</span>'; 
    btnProc.disabled = false;
};

window.processDirectCheckout = async function() {
    if (isProcessingCheckout || !selectedProductForBuy) return;
    
    if (siteSettings.isStoreOpen === false) {
        window.customAlert('Toko Sedang Tutup', 'Maaf, toko sedang tutup sementara.', 'warning');
        return;
    }

    const opRestricted = isLocalStockOnlyRestrictionActive();
    const availQuota = computeVariantAvailableStock(selectedProductForBuy);
    if (opRestricted && (availQuota === null || availQuota <= 0)) {
        window.customAlert('Di Luar Jam Operasional', `Saat ini di luar jam operasional (${siteSettings.opOpenTime || '08:00'} - ${siteSettings.opCloseTime || '22:00'}). Hanya produk yang memiliki stok lokal tersedia yang bisa dibeli langsung.`, 'warning');
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

    if (appliedPromo) {
        if (!isMember) {
            appliedPromo = null;
            window.calculateDirectBuyTotal();
            window.customAlert('Khusus Member', 'Kode promo hanya dapat digunakan oleh Member.', 'warning');
            return;
        }
        const promoDoc = promos.find(x => x.code === appliedPromo.code);
        if (promoDoc) {
            if (promoDoc.onePerEmail !== false) {
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
    }
    
    const qty = parseInt(document.getElementById('buy-qty').value) || 1;
    if (typeof availQuota === 'number' && availQuota < qty) {
        window.customAlert('Stok Tidak Cukup', `Sisa stok tersedia untuk variasi ini adalah ${availQuota}.`, 'warning');
        return;
    }
    
    let playerInfo = '';
    let rawTargetId = '';
    const buyIdEl = document.getElementById('buy-id');
    if (buyIdEl) {
        const pid = buyIdEl.value.trim();
        const zol = document.getElementById('buy-zone') ? document.getElementById('buy-zone').value.trim() : '';
        if (!pid) {
            window.customAlert('Data Tujuan Kosong', 'Harap isi kolom Data Tujuan terlebih dahulu.', 'warning');
            return;
        }
        rawTargetId = zol ? `${pid} (${zol})` : pid;

        let inpType = currentCheckoutBrand.items[0]?.inputType || 'id_zone';
        if (currentCheckoutBrand.type === 'app') playerInfo = `Tujuan: ${pid}`;
        else if (inpType === 'id_only') playerInfo = `ID: ${pid}`;
        else if (inpType === 'custom' || inpType === 'roblox') playerInfo = `Target: ${pid}`;
        else playerInfo = `ID: ${pid} | Zone: ${zol}`;
    } else {
        const typeLabel = currentCheckoutBrand.type === 'tools' ? 'Tools' : 'Aplikasi';
        playerInfo = `${typeLabel}`;
    }

    await ensureAuthSession();
    const effectiveUid = isMember ? currentUser.uid : (boundLegacyGuestUid || currentUser?.uid || userProfile.uid || null);

    const now = Date.now();
    const paymentMethod = document.querySelector('input[name="payment_method"]:checked').value;

    const existingActiveOrder = orders.find(o => {
        const isSameUser = effectiveUid && o.userId === effectiveUid;
        const isStillActive = (o.status === 'UNPAID' || o.status === 'PENDING_PAYMENT') && (now - new Date(o.date).getTime() < 900000);
        const isSameItem = o.items && o.items[0] &&
                           o.items[0].productDbId === selectedProductForBuy.dbId &&
                           o.items[0].qty === qty &&
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
    const ogHtml = btnProc.innerHTML;
    btnProc.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Memproses...</span>';
    btnProc.disabled = true;

    saveActiveSessionContact(emailInput);
    
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

    // Semua pesanan yang belum dibayar dimulai dari status UNPAID (Menunggu Pembayaran #1)
    const newOrder = {
        id: invId, 
        orderId: invId,
        userEmail: emailInput,
        buyerEmail: emailInput,
        buyerName: userProfile.name || emailInput.split('@')[0],
        userPhone: '',
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
        status: 'UNPAID',
        paymentVerified: false,
        paymentMethod: paymentMethod,
        adminReply: '',
        emailSent: false,
        emailReceiptEnabled: Boolean(isUserEmailReceiptEnabled),
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
            setTimeout(() => window.openQRISModal(), 50);
        } else {
            setTimeout(() => window.openCashBarcodeModal(), 50);
        }
    } catch (e) { 
        window.customAlert("Gagal", "Gagal membuat pesanan, silakan coba lagi.", "error"); 
    } finally {
        setTimeout(() => {
            isProcessingCheckout = false;
            btnProc.innerHTML = ogHtml;
            btnProc.disabled = false;
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
        heroTitle = 'Pesanan Terkirim & Selesai';
        heroDesc = 'Pembayaran telah diterima dan rincian pesanan sudah dikirimkan di bawah ini.';
    } else if (isPendingAdmin) {
        sBadge = 'status-pending';
        sName = 'DIPROSES ADMIN (PENDING)';
        heroClass = 'hero-pending';
        heroIcon = 'fa-user-clock';
        heroTitle = 'Pembayaran Diterima — Menunggu Dikirim Admin';
        heroDesc = 'Pembayaran kamu sudah kami terima. Pesanan sedang disiapkan dan akan segera dikirim oleh Admin.';
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
        heroDesc = 'Silakan buat pesanan baru jika masih ingin melanjutkan pembelian.';
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
    } else if (isCancelled || order.status === 'EXPIRED') {
        if (brandName) {
            actionHtml = `<button class="btn btn-primary" style="width:100%; margin-top:0.9rem;" onclick="window.closeModal('modal-order-detail'); window.openDirectBuyModal('${safeJsBrand}')"><i class="fa-solid fa-rotate-right"></i> Pesan Ulang Produk Ini</button>`;
        }
    } else if (isDeliveredSuccess) {
        const alreadyReviewed = hasOrderBeenReviewed(order);
        if (!alreadyReviewed && brandName) {
            actionHtml = `
                <button class="btn btn-warning" style="width:100%; margin-top:0.9rem;" onclick="window.goToReview('${safeJsBrand}', '${order.id}')"><i class="fa-solid fa-star"></i> Beri Ulasan Produk</button>`;
        } else if (alreadyReviewed) {
            actionHtml = `
                <div style="margin-top:0.9rem; text-align:center; font-size:0.76rem; font-weight:800; color:var(--success); padding:7px; border:1.5px dashed var(--success); border-radius:8px;"><i class="fa-solid fa-circle-check"></i> Terima kasih, pesanan ini sudah kamu ulas</div>`;
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
    
    let replyHtml = '';
    if (isDeliveredSuccess && order.adminReply) {
        const quickCopyButtonsHtml = buildQuickCopyCredentialButtons(order.adminReply);
        replyHtml = `
        <div class="ereceipt-cred-vault">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                <span style="font-weight: 900; color: var(--success); font-size: 0.82rem; display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-key"></i> RINCIAN AKUN / PESANAN TERKIRIM:
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

    return `
    <div class="ereceipt-ticket">
        <div class="ereceipt-top-banner">
            <div>
                <span style="font-size:0.65rem; font-weight:900; color:var(--text-muted); display:block; letter-spacing:0.04em;">ID TRANSAKSI</span>
                <div class="ereceipt-inv-code">
                    <span>#${escapeHtml(order.id)}</span>
                    <button class="mini-copy-btn" onclick="navigator.clipboard.writeText('${escapeJsStr(order.id)}'); window.showToast('Disalin','ID Transaksi berhasil disalin','success');" title="Salin ID"><i class="fa-regular fa-copy"></i></button>
                </div>
            </div>
            <span class="status-badge ${sBadge}">${sName}</span>
        </div>

        <!-- Hero Penjelasan Status Pesanan (#1) -->
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
                <span class="estep-label">3. ${isPendingAdmin ? 'Diproses Admin' : 'Selesai'}</span>
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
                    <strong>${order.paymentMethod === 'cash' ? 'TUNAI (KASIR)' : 'QRIS OTOMATIS'}</strong>
                </div>
                <div class="ereceipt-meta-cell" style="grid-column: 1 / -1;">
                    <span>EMAIL PENGIRIMAN</span>
                    <strong>${escapeHtml(order.userEmail || '-')}</strong>
                </div>
            </div>

            <div class="ereceipt-product-box">
                <span style="font-size:0.65rem; font-weight:900; color:var(--text-muted); display:block; margin-bottom:2px;">ITEM PESANAN</span>
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

        // Multi-Layer Write: tulis ke product_suggestions, dengan fallback ke koleksi chats & settings/mainConfig
        // agar 100% berhasil meskipun Firestore Rules membatasi koleksi baru (#1)
        let savedSuccess = false;

        try {
            await setDoc(doc(db, pathSuggestions, suggestionId), suggestionPayload);
            savedSuccess = true;
        } catch (primaryErr) {
            console.warn("Primary suggestion write fallback:", primaryErr);
        }

        try {
            await setDoc(doc(db, pathChats, suggestionId), {
                ...suggestionPayload,
                uid: suggestionId,
                userInfo: `[SARAN PRODUK] ${senderName || 'Pelanggan'}`,
                updatedAt: nowMs
            }, { merge: true });
            savedSuccess = true;
        } catch (chatFallbackErr) {}

        try {
            await setDoc(doc(db, pathSettings, 'mainConfig'), {
                suggestionsList: arrayUnion(suggestionPayload)
            }, { merge: true });
            savedSuccess = true;
        } catch (settingsFallbackErr) {}

        if (!savedSuccess && siteSettings.emailWebhookUrl) {
            await callUnifiedGasWebhook({
                action: 'SAVE_PRODUCT_SUGGESTION',
                ...suggestionPayload
            });
            savedSuccess = true;
        }

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

function updateProfileEmailReceiptToggleUI() {
    const statusText = document.getElementById('prof-email-receipt-status-text');
    const toggleBtn = document.getElementById('btn-prof-toggle-email-receipt');
    const iconEl = document.getElementById('prof-email-receipt-icon');
    const iconBox = document.getElementById('prof-email-receipt-icon-box');

    if (!statusText || !toggleBtn || !iconEl) return;

    if (isUserEmailReceiptEnabled) {
        statusText.innerText = 'Aktif (Struk otomatis dikirim ke email)';
        statusText.style.color = 'var(--success)';
        toggleBtn.innerText = 'Matikan';
        toggleBtn.className = 'btn btn-sm btn-danger';
        iconEl.className = 'fa-solid fa-envelope-circle-check';
        if (iconBox) {
            iconBox.style.background = 'rgba(16, 185, 129, 0.15)';
            iconBox.style.color = 'var(--success)';
        }
    } else {
        statusText.innerText = 'Nonaktif (Email tidak dapat dikirim sistem/admin)';
        statusText.style.color = 'var(--text-muted)';
        toggleBtn.innerText = 'Aktifkan';
        toggleBtn.className = 'btn btn-sm btn-primary';
        iconEl.className = 'fa-regular fa-envelope';
        if (iconBox) {
            iconBox.style.background = 'var(--surface-hover)';
            iconBox.style.color = 'var(--text-muted)';
        }
    }
}

window.toggleUserEmailReceiptSetting = async function() {
    isUserEmailReceiptEnabled = !isUserEmailReceiptEnabled;
    userProfile.emailReceiptEnabled = isUserEmailReceiptEnabled;
    localStorage.setItem('vipercell_email_receipt_enabled', isUserEmailReceiptEnabled ? 'on' : 'off');
    updateProfileEmailReceiptToggleUI();

    const isMember = Boolean(currentUser && !currentUser.isAnonymous && !userProfile.isGuest);
    const effectiveUid = isMember ? currentUser.uid : (boundLegacyGuestUid || currentUser?.uid || userProfile.uid || '');

    if (effectiveUid) {
        await setDoc(doc(db, pathUsers, effectiveUid), {
            emailReceiptEnabled: isUserEmailReceiptEnabled,
            updatedAt: Date.now()
        }, { merge: true }).catch(() => {});

        // Sinkronkan juga ke pesanan pengguna agar Web Admin langsung mengetahui status izin email (#3)
        const myOrders = orders.filter(o => o.userId === effectiveUid);
        for (const ord of myOrders.slice(0, 15)) {
            if (ord.dbId) {
                updateDoc(doc(db, pathOrders, ord.dbId), {
                    emailReceiptEnabled: isUserEmailReceiptEnabled
                }).catch(() => {});
            }
        }
    }

    if (isUserEmailReceiptEnabled) {
        window.showToast('Struk Email Aktif', 'Notifikasi & pengiriman struk ke email diaktifkan.', 'success');
    } else {
        window.showToast('Struk Email Nonaktif', 'Pengiriman struk ke email oleh sistem maupun admin telah dimatikan.', 'info');
    }
};

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

    if (tab !== 'payment-qris' && activeTimersRegistry.qrisCountdown) {
        clearInterval(activeTimersRegistry.qrisCountdown);
        activeTimersRegistry.qrisCountdown = null;
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
        requestAnimationFrame(() => {
            tabEl.classList.add('active');
        });
        window.scrollTo({ top: 0, behavior: 'instant' }); 
    }
    
    if (tab === 'bantuan') {
        window.switchBantuanSubTab(currentBantuanSubTab);
    }
    if (tab === 'profil') {
        applyUserSessionToUI();
        updateProfileStats();
        updateProfileNotifToggleUI();
        updateProfileEmailReceiptToggleUI();
    }
    if (tab === 'pesanan') window.renderUserOrders();
    setTimeout(observeReveals, 40);
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

function renderInteractiveMarqueeUI() {
    const marqueeContent = document.getElementById('marquee-content');
    if (!marqueeContent) return;

    const slots = buildStructuredMarqueeSlots();

    const repeatFactor = slots.length > 0 && slots.length < 5 ? Math.ceil(6 / slots.length) : 1;
    const expandedCount = slots.length * repeatFactor;
    const durationSec = Math.max(26, expandedCount * 5.5);
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

    renderFooterMarqueeUI();
}

function renderFooterMarqueeUI() {
    const footerTrack = document.getElementById('footer-marquee-content');
    if (!footerTrack) return;

    const rawFooter = String(
        siteSettings.footerMarquee ||
        'TERIMA KASIH TELAH BERBELANJA DI VIPERCELL — LAYANAN APLIKASI PREMIUM, TOP UP GAME & PRODUK DIGITAL || TRANSAKSI OTOMATIS & BERGARANSI — HUBUNGI CS BANTUAN JIKA BUTUH PANDUAN'
    ).trim();

    let items = [];
    if (Array.isArray(siteSettings.footerMarqueeList) && siteSettings.footerMarqueeList.length > 0) {
        items = siteSettings.footerMarqueeList
            .map(it => (typeof it === 'string' ? it.trim() : String(it?.text || '').trim()))
            .filter(Boolean);
    }
    if (items.length === 0) {
        const parts = rawFooter.includes('||') ? rawFooter.split('||') : rawFooter.split(/\r?\n/);
        items = parts.map(s => s.trim()).filter(Boolean);
    }
    if (items.length === 0) {
        items = ['TERIMA KASIH TELAH BERBELANJA DI VIPERCELL'];
    }

    const repeatFactor = items.length < 4 ? Math.ceil(5 / items.length) : 1;
    const totalCount = items.length * repeatFactor;
    const durationSec = Math.max(28, totalCount * 7);
    footerTrack.style.setProperty('--footer-marquee-duration', `${durationSec}s`);

    const buildPass = () => items.map(txt => `
        <span class="footer-bead-item" onclick="window.switchMainTab('katalog')">
            <span class="bead-ornament" aria-hidden="true">•◦✦◦•</span>
            <span class="footer-glow-text">${escapeHtml(txt)}</span>
        </span>
    `).join('');

    const half = Array.from({ length: repeatFactor }, () => buildPass()).join('');
    footerTrack.innerHTML = half + half;
}

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

// Jalankan Inisialisasi Aplikasi
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAppWithLoader);
} else {
    initializeAppWithLoader();
}