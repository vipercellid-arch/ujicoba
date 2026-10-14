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

// ==========================================
// STATE & VARIABEL GLOBAL
// ==========================================
let products = [];
let groupedBrands = []; 
let orders = [];
let promos = [];
let reviewsData = [];
let siteSettings = { 
    logoText: 'VIPER', logoAccent: 'CELL', logoImgBase64: '', marquee: 'Selamat Datang di Vipercell',
    qrisStringData: '', adminWa: '085656321860', igLink: '', ttLink: '',
    newsList: [], banners: [], isStoreOpen: true, waChannelLink: ''
};

let userProfile = { name: '', email: '', isGuest: true };
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

// Filter & Search Katalog
let currentBrandFilter = 'all';
let currentSearchQuery = '';

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
// SISTEM TEMA (DEFAULT AWAL: LIGHT / PUTIH)
// ==========================================
window.toggleTheme = function() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('vipercell_theme', newTheme);
    
    const metaTheme = document.getElementById('meta-theme-color');
    if(metaTheme) metaTheme.setAttribute('content', newTheme === 'dark' ? '#0f172a' : '#ffffff');
    
    const icon = document.getElementById('theme-icon');
    if(icon) icon.className = newTheme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
};

// ==========================================
// SISTEM NOTIFIKASI BROWSER / PWA MATANG
// ==========================================
function updateNotifIconUI() {
    const btn = document.getElementById('btn-notif-perm');
    const icon = document.getElementById('notif-perm-icon');
    if (!btn || !icon || !('Notification' in window)) return;

    if (Notification.permission === 'granted') {
        icon.className = 'fa-solid fa-bell';
        btn.style.background = '#dbeafe';
        btn.style.color = '#1d4ed8';
    } else if (Notification.permission === 'denied') {
        icon.className = 'fa-solid fa-bell-slash';
        btn.style.background = 'var(--surface)';
        btn.style.color = 'var(--text-muted)';
    } else {
        icon.className = 'fa-regular fa-bell';
    }
}

window.requestWebNotificationPermission = async function() {
    if (!('Notification' in window)) {
        window.customAlert('Tidak Didukung', 'Browser perangkat kamu belum mendukung notifikasi sistem.', 'warning');
        return;
    }
    if (Notification.permission === 'granted') {
        window.showToast('Notifikasi Aktif', 'Notifikasi browser kamu sudah aktif!', 'success');
        sendNativeNotification('Vipercell Store', 'Notifikasi real-time sudah aktif di perangkatmu!');
        return;
    }
    const perm = await Notification.requestPermission();
    updateNotifIconUI();
    if (perm === 'granted') {
        window.showToast('Berhasil Diaktifkan', 'Kamu akan menerima notifikasi saat pesanan selesai atau dibalas Admin.', 'success');
        sendNativeNotification('Notifikasi Vipercell Aktif!', 'Kami akan memberitahumu segera setelah pesanan selesai diproses.');
    } else {
        window.showToast('Izin Ditolak', 'Aktifkan izin notifikasi di pengaturan browser jika ingin menerima pemberitahuan.', 'warning');
    }
};

function sendNativeNotification(title, bodyText) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const iconUrl = siteSettings.logoImgBase64 || 'https://cdn-icons-png.flaticon.com/512/3659/3659899.png';
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification(title, {
                body: bodyText,
                icon: iconUrl,
                badge: iconUrl,
                vibrate: [150, 80, 150]
            });
        }).catch(() => {
            new Notification(title, { body: bodyText, icon: iconUrl });
        });
    } else {
        new Notification(title, { body: bodyText, icon: iconUrl });
    }
}

// ==========================================
// EFEK TYPEWRITER HERO SECTION
// ==========================================
const twWords = [
    "Aplikasi Premium Bergaransi",
    "Top Up Game Instan 24 Jam",
    "Tools Digital & Produktivitas",
    "Pembayaran QRIS Detik Itu Juga"
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
    for (let i = 0; i < 65; i++) {
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
                const trackInput = document.getElementById('track-id');
                if (trackInput && orderId) {
                    trackInput.value = orderId;
                    window.trackOrder();
                }
            }, 450);
        }, 2700);
    }
};

// ==========================================
// IN-APP PUSH NOTIFICATION (TOAST)
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
    
    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
            <h4>${escapeHtml(title)}</h4>
            <p>${escapeHtml(msg)}</p>
        </div>
    `;
    
    if(actionCallback) {
        toast.style.cursor = 'pointer';
        toast.onclick = () => { actionCallback(); toast.remove(); };
    }
    
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
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
    const titlePesanan = document.getElementById('pesanan-title');
    const subPesanan = document.getElementById('pesanan-subtitle');
    
    if (isLogged) {
        if(textPesananDesk) textPesananDesk.innerText = "Pesanan Saya";
        if(textPesananMob) textPesananMob.innerText = "Pesanan";
        if(titlePesanan) titlePesanan.innerText = "Pesanan & Riwayat Transaksi";
        if(subPesanan) subPesanan.innerText = "Pantau status pesanan dan ambil data akun/voucher kamu secara langsung.";
    } else {
        if(textPesananDesk) textPesananDesk.innerText = "Lacak Pesanan";
        if(textPesananMob) textPesananMob.innerText = "Lacak";
        if(titlePesanan) titlePesanan.innerText = "Lacak Status Pesanan";
        if(subPesanan) subPesanan.innerText = "Masukkan Email pembelian dan ID Invoice untuk membuka rincian pesananmu.";
    }
}

// ==========================================
// INIT APP & FIREBASE AUTHENTICATION
// ==========================================
async function initApp() {
    initTypewriter();
    updateNotifIconUI();
    try {
        // Default ke LIGHT (Putih) jika belum ada di localStorage
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
            
            const historySec = document.getElementById('user-history-section');
            const guestTrackSec = document.getElementById('guest-tracking-section');
            const emailGroupBuy = document.getElementById('buy-email-group');
            
            if (user) {
                if (user.isAnonymous) {
                    const savedAnonName = localStorage.getItem('vipercell_anon_name') || '';
                    userProfile = { name: savedAnonName, email: '', isGuest: true };
                    
                    document.getElementById('btn-login-user').style.display = 'inline-flex';
                    document.getElementById('nav-profil').style.display = 'none';
                    
                    if(historySec) historySec.style.display = 'none';
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
                            isGuest: false
                        };
                    }
                    
                    const finalEmail = userProfile.email || user.email || '';
                    const finalName = userProfile.name || finalEmail.split('@')[0] || 'Member Vipercell';
                    userProfile.email = finalEmail;
                    userProfile.name = finalName;

                    document.getElementById('prof-name').value = finalName;
                    document.getElementById('prof-email').value = finalEmail;
                    
                    const dispNameEl = document.getElementById('prof-display-name');
                    const dispEmailEl = document.getElementById('prof-display-email');
                    const avatarEl = document.getElementById('prof-avatar-initial');
                    if (dispNameEl) dispNameEl.innerText = finalName;
                    if (dispEmailEl) dispEmailEl.innerText = finalEmail;
                    if (avatarEl) avatarEl.innerText = finalName.charAt(0).toUpperCase();

                    document.getElementById('nav-profil').style.display = 'flex';
                    
                    if(guestTrackSec) guestTrackSec.style.display = 'none';
                    if(historySec) historySec.style.display = 'block';
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
                
                if(historySec) historySec.style.display = 'none';
                if(guestTrackSec) guestTrackSec.style.display = 'block';
                if(emailGroupBuy) emailGroupBuy.style.display = 'block';
                
                updateUIVisibility();
                signInAnonymously(auth).catch(() => {});
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
    
    onSnapshot(doc(db, pathSettings, 'mainConfig'), (docSnap) => {
        if (docSnap.exists()) {
            siteSettings = { ...siteSettings, ...docSnap.data() };
        }
        isSettingsLoaded = true;
        window.applySettingsToUI();
    });

    onSnapshot(collection(db, pathReviews), (snapshot) => {
        reviewsData = [];
        snapshot.forEach((docSnap) => { reviewsData.push({ dbId: docSnap.id, ...docSnap.data() }); });
        
        window.renderBrands(currentBrandFilter);
        
        if(currentCheckoutBrand) {
            window.renderReviewsUI();
        }
        if(currentUser && !userProfile.isGuest) {
            window.renderUserOrders();
        }
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

            // ANIMASI PEMBAYARAN SUKSES + NOTIFIKASI SISTEM
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
        if(currentUser) {
            window.renderUserOrders();
            if(!userProfile.isGuest) updateProfileStats();
        }
        if(currentCheckoutBrand) {
            window.renderReviewsUI();
        }
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
    if (currentUser && !userProfile.isGuest) {
        const hasActionNeeded = orders.some(o => o.userId === currentUser.uid && (o.status === 'UNPAID' || o.status === 'PENDING'));
        const badgeDesk = document.getElementById('user-order-badge-desktop');
        if(badgeDesk) badgeDesk.style.display = hasActionNeeded ? 'block' : 'none';
        const badgeMob = document.getElementById('user-order-badge-mobile');
        if(badgeMob) badgeMob.style.display = hasActionNeeded ? 'block' : 'none';
    }
}

// ==========================================
// CRC16 CCITT-FALSE & DYNAMIC QRIS GENERATOR
// ==========================================
function calculateCRC16(payload) {
    let crc = 0xFFFF;
    for (let c = 0; c < payload.length; c++) {
        crc ^= payload.charCodeAt(c) << 8;
        for (let i = 0; i < 8; i++) {
            if ((crc & 0x8000) !== 0) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
        }
    }
    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

function generateDynamicQRIS(staticQRIS, amount) {
    if (!staticQRIS) return "";
    let baseString = staticQRIS.slice(0, -4);
    if (baseString.endsWith('6304')) baseString = baseString.slice(0, -4);

    const amountStr = amount.toString();
    const lengthStr = amountStr.length.toString().padStart(2, '0');
    const tag54 = `54${lengthStr}${amountStr}`;

    const newPayload = `${baseString}${tag54}6304`;
    const newCRC = calculateCRC16(newPayload);

    return `${newPayload}${newCRC}`;
}

// ==========================================
// FITUR LIVE CHAT + NOTIFIKASI BALASAN ADMIN
// ==========================================
function checkChatUserState() {
    const preForm = document.getElementById('chat-pre-form');
    const chatHeader = document.getElementById('chat-wa-header');
    const chatBody = document.getElementById('user-chat-body');
    const chatFooter = document.getElementById('user-chat-footer');
    
    let hasName = userProfile.name && userProfile.name.trim() !== '';
    
    if(!hasName && userProfile.isGuest) {
        const savedName = localStorage.getItem('vipercell_anon_name');
        if(savedName) {
            userProfile.name = savedName;
            hasName = true;
        }
    }
    
    if(!hasName && currentUser && !userProfile.isGuest && currentUser.email) {
        hasName = true;
        userProfile.name = currentUser.email.split('@')[0];
    }
    
    if (hasName) {
        if(preForm) preForm.style.display = 'none';
        if(chatHeader) chatHeader.style.display = 'flex';
        if(chatBody) chatBody.style.display = 'flex';
        if(chatFooter) chatFooter.style.display = 'flex';
        scrollToBottomUserChat();
    } else {
        if(preForm) preForm.style.display = 'flex';
        if(chatHeader) chatHeader.style.display = 'none';
        if(chatBody) chatBody.style.display = 'none';
        if(chatFooter) chatFooter.style.display = 'none';
    }
}

window.startAnonChat = function() {
    const input = document.getElementById('chat-anon-name');
    const name = input ? input.value.trim() : '';
    if(!name) { window.customAlert('Nama Diperlukan', 'Silakan masukkan nama panggilan Anda.', 'warning'); return; }
    
    userProfile.name = name;
    localStorage.setItem('vipercell_anon_name', name);
    checkChatUserState();
    listenUserChat();

    if(window.pendingMsgToAdmin) {
        document.getElementById('user-chat-input').value = window.pendingMsgToAdmin;
        window.sendUserChat();
        window.pendingMsgToAdmin = null;
    }
};

function listenUserChat() {
    if(!currentUser) return;
    const chatRef = doc(db, pathChats, currentUser.uid);
    if(chatUnsubscribe) chatUnsubscribe();
    
    chatUnsubscribe = onSnapshot(chatRef, (docSnap) => {
        if(docSnap.exists()) {
            const data = docSnap.data();
            const oldLen = userChatMessages.length;
            userChatMessages = data.messages || [];
            
            window.renderUserChatMessages();
            
            if(userChatMessages.length > oldLen && oldLen > 0) {
                const lastMsg = userChatMessages[userChatMessages.length - 1];
                const activeTab = document.querySelector('.main-tab-content.active');
                if(lastMsg.sender === 'admin') {
                    sendNativeNotification('Balasan Baru dari Admin CS 💬', lastMsg.text);
                    if(!activeTab || activeTab.id !== 'tab-bantuan') {
                        window.showToast('Pesan Baru dari Admin', lastMsg.text, 'info', () => window.switchMainTab('bantuan'));
                    }
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
        body.innerHTML = '<div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100%; color:var(--text-muted); text-align:center;"><i class="fa-solid fa-comments" style="font-size:3rem; margin-bottom:12px; color:var(--primary);"></i><p style="font-weight:800;">Belum ada percakapan.<br><small>Ketik pesan di bawah untuk terhubung langsung dengan Admin Vipercell.</small></p></div>';
        return;
    }
    
    let html = '';
    userChatMessages.forEach(msg => {
        const isUser = msg.sender === 'user';
        html += `
            <div class="chat-msg ${isUser ? 'user' : 'admin'}">
                ${escapeHtml(msg.text)}
                <span class="chat-time">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
        `;
    });
    body.innerHTML = html;
    scrollToBottomUserChat();
};

function scrollToBottomUserChat() {
    const body = document.getElementById('user-chat-body');
    if(body) setTimeout(() => { body.scrollTop = body.scrollHeight; }, 100);
}

window.sendUserChat = async function() {
    if(!currentUser) return;
    const input = document.getElementById('user-chat-input');
    const btn = document.getElementById('btn-send-chat');
    
    const text = input.value.trim();
    if(!text || btn.disabled) return;
    
    input.value = '';
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    
    const chatRef = doc(db, pathChats, currentUser.uid);
    const newMsg = { sender: 'user', text: text, timestamp: Date.now() };
    
    try {
        const docSnap = await getDoc(chatRef);
        const displayName = userProfile.name ? userProfile.name : (userProfile.isGuest ? 'Pelanggan Tamu' : currentUser.email);
        
        if(!docSnap.exists()) {
            await setDoc(chatRef, { uid: currentUser.uid, userInfo: displayName, updatedAt: Date.now(), messages: [newMsg] });
        } else {
            await updateDoc(chatRef, { userInfo: displayName, updatedAt: Date.now(), messages: arrayUnion(newMsg) });
        }
        scrollToBottomUserChat();
    } catch(e) {
        window.customAlert('Gagal', 'Pesan tidak terkirim, pastikan jaringan stabil.', 'error');
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
        authTitle.innerText = tab === 'login' ? 'Masuk Akun' : 'Daftar Akun Baru';
        authSub.innerText = tab === 'login' ? 'Masuk untuk memantau seluruh riwayat transaksi.' : 'Buat akun gratis untuk kemudahan transaksi otomatis.';
        
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
    
    let navEl = document.getElementById('nav-'+tab);
    if(navEl) navEl.classList.add('active');
    let botNavEl = document.getElementById('nav-bot-'+tab);
    if(botNavEl) botNavEl.classList.add('active');
    
    let tabEl = document.getElementById('tab-'+tab);
    if(tabEl) {
        tabEl.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'instant' }); 
    }
    
    if (tab === 'bantuan') checkChatUserState();
    if (tab === 'profil') updateProfileStats();
    setTimeout(observeReveals, 50);
};

window.goToReview = function(brandName, orderId = null) {
    targetReviewOrderId = orderId;
    window.openDirectBuyModal(brandName);
    setTimeout(() => {
        window.switchBuyModalTab('reviews');
    }, 250); 
};

// ==========================================
// AUTHENTICATION & PROFIL LENGKAP
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
        btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> <span>Masuk ke Akun</span>'; 
        btn.disabled = false; 
    }
};

window.processRegister = async function() {
    const name = document.getElementById('auth-r-name').value.trim();
    const em = document.getElementById('auth-r-email').value.trim();
    const pw = document.getElementById('auth-r-pass').value.trim();
    
    if(!name || !em || pw.length < 6) { 
        window.customAlert('Peringatan', 'Harap lengkapi form dan Kata Sandi minimal 6 karakter.', 'warning'); return; 
    }
    
    const btn = document.getElementById('btn-do-register');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Memproses...</span>'; 
    btn.disabled = true;
    try {
        const cred = await createUserWithEmailAndPassword(auth, em, pw);
        await setDoc(doc(db, pathUsers, cred.user.uid), { 
            email: em, 
            name: name, 
            isGuest: false, 
            verified: true, 
            createdAt: new Date().toISOString() 
        });
        userProfile = { name, email: em, isGuest: false };
        window.switchMainTab('profil');
        window.customAlert('Pendaftaran Berhasil', 'Akun kamu telah aktif dan siap digunakan!', 'success');
    } catch(e) { window.customAlert('Gagal Daftar', 'Email mungkin sudah terdaftar atau format salah.', 'error'); } 
    finally { 
        btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> <span>Daftar Sekarang</span>'; 
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
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span>Kirim Link Reset</span>';
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
    const ogText = btnText ? btnText.innerText : 'Lanjutkan dengan Google';
    if(btnText) btnText.innerText = 'Memverifikasi...';
    
    try {
        const result = await signInWithPopup(auth, provider);
        const userDoc = await getDoc(doc(db, pathUsers, result.user.uid));
        
        if (!userDoc.exists()) {
            await setDoc(doc(db, pathUsers, result.user.uid), { 
                email: result.user.email, 
                name: result.user.displayName || 'Member Google', 
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
    if(!name) { window.customAlert('Peringatan', 'Nama panggilan tidak boleh kosong.', 'warning'); return; }
    try {
        await updateDoc(doc(db, pathUsers, currentUser.uid), { name: name });
        userProfile.name = name;
        const dispNameEl = document.getElementById('prof-display-name');
        const avatarEl = document.getElementById('prof-avatar-initial');
        if (dispNameEl) dispNameEl.innerText = name;
        if (avatarEl) avatarEl.innerText = name.charAt(0).toUpperCase();
        window.customAlert('Tersimpan', 'Profil kamu berhasil diperbarui.', 'success');
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
// RENDER UI, BERITA MAGAZINE, & KATALOG (APP, GAME, TOOLS)
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
    const favicon = document.getElementById('favicon');
    
    if(siteSettings.logoImgBase64) {
        if(imgEl){ imgEl.src = siteSettings.logoImgBase64; imgEl.style.display = 'block'; }
        if(fImgEl){ fImgEl.src = siteSettings.logoImgBase64; fImgEl.style.display = 'block'; }
        if(favicon) favicon.href = siteSettings.logoImgBase64;
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

// TAMPILAN BARU BERITA & KOMUNITAS (MAGAZINE CARDS + MODAL DETAIL)
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
            <article class="news-article-card">
                <div>
                    ${coverHtml}
                    <div class="news-card-body">
                        <div>
                            <span class="brutal-tag tag-primary"><i class="fa-solid fa-bullhorn"></i> INFO VIPERCELL</span>
                            <h3 class="news-card-title">${escapeHtml(news.title)}</h3>
                            <p class="news-card-excerpt">${escapeHtml(news.desc)}</p>
                        </div>
                        <button class="btn btn-outline btn-sm" style="width:100%;" onclick="window.openReadNewsModal(${idx})">
                            <i class="fa-solid fa-book-open"></i> Baca Selengkapnya
                        </button>
                    </div>
                </div>
            </article>`;
    });
    grid.innerHTML = html;
};

window.openReadNewsModal = function(idx) {
    const list = (siteSettings.newsList || []).filter(t => !t.isHidden);
    const news = list[idx];
    if (!news) return;

    document.getElementById('read-news-title').innerText = news.title || 'Informasi Vipercell';
    document.getElementById('read-news-body').innerText = news.desc || '';
    const imgEl = document.getElementById('read-news-img');
    if (news.imageUrl) {
        imgEl.src = news.imageUrl;
        imgEl.style.display = 'block';
    } else {
        imgEl.style.display = 'none';
    }
    window.openModal('modal-read-news');
};

// FILTER & LIVE SEARCH KATALOG
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
    
    let filteredBrands = filter === 'all' ? groupedBrands : groupedBrands.filter(b => b.type === filter);

    if (currentSearchQuery) {
        filteredBrands = filteredBrands.filter(b =>
            b.brandName.toLowerCase().includes(currentSearchQuery) ||
            (b.desc && b.desc.toLowerCase().includes(currentSearchQuery)) ||
            b.items.some(i => i.name.toLowerCase().includes(currentSearchQuery))
        );
    }
    
    if(filteredBrands.length === 0) { 
        grid.innerHTML = `<div class="brutal-empty-box" style="grid-column: 1/-1;"><i class="fa-solid fa-box-open" style="font-size:2rem; display:block; margin-bottom:8px;"></i>Produk yang kamu cari belum tersedia di kategori ini.</div>`; 
        return; 
    }
    
    let html = '';
    filteredBrands.forEach(b => {
        const soldCount = orders.filter(o => o.status === 'SUCCESS' && o.items && o.items[0]?.brandName === b.brandName)
                                .reduce((sum, o) => sum + (o.items[0].qty || 1), 0);

        const safeJsBrand = escapeJsStr(b.brandName);
        const safeHtmlBrand = escapeHtml(b.brandName);
        
        let tagClass = 'tag-app';
        let tagLabel = 'APLIKASI';
        if (b.isGangguan) {
            tagClass = 'tag-maint';
            tagLabel = 'GANGGUAN';
        } else if (b.type === 'game') {
            tagClass = 'tag-game';
            tagLabel = 'TOP UP GAME';
        } else if (b.type === 'tools') {
            tagClass = 'tag-tools';
            tagLabel = 'TOOLS';
        }

        // Hitung harga termurah dari varian yang ada
        const prices = b.items.map(i => i.priceNum || 0).filter(p => p > 0);
        const minPrice = prices.length > 0 ? Math.min(...prices) : 0;

        const imgHtml = b.imgUrlBase64 
             ? `<img src="${b.imgUrlBase64}" alt="${safeHtmlBrand}" loading="lazy">` 
             : `<div style="width:100%; height:100%; background:var(--primary); display:flex; align-items:center; justify-content:center; font-size:2rem; font-weight:900; color:#ffffff;">${safeHtmlBrand.charAt(0)}</div>`;
             
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
                        <div class="brand-start-price">Mulai <b>Rp${minPrice.toLocaleString('id-ID')}</b></div>
                    </div>
                </div>
                <div class="brand-meta-footer">
                    <span class="sold-pill"><i class="fa-solid fa-fire"></i> ${soldCount} Terjual</span>
                    <span class="buy-arrow-pill">Beli <i class="fa-solid fa-arrow-right"></i></span>
                </div>
            </div>`;
    });
    grid.innerHTML = html;
    setTimeout(observeReveals, 60);
};

// ==========================================
// PUSAT PEMBELIAN (CHECKOUT SPLIT-VIEW + DUKUNGAN TOOLS)
// ==========================================
window.selectPaymentUI = function(val, el) {
    document.querySelectorAll('input[name="payment_method"]').forEach(input => { input.parentElement.classList.remove('active'); });
    el.classList.add('active'); el.querySelector('input').checked = true;
    
    const cashWarn = document.getElementById('cash-warning-msg');
    if (cashWarn) cashWarn.style.display = val === 'cash' ? 'flex' : 'none';
    
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
    window.switchBuyModalTab('form');
    
    document.getElementById('buy-detail-fields').style.maxHeight = '150px';
    document.getElementById('buy-desc-fade').style.display = 'block';
    document.getElementById('btn-desc-more').style.display = 'block';
    document.getElementById('buy-item-grid').style.maxHeight = '360px';

    document.getElementById('buy-brand-name').innerText = brandObj.brandName;
    let badgeTypeLabel = 'APLIKASI PREMIUM';
    if (brandObj.type === 'game') badgeTypeLabel = 'TOP UP GAME';
    else if (brandObj.type === 'tools') badgeTypeLabel = 'TOOLS & PRODUKTIVITAS';
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
        const isSold = item.soldOut;
        const procBadge = item.processType === 'manual'
            ? '<small style="font-size:0.62rem; font-weight:800; color:var(--warning);">MANUAL</small>'
            : '<small style="font-size:0.62rem; font-weight:800; color:var(--success);">OTOMATIS</small>';
        
        html += `
            <div class="item-card ${isSold ? 'sold-out' : ''}" id="buy-card-${item.dbId}" onclick="${isSold ? '' : `window.selectItemToBuy('${item.dbId}')`}">
                <h4>${escapeHtml(item.name)}</h4>
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
    let extraDesc = fmtDesc ? `<div style="font-size:0.85rem; font-weight:600; color:var(--text); background:var(--bg); padding:12px; border-radius:10px; border:1.5px solid var(--border); margin-bottom:14px;"><i class="fa-solid fa-circle-info text-primary" style="margin-right:6px;"></i> ${fmtDesc}</div>` : '';
    
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
                <i class="fa-solid fa-bolt text-primary" style="font-size:1.25rem;"></i>
                <span>Detail <b>Akun / Lisensi Tools / Akses Premium</b> akan langsung ditampilkan otomatis di menu <b>Pesanan</b> segera setelah pembayaran lunas!</span>
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
// PROSES CHECKOUT + PROTEKSI ANTI-DOBEL PESANAN
// ==========================================
window.processDirectCheckout = async function() {
    if (isProcessingCheckout || !selectedProductForBuy) return;
    
    let emailInput = document.getElementById('buy-email').value.trim();
    if(!emailInput || !emailInput.includes('@')) { 
        window.customAlert('Email Diperlukan', 'Harap masukkan alamat Email aktif untuk bukti tagihan & pelacakan!', 'warning'); 
        return; 
    }
    
    const qty = parseInt(document.getElementById('buy-qty').value) || 1;
    
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

    // Cegah duplikasi pesanan aktif dalam 4 menit terakhir
    const now = Date.now();
    const existingActiveOrder = orders.find(o => {
        const isSameUser = (currentUser && !userProfile.isGuest && o.userId === currentUser.uid) ||
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
    btnProc.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Membuat Tagihan...</span>';
    btnProc.disabled = true;

    if(userProfile.isGuest) {
        localStorage.setItem('vipercell_track_email', emailInput);
    }
    
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
    if(paymentMethod === 'qris' && baseTotal > 0) uniqueCode = Math.floor(Math.random() * 300) + 1;
    let finalTotal = baseTotal + uniqueCode;
    
    let invId = 'VP-' + Math.floor(100000 + Math.random() * 900000);
    while (orders.some(o => o.id === invId)) {
        invId = 'VP-' + Math.floor(100000 + Math.random() * 900000);
    }

    const singleItem = { 
        cartId: Date.now().toString(), productDbId: selectedProductForBuy.dbId,
        brandName: currentCheckoutBrand.brandName, exactItemName: selectedProductForBuy.name,
        name: `${currentCheckoutBrand.brandName} - ${selectedProductForBuy.name} (x${qty})`, 
        priceNum: selectedProductForBuy.priceNum, qty: qty, type: currentCheckoutBrand.type, 
        processType: selectedProductForBuy.processType || 'auto', playerInfo: playerInfo 
    };

    const newOrder = {
        id: invId, 
        userEmail: emailInput,
        userId: currentUser && !userProfile.isGuest ? currentUser.uid : null, 
        items: [singleItem], finalTotal: finalTotal, baseTotal: baseTotal,
        uniqueCode: uniqueCode, promoCode: promoUsedCode, promoDiscount: discountPromo,
        status: paymentMethod === 'cash' ? 'PENDING' : 'UNPAID',
        paymentMethod: paymentMethod, adminReply: '', date: new Date().toISOString()
    };

    try {
        const docRef = await addDoc(collection(db, pathOrders), newOrder);
        currentCheckoutSession = { dbId: docRef.id, id: invId, finalTotal: finalTotal, method: paymentMethod, date: newOrder.date };
        
        if(appliedPromo) {
            await updateDoc(doc(db, pathPromos, appliedPromo.dbId), { usedCount: increment(1) }).catch(e=>console.log(e));
        }
        
        if(paymentMethod === 'qris') {
            setTimeout(() => window.openQRISModal(), 250);
        } else {
            window.finishCashOrder();
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

window.finishCashOrder = function() {
    const invToTrack = currentCheckoutSession.id;
    const successMsg = `ID Pesanan Anda: <strong style="color:var(--primary)">${invToTrack}</strong><br><br>Metode Tunai mengharuskan pembayaran langsung. Klik tombol di bawah untuk konfirmasi ke Admin via Live Chat.`;
    
    const extraBtn = `
        <button class="btn btn-primary" style="width:100%; margin-top:12px;" onclick="window.sendPredefinedChat('Halo Admin, saya melakukan pesanan metode CASH/Tunai dengan Invoice ${invToTrack}. Mohon dicek.')">
            <i class="fa-solid fa-headset"></i> Lapor ke Admin Sekarang
        </button>`;
        
    window.customAlert('Menunggu Pembayaran Tunai', successMsg, 'info', extraBtn);
    currentCheckoutSession = null;
    
    setTimeout(() => {
        window.switchMainTab('pesanan');
        document.getElementById('track-id').value = invToTrack;
        window.trackOrder();
    }, 400);
};

window.sendPredefinedChat = function(message) {
    window.closeAlert();
    window.switchMainTab('bantuan');
    if (userProfile.name) {
        document.getElementById('user-chat-input').value = message;
        window.sendUserChat();
    } else {
        document.getElementById('chat-anon-name').focus();
        window.pendingMsgToAdmin = message;
    }
};

// ==========================================
// TIMER & QRIS DINAMIS
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
    const qrContainer = document.getElementById('qrcode-container');
    const qrErrorMsg = document.getElementById('qris-error-msg');
    const invIdEl = document.getElementById('pay-modal-invoice-id');
    qrContainer.innerHTML = '';
    
    if(invIdEl && currentCheckoutSession) {
        invIdEl.innerText = currentCheckoutSession.id;
    }
    
    const qrisBaseString = siteSettings.qrisStringData || "00020101021126670016COM.NOBUBANK.WWW011893600503000000000051440014ID.CO.QRIS.WWW0215ID10200210007070303UMI5204581253033605802ID5919VIPERCELL INDONESIA6005AMBON61059711662070703A016304"; 
    
    if(qrisBaseString && currentCheckoutSession && currentCheckoutSession.finalTotal > 0) {
        const dynamicQRIS = generateDynamicQRIS(qrisBaseString, currentCheckoutSession.finalTotal);
        new QRCode(qrContainer, {
            text: dynamicQRIS,
            width: 225,
            height: 225,
            colorDark : "#0f172a",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.M
        });
        qrContainer.style.display = 'inline-block';
        qrErrorMsg.style.display = 'none';
    } else {
        qrContainer.style.display = 'none';
        qrErrorMsg.style.display = 'flex';
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
        window.showToast('Nominal Disalin', `Angka ${nominal} berhasil disalin.`, 'success');
    });
};

window.resumePayment = function(dbId) {
    const order = orders.find(o => o.dbId === dbId);
    if(!order) return;
    currentCheckoutSession = { dbId: order.dbId, id: order.id, finalTotal: order.finalTotal, method: order.paymentMethod, date: order.date };
    if(order.paymentMethod === 'cash') window.finishCashOrder();
    else window.openQRISModal();
};

window.goToPesananFromPay = function() {
    window.closeModal('modal-payment');
    const orderIdToTrack = currentCheckoutSession ? currentCheckoutSession.id : '';
    currentCheckoutSession = null;
    
    window.switchMainTab('pesanan');
    if (orderIdToTrack) {
        document.getElementById('track-id').value = orderIdToTrack;
        window.trackOrder(); 
    }
};

// ==========================================
// FITUR BANTUAN & LACAK PESANAN
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

window.refreshOrderData = function() {
    if(currentUser && !userProfile.isGuest) window.renderUserOrders();
    const trackResult = document.getElementById('track-result');
    if(trackResult && trackResult.style.display === 'block') window.trackOrder();
    window.showToast('Diperbarui', 'Status transaksi telah disegarkan.', 'info');
};

window.forceRefreshOrder = function(invId) {
    document.getElementById('track-id').value = invId;
    window.trackOrder();
    window.showToast('Diperbarui', `Data Invoice ${invId} disegarkan.`, 'info');
};

function buildOrderCardHTML(order) {
    const sBadge = order.status === 'UNPAID' ? 'status-unpaid' : order.status === 'PENDING' ? 'status-pending' : (order.status === 'FAILED' || order.status === 'EXPIRED') ? 'status-failed' : 'status-success';
    const sName = order.status === 'UNPAID' ? 'BELUM DIBAYAR' : order.status === 'PENDING' ? 'MENUNGGU PROSES' : order.status === 'FAILED' ? 'GAGAL / BATAL' : order.status === 'EXPIRED' ? 'WAKTU HABIS' : 'TRANSAKSI SUKSES';
    
    const brandName = order.items[0]?.brandName || '';
    const safeJsBrand = escapeJsStr(brandName);

    let actionHtml = '';
    if (order.status === 'UNPAID') {
        actionHtml = `<button class="btn btn-primary" style="width:100%; margin-top:1rem;" onclick="window.resumePayment('${order.dbId}')"><i class="fa-solid fa-qrcode"></i> Lanjutkan Pembayaran</button>`;
    } else if (order.status === 'SUCCESS') {
        const alreadyReviewed = hasOrderBeenReviewed(order);
        if (!alreadyReviewed && brandName) {
            actionHtml = `<button class="btn btn-warning" style="width:100%; margin-top:1rem;" onclick="window.goToReview('${safeJsBrand}', '${order.id}')"><i class="fa-solid fa-star"></i> Beri Ulasan Transaksi Ini</button>`;
        } else if (alreadyReviewed) {
            actionHtml = `<div style="margin-top:1rem; text-align:center; font-size:0.8rem; font-weight:800; color:var(--success); padding:8px; border:1.5px dashed var(--success); border-radius:8px;"><i class="fa-solid fa-circle-check"></i> Transaksi ini sudah diulas</div>`;
        }
    }
    
    let replyHtml = '';
    if (order.status === 'SUCCESS') {
        if (order.adminReply) {
            replyHtml = `
            <div style="background: var(--bg); border: var(--brutal-border); border-radius: 12px; padding: 14px; margin-top: 14px;">
                <div style="font-weight: 800; color: var(--success); font-size: 0.88rem; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-box-open"></i> DATA PESANAN / AKUN TERKIRIM:
                </div>
                <div style="font-family: monospace; font-size: 0.88rem; font-weight: 700; color: var(--text); background: var(--surface); padding: 12px; border-radius: 8px; border: 1.5px solid var(--border); white-space: pre-wrap; word-break: break-all;">${escapeHtml(order.adminReply)}</div>
            </div>`;
        } else if (order.items[0]?.processType === 'manual') {
            replyHtml = `
            <div class="brutal-alert-box alert-warning" style="margin-top: 14px;">
                <i class="fa-solid fa-user-clock"></i>
                <span>Pembayaran terverifikasi! Pesanan manual sedang disiapkan oleh Admin.</span>
            </div>`;
        } else {
            replyHtml = `
            <div class="brutal-alert-box alert-warning" style="margin-top: 14px;">
                <i class="fa-solid fa-clock"></i>
                <span>Pembayaran lunas! Sistem sedang menyiapkan stok otomatis untukmu.</span>
            </div>`;
        }
    }
    
    const helpHtml = generateHelpButtons(order.id, order.status, order.items[0]);

    return `
    <div class="receipt-card" style="width: 100%; position:relative;">
        <div class="receipt-header">
            <div>
                <div style="color:var(--text-muted); font-size: 0.7rem; font-weight: 800;">NOMOR INVOICE</div>
                <div style="color:var(--primary); font-weight: 900; font-size: 1.1rem;">${escapeHtml(order.id)}</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span class="status-badge ${sBadge}">${sName}</span>
                <button class="btn-icon-only" style="width:34px; height:34px; font-size:0.85rem;" onclick="window.forceRefreshOrder('${order.id}')" title="Segarkan"><i class="fa-solid fa-rotate-right"></i></button>
            </div>
        </div>
        <div class="receipt-body">
            <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); margin-bottom: 12px;">
                <i class="fa-regular fa-calendar-check"></i> ${new Date(order.date).toLocaleString('id-ID')}
            </div>
            <div style="border-left: 4px solid var(--primary); padding-left: 12px; margin-bottom: 10px;">
                ${order.items.map(i => `<div style="font-weight: 800; font-size: 0.98rem; color: var(--text);">${escapeHtml(i.name)}</div>`).join('')}
                <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-top:4px;">${escapeHtml(order.items[0]?.playerInfo || '')}</div>
            </div>
            ${replyHtml}
        </div>
        <div class="receipt-footer">
            <div class="receipt-row">
                <span style="color:var(--text-muted);">Subtotal Produk</span>
                <span>Rp${(order.baseTotal + (order.promoDiscount || 0)).toLocaleString('id-ID')}</span>
            </div>
            ${order.promoDiscount > 0 ? `
            <div class="receipt-row">
                <span style="color:var(--success);">Diskon Promo (${escapeHtml(order.promoCode)})</span>
                <span style="color:var(--success);">-Rp${order.promoDiscount.toLocaleString('id-ID')}</span>
            </div>` : ''}
            <div class="receipt-row">
                <span style="color:var(--warning);">Kode Unik QRIS</span>
                <span style="color:var(--warning);">+Rp${order.uniqueCode || 0}</span>
            </div>
            <div class="receipt-row" style="margin-top: 8px; padding-top: 8px; border-top: 1.5px solid var(--border);">
                <strong style="font-size: 1rem; font-weight: 900; color: var(--text);">TOTAL PEMBAYARAN</strong>
                <strong style="font-size: 1.2rem; font-weight: 900; color: var(--primary);">Rp${order.finalTotal.toLocaleString('id-ID')}</strong>
            </div>
            ${actionHtml}
            ${helpHtml}
        </div>
    </div>`;
}

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
    resBox.innerHTML = buildOrderCardHTML(order);
};

window.renderUserOrders = function() {
    const grid = document.getElementById('user-order-grid');
    if(!grid) return;
    
    if(!currentUser || userProfile.isGuest) { grid.innerHTML = ''; return; }
    
    const userOrders = orders.filter(o => o.userId === currentUser.uid || (userProfile.email && o.userEmail?.toLowerCase() === userProfile.email.toLowerCase()));
    
    if(userOrders.length === 0) {
        grid.innerHTML = '<div class="brutal-empty-box">Kamu belum memiliki riwayat transaksi. Yuk mulai belanja di Katalog!</div>';
        return;
    }
    
    let html = '';
    userOrders.slice(0, 50).forEach((o) => {
        html += buildOrderCardHTML(o);
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
        const matchUid = currentUser && !userProfile.isGuest && o.userId === currentUser.uid;
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

        const invBadge = r.orderId ? `<span class="brutal-tag tag-success" style="font-size:0.62rem; padding:2px 6px;">#${escapeHtml(r.orderId)}</span>` : '';
        
        const adminReplyHtml = r.adminReply ? `
            <div style="margin-top: 10px; padding: 10px 12px; background: var(--surface); border-left: 4px solid var(--primary); border-radius: 8px; border: 1.5px solid var(--border);">
                <div style="font-size: 0.75rem; font-weight: 800; color: var(--primary); margin-bottom: 3px;">
                    <i class="fa-solid fa-reply"></i> BALASAN ADMIN VIPERCELL:
                </div>
                <p style="font-size: 0.85rem; font-weight: 600; color: var(--text); margin: 0;">${escapeHtml(r.adminReply)}</p>
            </div>
        ` : '';

        html += `
        <div style="background:var(--bg); border:var(--brutal-border); padding:15px; border-radius:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:6px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <strong style="color:var(--text); font-size:0.92rem; font-weight:800;">${escapeHtml(r.userName || 'Pelanggan Vipercell')}</strong>
                    ${invBadge}
                </div>
                <span style="font-size:0.72rem; font-weight:700; color:var(--text-muted);">${new Date(r.timestamp).toLocaleDateString('id-ID')}</span>
            </div>
            <div style="margin-bottom:8px; display:flex; gap:3px;">${starsHtml}</div>
            <p style="font-size:0.88rem; font-weight:600; color:var(--text); margin:0;">"${escapeHtml(r.text)}"</p>
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