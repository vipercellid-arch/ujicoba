import { 
    db, auth,
    signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword,
    sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, onAuthStateChanged,
    signOut, setPersistence, browserLocalPersistence,
    doc, setDoc, getDoc, updateDoc, deleteDoc, onSnapshot, collection, addDoc, increment, arrayUnion, query, where, getDocs 
} from './firebase.js';

// ==========================================
// KONFIGURASI DATABASE (KOMPATIBEL DATA LAMA & BARU)
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

const fallbackSettingsPath = isWorkspace ? 'settings' : `artifacts/${appId}/public/data/settings`;

// ==========================================
// STATE & VARIABEL GLOBAL (V23)
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
    adminWa: '085656321860',
    igLink: '',
    ttLink: '',
    newsList: [],
    banners: [],
    isStoreOpen: true,
    waChannelLink: ''
};

let userProfile = { name: '', email: '', phone: '', isGuest: true };
let currentUser = null;
let currentCheckoutBrand = null;
let selectedProductForBuy = null;
let appliedPromo = null; 
let currentCheckoutSession = null; 
let userChatMessages = [];
let chatUnsubscribe = null;
let initialOrderLoad = true;
let isSettingsLoaded = false; 
let previousOrdersData = {}; 
let qrisInterval = null;
let currentOpenedArticle = null;

// Filter & Sortir Katalog + Riwayat
let currentBrandFilter = 'all';
let currentSearchQuery = '';
let currentUserHistoryFilter = 'ALL';

// Preferensi Notifikasi User (Bisa ON / OFF dari Tab Profil)
let isUserNotifEnabled = localStorage.getItem('vipercell_user_notif') !== 'off';

// Gembok Anti-Dobel Transaksi & Ulasan
let isProcessingCheckout = false;
let isSubmittingReview = false;
let targetReviewOrderId = null;

// ==========================================
// UTILITAS KEAMANAN TEKS & KARAKTER KUTIP
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
// JAMINAN SESI AUTH FIREBASE (PERBAIKAN BUG GUEST CHAT)
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
        console.error("Gagal membuat sesi anonim:", err);
        return null;
    }
}

// ==========================================
// SISTEM TEMA (DEFAULT AWAL: LIGHT / PUTIH)
// ==========================================
window.toggleTheme = function() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('vipercell_theme', newTheme);
    
    const metaTheme = document.getElementById('meta-theme-color');
    if(metaTheme) metaTheme.setAttribute('content', newTheme === 'dark' ? '#090d16' : '#ffffff');
    
    const icon = document.getElementById('theme-icon');
    if(icon) icon.className = newTheme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
};

// ==========================================
// SAKELAR TOGGLE LONCENG NOTIFIKASI DI PROFIL (ON / OFF)
// ==========================================
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

// ==========================================
// DYNAMIC CUSTOM PWA ICON & MANIFEST INJECTOR
// ==========================================
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

// ==========================================
// EFEK TYPEWRITER HERO SECTION
// ==========================================
const twWords = [
    "Aplikasi Premium Bergaransi",
    "Top Up Game Instan 24 Jam",
    "Tools Digital & Produktivitas",
    "QRIS & Barcode Kasir Praktis"
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

// ==========================================
// ANIMASI KONFETI PEMBAYARAN SUKSES
// ==========================================
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
    window.closeModal('modal-payment');
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
            }, 450);
        }, 2500);
    }
};

// ==========================================
// POP-UP NOTIFIKASI TENGAH + SWIPE LEFT/RIGHT TO DISMISS + TAP TO NAVIGATE
// ==========================================
window.showToast = function(title, msg, type = 'info', actionCallback = null) {
    const container = document.getElementById('toast-container');
    if(!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    
    let icon = '<i class="fa-solid fa-circle-info"></i>';
    if(type === 'success') icon = '<i class="fa-solid fa-circle-check"></i>';
    if(type === 'warning') icon = '<i class="fa-solid fa-triangle-exclamation"></i>';
    if(type === 'error') icon = '<i class="fa-solid fa-circle-xmark"></i>';
    
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

    // Gesture Sentuh (Mobile) & Drag Mouse (Desktop)
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
            // Jika tidak digeser jauh (hanya diketuk / tap)
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

    if (actionCallback) {
        toast.style.cursor = 'pointer';
    } else {
        toast.style.cursor = 'grab';
    }
    
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 15);
    autoRemoveTimer = setTimeout(() => {
        if (document.body.contains(toast)) {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 250);
        }
    }, 4800);
};

// ==========================================
// FUNGSI UI / UX DASAR
// ==========================================
window.openModal = (id) => {
    const el = document.getElementById(id);
    if(el) { el.classList.add('active'); document.body.classList.add('no-scroll'); }
};
window.closeModal = (id) => {
    const el = document.getElementById(id);
    if(el) { 
        el.classList.remove('active'); document.body.classList.remove('no-scroll'); 
        if(id === 'modal-payment') clearInterval(qrisInterval);
    }
};
window.handleLogoClick = () => window.switchMainTab('katalog');

window.customAlert = (title, message, type = 'info', extraActionHtml = '') => {
    const titleEl = document.getElementById('ca-title');
    const descEl = document.getElementById('ca-desc');
    const iconEl = document.getElementById('ca-icon');
    const extraEl = document.getElementById('ca-extra-action');
    const alertEl = document.getElementById('custom-alert');
    
    if(titleEl) titleEl.innerText = title;
    if(descEl) descEl.innerHTML = message;
    if(extraEl) extraEl.innerHTML = extraActionHtml || '';
    if(iconEl) {
        iconEl.className = `msg-icon ${type}`;
        if(type === 'success') iconEl.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
        else if(type === 'error') iconEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
        else if(type === 'warning') iconEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
        else iconEl.innerHTML = '<i class="fa-solid fa-circle-info"></i>';
    }
    if(alertEl) alertEl.classList.add('active');
    document.body.classList.add('no-scroll');
};

window.closeAlert = () => {
    const alertEl = document.getElementById('custom-alert');
    const extraEl = document.getElementById('ca-extra-action');
    if(alertEl) alertEl.classList.remove('active');
    if(extraEl) extraEl.innerHTML = '';
    document.body.classList.remove('no-scroll');
};

let promptCallback = null;
window.openConfirm = function(title, message, callback, actionType = 'warning') {
    const titleEl = document.getElementById('mc-title');
    const descEl = document.getElementById('mc-desc');
    const iconContainer = document.getElementById('mc-icon-container');
    const confirmBtn = document.getElementById('mc-confirm-btn');
    
    if(titleEl) titleEl.innerText = title;
    if(descEl) descEl.innerHTML = message;
    promptCallback = callback;
    
    if (iconContainer && confirmBtn) {
        if (actionType === 'success') {
            iconContainer.className = 'msg-icon success';
            iconContainer.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
            confirmBtn.className = 'btn btn-success';
        } else {
            iconContainer.className = 'msg-icon warning';
            iconContainer.innerHTML = '<i class="fa-solid fa-circle-question"></i>';
            confirmBtn.className = 'btn btn-primary';
        }
    }
    window.openModal('modal-confirm');
};
window.resolveConfirm = function(isConfirmed) {
    window.closeModal('modal-confirm');
    if(promptCallback) promptCallback(isConfirmed);
};

const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => { if(entry.isIntersecting) entry.target.classList.add('reveal-visible'); });
}, { threshold: 0.1 });
function observeReveals() { document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el)); }

function updateUIVisibility() {
    const isLogged = currentUser && !userProfile.isGuest;
    const textPesananDesk = document.getElementById('nav-text-pesanan-desk');
    const textPesananMob = document.getElementById('nav-text-pesanan-mob');
    
    if (isLogged) {
        if(textPesananDesk) textPesananDesk.innerText = "Pesanan Saya";
        if(textPesananMob) textPesananMob.innerText = "Pesanan";
    } else {
        if(textPesananDesk) textPesananDesk.innerText = "Lacak Pesanan";
        if(textPesananMob) textPesananMob.innerText = "Pesanan";
    }
}

// ==========================================
// INIT APP & FIREBASE AUTHENTICATION
// ==========================================
async function initApp() {
    initTypewriter();
    updateProfileNotifToggleUI();
    try {
        const savedTheme = localStorage.getItem('vipercell_theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        const icon = document.getElementById('theme-icon');
        if(icon) icon.className = savedTheme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
        
        const trackEmailInp = document.getElementById('track-email');
        if(trackEmailInp && localStorage.getItem('vipercell_track_email')) {
            trackEmailInp.value = localStorage.getItem('vipercell_track_email');
        }
        
        await setPersistence(auth, browserLocalPersistence);
        
        onAuthStateChanged(auth, async (user) => {
            currentUser = user;
            
            const guestTrackSec = document.getElementById('guest-tracking-section');
            const emailGroupBuy = document.getElementById('buy-email-group');
            
            if (user) {
                if (user.isAnonymous) {
                    const savedAnonName = localStorage.getItem('vipercell_anon_name') || '';
                    userProfile = { name: savedAnonName, email: '', phone: '', isGuest: true };
                    
                    document.getElementById('btn-login-user').style.display = 'inline-flex';
                    document.getElementById('nav-profil').style.display = 'none';
                    
                    if(guestTrackSec) guestTrackSec.style.display = 'block';
                    if(emailGroupBuy) emailGroupBuy.style.display = 'block';
                    
                } else {
                    document.getElementById('btn-login-user').style.display = 'none';
                    const userDoc = await getDoc(doc(db, pathUsers, user.uid));
                    
                    if(userDoc.exists()) {
                        userProfile = { ...userProfile, ...userDoc.data(), isGuest: false };
                    } else {
                        userProfile = {
                            name: user.displayName || user.email?.split('@')[0] || 'Member',
                            email: user.email || '',
                            phone: '',
                            isGuest: false
                        };
                    }
                    
                    const finalEmail = userProfile.email || user.email || '';
                    const finalName = userProfile.name || finalEmail.split('@')[0] || 'Member Vipercell';
                    const finalPhone = userProfile.phone || '';
                    userProfile.email = finalEmail;
                    userProfile.name = finalName;
                    userProfile.phone = finalPhone;

                    document.getElementById('prof-name').value = finalName;
                    document.getElementById('prof-email').value = finalEmail;
                    const profPhoneEl = document.getElementById('prof-phone');
                    if (profPhoneEl) profPhoneEl.value = finalPhone;
                    
                    const dispNameEl = document.getElementById('prof-display-name');
                    const dispEmailEl = document.getElementById('prof-display-email');
                    const avatarEl = document.getElementById('prof-avatar-initial');
                    if (dispNameEl) dispNameEl.innerText = finalName;
                    if (dispEmailEl) dispEmailEl.innerText = finalEmail + (finalPhone ? ` • ${finalPhone}` : '');
                    if (avatarEl) avatarEl.innerText = finalName.charAt(0).toUpperCase();

                    document.getElementById('nav-profil').style.display = 'flex';
                    
                    if(guestTrackSec) guestTrackSec.style.display = 'none';
                    if(emailGroupBuy) emailGroupBuy.style.display = 'none';
                    
                    updateProfileStats();
                }
                
                updateUIVisibility();
                window.renderUserOrders(); 
                checkChatUserState();
                listenUserChat();
                listenData();
            } else {
                document.getElementById('btn-login-user').style.display = 'inline-flex';
                document.getElementById('nav-profil').style.display = 'none';
                
                if(guestTrackSec) guestTrackSec.style.display = 'block';
                if(emailGroupBuy) emailGroupBuy.style.display = 'block';
                
                updateUIVisibility();
                // Langsung inisialisasi sesi anonim agar Guest selalu siap chat & transaksi
                signInAnonymously(auth).catch((err) => console.error("Anon Auth Error:", err));
                listenData();
            }
        });
    } catch (error) { console.error("Auth Init Error:", error); }
    observeReveals();
}

// ==========================================
// REAL-TIME DATA LISTENER (FIRESTORE)
// ==========================================
let isListening = false;
function listenData() {
    if(isListening) return;
    isListening = true;
    
    onSnapshot(doc(db, pathSettings, 'mainConfig'), async (docSnap) => {
        if (docSnap.exists()) {
            siteSettings = { ...siteSettings, ...docSnap.data() };
        } else {
            try {
                const fallbackSnap = await getDoc(doc(db, fallbackSettingsPath, 'mainConfig'));
                if (fallbackSnap.exists()) {
                    siteSettings = { ...siteSettings, ...fallbackSnap.data() };
                }
            } catch (e) {}
        }
        isSettingsLoaded = true;
        window.applySettingsToUI();
        applyCustomPwaIcon();
    });

    onSnapshot(collection(db, pathReviews), (snapshot) => {
        reviewsData = [];
        snapshot.forEach((docSnap) => { reviewsData.push({ dbId: docSnap.id, ...docSnap.data() }); });
        
        window.renderBrands(currentBrandFilter);
        if(currentCheckoutBrand) window.renderReviewsUI();
        window.renderUserOrders();
    });

    onSnapshot(collection(db, pathOrders), (snapshot) => {
        let newOrders = [];
        const now = Date.now();
        
        snapshot.forEach((docSnap) => {
            let data = { dbId: docSnap.id, ...docSnap.data() };
            const orderTime = new Date(data.date).getTime();
            
            if(data.status === 'UNPAID') {
                if(now - orderTime > 240000) { 
                    updateDoc(doc(db, pathOrders, data.dbId), { status: 'EXPIRED' }).catch(()=>{});
                    data.status = 'EXPIRED';
                }
            } else if (data.status === 'EXPIRED') {
                if(now - orderTime > 86400000) { 
                    deleteDoc(doc(db, pathOrders, data.dbId)).catch(()=>{});
                    return; 
                }
            }
            newOrders.push(data);

            // ANIMASI PEMBAYARAN SUKSES + NOTIFIKASI SISTEM (QRIS MAUPUN SCAN BARCODE TUNAI)
            let savedEmail = (localStorage.getItem('vipercell_track_email') || '').toLowerCase();
            let orderEmail = (data.userEmail || '').toLowerCase();
            let isMyOrder = (currentUser && data.userId === currentUser.uid) || (savedEmail && savedEmail === orderEmail);

            if (!initialOrderLoad && isMyOrder) {
                let oldStatus = previousOrdersData[data.id];
                if (oldStatus && oldStatus !== 'SUCCESS' && data.status === 'SUCCESS') {
                    window.showPaymentSuccessAnimation(data.id);
                }
            }
            previousOrdersData[data.id] = data.status;
        });
        
        orders = newOrders.sort((a,b) => new Date(b.date) - new Date(a.date));
        window.renderBrands(currentBrandFilter);
        
        const trackResult = document.getElementById('track-result');
        if(trackResult && trackResult.style.display === 'block') {
            const currentTrackId = document.getElementById('track-id').value.trim().toUpperCase();
            if(currentTrackId) window.trackOrder(); 
        }
        
        updateOrderBadges();
        window.renderUserOrders();
        if(currentUser && !userProfile.isGuest) updateProfileStats();
        if(currentCheckoutBrand) window.renderReviewsUI();
        initialOrderLoad = false;
    });

    onSnapshot(collection(db, pathProducts), (snapshot) => {
        products = [];
        snapshot.forEach((docSnap) => { products.push({ dbId: docSnap.id, ...docSnap.data() }); });
        
        groupedBrands = [];
        products.forEach(p => {
            const brandName = p.brand || p.name;
            const existing = groupedBrands.find(b => b.brandName === brandName);
            if(existing) {
                existing.items.push(p);
                if(p.imgUrlBase64 && !existing.imgUrlBase64) existing.imgUrlBase64 = p.imgUrlBase64;
                if(p.desc && !existing.desc) existing.desc = p.desc;
            } else {
                groupedBrands.push({
                    brandName: brandName,
                    type: p.type || 'app',
                    imgUrlBase64: p.imgUrlBase64 || '',
                    desc: p.desc || '',
                    isGangguan: p.isGangguan || false,
                    items: [p]
                });
            }
        });

        const heroCatalogCount = document.getElementById('hero-live-catalog-count');
        if (heroCatalogCount && groupedBrands.length > 0) {
            heroCatalogCount.innerText = `${groupedBrands.length} Brand & ${products.length} Layanan Aktif`;
        }
        
        window.renderBrands(currentBrandFilter);
    });

    onSnapshot(collection(db, pathPromos), (snapshot) => {
        promos = [];
        snapshot.forEach((docSnap) => { promos.push({ dbId: docSnap.id, ...docSnap.data() }); });
        if(selectedProductForBuy) window.calculateDirectBuyTotal();
    });
}

function updateOrderBadges() {
    const savedEmail = (localStorage.getItem('vipercell_track_email') || '').toLowerCase();
    const hasActionNeeded = orders.some(o => {
        const isMine = (currentUser && !userProfile.isGuest && o.userId === currentUser.uid) ||
                       (savedEmail && o.userEmail?.toLowerCase() === savedEmail);
        return isMine && (o.status === 'UNPAID' || o.status === 'PENDING');
    });
    const badgeDesk = document.getElementById('user-order-badge-desktop');
    if(badgeDesk) badgeDesk.style.display = hasActionNeeded ? 'block' : 'none';
    const badgeMob = document.getElementById('user-order-badge-mobile');
    if(badgeMob) badgeMob.style.display = hasActionNeeded ? 'block' : 'none';
}

// ==========================================
// MESIN QRIS DINAMIS (EMVCo TLV PARSER + CRC16-CCITT)
// ==========================================
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

// ==========================================
// FITUR LIVE CHAT (PERBAIKAN TOTAL UNTUK GUEST & MEMBER + ANTI-RESET)
// ==========================================
async function getResolvedChatDocId() {
    // Pastikan sesi Firebase Auth (baik Member maupun Anonymous Guest) sudah siap
    const user = await ensureAuthSession();
    if (user && user.uid) {
        localStorage.setItem('vipercell_chat_uid_backup', user.uid);
        return user.uid;
    }
    // Cadangan jika koneksi auth lambat
    let backupId = localStorage.getItem('vipercell_chat_uid_backup');
    if (!backupId) {
        backupId = 'guest_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
        localStorage.setItem('vipercell_chat_uid_backup', backupId);
    }
    return backupId;
}

function checkChatUserState() {
    const preForm = document.getElementById('chat-pre-form');
    const chatHeader = document.getElementById('chat-wa-header');
    const chatBody = document.getElementById('user-chat-body');
    const chatFooter = document.getElementById('user-chat-footer');
    const chatChips = document.getElementById('chat-quick-chips');
    const userLabel = document.getElementById('chat-current-user-label');
    
    let savedName = localStorage.getItem('vipercell_anon_name') || '';
    if (!userProfile.name && savedName) {
        userProfile.name = savedName;
    }
    if (!userProfile.name && currentUser && !userProfile.isGuest && currentUser.email) {
        userProfile.name = currentUser.email.split('@')[0];
    }

    let hasName = Boolean(userProfile.name && userProfile.name.trim() !== '');
    if (userLabel && hasName) userLabel.innerText = userProfile.name;
    
    if (hasName) {
        if(preForm) preForm.style.display = 'none';
        if(chatHeader) chatHeader.style.display = 'flex';
        if(chatBody) chatBody.style.display = 'flex';
        if(chatChips) chatChips.style.display = 'flex';
        if(chatFooter) chatFooter.style.display = 'flex';
        scrollToBottomUserChat();
    } else {
        if(preForm) preForm.style.display = 'flex';
        if(chatHeader) chatHeader.style.display = 'none';
        if(chatBody) chatBody.style.display = 'none';
        if(chatChips) chatChips.style.display = 'none';
        if(chatFooter) chatFooter.style.display = 'none';
    }
}

window.startAnonChat = async function() {
    const input = document.getElementById('chat-anon-name');
    const name = input ? input.value.trim() : '';
    if(!name) {
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

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span>Buka Ruang Obrolan</span>';
    }

    checkChatUserState();
    await listenUserChat();

    if(window.pendingMsgToAdmin) {
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
    const currentName = userProfile.name || localStorage.getItem('vipercell_anon_name') || '';
    const newName = prompt('Ubah nama panggilan kamu di ruang obrolan:', currentName);
    if (newName && newName.trim() !== '') {
        userProfile.name = newName.trim();
        localStorage.setItem('vipercell_anon_name', userProfile.name);
        checkChatUserState();
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
    if(!chatId) return;
    const chatRef = doc(db, pathChats, chatId);
    if(chatUnsubscribe) chatUnsubscribe();
    
    chatUnsubscribe = onSnapshot(chatRef, (docSnap) => {
        if(docSnap.exists()) {
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

            // Tampilkan titik merah di navigasi Bantuan jika pesan terakhir dari Admin & tab Bantuan tertutup
            const chatBadgeDesk = document.getElementById('user-chat-badge-desktop');
            const chatBadgeMob = document.getElementById('user-chat-badge-mobile');
            const showUnreadDot = lastMsg && lastMsg.sender === 'admin' && !isBantuanOpen;
            if (chatBadgeDesk) chatBadgeDesk.style.display = showUnreadDot ? 'block' : 'none';
            if (chatBadgeMob) chatBadgeMob.style.display = showUnreadDot ? 'block' : 'none';

            if (oldLen > 0 && userChatMessages.length > oldLen && lastMsg && lastMsg.sender === 'admin') {
                sendNativeNotification('Balasan Baru dari Admin CS 💬', lastMsg.text);
                if(!isBantuanOpen) {
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
    if(!body) return;
    
    if(userChatMessages.length === 0) {
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
    if(body) setTimeout(() => { body.scrollTop = body.scrollHeight; }, 80);
}

window.sendUserChat = async function() {
    const input = document.getElementById('user-chat-input');
    const btn = document.getElementById('btn-send-chat');
    if (!input || !btn) return;
    
    const text = input.value.trim();
    if(!text || btn.disabled) return;
    
    input.value = '';
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    
    try {
        // Pastikan user sudah mendapatkan UID (Member maupun Guest Anonim) sebelum menulis ke Firestore
        const chatId = await getResolvedChatDocId();
        if (!chatId) throw new Error("Sesi belum siap");

        const chatRef = doc(db, pathChats, chatId);
        const msgTimestamp = Date.now();
        const newMsg = { sender: 'user', text: text, timestamp: msgTimestamp };

        const displayName = userProfile.name
            ? userProfile.name
            : (localStorage.getItem('vipercell_anon_name') || (userProfile.isGuest ? 'Pelanggan Tamu' : (currentUser?.email || 'Pelanggan')));

        // Gunakan setDoc dengan { merge: true } + arrayUnion agar tidak pernah gagal baik untuk dokumen baru maupun lama!
        await setDoc(chatRef, {
            uid: chatId,
            userInfo: displayName,
            userEmail: userProfile.email || localStorage.getItem('vipercell_track_email') || '',
            updatedAt: msgTimestamp,
            messages: arrayUnion(newMsg)
        }, { merge: true });

        scrollToBottomUserChat();
    } catch(e) {
        console.error("Send Chat Error:", e);
        input.value = text; // Kembalikan teks agar tidak hilang
        window.customAlert('Gagal Mengirim Pesan', 'Koneksi ke server chat terganggu. Silakan klik tombol kirim sekali lagi.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    }
};

// ==========================================
// UI & TAB NAVIGATION
// ==========================================
window.openAuthModal = function() {
    window.switchAuthTab('login');
    window.switchMainTab('auth');
};

window.switchAuthTab = function(tab) {
    document.getElementById('form-login').style.display = tab==='login' ? 'block' : 'none';
    document.getElementById('form-register').style.display = tab==='register' ? 'block' : 'none';
    document.getElementById('form-reset').style.display = tab==='reset' ? 'block' : 'none';
    
    const authTabsContainer = document.getElementById('auth-tabs-container');
    const authDivider = document.getElementById('auth-divider');
    const googleBtn = document.getElementById('auth-google-btn');
    const authTitle = document.getElementById('auth-title');
    const authSub = document.getElementById('auth-subtitle');
    
    if(tab === 'reset') {
        if(authTabsContainer) authTabsContainer.style.display = 'none';
        if(authDivider) authDivider.style.display = 'none';
        if(googleBtn) googleBtn.style.display = 'none';
        authTitle.innerText = 'Pulihkan Kata Sandi'; 
        authSub.innerText = 'Masukkan email terdaftar untuk menerima tautan reset.';
    } else {
        if(authTabsContainer) authTabsContainer.style.display = 'flex';
        if(authDivider) authDivider.style.display = 'flex';
        if(googleBtn) googleBtn.style.display = 'inline-flex';
        authTitle.innerText = tab === 'login' ? 'Selamat Datang Kembali' : 'Daftar Member Vipercell';
        authSub.innerText = tab === 'login' ? 'Silakan masuk ke akun Vipercell kamu.' : 'Daftar gratis untuk menyimpan riwayat E-Receipt otomatis.';
        
        const btnL = document.getElementById('tab-login');
        const btnR = document.getElementById('tab-register');
        if(btnL) btnL.className = tab==='login' ? 'active' : '';
        if(btnR) btnR.className = tab==='register' ? 'active' : '';
    }
};
window.showResetPassword = () => window.switchAuthTab('reset');

window.switchMainTab = function(tab) {
    document.querySelectorAll('.main-tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('nav a').forEach(el => el.classList.remove('active'));
    
    const navKey = tab === 'baca-berita' ? 'berita' : tab;
    let navEl = document.getElementById('nav-' + navKey);
    if(navEl) navEl.classList.add('active');
    let botNavEl = document.getElementById('nav-bot-' + navKey);
    if(botNavEl) botNavEl.classList.add('active');
    
    let tabEl = document.getElementById('tab-'+tab);
    if(tabEl) {
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
    }, 250); 
};

// ==========================================
// AUTHENTICATION & PROFIL LENGKAP (DENGAN NOMOR HP/WA)
// ==========================================
window.processLogin = async function() {
    const em = document.getElementById('auth-l-email').value.trim();
    const pw = document.getElementById('auth-l-pass').value.trim();
    if(!em || !pw) { window.customAlert('Error', 'Email dan Kata Sandi wajib diisi!', 'error'); return; }
    
    const btn = document.getElementById('btn-do-login');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Memproses...</span>'; 
    btn.disabled = true;
    try {
        await signInWithEmailAndPassword(auth, em, pw);
        window.switchMainTab('pesanan');
        window.showToast('Berhasil Masuk', 'Selamat datang kembali di Vipercell!', 'success');
    } catch(e) { window.customAlert('Gagal Masuk', 'Email atau kata sandi tidak cocok.', 'error'); } 
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
    
    if(!name || !em || pw.length < 6) { 
        window.customAlert('Peringatan', 'Harap lengkapi Nama, Email, dan Kata Sandi minimal 6 karakter.', 'warning');
        return; 
    }
    
    const btn = document.getElementById('btn-do-register');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Memproses...</span>'; 
    btn.disabled = true;
    try {
        const cred = await createUserWithEmailAndPassword(auth, em, pw);
        await setDoc(doc(db, pathUsers, cred.user.uid), { 
            email: em, 
            name: name, 
            phone: phone,
            isGuest: false, 
            verified: true, 
            createdAt: new Date().toISOString() 
        });
        userProfile = { name, email: em, phone, isGuest: false };
        localStorage.setItem('vipercell_anon_name', name);
        window.switchMainTab('profil');
        window.customAlert('Pendaftaran Berhasil', 'Akun member kamu telah aktif dan siap digunakan!', 'success');
    } catch(e) { window.customAlert('Gagal Daftar', 'Email mungkin sudah terdaftar atau format salah.', 'error'); } 
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
    if(!em) { window.customAlert('Error', 'Masukkan email terdaftar.', 'error'); return; }
    if(!checkResetCooldown()) return;
    
    const btn = document.getElementById('btn-do-reset');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Memproses...</span>';
    btn.disabled = true;
    try {
        await sendPasswordResetEmail(auth, em);
        localStorage.setItem('vipercell_last_reset', Date.now());
        window.customAlert('Terkirim', 'Tautan reset kata sandi telah dikirim ke email kamu.', 'success');
        window.switchAuthTab('login');
    } catch(e) { window.customAlert('Error', 'Gagal mengirim tautan reset.', 'error'); }
    finally {
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span>Kirim Tautan Reset</span>';
        btn.disabled = false;
    }
};

window.sendProfileResetPassword = async function() {
    if(!currentUser || userProfile.isGuest) return;
    if(!checkResetCooldown()) return;
    try {
        await sendPasswordResetEmail(auth, userProfile.email || currentUser.email);
        localStorage.setItem('vipercell_last_reset', Date.now());
        window.customAlert('Terkirim', 'Cek kotak masuk email kamu untuk mengatur kata sandi baru.', 'success');
    } catch (e) { window.customAlert('Gagal', 'Terjadi kesalahan saat mengirim email reset.', 'error'); }
};

window.processGoogleLogin = async function() {
    const provider = new GoogleAuthProvider();
    const btnText = document.getElementById('text-google-btn');
    const ogText = btnText ? btnText.innerText : 'Akun Google';
    if(btnText) btnText.innerText = 'Memverifikasi...';
    
    try {
        const result = await signInWithPopup(auth, provider);
        const userDoc = await getDoc(doc(db, pathUsers, result.user.uid));
        
        if (!userDoc.exists()) {
            await setDoc(doc(db, pathUsers, result.user.uid), { 
                email: result.user.email, 
                name: result.user.displayName || 'Member Google', 
                phone: '',
                isGuest: false, 
                verified: true, 
                createdAt: new Date().toISOString() 
            });
        }
        window.switchMainTab('pesanan');
        window.showToast('Berhasil Masuk', 'Login menggunakan Google berhasil!', 'success');
    } catch (error) {
        console.error(error);
    } finally {
        if(btnText) btnText.innerText = ogText;
    }
};

window.logoutUser = async function() {
    await signOut(auth);
    window.switchMainTab('katalog');
    window.showToast('Keluar Akun', 'Anda telah keluar dari akun.', 'info');
};

window.saveUserProfile = async function() {
    if(!currentUser || userProfile.isGuest) return;
    const name = document.getElementById('prof-name').value.trim();
    const phone = document.getElementById('prof-phone') ? document.getElementById('prof-phone').value.trim() : '';
    if(!name) { window.customAlert('Peringatan', 'Nama panggilan tidak boleh kosong.', 'warning'); return; }
    try {
        await setDoc(doc(db, pathUsers, currentUser.uid), { name: name, phone: phone }, { merge: true });
        userProfile.name = name;
        userProfile.phone = phone;
        localStorage.setItem('vipercell_anon_name', name);
        const dispNameEl = document.getElementById('prof-display-name');
        const dispEmailEl = document.getElementById('prof-display-email');
        const avatarEl = document.getElementById('prof-avatar-initial');
        if (dispNameEl) dispNameEl.innerText = name;
        if (dispEmailEl) dispEmailEl.innerText = (userProfile.email || '') + (phone ? ` • ${phone}` : '');
        if (avatarEl) avatarEl.innerText = name.charAt(0).toUpperCase();
        window.showToast('Profil Disimpan', 'Data identitas & nomor WhatsApp berhasil diperbarui.', 'success');
    } catch(e) { window.customAlert('Error', 'Gagal menyimpan perubahan profil.', 'error'); }
};

function updateProfileStats() {
    if(!currentUser || userProfile.isGuest) return;
    const myOrders = orders.filter(o => o.userId === currentUser.uid || (userProfile.email && o.userEmail?.toLowerCase() === userProfile.email.toLowerCase()));
    const successOrders = myOrders.filter(o => o.status === 'SUCCESS');
    const totalSpent = successOrders.reduce((sum, o) => sum + (o.finalTotal || 0), 0);

    const totalEl = document.getElementById('prof-stat-total');
    const statEl = document.getElementById('prof-stat-success');
    const spentEl = document.getElementById('prof-stat-spent');

    if(totalEl) totalEl.innerText = myOrders.length;
    if(statEl) statEl.innerText = successOrders.length;
    if(spentEl) spentEl.innerText = `Rp${totalSpent.toLocaleString('id-ID')}`;
}

// ==========================================
// RENDER UI, BERITA FULL LAYAR & KATALOG
// ==========================================
window.applySettingsToUI = function() {
    const logoDasar = siteSettings.logoText || 'VIPER';
    const logoAksen = siteSettings.logoAccent || 'CELL';
    
    const slt = document.getElementById('site-logo-text');
    const flt = document.getElementById('footer-logo-text-2');
    if(slt) slt.innerHTML = `${escapeHtml(logoDasar)}<span>${escapeHtml(logoAksen)}</span>`;
    if(flt) flt.innerHTML = `${escapeHtml(logoDasar)}<span>${escapeHtml(logoAksen)}</span>`;
    
    const imgEl = document.getElementById('site-logo-img');
    const fImgEl = document.getElementById('footer-logo-img-2');
    
    if(siteSettings.logoImgBase64) {
        if(imgEl){ imgEl.src = siteSettings.logoImgBase64; imgEl.style.display = 'block'; }
        if(fImgEl){ fImgEl.src = siteSettings.logoImgBase64; fImgEl.style.display = 'block'; }
    } else {
        if(imgEl) imgEl.style.display = 'none'; 
        if(fImgEl) fImgEl.style.display = 'none'; 
    }
    
    const mText = siteSettings.marquee || 'Selamat Datang di Vipercell';
    const mt1 = document.getElementById('marquee-text-1');
    const mt2 = document.getElementById('marquee-text-2');
    if(mt1) mt1.innerText = mText; if(mt2) mt2.innerText = mText;
    
    const igBtn = document.getElementById('footer-ig-btn');
    if(igBtn) {
        if(siteSettings.igLink) { igBtn.href = siteSettings.igLink; igBtn.style.display = 'inline-flex'; }
        else { igBtn.style.display = 'none'; }
    }
    
    const ttBtn = document.getElementById('footer-tt-btn');
    if(ttBtn) {
        if(siteSettings.ttLink) { ttBtn.href = siteSettings.ttLink; ttBtn.style.display = 'inline-flex'; }
        else { ttBtn.style.display = 'none'; }
    }
    
    let adminWaNum = siteSettings.adminWa || '085656321860';
    if (adminWaNum.startsWith('0')) adminWaNum = '62' + adminWaNum.substring(1);
    const waHref = `https://wa.me/${adminWaNum}?text=${encodeURIComponent('Halo Min Vipercell')}`;
    
    const fWaLink = document.getElementById('footer-wa-link');
    if(fWaLink) fWaLink.href = waHref;
    
    const waChanBtn = document.getElementById('btn-wa-channel');
    if(waChanBtn) waChanBtn.href = siteSettings.waChannelLink || waHref;
    
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
    
    if(!container || !track || !dotsContainer) return;
    const banners = siteSettings.banners || [];
    
    if(banners.length === 0) { container.style.display = 'none'; return; }
    
    container.style.display = 'block';
    setTimeout(() => { container.classList.add('reveal-visible'); }, 50);
    
    let trackHtml = ''; let dotsHtml = '';
    banners.forEach((b64, idx) => {
        trackHtml += `<img src="${b64}" class="banner-slide" alt="Promo Vipercell" loading="lazy">`;
        dotsHtml += `<div class="banner-dot ${idx===0?'active':''}" onclick="window.goToBanner(${idx})"></div>`;
    });
    track.innerHTML = trackHtml; dotsContainer.innerHTML = dotsHtml;
    window.startBannerAuto();
};

let currentBanner = 0; let bannerInterval;
window.goToBanner = function(idx) {
    currentBanner = idx;
    const track = document.getElementById('banner-track');
    const dots = document.querySelectorAll('.banner-dot');
    if(!track) return;
    
    track.style.transform = `translateX(-${currentBanner * 100}%)`;
    dots.forEach(d => d.classList.remove('active'));
    if(dots[currentBanner]) dots[currentBanner].classList.add('active');
};
window.startBannerAuto = function() {
    clearInterval(bannerInterval);
    bannerInterval = setInterval(() => {
        const total = siteSettings.banners?.length || 0;
        if(total > 1) { currentBanner = (currentBanner + 1) % total; window.goToBanner(currentBanner); }
    }, 5000);
};

// TAMPILAN BARU BERITA -> KLIK LANGSUNG BUKA HALAMAN FULL LAYAR (#tab-baca-berita)
window.renderNews = function() {
    const grid = document.getElementById('public-news-list');
    if(!grid) return;
    
    const list = siteSettings.newsList || [];
    const visibleList = list.filter(t => !t.isHidden);
    
    if(visibleList.length === 0) {
        grid.innerHTML = '<div class="brutal-empty-box" style="grid-column: 1/-1;">Belum ada artikel berita atau pengumuman terbaru.</div>';
        return;
    }
    
    let html = '';
    visibleList.forEach((news, idx) => {
        const coverHtml = news.imageUrl
            ? `<img src="${news.imageUrl}" class="news-cover-img" alt="${escapeHtml(news.title)}" loading="lazy">`
            : `<div class="news-cover-placeholder"><i class="fa-solid fa-newspaper"></i></div>`;

        html += `
            <article class="news-article-card" onclick="window.openReadNewsFullPage(${idx})">
                <div>
                    ${coverHtml}
                    <div class="news-card-body">
                        <div>
                            <span class="brutal-tag tag-primary"><i class="fa-solid fa-bullhorn"></i> ARTIKEL VIPERCELL</span>
                            <h3 class="news-card-title">${escapeHtml(news.title)}</h3>
                            <p class="news-card-excerpt">${escapeHtml(news.desc)}</p>
                        </div>
                        <button class="btn btn-outline btn-sm" style="width:100%;">
                            <i class="fa-solid fa-expand"></i> Baca Layar Penuh
                        </button>
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

window.filterBrands = function(type, btnEl) {
    currentBrandFilter = type;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    window.renderBrands(type);
};

window.handleCatalogSearch = function() {
    const inp = document.getElementById('catalog-search-input');
    const clearBtn = document.getElementById('btn-clear-search');
    currentSearchQuery = inp ? inp.value.trim().toLowerCase() : '';
    if (clearBtn) clearBtn.style.display = currentSearchQuery ? 'block' : 'none';
    window.renderBrands(currentBrandFilter);
};

window.clearCatalogSearch = function() {
    const inp = document.getElementById('catalog-search-input');
    const clearBtn = document.getElementById('btn-clear-search');
    if (inp) inp.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    currentSearchQuery = '';
    window.renderBrands(currentBrandFilter);
};

window.renderBrands = function(filter = currentBrandFilter) {
    const grid = document.getElementById('brand-grid');
    if(!grid) return;
    
    let filteredBrands = filter === 'all' ? [...groupedBrands] : groupedBrands.filter(b => b.type === filter);

    if (currentSearchQuery) {
        filteredBrands = filteredBrands.filter(b =>
            b.brandName.toLowerCase().includes(currentSearchQuery) ||
            (b.desc && b.desc.toLowerCase().includes(currentSearchQuery)) ||
            b.items.some(i => i.name.toLowerCase().includes(currentSearchQuery))
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
    
    if(filteredBrands.length === 0) { 
        grid.innerHTML = `<div class="brutal-empty-box" style="grid-column: 1/-1;"><i class="fa-solid fa-box-open" style="font-size:2rem; display:block; margin-bottom:8px;"></i>Produk yang kamu cari belum tersedia di kategori ini.</div>`; 
        return; 
    }
    
    let html = '';
    filteredBrands.forEach(b => {
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
             ? `<img src="${b.imgUrlBase64}" alt="${safeHtmlBrand}" loading="lazy">` 
             : `<div style="width:100%; height:100%; background:var(--primary); display:flex; align-items:center; justify-content:center; font-size:1.9rem; font-weight:900; color:#ffffff;">${safeHtmlBrand.charAt(0)}</div>`;
             
        const clickAction = b.isGangguan 
            ? `window.customAlert('Maintenance Server', 'Mohon maaf, layanan produk ini sedang dalam pemeliharaan jaringan.', 'warning')` 
            : `window.openDirectBuyModal('${safeJsBrand}')`;
        const cssClass = b.isGangguan ? 'brand-card reveal sold-out' : 'brand-card reveal';
        
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
                    <span class="buy-arrow-pill">Beli <i class="fa-solid fa-arrow-right"></i></span>
                </div>
            </div>`;
    });
    grid.innerHTML = html;
    setTimeout(observeReveals, 50);
};

// ==========================================
// PUSAT PEMBELIAN (CHECKOUT + KUOTA STOK TOOLS + BARCODE TUNAI)
// ==========================================
window.selectPaymentUI = function(val, el) {
    document.querySelectorAll('input[name="payment_method"]').forEach(input => { input.parentElement.classList.remove('active'); });
    el.classList.add('active'); el.querySelector('input').checked = true;
    
    const cashWarn = document.getElementById('cash-warning-msg');
    if (cashWarn) cashWarn.style.display = val === 'cash' ? 'flex' : 'none';
    
    window.calculateDirectBuyTotal();
};

window.changeBuyQty = function(change) {
    const input = document.getElementById('buy-qty');
    let current = parseInt(input.value) || 1;
    let newVal = current + change;
    if (newVal < 1) newVal = 1;

    // Jika varian memiliki batas kuota stok (misal pada kategori Tools), batasi maksimum qty
    if (selectedProductForBuy && typeof selectedProductForBuy.stockCount === 'number' && selectedProductForBuy.stockCount > 0) {
        if (newVal > selectedProductForBuy.stockCount) {
            newVal = selectedProductForBuy.stockCount;
            window.showToast('Batas Stok', `Maksimal stok tersedia untuk varian ini adalah ${selectedProductForBuy.stockCount}.`, 'warning');
        }
    }

    input.value = newVal;
    window.calculateDirectBuyTotal();
};

window.openDirectBuyModal = function(brandName) {
    const brandObj = groupedBrands.find(b => b.brandName === brandName);
    if(!brandObj) return;
    if(brandObj.isGangguan) { window.customAlert('Maintenance Server', 'Mohon maaf, produk sedang gangguan.', 'warning'); return; }
    
    currentCheckoutBrand = brandObj; selectedProductForBuy = null; appliedPromo = null;
    
    document.getElementById('buy-promo-code').value = '';
    document.getElementById('buy-promo-msg').innerHTML = '';
    document.getElementById('buy-qty').value = 1;
    document.getElementById('manual-warning-msg').style.display = 'none';
    document.getElementById('cash-warning-msg').style.display = 'none';
    const qtySub = document.getElementById('buy-qty-subtext');
    if (qtySub) qtySub.innerText = 'Kuantitas item';
    window.switchBuyModalTab('form');
    
    document.getElementById('buy-detail-fields').style.maxHeight = '150px';
    document.getElementById('buy-desc-fade').style.display = 'block';
    document.getElementById('btn-desc-more').style.display = 'block';
    document.getElementById('buy-item-grid').style.maxHeight = '380px';

    document.getElementById('buy-brand-name').innerText = brandObj.brandName;
    let badgeTypeLabel = 'APLIKASI PREMIUM';
    if (brandObj.type === 'game') badgeTypeLabel = 'TOP UP GAME';
    else if (brandObj.type === 'tools') badgeTypeLabel = 'TOOLS DIGITAL';
    document.getElementById('buy-brand-badge').innerText = badgeTypeLabel;
    
    const totalSold = orders.filter(o => o.status === 'SUCCESS' && o.items && o.items[0]?.brandName === brandObj.brandName)
                            .reduce((sum, o) => sum + (o.items[0].qty || 1), 0);
    document.getElementById('buy-brand-sold').innerText = `${totalSold} Terjual`;
    
    const imgEl = document.getElementById('buy-brand-img');
    if(brandObj.imgUrlBase64) { imgEl.src = brandObj.imgUrlBase64; imgEl.style.display = 'block'; } 
    else { imgEl.style.display = 'none'; }
    
    const itemGrid = document.getElementById('buy-item-grid');
    const sortedItems = [...brandObj.items].sort((a, b) => (a.priceNum||0) - (b.priceNum||0));
    
    if (sortedItems.length <= 6) document.getElementById('btn-items-more').style.display = 'none';
    else document.getElementById('btn-items-more').style.display = 'block';
    
    let html = '';
    sortedItems.forEach(item => {
        const normalPrice = item.priceNum || 0;
        const hasStockQuota = typeof item.stockCount === 'number' && item.stockCount >= 0;
        const isQuotaEmpty = hasStockQuota && item.stockCount === 0;
        const isSold = Boolean(item.soldOut || isQuotaEmpty);

        const procBadge = item.processType === 'manual'
            ? '<small style="font-size:0.6rem; font-weight:800; color:var(--warning);">MANUAL</small>'
            : '<small style="font-size:0.6rem; font-weight:800; color:var(--success);">INSTAN</small>';

        let stockInfoHtml = '';
        if (hasStockQuota) {
            stockInfoHtml = `<span class="item-stock-pill"><i class="fa-solid fa-layer-group"></i> Sisa Stok: <b>${item.stockCount}</b></span>`;
        }
        
        html += `
            <div class="item-card ${isSold ? 'sold-out' : ''}" id="buy-card-${item.dbId}" onclick="${isSold ? '' : `window.selectItemToBuy('${item.dbId}')`}">
                <div>
                    <h4>${escapeHtml(item.name)}</h4>
                    ${stockInfoHtml}
                </div>
                <div class="price-wrapper">
                    <span class="price-normal">Rp${normalPrice.toLocaleString('id-ID')}</span>
                    ${procBadge}
                </div>
            </div>
        `;
    });
    itemGrid.innerHTML = html;
    
    const fields = document.getElementById('buy-detail-fields');
    let inpType = brandObj.items[0]?.inputType || (brandObj.type === 'game' ? 'id_zone' : 'none');
    let fmtDesc = brandObj.desc ? escapeHtml(brandObj.desc).replace(/\n/g, '<br>') : '';
    let extraDesc = fmtDesc ? `<div style="font-size:0.84rem; font-weight:600; color:var(--text); background:var(--bg); padding:12px; border-radius:10px; border:1.5px solid var(--border); margin-bottom:12px;"><i class="fa-solid fa-circle-info text-primary" style="margin-right:6px;"></i> ${fmtDesc}</div>` : '';
    
    if (!fmtDesc || brandObj.desc.length < 130) {
        document.getElementById('buy-desc-fade').style.display = 'none';
        document.getElementById('btn-desc-more').style.display = 'none';
        document.getElementById('buy-detail-fields').style.maxHeight = '1200px';
    }

    if(brandObj.type === 'game' || (brandObj.type === 'tools' && inpType && inpType !== 'none')) {
        if(inpType === 'id_only') {
            fields.innerHTML = `
                ${extraDesc}
                <div class="form-group" style="margin-bottom:0;">
                    <label for="buy-id">ID Player / UID Tujuan <span style="color:var(--danger)">*</span></label>
                    <input type="text" id="buy-id" class="form-control" placeholder="Masukkan ID Player (Contoh: 123456789)" required>
                    <small class="form-helper" style="color:var(--danger);">*Pastikan ID sudah benar.</small>
                </div>`;
        } else if(inpType === 'custom' || inpType === 'roblox') {
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
                <span>Detail <b>Akun / Link Akses Tools / Lisensi</b> akan langsung ditampilkan otomatis di menu <b>Pesanan (E-Receipt)</b> segera setelah pembayaran lunas!</span>
            </div>`;
    }
    
    const emailGroup = document.getElementById('buy-email-group');
    const emailInput = document.getElementById('buy-email');
    if (!userProfile.isGuest && userProfile.email) {
        emailInput.value = userProfile.email;
        if(emailGroup) emailGroup.style.display = 'none';
    } else {
        emailInput.value = localStorage.getItem('vipercell_track_email') || '';
        if(emailGroup) emailGroup.style.display = 'block';
    }
    
    const defaultPayCard = document.querySelector('input[name="payment_method"][value="qris"]');
    if(defaultPayCard) window.selectPaymentUI('qris', defaultPayCard.parentElement);
    
    window.calculateDirectBuyTotal();
    window.renderReviewsUI();
    window.switchMainTab('checkout');
};

window.selectItemToBuy = function(dbId) {
    selectedProductForBuy = currentCheckoutBrand.items.find(i => i.dbId === dbId);
    document.querySelectorAll('.item-card').forEach(el => el.classList.remove('selected'));
    const cardEl = document.getElementById(`buy-card-${dbId}`);
    if(cardEl) cardEl.classList.add('selected');
    
    const manualWarn = document.getElementById('manual-warning-msg');
    if (manualWarn) {
        manualWarn.style.display = selectedProductForBuy.processType === 'manual' ? 'flex' : 'none';
    }

    const qtyInput = document.getElementById('buy-qty');
    const qtySub = document.getElementById('buy-qty-subtext');
    if (selectedProductForBuy && typeof selectedProductForBuy.stockCount === 'number') {
        if (qtySub) qtySub.innerText = `Tersedia ${selectedProductForBuy.stockCount} stok`;
        if (parseInt(qtyInput.value) > selectedProductForBuy.stockCount) {
            qtyInput.value = Math.max(1, selectedProductForBuy.stockCount);
        }
    } else if (qtySub) {
        qtySub.innerText = 'Kuantitas item';
    }
    
    window.calculateDirectBuyTotal();
};

window.applyPromoDirect = function() {
    const codeInput = document.getElementById('buy-promo-code').value.trim().toUpperCase();
    const msgEl = document.getElementById('buy-promo-msg');
    
    if(!codeInput) {
        appliedPromo = null; window.calculateDirectBuyTotal(); return;
    }
    
    const p = promos.find(x => x.code === codeInput);
    if(!p || !p.active) {
        appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-circle-xmark"></i> Kode promo tidak ditemukan atau tidak aktif.</span>`;
    } else if (p.usedCount >= p.maxUses) {
        appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-circle-xmark"></i> Kuota kode promo sudah habis.</span>`;
    } else if (p.targetBrand !== 'all' && p.targetBrand !== currentCheckoutBrand.brandName) {
        appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-circle-xmark"></i> Khusus produk ${escapeHtml(p.targetBrand)}.</span>`;
    } else if (p.targetUser === 'new') {
        const hasOrders = currentUser ? orders.some(o => o.userId === currentUser.uid) : false;
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
    
    if(!selectedProductForBuy) {
        document.getElementById('buy-total-price').innerText = 'Rp0';
        btnProc.innerHTML = '<i class="fa-solid fa-cart-shopping"></i> <span>Pilih Varian Dahulu</span>';
        btnProc.disabled = true;
        return; 
    }
    
    const qty = parseInt(document.getElementById('buy-qty').value) || 1;
    let baseTotal = selectedProductForBuy.priceNum * qty;
    
    let disc = 0;
    if(appliedPromo) {
        if(appliedPromo.type === 'percent') disc = Math.round(baseTotal * (appliedPromo.amount / 100));
        else disc = appliedPromo.amount;
        
        if(disc > baseTotal) disc = baseTotal;
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

// ==========================================
// PROSES CHECKOUT + BARCODE KASIR TUNAI & QRIS
// ==========================================
window.processDirectCheckout = async function() {
    if (isProcessingCheckout || !selectedProductForBuy) return;
    
    let emailInput = document.getElementById('buy-email').value.trim();
    if(!emailInput || !emailInput.includes('@')) { 
        window.customAlert('Email Diperlukan', 'Harap masukkan alamat Email aktif untuk bukti tagihan & pelacakan!', 'warning'); 
        return; 
    }
    
    const qty = parseInt(document.getElementById('buy-qty').value) || 1;

    // Validasi Kuota Stok jika ditentukan
    if (typeof selectedProductForBuy.stockCount === 'number' && selectedProductForBuy.stockCount < qty) {
        window.customAlert('Stok Tidak Cukup', `Sisa stok untuk varian ini hanya ${selectedProductForBuy.stockCount}.`, 'warning');
        return;
    }
    
    let playerInfo = '';
    const buyIdEl = document.getElementById('buy-id');
    if(buyIdEl) {
        const pid = buyIdEl.value.trim();
        const zol = document.getElementById('buy-zone') ? document.getElementById('buy-zone').value.trim() : '';
        if(!pid) { window.customAlert('Data Tujuan Kosong', 'Harap isi ID Player / Username / Target Tujuan terlebih dahulu!', 'warning'); return; }
        
        let inpType = currentCheckoutBrand.items[0]?.inputType || 'id_zone';
        if(inpType === 'id_only') playerInfo = `ID: ${pid}`;
        else if(inpType === 'custom' || inpType === 'roblox') playerInfo = `Target: ${pid}`;
        else playerInfo = `ID: ${pid} | Zone: ${zol}`;
    } else {
        const typeLabel = currentCheckoutBrand.type === 'tools' ? 'Tools Digital' : 'Akun Premium';
        playerInfo = `${typeLabel} (Delivery: ${selectedProductForBuy.processType === 'manual' ? 'Manual' : 'Auto'})`;
    }

    await ensureAuthSession();

    const now = Date.now();
    const existingActiveOrder = orders.find(o => {
        const isSameUser = (currentUser && o.userId === currentUser.uid) ||
                           (o.userEmail && o.userEmail.toLowerCase() === emailInput.toLowerCase());
        const isStillActive = (o.status === 'UNPAID' || o.status === 'PENDING') && (now - new Date(o.date).getTime() < 240000);
        const isSameItem = o.items && o.items[0] && o.items[0].productDbId === selectedProductForBuy.dbId && o.items[0].qty === qty;
        return isSameUser && isStillActive && isSameItem;
    });

    if (existingActiveOrder) {
        window.showToast('Tagihan Aktif Ditemukan', `Membuka kembali tagihan ${existingActiveOrder.id} agar pesanan tidak dobel.`, 'warning');
        window.resumePayment(existingActiveOrder.dbId);
        return;
    }

    isProcessingCheckout = true;
    const btnProc = document.getElementById('btn-process-buy');
    const ogHtml = btnProc.innerHTML;
    btnProc.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Menerbitkan Tagihan...</span>';
    btnProc.disabled = true;

    localStorage.setItem('vipercell_track_email', emailInput);
    const trackEmailEl = document.getElementById('track-email');
    if (trackEmailEl) trackEmailEl.value = emailInput;
    
    let rawTotal = selectedProductForBuy.priceNum * qty;
    let discountPromo = 0; let promoUsedCode = '';
    if(appliedPromo) {
        if(appliedPromo.type === 'percent') discountPromo = Math.round(rawTotal * (appliedPromo.amount / 100));
        else discountPromo = appliedPromo.amount;
        if(discountPromo > rawTotal) discountPromo = rawTotal;
        promoUsedCode = appliedPromo.code;
    }
    
    let baseTotal = rawTotal - discountPromo;
    if(baseTotal < 0) baseTotal = 0;
    const paymentMethod = document.querySelector('input[name="payment_method"]:checked').value;
    
    let uniqueCode = 0;
    if(paymentMethod === 'qris' && baseTotal > 0) uniqueCode = Math.floor(Math.random() * 250) + 1;
    let finalTotal = baseTotal + uniqueCode;
    
    let invId = 'VP-' + Math.floor(100000 + Math.random() * 900000);
    while (orders.some(o => o.id === invId)) {
        invId = 'VP-' + Math.floor(100000 + Math.random() * 900000);
    }

    const singleItem = { 
        cartId: Date.now().toString(),
        productDbId: selectedProductForBuy.dbId,
        brandName: currentCheckoutBrand.brandName,
        exactItemName: selectedProductForBuy.name,
        name: `${currentCheckoutBrand.brandName} - ${selectedProductForBuy.name} (x${qty})`, 
        priceNum: selectedProductForBuy.priceNum,
        qty: qty,
        type: currentCheckoutBrand.type, 
        processType: selectedProductForBuy.processType || 'auto',
        playerInfo: playerInfo 
    };

    const newOrder = {
        id: invId, 
        userEmail: emailInput,
        userId: currentUser ? currentUser.uid : null, 
        items: [singleItem],
        finalTotal: finalTotal,
        baseTotal: baseTotal,
        uniqueCode: uniqueCode,
        promoCode: promoUsedCode,
        promoDiscount: discountPromo,
        status: paymentMethod === 'cash' ? 'PENDING' : 'UNPAID',
        paymentMethod: paymentMethod,
        adminReply: '',
        date: new Date().toISOString()
    };

    try {
        const docRef = await addDoc(collection(db, pathOrders), newOrder);
        currentCheckoutSession = {
            dbId: docRef.id,
            id: invId,
            itemName: singleItem.name,
            finalTotal: finalTotal,
            method: paymentMethod,
            date: newOrder.date
        };
        
        if(appliedPromo) {
            await updateDoc(doc(db, pathPromos, appliedPromo.dbId), { usedCount: increment(1) }).catch(()=>{});
        }
        
        if(paymentMethod === 'qris') {
            setTimeout(() => window.openQRISModal(), 150);
        } else {
            // Tampilkan Tiket Barcode Kasir 1D (Ala Indomaret / Alfamidi) untuk di-scan Admin!
            setTimeout(() => window.openCashBarcodeModal(), 150);
        }
        
    } catch (e) { 
        window.customAlert("Gagal", "Gagal membuat pesanan ke server, silakan coba lagi.", "error"); 
    } finally {
        setTimeout(() => {
            isProcessingCheckout = false;
            btnProc.innerHTML = ogHtml;
            btnProc.disabled = false;
        }, 1200);
    }
};

// ==========================================
// MODAL TIKET BARCODE TUNAI / CASH (ALA INDOMARET)
// ==========================================
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

// ==========================================
// TIMER & MODAL QRIS FINTECH (SCAN-READY)
// ==========================================
window.startQrisTimer = function(orderDate) {
    clearInterval(qrisInterval);
    const timerEl = document.getElementById('qris-timer-display');
    const timeText = document.getElementById('qris-time-left');
    if(!timerEl || !timeText) return;
    
    timerEl.style.display = 'inline-block';
    const startTime = new Date(orderDate).getTime();
    
    qrisInterval = setInterval(() => {
        const diff = Date.now() - startTime;
        const remain = 240000 - diff;
        
        if(remain <= 0) {
            clearInterval(qrisInterval);
            timeText.innerText = "EXPIRED";
        } else {
            const m = Math.floor(remain / 60000);
            const s = Math.floor((remain % 60000) / 1000);
            timeText.innerText = `0${m}:${s < 10 ? '0'+s : s}`;
        }
    }, 1000);
};

window.openQRISModal = function() {
    window.closeModal('modal-order-detail');
    const qrContainer = document.getElementById('qrcode-container');
    const qrErrorMsg = document.getElementById('qris-error-msg');
    const invIdEl = document.getElementById('pay-modal-invoice-id');
    qrContainer.innerHTML = '';
    
    if(invIdEl && currentCheckoutSession) {
        invIdEl.innerText = currentCheckoutSession.id;
    }
    
    const qrisBaseString = (siteSettings.qrisStringData || '').trim();
    
    if(qrisBaseString && currentCheckoutSession && currentCheckoutSession.finalTotal > 0) {
        const dynamicQRIS = generateDynamicQRIS(qrisBaseString, currentCheckoutSession.finalTotal);
        new QRCode(qrContainer, {
            text: dynamicQRIS,
            width: 220,
            height: 220,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.M
        });
        qrContainer.style.display = 'flex';
        qrErrorMsg.style.display = 'none';
    } else {
        qrContainer.style.display = 'none';
        qrErrorMsg.style.display = 'flex';
        qrErrorMsg.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>String QRIS belum diatur di Admin atau nominal tidak valid.</span>`;
    }
    
    const guestWarning = document.getElementById('pay-modal-guest-warning');
    if (guestWarning) {
        guestWarning.style.display = userProfile.isGuest ? 'block' : 'none';
    }
    
    document.getElementById('pay-total-display').innerText = `Rp${currentCheckoutSession.finalTotal.toLocaleString('id-ID')}`;
    if(currentCheckoutSession.date) window.startQrisTimer(currentCheckoutSession.date);
    
    window.openModal('modal-payment');
};

window.copyNominal = function() {
    if(!currentCheckoutSession) return;
    const nominal = currentCheckoutSession.finalTotal.toString();
    navigator.clipboard.writeText(nominal).then(() => {
        window.showToast('Nominal Disalin', `Angka Rp${Number(nominal).toLocaleString('id-ID')} berhasil disalin.`, 'success');
    });
};

window.resumePayment = function(dbId) {
    const order = orders.find(o => o.dbId === dbId);
    if(!order) return;
    currentCheckoutSession = {
        dbId: order.dbId,
        id: order.id,
        itemName: order.items && order.items[0] ? order.items[0].name : 'Pesanan Vipercell',
        finalTotal: order.finalTotal,
        method: order.paymentMethod,
        date: order.date
    };
    if(order.paymentMethod === 'cash') window.openCashBarcodeModal(order);
    else window.openQRISModal();
};

window.goToPesananFromPay = function() {
    window.closeModal('modal-payment');
    const orderIdToTrack = currentCheckoutSession ? currentCheckoutSession.id : '';
    currentCheckoutSession = null;
    
    window.switchMainTab('pesanan');
    if (orderIdToTrack) {
        window.openOrderDetailModalById(orderIdToTrack);
    }
};

// ==========================================
// E-RECEIPT RINCIAN PESANAN BARU (DENGAN STATUS STEPPER & TOMBOL BARCODE)
// ==========================================
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
    
    if(!actionBtn) return '';
    return `
    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1.5px dashed var(--border-subtle);">
        ${actionBtn}
    </div>`;
}

function hasOrderBeenReviewed(order) {
    if (!order) return true;
    return reviewsData.some(r => r.orderId && r.orderId === order.id);
}

window.copyAccountReplyText = function(invId) {
    const order = orders.find(o => o.id === invId);
    if (!order || !order.adminReply) return;
    navigator.clipboard.writeText(order.adminReply).then(() => {
        window.showToast('Data Disalin', 'Seluruh detail akun/link pesanan berhasil disalin!', 'success');
    });
};

function buildFullReceiptHTML(order) {
    const sBadge = order.status === 'UNPAID' ? 'status-unpaid' : order.status === 'PENDING' ? 'status-pending' : (order.status === 'FAILED' || order.status === 'EXPIRED') ? 'status-failed' : 'status-success';
    const sName = order.status === 'UNPAID' ? 'BELUM DIBAYAR' : order.status === 'PENDING' ? 'MENUNGGU KASIR / PROSES' : order.status === 'FAILED' ? 'GAGAL / BATAL' : order.status === 'EXPIRED' ? 'WAKTU HABIS' : 'TRANSAKSI SUKSES';
    
    const brandName = order.items[0]?.brandName || '';
    const safeJsBrand = escapeJsStr(brandName);

    // Status Stepper 3 Tahap
    const isFailed = order.status === 'FAILED' || order.status === 'EXPIRED';
    const step2Class = order.status === 'SUCCESS' ? 'done' : (isFailed ? 'failed' : 'active');
    const step3Class = order.status === 'SUCCESS' ? 'done' : '';

    let actionHtml = '';
    if (order.status === 'UNPAID') {
        actionHtml = `<button class="btn btn-primary" style="width:100%; margin-top:1rem;" onclick="window.resumePayment('${order.dbId}')"><i class="fa-solid fa-qrcode"></i> Buka & Bayar QRIS Sekarang</button>`;
    } else if (order.status === 'PENDING' && order.paymentMethod === 'cash') {
        actionHtml = `<button class="btn btn-primary" style="width:100%; margin-top:1rem;" onclick="window.resumePayment('${order.dbId}')"><i class="fa-solid fa-barcode"></i> Tampilkan Barcode Kasir (Tunai)</button>`;
    } else if (order.status === 'SUCCESS') {
        const alreadyReviewed = hasOrderBeenReviewed(order);
        if (!alreadyReviewed && brandName) {
            actionHtml = `<button class="btn btn-warning" style="width:100%; margin-top:1rem;" onclick="window.goToReview('${safeJsBrand}', '${order.id}')"><i class="fa-solid fa-star"></i> Beri Ulasan Transaksi Ini</button>`;
        } else if (alreadyReviewed) {
            actionHtml = `<div style="margin-top:1rem; text-align:center; font-size:0.78rem; font-weight:800; color:var(--success); padding:8px; border:1.5px dashed var(--success); border-radius:8px;"><i class="fa-solid fa-circle-check"></i> Transaksi ini sudah diulas</div>`;
        }
    }
    
    let replyHtml = '';
    if (order.status === 'SUCCESS') {
        if (order.adminReply) {
            replyHtml = `
            <div class="ereceipt-cred-vault">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight: 800; color: var(--success); font-size: 0.84rem; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-key"></i> DATA AKUN / LINK TOOLS TERKIRIM:
                    </span>
                    <button class="btn btn-outline btn-sm" style="padding:3px 10px; min-height:28px; font-size:0.7rem;" onclick="window.copyAccountReplyText('${escapeJsStr(order.id)}')">
                        <i class="fa-regular fa-copy"></i> Salin Semua
                    </button>
                </div>
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

        <!-- Progres Status Pesanan -->
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
                <span style="color:var(--warning);">Kode Unik QRIS</span>
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
    const sBadge = order.status === 'UNPAID' ? 'status-unpaid' : order.status === 'PENDING' ? 'status-pending' : (order.status === 'FAILED' || order.status === 'EXPIRED') ? 'status-failed' : 'status-success';
    const sName = order.status === 'UNPAID' ? 'BELUM BAYAR' : order.status === 'PENDING' ? (order.paymentMethod === 'cash' ? 'TUNAI BARCODE' : 'DIPROSES') : order.status === 'FAILED' ? 'GAGAL' : order.status === 'EXPIRED' ? 'EXPIRED' : 'SELESAI';
    
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
    if(trackResult && trackResult.style.display === 'block') window.trackOrder();
    window.showToast('Diperbarui', 'Status transaksi telah disegarkan.', 'info');
};

window.trackOrder = function() {
    const invId = document.getElementById('track-id').value.trim().toUpperCase();
    if(!invId) return;

    let trackEmail = "";
    if (userProfile.isGuest) {
        trackEmail = document.getElementById('track-email').value.trim();
        if(!trackEmail) {
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
    
    if(!order) {
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
    if(!grid) return;
    
    const savedTrackEmail = (localStorage.getItem('vipercell_track_email') || '').toLowerCase();
    const activeEmail = (!userProfile.isGuest && userProfile.email) ? userProfile.email.toLowerCase() : savedTrackEmail;

    let userOrders = orders.filter(o => {
        const matchUid = currentUser && o.userId === currentUser.uid;
        const matchEmail = activeEmail && o.userEmail && o.userEmail.toLowerCase() === activeEmail;
        return matchUid || matchEmail;
    });

    if (currentUserHistoryFilter !== 'ALL') {
        userOrders = userOrders.filter(o => o.status === currentUserHistoryFilter);
    }
    
    if(userOrders.length === 0) {
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
// FITUR ULASAN: 1X ULASAN PER TRANSAKSI (ORDER ID) + BALASAN ADMIN
// ==========================================
function getUnreviewedSuccessOrdersForBrand(brandName) {
    const userEmailToMatch = (userProfile.email || localStorage.getItem('vipercell_track_email') || '').toLowerCase();
    
    const mySuccessOrders = orders.filter(o => {
        if (o.status !== 'SUCCESS') return false;
        if (!o.items || o.items[0]?.brandName !== brandName) return false;
        const matchUid = currentUser && o.userId === currentUser.uid;
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
        ((currentUser && r.userId === currentUser.uid) || (userEmailToMatch && r.userEmail?.toLowerCase() === userEmailToMatch))
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

    const brandReviews = reviewsData.filter(r => r.brandName === brandName).sort((a,b) => b.timestamp - a.timestamp);
    
    if (brandReviews.length === 0) {
        reviewListContainer.innerHTML = `<div class="brutal-empty-box"><i class="fa-regular fa-comment-dots" style="font-size:2rem; margin-bottom:8px; display:block;"></i>Belum ada ulasan untuk produk ini.</div>`;
        return;
    }
    
    let html = '';
    brandReviews.forEach(r => {
        let starsHtml = '';
        for(let i=0; i<5; i++) {
            if(i < r.rating) starsHtml += `<i class="fa-solid fa-star" style="color:var(--warning); font-size:0.85rem;"></i>`;
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
    
    if(!textInput) { window.customAlert('Ulasan Kosong', 'Silakan tulis pengalaman belanjamu terlebih dahulu.', 'warning'); return; }
    
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

    const newReview = {
        orderId: orderToReview.id,
        brandName: currentCheckoutBrand.brandName,
        userEmail: userProfile.email || localStorage.getItem('vipercell_track_email') || orderToReview.userEmail || 'anonim',
        userId: currentUser ? currentUser.uid : null,
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
    } catch(e) {
        window.customAlert('Gagal', 'Gagal mengirim ulasan. Pastikan jaringan kamu stabil.', 'error');
    } finally {
        isSubmittingReview = false;
        btnSubmit.innerHTML = ogHtml;
        btnSubmit.disabled = false;
    }
};

// Inisialisasi Aplikasi
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initApp); } 
else { initApp(); }