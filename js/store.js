import { 
    db, auth,
    signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword,
    sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, onAuthStateChanged,
    signOut, setPersistence, browserLocalPersistence,
    doc, setDoc, getDoc, updateDoc, deleteDoc, onSnapshot, collection, addDoc, increment, arrayUnion, query, where, getDocs 
} from './firebase.js';

import { sendEmailVerification } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// ==========================================
// KONFIGURASI DATABASE
// ==========================================
const appId = typeof __app_id !== 'undefined' ? __app_id : 'vipercell-prod';
const isWorkspace = typeof __app_id !== 'undefined';
const pathProducts = isWorkspace ? `artifacts/${appId}/public/data/products` : 'products';
const pathOrders = isWorkspace ? `artifacts/${appId}/public/data/orders` : 'orders';
const pathSettings = isWorkspace ? `artifacts/${appId}/public/data/settings` : 'settings';
const pathUsers = isWorkspace ? `artifacts/${appId}/public/data/users` : 'users';
const pathChats = isWorkspace ? `artifacts/${appId}/public/data/chats` : 'chats';
const pathReviews = isWorkspace ? `artifacts/${appId}/public/data/reviews` : 'reviews';

// ==========================================
// STATE & VARIABEL GLOBAL
// ==========================================
let products = [];
let groupedBrands = []; 
let orders = [];
let realReviews = [];
let brandViewsData = {};
let siteSettings = { 
    logoText: 'VIPER', logoAccent: 'CELL', logoImgBase64: '', marquee: 'Selamat Datang di Vipercell',
    qrisRawString: '', adminWa: '085656321860', igLink: '', ttLink: '',
    newsList: [], banners: [], isStoreOpen: true, waChannelLink: ''
};
let userProfile = { name: '', phone: '' };
let currentUser = null;
let currentCheckoutBrand = null;
let selectedProductForBuy = null;
let currentCheckoutSession = null; 
let userChatMessages = [];
let chatUnsubscribe = null;
let isSettingsLoaded = false; 
let previousOrdersData = {}; 
let qrisInterval = null;
let isRobloxValid = false;

// Paginasi & Filter State
let currentQty = 1;
let currentPayMethod = 'qris';
let currentVariantPage = 1;
const VARIANTS_PER_PAGE = 9;
let activeOrderFilter = 'all';

// ==========================================
// SISTEM PWA & CUSTOM INSTALL PROMPT
// ==========================================
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const pwaPrompt = document.getElementById('pwa-install-prompt');
    if(pwaPrompt) pwaPrompt.style.display = 'flex';
});

document.addEventListener('click', async (e) => {
    const pwaPrompt = document.getElementById('pwa-install-prompt');
    if (!pwaPrompt || pwaPrompt.style.display === 'none') return;
    
    if (e.target.closest('#btn-close-pwa')) {
        pwaPrompt.style.display = 'none';
        return;
    }
    
    if (e.target.closest('#pwa-install-prompt') && deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') pwaPrompt.style.display = 'none';
        deferredPrompt = null;
    }
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW Reg Failed:', err));
    });
}

// ==========================================
// SISTEM TEMA & UX DASAR
// ==========================================
window.toggleTheme = function() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('vipercell_theme', newTheme);
    
    const metaTheme = document.getElementById('meta-theme-color');
    if(metaTheme) metaTheme.setAttribute('content', newTheme === 'dark' ? '#101423' : '#ffffff');
    
    const icon = document.getElementById('theme-icon');
    if(icon) icon.className = newTheme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
};

window.showToast = function(title, msg, type = 'info', actionCallback = null) {
    const container = document.getElementById('toast-container');
    if(!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    let icon = '<i class="fa-solid fa-circle-info"></i>';
    if(type === 'success') icon = '<i class="fa-solid fa-circle-check" style="color:var(--brand-green);"></i>';
    if(type === 'error') icon = '<i class="fa-solid fa-circle-xmark" style="color:#ef4444;"></i>';
    
    toast.innerHTML = `<div class="toast-icon">${icon}</div><div class="toast-content"><h4 style="font-weight:900; color:var(--text);">${title}</h4><p style="color:var(--text-muted);">${msg}</p></div>`;
    toast.style.border = 'var(--border-thick)';
    toast.style.boxShadow = 'var(--shadow-brutal)';
    toast.style.background = 'var(--surface)';
    
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

window.openModal = (id) => {
    const el = document.getElementById(id);
    if(el) { el.classList.add('active'); document.body.classList.add('no-scroll'); }
};

window.closeModal = (id) => {
    const el = document.getElementById(id);
    if(el) { el.classList.remove('active'); document.body.classList.remove('no-scroll'); }
};

window.customAlert = (title, message, type = 'info') => {
    const titleEl = document.getElementById('ca-title');
    const descEl = document.getElementById('ca-desc');
    const iconEl = document.getElementById('ca-icon');
    
    if(titleEl) titleEl.innerText = title;
    if(descEl) descEl.innerHTML = message;
    if(iconEl) {
        iconEl.className = `msg-icon ${type}`;
        if(type === 'success') iconEl.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--brand-green);"></i>';
        else if(type === 'error') iconEl.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color:#ef4444;"></i>';
        else if(type === 'warning') iconEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--brand-yellow);"></i>';
        else iconEl.innerHTML = '<i class="fa-solid fa-circle-info" style="color:var(--brand-blue);"></i>';
    }
    window.openModal('custom-alert');
};

window.closeAlert = () => window.closeModal('custom-alert');

let promptCallback = null;
window.resolveConfirm = function(isConfirmed) {
    window.closeModal('modal-confirm');
    if(promptCallback) promptCallback(isConfirmed);
};

window.getCaptchaResponse = function(parentId) {
    if(typeof grecaptcha === 'undefined') return '';
    const parent = document.getElementById(parentId);
    if(!parent) return '';
    const textarea = parent.querySelector('.g-recaptcha-response');
    return textarea ? textarea.value.trim() : '';
};

const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => { if(entry.isIntersecting) entry.target.classList.add('reveal-visible'); });
}, { threshold: 0.1 });
function observeReveals() { document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el)); }

function typeWriterEffect() {
    const text = "Selamat Datang";
    const twEl = document.getElementById('tw-text');
    if(!twEl) return;
    let i = 0; let isDeleting = false;
    
    function type() {
        const currentText = text.substring(0, i);
        twEl.innerHTML = currentText;
        let typeSpeed = 120;
        if (isDeleting) { typeSpeed = 60; i--; } else { i++; }
        if (!isDeleting && i === text.length + 1) { isDeleting = true; typeSpeed = 2500; } 
        else if (isDeleting && i === 0) { isDeleting = false; typeSpeed = 800; }
        setTimeout(type, typeSpeed);
    }
    type();
}

// ==========================================
// INIT APP & FIREBASE AUTHENTICATION
// ==========================================
async function initApp() {
    try {
        const savedTheme = localStorage.getItem('vipercell_theme') || 'dark';
        const icon = document.getElementById('theme-icon');
        if(icon) icon.className = savedTheme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
        
        typeWriterEffect();
        await setPersistence(auth, browserLocalPersistence);
        
        onAuthStateChanged(auth, async (user) => {
            currentUser = user;
            if (user && !user.isAnonymous) {
                document.getElementById('btn-auth-user').style.display = 'none';
                
                const userDoc = await getDoc(doc(db, pathUsers, user.uid));
                if(userDoc.exists()) {
                    userProfile = { ...userProfile, ...userDoc.data() };
                    document.getElementById('prof-name').value = userProfile.name || '';
                }
                
                document.getElementById('prof-email').value = user.email || '';
                document.getElementById('dash-user-name-display').innerText = userProfile.name || user.email.split('@')[0];
                
                document.getElementById('nav-profil').style.display = 'inline-block';
                document.getElementById('nav-pesanan').style.display = 'inline-block';
                document.getElementById('nav-bot-pesanan').style.display = 'flex';
                
                window.renderUserOrders();
                updateProfileStats();
            } else {
                document.getElementById('btn-auth-user').style.display = 'inline-flex';
                document.getElementById('nav-profil').style.display = 'none';
                document.getElementById('nav-pesanan').style.display = 'none';
                document.getElementById('nav-bot-pesanan').style.display = 'none';
            }
            document.getElementById('user-chat-fab').style.display = 'flex';
            listenUserChat();
            listenData();
        });
        
    } catch (error) { console.error("Auth Init Error:", error); }
    observeReveals();
}

// ==========================================
// REAL-TIME DATA LISTENER
// ==========================================
let isListening = false;
function listenData() {
    if(isListening) return;
    isListening = true;
    
    // Config & Settings
    onSnapshot(doc(db, pathSettings, 'mainConfig'), (docSnap) => {
        if (docSnap.exists()) siteSettings = { ...siteSettings, ...docSnap.data() };
        isSettingsLoaded = true;
        window.applySettingsToUI();
    });

    // Real Views Data
    onSnapshot(doc(db, pathSettings, 'brandViews'), (docSnap) => {
        if (docSnap.exists()) brandViewsData = docSnap.data();
    });

    // Ulasan Data (Real Rating)
    onSnapshot(collection(db, pathReviews), (snapshot) => {
        realReviews = [];
        snapshot.forEach(d => realReviews.push(d.data()));
    });

    // Katalog Produk
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
                    brandName: brandName, type: p.type, imgUrlBase64: p.imgUrlBase64 || '',
                    desc: p.desc || '', isGangguan: p.isGangguan || false, items: [p]
                });
            }
        });
        
        let activeTabBtn = document.querySelector('.neo-filter-tab.active');
        let curFilter = activeTabBtn ? (activeTabBtn.innerText.includes('AI') ? 'app' : activeTabBtn.innerText.includes('GAMES') ? 'game' : 'all') : 'all';
        window.renderBrands(curFilter);
    });

    // Orders & Transactions
    onSnapshot(collection(db, pathOrders), (snapshot) => {
        let newOrders = [];
        const now = Date.now();
        let globalSalesCount = 0;
        
        snapshot.forEach((docSnap) => {
            let data = { dbId: docSnap.id, ...docSnap.data() };
            const orderTime = new Date(data.date).getTime();
            
            if(data.status === 'UNPAID') {
                if(now - orderTime > 240000) { 
                    updateDoc(doc(db, pathOrders, data.dbId), { status: 'EXPIRED' });
                    data.status = 'EXPIRED';
                }
            }
            if(data.status === 'SUCCESS') globalSalesCount += (data.qty || 1);
            
            newOrders.push(data);
            if (currentUser && data.userEmail === currentUser.email) {
                let oldStatus = previousOrdersData[data.id];
                if (oldStatus && oldStatus !== 'SUCCESS' && data.status === 'SUCCESS') {
                    window.showToast('Pesanan Selesai!', `Hore! Pesanan ${data.id} berhasil diproses.`, 'success', () => window.switchMainTab('pesanan'));
                }
            }
            previousOrdersData[data.id] = data.status;
        });
        
        orders = newOrders.sort((a,b) => new Date(b.date) - new Date(a.date));
        
        if(document.getElementById('home-stat-1')) document.getElementById('home-stat-1').innerText = globalSalesCount;
        if(document.getElementById('home-stat-2')) document.getElementById('home-stat-2').innerText = groupedBrands.length;
        
        updateOrderBadges();
        if(currentUser && !currentUser.isAnonymous) {
            window.renderUserOrders();
            updateProfileStats();
        }
    });
}

// Fungsi Bantu Hitung Statistik Asli
function getRealStats(brandName) {
    let sales = 0;
    orders.forEach(o => {
        if(o.status === 'SUCCESS' && o.items && o.items[0]?.brandName === brandName) {
            sales += (o.qty || 1);
        }
    });
    
    let views = brandViewsData[brandName] || 0;
    
    let rating = 5.0;
    const brandRevs = realReviews.filter(r => r.brandName === brandName);
    if(brandRevs.length > 0) {
        const sum = brandRevs.reduce((a, b) => a + b.rating, 0);
        rating = (sum / brandRevs.length).toFixed(1);
    }
    
    return { rating, views, sales };
}

async function incrementBrandView(brandName) {
    try {
        const docRef = doc(db, pathSettings, 'brandViews');
        const docSnap = await getDoc(docRef);
        if(!docSnap.exists()) {
            await setDoc(docRef, { [brandName]: 1 });
        } else {
            await updateDoc(docRef, { [brandName]: increment(1) });
        }
    } catch(e) { console.log('View count err:', e); }
}

function updateOrderBadges() {
    if (currentUser && !currentUser.isAnonymous) {
        const hasActionNeeded = orders.some(o => o.userEmail === currentUser.email && (o.status === 'UNPAID' || o.status === 'PENDING'));
        const badgeDesk = document.getElementById('user-order-badge-desktop');
        if(badgeDesk) badgeDesk.style.display = hasActionNeeded ? 'block' : 'none';
        const badgeMob = document.getElementById('user-order-badge-mobile');
        if(badgeMob) badgeMob.style.display = hasActionNeeded ? 'block' : 'none';
    }
}

// ==========================================
// FITUR LIVE CHAT (USER)
// ==========================================
window.toggleUserChat = function() {
    const chatWindow = document.getElementById('user-chat-window');
    chatWindow.classList.toggle('active');
    if(chatWindow.classList.contains('active')) {
        document.getElementById('user-chat-badge').style.display = 'none';
        checkChatUserState();
    }
};

function checkChatUserState() {
    const preForm = document.getElementById('chat-pre-form');
    const chatBody = document.getElementById('user-chat-body');
    const chatFooter = document.getElementById('user-chat-footer');
    
    let hasName = userProfile.name && userProfile.name.trim() !== '';
    if(!hasName && currentUser && !currentUser.isAnonymous) {
        hasName = true;
        userProfile.name = currentUser.email.split('@')[0];
    }
    
    if (hasName) {
        if(preForm) preForm.style.display = 'none';
        if(chatBody) chatBody.style.display = 'flex';
        if(chatFooter) chatFooter.style.display = 'flex';
        scrollToBottomUserChat();
    } else {
        if(preForm) preForm.style.display = 'flex';
        if(chatBody) chatBody.style.display = 'none';
        if(chatFooter) chatFooter.style.display = 'none';
    }
}

window.startAnonChat = async function() {
    const input = document.getElementById('chat-anon-name');
    const name = input ? input.value.trim() : '';
    if(!name) { window.customAlert('Nama Diperlukan', 'Silakan masukkan nama panggilan Anda.', 'warning'); return; }
    
    userProfile.name = name;
    if(!currentUser) await signInAnonymously(auth);
    checkChatUserState();
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
                if(lastMsg.sender === 'admin' && !document.getElementById('user-chat-window').classList.contains('active')) {
                    document.getElementById('user-chat-badge').style.display = 'block';
                    window.showToast('Pesan Baru', 'Admin membalas pesan Anda.', 'info', () => window.toggleUserChat());
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
        body.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-size:0.85rem; font-weight:800; margin-top:30px;"> Belum ada obrolan. Tuliskan pertanyaan Anda.</p>';
        return;
    }
    
    let html = '';
    userChatMessages.forEach(msg => {
        const isUser = msg.sender === 'user';
        const bg = isUser ? 'var(--brand-blue)' : 'var(--surface)';
        const color = isUser ? '#000' : 'var(--text)';
        html += `
            <div class="chat-msg ${isUser ? 'user' : 'admin'}" style="background: ${bg}; color: ${color}; border: var(--border-thick); border-radius: 8px; box-shadow: 2px 2px 0px #000;">
                ${msg.text}
                <span class="chat-time" style="color: ${isUser?'#000':'var(--text-muted)'}; font-weight:600;">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
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
    const text = input.value.trim();
    if(!text) return;
    
    input.value = '';
    const chatRef = doc(db, pathChats, currentUser.uid);
    const newMsg = { sender: 'user', text: text, timestamp: Date.now() };
    
    const docSnap = await getDoc(chatRef);
    const displayName = userProfile.name ? userProfile.name : (currentUser.isAnonymous ? 'Pelanggan Tamu' : currentUser.email);
    
    if(!docSnap.exists()) {
        await setDoc(chatRef, { uid: currentUser.uid, userInfo: displayName, updatedAt: Date.now(), messages: [newMsg] });
    } else {
        await updateDoc(chatRef, { userInfo: displayName, updatedAt: Date.now(), messages: arrayUnion(newMsg) });
    }
    scrollToBottomUserChat();
};

// ==========================================
// UI & TAB NAVIGATION
// ==========================================
window.togglePassword = function(inputId, iconEl) {
    const input = document.getElementById(inputId);
    if(input.type === 'password') {
        input.type = 'text';
        iconEl.classList.remove('fa-eye-slash'); iconEl.classList.add('fa-eye');
    } else {
        input.type = 'password';
        iconEl.classList.remove('fa-eye'); iconEl.classList.add('fa-eye-slash');
    }
};

window.openAuthModal = function() {
    window.switchAuthTab('login');
    window.switchMainTab('auth');
};

window.switchAuthTab = function(tab) {
    document.getElementById('form-login').style.display = tab==='login' ? 'block' : 'none';
    document.getElementById('form-register').style.display = tab==='register' ? 'block' : 'none';
    document.getElementById('form-reset').style.display = tab==='reset' ? 'block' : 'none';
    
    const btnL = document.getElementById('tab-login');
    const btnR = document.getElementById('tab-register');
    if(btnL) {
        btnL.className = tab==='login' ? 'active' : '';
        btnL.style.background = tab==='login' ? 'var(--brand-green)' : 'transparent';
        btnL.style.color = tab==='login' ? '#000' : 'var(--text)';
    }
    if(btnR) {
        btnR.className = tab==='register' ? 'active' : '';
        btnR.style.background = tab==='register' ? 'var(--brand-blue)' : 'transparent';
        btnR.style.color = tab==='register' ? '#000' : 'var(--text)';
    }
    
    const title = document.getElementById('auth-title');
    const subtitle = document.getElementById('auth-subtitle');
    if(tab==='reset') {
        title.innerHTML = 'Lupa Sandi'; subtitle.innerText = 'Tenang, mari kita pulihkan akunmu.';
    } else {
        title.innerHTML = tab==='login' ? 'Masuk Akun' : 'Daftar Baru';
        subtitle.innerText = tab==='login' ? 'Masuk untuk menyimpan riwayat pesanan.' : 'Buat akun sekarang.';
    }
};

window.showResetPassword = () => window.switchAuthTab('reset');

window.switchMainTab = function(tab) {
    document.querySelectorAll('.main-tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.desktop-nav-pill a').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.bottom-nav a').forEach(el => el.classList.remove('active'));
    
    let navEl = document.getElementById('nav-'+tab);
    if(navEl) navEl.classList.add('active');
    let botNavEl = document.getElementById('nav-bot-'+tab);
    if(botNavEl) botNavEl.classList.add('active');
    
    let tabEl = document.getElementById('tab-'+tab);
    if(tabEl) {
        tabEl.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'instant' }); 
    }
    
    if(tab !== 'payment') clearInterval(qrisInterval);
    setTimeout(observeReveals, 50);
};

// ==========================================
// AUTHENTICATION PROCESS
// ==========================================
window.processLogin = async function() {
    const em = document.getElementById('auth-l-email').value.trim();
    const pw = document.getElementById('auth-l-pass').value.trim();
    if(!em || !pw) { window.customAlert('Error', 'Email dan Password wajib diisi!', 'error'); return; }
    
    const btn = document.getElementById('btn-do-login');
    const ogHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses...'; btn.disabled = true;
    try {
        await signInWithEmailAndPassword(auth, em, pw);
        window.switchMainTab('beranda');
        window.customAlert('Sukses', 'Berhasil masuk.', 'success');
    } catch(e) { window.customAlert('Gagal', 'Email atau password salah.', 'error'); } 
    finally { btn.innerHTML = ogHtml; btn.disabled = false; }
};

window.processRegister = async function() {
    const name = document.getElementById('auth-r-name').value.trim();
    const em = document.getElementById('auth-r-email').value.trim();
    const pw = document.getElementById('auth-r-pass').value.trim();
    
    if(!name || !em || pw.length < 6) { 
        window.customAlert('Peringatan', 'Harap lengkapi form dan Password minimal 6 karakter.', 'warning'); return; 
    }
    
    const btn = document.getElementById('btn-do-register');
    const ogHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses...'; btn.disabled = true;
    try {
        const cred = await createUserWithEmailAndPassword(auth, em, pw);
        await setDoc(doc(db, pathUsers, cred.user.uid), { email: em, name: name, phone: '', role: 'user', createdAt: new Date().toISOString() });
        window.switchMainTab('profil');
        window.customAlert('Sukses', 'Akun berhasil didaftarkan.', 'success');
    } catch(e) { window.customAlert('Gagal', 'Email mungkin sudah terdaftar.', 'error'); } 
    finally { btn.innerHTML = ogHtml; btn.disabled = false; }
};

window.processReset = async function() {
    const em = document.getElementById('auth-res-email').value.trim();
    if(!em) { window.customAlert('Error', 'Masukkan email terdaftar.', 'error'); return; }
    
    const captchaRes = window.getCaptchaResponse('form-reset');
    if(!captchaRes) { window.customAlert('Peringatan', 'Harap centang reCAPTCHA terlebih dahulu.', 'warning'); return; }

    try {
        await sendPasswordResetEmail(auth, em);
        window.customAlert('Terkirim', 'Tautan reset telah dikirim ke email kamu.', 'success');
        window.switchAuthTab('login');
    } catch(e) { window.customAlert('Error', 'Gagal mengirim tautan reset.', 'error'); }
};

window.sendProfileResetPassword = async function() {
    if(!currentUser || currentUser.isAnonymous) return;
    
    const captchaRes = window.getCaptchaResponse('tab-profil');
    if(!captchaRes) { window.customAlert('Peringatan', 'Harap centang reCAPTCHA terlebih dahulu untuk verifikasi keamanan.', 'warning'); return; }

    try {
        await sendPasswordResetEmail(auth, currentUser.email);
        window.customAlert('Terkirim', 'Cek kotak masuk email kamu untuk membuat sandi baru.', 'success');
        if(typeof grecaptcha !== 'undefined') grecaptcha.reset();
    } catch (e) { window.customAlert('Gagal', 'Terjadi kesalahan sistem.', 'error'); }
};

window.sendVerificationEmail = async function() {
    if(!currentUser || currentUser.isAnonymous) return;

    const captchaRes = window.getCaptchaResponse('tab-profil');
    if(!captchaRes) { window.customAlert('Peringatan', 'Harap centang reCAPTCHA terlebih dahulu untuk verifikasi keamanan.', 'warning'); return; }

    try {
        const btn = document.getElementById('btn-verify-email');
        btn.innerText = 'Mengirim...'; btn.disabled = true;
        await sendEmailVerification(currentUser);
        window.customAlert('Terkirim', 'Link verifikasi telah dikirim ke email Anda. Silakan periksa Inbox/Spam.', 'success');
        btn.innerText = 'Kirim Verifikasi Email'; btn.disabled = false;
        if(typeof grecaptcha !== 'undefined') grecaptcha.reset();
    } catch (e) { window.customAlert('Gagal', 'Terjadi kesalahan / Tunggu beberapa saat sebelum kirim ulang.', 'error'); }
};

window.logoutUser = async function() {
    await signOut(auth);
    window.switchMainTab('beranda');
    window.customAlert('Logout', 'Anda telah keluar dari akun.', 'info');
};

window.saveUserProfile = async function() {
    if(!currentUser || currentUser.isAnonymous) return;
    const name = document.getElementById('prof-name').value.trim();
    try {
        await setDoc(doc(db, pathUsers, currentUser.uid), { name }, { merge: true });
        userProfile.name = name;
        document.getElementById('dash-user-name-display').innerText = name;
        window.customAlert('Tersimpan', 'Profil berhasil diperbarui.', 'success');
    } catch(e) { window.customAlert('Error', 'Gagal menyimpan profil.', 'error'); }
};

function updateProfileStats() {
    if(!currentUser || currentUser.isAnonymous) return;
    
    const myOrders = orders.filter(o => o.userEmail === currentUser.email);
    const successOrders = myOrders.filter(o => o.status === 'SUCCESS');
    const expiredOrders = myOrders.filter(o => o.status === 'EXPIRED' || o.status === 'FAILED');
    
    let spent = 0;
    successOrders.forEach(o => spent += o.finalTotal);
    
    // Profil Tab Stats
    if(document.getElementById('prof-stat-success')) document.getElementById('prof-stat-success').innerText = successOrders.length;
    if(document.getElementById('prof-stat-expired')) document.getElementById('prof-stat-expired').innerText = expiredOrders.length;
    if(document.getElementById('prof-stat-spent')) document.getElementById('prof-stat-spent').innerText = `Rp ${spent.toLocaleString('id-ID')}`;
    
    // Pesanan Tab Stats
    const unpaidCount = myOrders.filter(o => o.status === 'UNPAID' || o.status === 'PENDING').length;
    if(document.getElementById('stat-order-unpaid')) document.getElementById('stat-order-unpaid').innerText = unpaidCount;
    if(document.getElementById('stat-order-failed')) document.getElementById('stat-order-failed').innerText = expiredOrders.length;
    if(document.getElementById('stat-order-success')) document.getElementById('stat-order-success').innerText = successOrders.length;

    // Warnings Toggle
    const warnEmail = document.getElementById('warn-unverified-email');
    if(warnEmail) warnEmail.style.display = currentUser.emailVerified ? 'none' : 'flex';
    
    const warnPass = document.getElementById('warn-no-password');
    const warnOrderPass = document.getElementById('warn-order-pass');
    if(warnPass) {
        const hasPassword = currentUser.providerData.some(p => p.providerId === 'password');
        warnPass.style.display = hasPassword ? 'none' : 'flex';
        if(warnOrderPass) warnOrderPass.style.display = hasPassword ? 'none' : 'flex';
    }
}

// ==========================================
// RENDER UI & KATALOG
// ==========================================
window.applySettingsToUI = function() {
    const logoDasar = siteSettings.logoText || 'VIPER';
    const logoAksen = siteSettings.logoAccent || 'CELL';
    
    const slt = document.getElementById('site-logo-text');
    if(slt) slt.innerHTML = `${logoDasar}<span style="color:var(--brand-pink);">${logoAksen}</span>`;
    
    const imgEl = document.getElementById('site-logo-img');
    const favicon = document.getElementById('favicon');
    if(siteSettings.logoImgBase64) {
        if(imgEl){ imgEl.src = siteSettings.logoImgBase64; imgEl.style.display = 'block'; }
        if(favicon) favicon.href = siteSettings.logoImgBase64;
    } else {
        if(imgEl) imgEl.style.display = 'none'; 
    }
    
    const mText = siteSettings.marquee || 'Selamat Datang di Vipercell';
    const mt1 = document.getElementById('marquee-text-1');
    const mt2 = document.getElementById('marquee-text-2');
    if(mt1) mt1.innerText = mText; if(mt2) mt2.innerText = mText;
    
    let adminWaNum = siteSettings.adminWa || '085656321860';
    if (adminWaNum.startsWith('0')) adminWaNum = '62' + adminWaNum.substring(1);
    const waHref = `https://wa.me/${adminWaNum}?text=${encodeURIComponent('Halo Min')}`;
    
    const fWaLink = document.getElementById('footer-wa-link');
    if(fWaLink) fWaLink.href = waHref;
    
    const waChanBtn = document.getElementById('btn-wa-channel');
    if(waChanBtn) waChanBtn.href = siteSettings.waChannelLink || waHref;

    const fWaChan = document.getElementById('footer-wa-channel');
    if(fWaChan && siteSettings.waChannelLink) { fWaChan.href = siteSettings.waChannelLink; fWaChan.style.display = 'inline-flex'; }
    
    const storeBadge = document.getElementById('store-status-badge');
    const storeBanner = document.getElementById('store-closed-banner');
    if (siteSettings.isStoreOpen === false) {
        if (storeBadge) storeBadge.style.display = 'inline-block';
        if (storeBanner) storeBanner.style.display = 'block';
    } else {
        if (storeBadge) storeBadge.style.display = 'none';
        if (storeBanner) storeBanner.style.display = 'none';
    }
    
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
    
    let trackHtml = ''; let dotsHtml = '';
    banners.forEach((b64, idx) => {
        trackHtml += `<img src="${b64}" class="banner-slide" alt="Promo" loading="lazy">`;
        dotsHtml += `<div class="banner-dot ${idx===0?'active':''}" onclick="window.goToBanner(${idx})"></div>`;
    });
    track.innerHTML = trackHtml; dotsContainer.innerHTML = dotsHtml;
    window.startBannerAuto();
};

let currentBanner = 0;
let bannerInterval;
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

window.renderNews = function() {
    const grid = document.getElementById('public-news-list');
    if(!grid) return;
    const list = siteSettings.newsList || [];
    const visibleList = list.filter(t => !t.isHidden);
    
    if(visibleList.length === 0) {
        grid.innerHTML = '<div style="text-align:center; font-weight:800; color:var(--text-muted);">Belum ada informasi panduan terbaru.</div>';
        return;
    }
    
    let html = '';
    visibleList.forEach(news => {
        const imgHtml = news.imageUrl ? `<img src="${news.imageUrl}" style="width:100%; border-radius: 8px; margin-bottom: 15px; border: var(--border-thick);" loading="lazy">` : '';
        html += `
            <div style="background: var(--surface); border: var(--border-thick); border-radius: 16px; padding: 1.5rem; margin-bottom: 1rem; box-shadow: var(--shadow-brutal);">
                <h3 style="font-size: 1.2rem; color: var(--text); margin-bottom: 10px; font-weight:900;">${news.title}</h3>
                ${imgHtml}
                <p style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.6; margin: 0; font-weight:600;">${news.desc.replace(/\n/g, '<br>')}</p>
            </div>`;
    });
    grid.innerHTML = html;
};

// Fitur Pencarian Baru
window.searchProduct = function() {
    const query = document.getElementById('search-product').value.toLowerCase();
    let activeTabBtn = document.querySelector('.neo-filter-tab.active');
    let curFilter = activeTabBtn ? (activeTabBtn.innerText.includes('AI') ? 'app' : activeTabBtn.innerText.includes('GAMES') ? 'game' : 'all') : 'all';
    
    const filteredBrands = groupedBrands.filter(b => {
        const matchFilter = curFilter === 'all' || b.type === curFilter;
        const matchSearch = b.brandName.toLowerCase().includes(query) || (b.desc && b.desc.toLowerCase().includes(query));
        return matchFilter && matchSearch;
    });
    
    renderBrandsGrid(filteredBrands);
};

window.filterBrands = function(type, btnEl) {
    document.querySelectorAll('#tab-katalog .neo-filter-tab').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
    
    const query = document.getElementById('search-product').value.toLowerCase();
    const filteredBrands = groupedBrands.filter(b => {
        const matchFilter = type === 'all' || b.type === type;
        const matchSearch = b.brandName.toLowerCase().includes(query) || (b.desc && b.desc.toLowerCase().includes(query));
        return matchFilter && matchSearch;
    });
    
    renderBrandsGrid(filteredBrands);
};

window.renderBrands = function(filter) {
    const filteredBrands = filter === 'all' ? groupedBrands : groupedBrands.filter(b => b.type === filter);
    renderBrandsGrid(filteredBrands);
};

function renderBrandsGrid(filteredBrands) {
    const grid = document.getElementById('brand-grid');
    if(!grid) return;
    
    if(filteredBrands.length === 0) { 
        grid.innerHTML = `<div style="text-align:center; grid-column: 1/-1; font-weight:bold; color:var(--text-muted);">Katalog kosong atau tidak ditemukan.</div>`; 
        return; 
    }
    
    let html = '';
    filteredBrands.forEach(b => {
        const typeName = b.type === 'game' ? 'GAME' : 'APP';
        const imgHtml = b.imgUrlBase64 
            ? `<img src="${b.imgUrlBase64}" alt="${b.brandName}" loading="lazy" class="glow-effect">` 
            : `<div class="glow-effect" style="width:75px; height:75px; background:#fff; border: 2px solid #000; border-radius:16px; display:flex; align-items:center; justify-content:center; font-size:2rem; font-weight:900; color:#000;">${b.brandName.charAt(0)}</div>`;
        
        const clickAction = b.isGangguan ? `window.customAlert('Maintenance Server', 'Mohon maaf, produk ini sedang dalam gangguan jaringan.', 'warning')` : `window.openCheckoutTab('${b.brandName}')`;
        const opacity = b.isGangguan ? '0.5' : '1';
        
        const isAllSold = b.items.every(i => i.soldOut);
        const actionBtnStr = isAllSold 
            ? `<div style="background:var(--surface-hover); border-top:var(--border-thick); padding:12px; text-align:center; font-weight:900; color:var(--text-muted);">Stok Habis</div>` 
            : `<div style="background:var(--brand-yellow); border-top:var(--border-thick); padding:12px; text-align:center; font-weight:900; color:#000;">Beli Sekarang</div>`;
        
        const bgHead = b.type === 'game' ? 'var(--brand-green)' : 'var(--brand-blue)';
        const stats = getRealStats(b.brandName);
        
        html += `
            <div class="neo-card reveal" style="opacity: ${opacity};" onclick="${clickAction}">
                <div class="neo-card-img-box" style="background: ${bgHead};">
                    ${imgHtml}
                    ${b.isGangguan ? `<div style="position:absolute; top:10px; right:10px; background:#ef4444; color:#fff; font-size:0.6rem; font-weight:900; padding:4px 8px; border-radius:12px; border:2px solid #000;">GANGGUAN</div>` : ''}
                </div>
                <div style="padding: 1.2rem; flex-grow:1; display:flex; flex-direction:column; background:var(--surface);">
                    <div style="display:flex; gap:5px; margin-bottom:8px;">
                        <span style="border:2px solid var(--border); border-radius:12px; font-size:0.6rem; font-weight:900; padding:2px 8px; color:var(--text);">${typeName}</span>
                        ${b.brandName.includes('PRO') || b.brandName.includes('Plus') || b.brandName.toLowerCase().includes('mobile') ? `<span style="background:var(--brand-pink); border:2px solid #000; border-radius:12px; font-size:0.6rem; font-weight:900; padding:2px 8px; color:#000;">TERLARIS</span>` : ''}
                    </div>
                    <h3 style="font-size: 1.2rem; color: var(--text); margin: 0 0 5px 0; font-weight:900; letter-spacing: -0.5px;">${b.brandName}</h3>
                    <p class="line-clamp-2" style="font-size:0.8rem; color:var(--text-muted); font-weight:600; margin-bottom:10px; flex-grow:1;">${b.desc || 'Pilih produk dan bayar dengan cepat.'}</p>
                    
                    <div style="display:flex; gap:10px; font-size:0.75rem; font-weight:800; color:var(--text-muted); margin-bottom:12px;">
                        <span><i class="fa-solid fa-star" style="color:#f59e0b;"></i> ${stats.rating}</span>
                        <span><i class="fa-solid fa-eye" style="color:var(--brand-blue);"></i> ${stats.views}</span>
                        <span><i class="fa-solid fa-bag-shopping" style="color:var(--brand-green);"></i> ${stats.sales}</span>
                    </div>
                    
                    <div style="font-size:1.3rem; font-weight:900; color:var(--text);">
                        Rp ${b.items[0] ? b.items[0].priceNum.toLocaleString('id-ID') : '0'}
                    </div>
                </div>
                ${actionBtnStr}
            </div>`;
    });
    grid.innerHTML = html;
    setTimeout(observeReveals, 100);
}

// ==========================================
// ROBLOX AVATAR CHECKER 
// ==========================================
let typingTimer;
const doneTypingInterval = 600;

async function fetchFastest(url, roproxyUrl) {
    const proxies = [
        roproxyUrl, 
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, 
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    ];
    return await Promise.any(proxies.map(async (proxy) => {
        const res = await fetch(proxy);
        if (!res.ok) throw new Error('Proxy gagal');
        return await res.json();
    }));
}

async function getRobloxUserId(username) {
    const searchPath = `/v1/users/search?keyword=${username}&limit=10`;
    const targetUrl = `https://users.roblox.com${searchPath}`;
    const roproxyUrl = `https://users.roproxy.com${searchPath}`;
    const data = await fetchFastest(targetUrl, roproxyUrl);
    if (!data || !data.data || data.data.length === 0) throw new Error("Username tidak ditemukan");
    const user = data.data.find(u => u.name.toLowerCase() === username.toLowerCase() || u.displayName.toLowerCase() === username.toLowerCase());
    return user ? user.id : data.data[0].id;
}

async function getRobloxAvatar(userId) {
    const targetPath = `/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=true`;
    const targetUrl = `https://thumbnails.roblox.com${targetPath}`;
    const roproxyUrl = `https://thumbnails.roproxy.com${targetPath}`;
    const data = await fetchFastest(targetUrl, roproxyUrl);
    if (data && data.data && data.data.length > 0 && data.data[0].imageUrl) return data.data[0].imageUrl;
    throw new Error("Gagal memuat avatar");
}

function initRobloxChecker() {
    const usernameInput = document.getElementById('chk-game-id');
    const avatarImg = document.getElementById('roblox-avatar-img');
    const statusIcon = document.getElementById('roblox-status-icon');
    const loadingIcon = document.getElementById('roblox-loading-icon');
    
    if(!usernameInput || !avatarImg) return;

    usernameInput.addEventListener('input', () => {
        clearTimeout(typingTimer);
        isRobloxValid = false;
        statusIcon.style.display = 'none';
        
        if (usernameInput.value.trim().length > 0) {
            loadingIcon.style.display = 'inline-block';
            avatarImg.src = `https://ui-avatars.com/api/?name=?&background=f0d4dd&color=4a4a4a&rounded=true`;
            typingTimer = setTimeout(async () => {
                const username = usernameInput.value.trim();
                try {
                    const userId = await getRobloxUserId(username);
                    const avatarUrl = await getRobloxAvatar(userId);
                    avatarImg.src = avatarUrl;
                    statusIcon.style.display = 'inline-block';
                    isRobloxValid = true;
                } catch (error) {
                    statusIcon.style.display = 'none';
                    avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=f0d4dd&color=4a4a4a&rounded=true`;
                } finally {
                    loadingIcon.style.display = 'none';
                }
            }, doneTypingInterval);
        } else {
            loadingIcon.style.display = 'none';
            avatarImg.src = "https://ui-avatars.com/api/?name=?&background=f0d4dd&color=4a4a4a&rounded=true";
        }
    });
}

// ==========================================
// FITUR ULASAN & DESKRIPSI (CHECKOUT)
// ==========================================
window.toggleDesc = function() {
    const content = document.getElementById('chk-desc-content');
    const btn = document.getElementById('btn-read-more');
    if(!content || !btn) return;
    
    if(content.style.maxHeight === '65px' || content.style.maxHeight === '') {
        content.style.maxHeight = '1000px';
        btn.innerHTML = 'Tutup Deskripsi <i class="fa-solid fa-chevron-up"></i>';
    } else {
        content.style.maxHeight = '65px';
        btn.innerHTML = 'Lihat Selengkapnya <i class="fa-solid fa-chevron-down"></i>';
    }
};

window.renderReviewsList = function(brandName) {
    const revList = document.getElementById('review-list-container');
    const brandRevs = realReviews.filter(r => r.brandName === brandName).sort((a,b) => b.timestamp - a.timestamp);
    
    if(brandRevs.length === 0) {
        revList.innerHTML = '<div style="text-align:center; color:var(--text-muted); font-size:0.85rem; font-weight:800; padding:10px;">Belum ada ulasan pembeli.</div>';
        return;
    }
    
    let html = '';
    brandRevs.forEach(r => {
        let stars = ''; for(let i=0; i<r.rating; i++) stars += '<i class="fa-solid fa-star"></i>';
        html += `
        <div class="review-box">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                <strong style="font-size: 0.85rem; font-weight: 900; color:var(--text);"><i class="fa-solid fa-circle-check" style="color:var(--brand-green);"></i> ${r.userName.substring(0,3)}***</strong>
                <span class="star-rating" style="font-size: 0.7rem;">${stars}</span>
            </div>
            <div style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); margin-bottom: 8px;">${new Date(r.timestamp).toLocaleDateString('id-ID')}</div>
            <p style="margin: 0; font-size: 0.85rem; font-weight: 600; color:var(--text);">${r.text}</p>
        </div>`;
    });
    revList.innerHTML = html;
};

window.submitReview = async function() {
    const star = parseInt(document.getElementById('rev-input-star').value);
    const text = document.getElementById('rev-input-text').value.trim();
    if(!text) { window.customAlert('Peringatan', 'Tuliskan ulasan Anda terlebih dahulu.', 'warning'); return; }
    
    try {
        await addDoc(collection(db, pathReviews), {
            brandName: currentCheckoutBrand.brandName,
            userEmail: currentUser.email,
            userName: userProfile.name || currentUser.email.split('@')[0],
            rating: star, text: text, timestamp: Date.now()
        });
        window.customAlert('Berhasil', 'Ulasan Anda telah dikirim. Terima kasih!', 'success');
        document.getElementById('rev-input-text').value = '';
        
        // Sembunyikan form agar tidak mengulang submit
        document.getElementById('review-auth-form').style.display = 'none';
        document.getElementById('review-unauth-msg').style.display = 'block';
        document.getElementById('review-unauth-msg').innerHTML = `<p style="font-size: 0.8rem; color: var(--brand-green); font-weight: 900; margin: 0;">Terima kasih atas ulasannya!</p>`;
        
    } catch(e) {
        window.customAlert('Gagal', 'Terjadi kesalahan saat mengirim ulasan.', 'error');
    }
};

// ==========================================
// LOGIKA PEMBELIAN & CHECKOUT
// ==========================================
window.updateQty = function(change) {
    let newVal = currentQty + change;
    if(newVal >= 1 && newVal <= 5) {
        currentQty = newVal;
        document.getElementById('chk-qty').value = currentQty;
        window.updateCheckoutTotal();
    }
};

window.selectVariant = function(dbId) {
    selectedProductForBuy = currentCheckoutBrand.items.find(i => i.dbId === dbId);
    document.querySelectorAll('.variant-item-card').forEach(el => el.classList.remove('selected'));
    document.getElementById(`var-${dbId}`).classList.add('selected');
    window.updateCheckoutTotal();
};

window.selectQrisMethod = function() {
    currentPayMethod = 'qris';
    document.getElementById('btn-pay-qris').style.background = 'var(--brand-yellow)';
    document.getElementById('btn-pay-qris').style.color = '#000';
    document.getElementById('btn-pay-manual').style.background = 'var(--surface)';
    document.getElementById('btn-pay-manual').style.color = 'var(--text)';
};

window.cashWarningAmbon = function() { window.openModal('modal-cash-warning'); };

window.confirmCashMethod = function() {
    window.closeModal('modal-cash-warning');
    currentPayMethod = 'cash';
    document.getElementById('btn-pay-qris').style.background = 'var(--surface)';
    document.getElementById('btn-pay-qris').style.color = 'var(--text)';
    document.getElementById('btn-pay-manual').style.background = 'var(--brand-yellow)';
    document.getElementById('btn-pay-manual').style.color = '#000';
};

window.renderVariantList = function() {
    const variantList = document.getElementById('chk-variant-list');
    const btnLoadMore = document.getElementById('btn-load-more-variants');
    let varHtml = '';
    const isGame = currentCheckoutBrand.type === 'game';
    variantList.style.flexDirection = isGame ? 'column' : 'row';
    
    const sortedItems = [...currentCheckoutBrand.items].sort((a, b) => (a.priceNum||0) - (b.priceNum||0));
    const maxItems = isGame ? currentVariantPage * VARIANTS_PER_PAGE : sortedItems.length;
    const itemsToShow = sortedItems.slice(0, maxItems);
    
    itemsToShow.forEach(item => {
        const isSold = item.soldOut;
        const extraStyle = isGame ? 'width: 100%;' : 'flex: 1; min-width: 130px;';
        const activeClass = (selectedProductForBuy && selectedProductForBuy.dbId === item.dbId) ? 'selected' : '';
        
        varHtml += `
        <div class="variant-item-card ${isSold ? 'sold-out' : ''} ${activeClass}" style="${extraStyle}" id="var-${item.dbId}" onclick="${isSold ? '' : `window.selectVariant('${item.dbId}')`}">
            <div>
                <div style="font-weight: 900; font-size: 0.9rem;">${item.name}</div>
            </div>
            <div style="font-weight: 900; color: ${isSold ? 'var(--text-muted)' : 'var(--brand-pink)'}; font-size: 1rem;">
                Rp${item.priceNum.toLocaleString('id-ID')}
            </div>
        </div>`;
    });
    
    variantList.innerHTML = varHtml;
    
    if (isGame && sortedItems.length > maxItems) {
        btnLoadMore.style.display = 'block';
    } else {
        btnLoadMore.style.display = 'none';
    }
};

window.loadMoreVariants = function() {
    currentVariantPage++;
    window.renderVariantList();
};

window.openCheckoutTab = function(brandName) {
    const brandObj = groupedBrands.find(b => b.brandName === brandName);
    if(!brandObj) return;

    currentCheckoutBrand = brandObj;
    currentQty = 1;
    currentVariantPage = 1;
    document.getElementById('chk-qty').value = 1;
    isRobloxValid = false;
    selectedProductForBuy = null;
    window.selectQrisMethod(); 
    
    // View Tracker
    incrementBrandView(brandName);

    document.getElementById('chk-brand-name').innerText = brandObj.brandName;
    document.getElementById('chk-brand-type').innerText = brandObj.type === 'game' ? 'TOP UP GAME' : 'APLIKASI PREMIUM';
    const imgEl = document.getElementById('chk-brand-img');
    if(brandObj.imgUrlBase64) { imgEl.src = brandObj.imgUrlBase64; imgEl.style.display = 'block'; }
    else { imgEl.style.display = 'none'; }
    
    // Stats Dinamis Asli
    const stats = getRealStats(brandObj.brandName);
    document.getElementById('chk-stat-rating').innerText = stats.rating;
    document.getElementById('rev-rating-badge').innerText = stats.rating;
    document.getElementById('chk-stat-views').innerText = `${stats.views}`;
    document.getElementById('chk-stat-sales').innerText = stats.sales;

    const descContainer = document.getElementById('chk-desc-content');
    const btnReadMore = document.getElementById('btn-read-more');
    if(brandObj.desc) {
        descContainer.innerHTML = brandObj.desc.replace(/\n/g, '<br>');
        if(brandObj.desc.length > 120) {
            btnReadMore.style.display = 'inline-block';
            descContainer.style.maxHeight = '65px';
            btnReadMore.innerHTML = 'Lihat Selengkapnya <i class="fa-solid fa-chevron-down"></i>';
        } else {
            btnReadMore.style.display = 'none';
            descContainer.style.maxHeight = 'none';
        }
    } else {
        descContainer.innerHTML = 'Tidak ada deskripsi khusus.';
        btnReadMore.style.display = 'none';
    }

    window.renderVariantList();

    const allSoldOut = brandObj.items.every(i => i.soldOut);
    const stockCountEl = document.getElementById('chk-stock-count');
    stockCountEl.innerText = allSoldOut ? 'HABIS' : 'Tersedia';
    stockCountEl.parentElement.style.background = allSoldOut ? '#fca5a5' : 'var(--surface)';

    const targetContainer = document.getElementById('chk-target-container');
    let isRoblox = brandObj.brandName.toLowerCase().includes('roblox');
    
    if(brandObj.type === 'game') {
        targetContainer.style.display = 'block';
        if(isRoblox) {
            const tpl = document.getElementById('roblox-checker-template');
            if(tpl) targetContainer.innerHTML = tpl.innerHTML;
            initRobloxChecker();
        } else {
            isRobloxValid = true; 
            let inpType = brandObj.items[0]?.inputType || 'id_zone';
            if(inpType === 'id_only' || inpType === 'custom') {
                let label = inpType === 'id_only' ? 'ID Player' : 'Info Akun (Server/Nick)';
                targetContainer.innerHTML = `
                <div style="background: var(--surface); padding: 15px; border-radius: 12px; border: var(--border-thick); box-shadow: 2px 2px 0px #000;">
                    <label style="color:var(--text); font-size: 0.8rem; font-weight:900; text-transform:uppercase; margin-bottom:10px; display:block;">${label}</label>
                    <input type="text" id="chk-game-id" class="form-control" placeholder="Masukkan data disini..." required style="border-radius: 8px; width:100%; font-weight:600;">
                </div>`;
            } else {
                const tpl = document.getElementById('game-id-template');
                if(tpl) targetContainer.innerHTML = tpl.innerHTML;
            }
        }
    } else {
        isRobloxValid = true;
        targetContainer.style.display = 'block';
        targetContainer.innerHTML = `
        <div style="background: var(--surface-hover); padding: 15px; border-radius: 12px; border: 2px dashed var(--border); text-align:center;">
            <p style="font-size: 0.8rem; color: var(--text-muted); font-weight:600; margin:0;">Informasi akun premium akan dikirim otomatis ke email Anda setelah pembayaran sukses.</p>
        </div>`;
    }

    const emailContainer = document.getElementById('chk-email-container');
    const emailInput = document.getElementById('chk-email');
    if (currentUser && !currentUser.isAnonymous) {
        emailContainer.style.display = 'none';
        emailInput.value = currentUser.email;
    } else {
        emailContainer.style.display = 'block';
        emailInput.value = '';
    }

    // Ulasan Checker (1 Review = 1 Transaksi)
    window.renderReviewsList(brandObj.brandName);
    const unauthMsg = document.getElementById('review-unauth-msg');
    const authForm = document.getElementById('review-auth-form');
    
    if (currentUser && !currentUser.isAnonymous && currentUser.emailVerified) {
        const successCount = orders.filter(o => o.status === 'SUCCESS' && o.userEmail === currentUser.email && o.items[0]?.brandName === brandObj.brandName).length;
        const reviewCount = realReviews.filter(r => r.userEmail === currentUser.email && r.brandName === brandObj.brandName).length;
        
        if(successCount > reviewCount) {
            unauthMsg.style.display = 'none';
            authForm.style.display = 'block';
        } else if(successCount > 0 && successCount <= reviewCount) {
            unauthMsg.style.display = 'block';
            authForm.style.display = 'none';
            unauthMsg.innerHTML = `<p style="font-size: 0.8rem; color: #b91c1c; font-weight: 800; margin: 0;">Anda sudah mengulas transaksi ini. Belanja lagi untuk memberi ulasan baru.</p>`;
        } else {
            unauthMsg.style.display = 'block';
            authForm.style.display = 'none';
            unauthMsg.innerHTML = `<p style="font-size: 0.8rem; color: #b91c1c; font-weight: 800; margin: 0;">Selesaikan minimal 1 pesanan untuk memberikan ulasan pada produk ini.</p>`;
        }
    } else {
        unauthMsg.style.display = 'block';
        authForm.style.display = 'none';
        if (currentUser && !currentUser.isAnonymous && !currentUser.emailVerified) {
            unauthMsg.innerHTML = `<p style="font-size: 0.8rem; color: #b91c1c; font-weight: 800; margin: 0;">Email belum diverifikasi. Verifikasi di tab Profil untuk bisa memberi ulasan.</p>`;
        } else if (!currentUser || currentUser.isAnonymous) {
            unauthMsg.innerHTML = `<p style="font-size: 0.8rem; color: #b91c1c; font-weight: 800; margin: 0;">Login & Verifikasi Email diperlukan untuk memberi ulasan.</p>`;
        }
    }

    if (typeof grecaptcha !== 'undefined') try { grecaptcha.reset(); } catch(e){}

    window.updateCheckoutTotal();
    window.switchMainTab('checkout');
};

window.updateCheckoutTotal = function() {
    if(!selectedProductForBuy) {
        document.getElementById('chk-total').innerText = `Rp 0`;
        const btnProc = document.getElementById('btn-process-checkout');
        btnProc.innerHTML = '<i class="fa-solid fa-cart-arrow-down"></i> Pilih Varian'; 
        btnProc.disabled = true; btnProc.style.background = 'var(--surface-hover)';
        return;
    }
    
    let subtotal = selectedProductForBuy.priceNum * currentQty;
    document.getElementById('chk-total').innerText = `Rp ${subtotal.toLocaleString('id-ID')}`;
    
    const btnProc = document.getElementById('btn-process-checkout');
    if (siteSettings.isStoreOpen === false) {
        btnProc.innerHTML = '<i class="fa-solid fa-store-slash"></i> Toko Tutup'; 
        btnProc.disabled = true;
        btnProc.style.background = '#ef4444'; 
    } else {
        btnProc.innerHTML = '<i class="fa-solid fa-cart-arrow-down"></i> Bayar Sekarang'; 
        btnProc.disabled = false;
        btnProc.style.background = 'var(--brand-green)';
    }
};

window.processNewCheckout = function() {
    const captchaRes = window.getCaptchaResponse('chk-captcha-box');
    if(!captchaRes) {
        window.customAlert('Verifikasi Gagal', 'Harap centang kotak reCAPTCHA (Saya bukan robot).', 'warning');
        return;
    }

    const emailInput = document.getElementById('chk-email').value.trim();
    if(!emailInput || !emailInput.includes('@')) { 
        window.customAlert('Peringatan', 'Alamat Email wajib diisi dengan format yang benar!', 'warning'); 
        return; 
    }

    if(currentCheckoutBrand.type === 'game') {
        const pid = document.getElementById('chk-game-id') ? document.getElementById('chk-game-id').value.trim() : '';
        if(!pid) { window.customAlert('Peringatan', 'Target tujuan (ID/Data Game) wajib diisi!', 'warning'); return; }
        
        let isRobloxType = currentCheckoutBrand.brandName.toLowerCase().includes('roblox');
        if(isRobloxType && !isRobloxValid) {
            window.customAlert('Validasi Roblox', 'Username Roblox belum ditemukan. Pastikan ketikan benar dan tunggu centang hijau.', 'warning');
            return;
        }
    }

    if(!currentUser || currentUser.isAnonymous) {
        window.openModal('modal-guest-prompt');
    } else {
        window.executeCheckoutFinal();
    }
};

window.continueAsGuest = function() {
    window.closeModal('modal-guest-prompt');
    window.executeCheckoutFinal();
};

window.executeCheckoutFinal = async function() {
    const btn = document.getElementById('btn-process-checkout');
    const ogHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses...';
    btn.disabled = true;

    try {
        const emailInput = document.getElementById('chk-email').value.trim();
        let targetUserEmail = emailInput;
        
        if(!currentUser || currentUser.isAnonymous) {
            const guestId = "GUEST_" + Date.now();
            await setDoc(doc(db, pathUsers, guestId), { 
                email: emailInput, name: emailInput.split('@')[0], role: 'guest', 
                emailVerified: false, isTemporary: true, createdAt: new Date().toISOString() 
            }).catch(e=>{});
        }

        let playerInfo = '';
        if(currentCheckoutBrand.type === 'game') {
            const pid = document.getElementById('chk-game-id').value.trim();
            const zol = document.getElementById('chk-game-zone') ? document.getElementById('chk-game-zone').value.trim() : '';
            let isRobloxType = currentCheckoutBrand.brandName.toLowerCase().includes('roblox');
            
            let inpType = currentCheckoutBrand.items[0]?.inputType || 'id_zone';
            if(isRobloxType) playerInfo = `Roblox User: ${pid}`;
            else if(inpType === 'id_only') playerInfo = `ID: ${pid}`;
            else if(inpType === 'custom') playerInfo = `Info: ${pid}`;
            else playerInfo = `ID: ${pid} | Zone: ${zol}`;
        } else {
            playerInfo = `Akun Premium (Delivery Type: ${selectedProductForBuy.processType === 'manual' ? 'Manual' : 'Auto'})`;
        }

        let rawTotal = selectedProductForBuy.priceNum * currentQty;
        let uniqueCode = 0;
        if(currentPayMethod === 'qris' && rawTotal > 0) uniqueCode = Math.floor(Math.random() * 300) + 1;
        let finalTotal = rawTotal + uniqueCode;
        
        const invId = 'VP-' + Math.floor(100000 + Math.random() * 900000);
        
        const singleItem = { 
            cartId: Date.now().toString(), productDbId: selectedProductForBuy.dbId,
            brandName: currentCheckoutBrand.brandName, exactItemName: selectedProductForBuy.name,
            name: `${currentCheckoutBrand.brandName} - ${selectedProductForBuy.name}`, 
            priceNum: selectedProductForBuy.priceNum, type: currentCheckoutBrand.type, 
            processType: selectedProductForBuy.processType || 'auto', playerInfo: playerInfo 
        };

        const newOrder = {
            id: invId, userEmail: targetUserEmail, customerWa: '-',
            items: [singleItem], qty: currentQty,
            finalTotal: finalTotal, baseTotal: rawTotal,
            uniqueCode: uniqueCode, promoCode: '', promoDiscount: 0,
            status: currentPayMethod === 'cash' ? 'PENDING' : 'UNPAID', 
            paymentMethod: currentPayMethod, adminReply: '', date: new Date().toISOString()
        };

        const docRef = await addDoc(collection(db, pathOrders), newOrder);
        currentCheckoutSession = { 
            dbId: docRef.id, id: invId, finalTotal: finalTotal, 
            uniqueCode: uniqueCode, method: currentPayMethod, date: newOrder.date,
            brandName: currentCheckoutBrand.brandName,
            varName: selectedProductForBuy.name,
            qty: currentQty, baseTotal: rawTotal
        };
        
        if (typeof grecaptcha !== 'undefined') try { grecaptcha.reset(); } catch(e){}
        
        if(currentPayMethod === 'qris') window.openPaymentTab();
        else window.finishCashOrder();

    } catch (e) {
        window.customAlert("Error", "Gagal menghubungkan pesanan ke server.", "error"); 
    } finally {
        btn.innerHTML = ogHtml; btn.disabled = false;
    }
};

window.finishCashOrder = function() {
    let adminWaNum = siteSettings.adminWa || '085656321860';
    if (adminWaNum.startsWith('0')) adminWaNum = '62' + adminWaNum.substring(1);
    
    const waText = `Halo Admin Vipercell, saya melakukan pesanan dengan metode CASH (Ambon).\n\n*Invoice ID:* ${currentCheckoutSession.id}\n*Total Bayar:* Rp${currentCheckoutSession.finalTotal.toLocaleString('id-ID')}\n\nMohon direspon ya Min.`;
    const waUrl = `https://wa.me/${adminWaNum}?text=${encodeURIComponent(waText)}`;
    
    document.getElementById('ca-extra-action').innerHTML = `
        <a href="${waUrl}" target="_blank" class="btn-brutal" style="display:flex; justify-content:center; width:100%; margin-top:15px; background:var(--brand-green); padding: 12px; box-shadow: 2px 2px 0px #000;">
            <i class="fa-brands fa-whatsapp" style="font-size:1.2rem; margin-right:8px;"></i> Hubungi Admin
        </a>`;
        
    window.customAlert('Menunggu Konfirmasi', `ID Pesanan Anda: <strong style="color:var(--text);">${currentCheckoutSession.id}</strong><br><br><span style="color:#ef4444; font-weight:900;">PENTING:</span> Segera hubungi admin untuk melakukan kesepakatan lokasi pembayaran tunai.`, 'info');
    currentCheckoutSession = null;
    if(currentUser && !currentUser.isAnonymous) window.switchMainTab('pesanan');
};

// ==========================================
// DYNAMIC QRIS
// ==========================================
function calculateCrc16Ccitt(str) {
    let crc = 0xFFFF;
    for (let c = 0; c < str.length; c++) {
        crc ^= str.charCodeAt(c) << 8;
        for (let i = 0; i < 8; i++) {
            if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
            else crc = crc << 1;
        }
    }
    return (crc >>> 0).toString(16).toUpperCase().padStart(4, '0');
}

function buildDynamicQris(rawQris, amount) {
    rawQris = rawQris.trim();
    if(!rawQris) return null;
    let base = rawQris.slice(0, -4);
    if (!base.endsWith('6304')) {
        let idx = rawQris.indexOf('6304');
        if (idx !== -1) base = rawQris.substring(0, idx + 4);
        else return rawQris; 
    }
    let tag54 = "54" + String(amount).length.toString().padStart(2, '0') + amount;
    let newBase;
    if (base.includes("5802ID")) newBase = base.replace("5802ID", tag54 + "5802ID");
    else newBase = base.replace("6304", tag54 + "6304");
    return newBase + calculateCrc16Ccitt(newBase);
}

window.startQrisTimer = function(orderDate) {
    clearInterval(qrisInterval);
    const timeText = document.getElementById('qris-time-left');
    if(!timeText) return;
    
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

window.openPaymentTab = function() {
    if(!currentCheckoutSession) return;
    
    document.getElementById('pay-ref').innerText = currentCheckoutSession.id;
    document.getElementById('pay-method-display').innerText = currentCheckoutSession.method === 'qris' ? 'QRIS Otomatis' : 'CASH';
    document.getElementById('pay-date').innerText = new Date(currentCheckoutSession.date).toLocaleString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    
    document.getElementById('pay-prod-name').innerText = currentCheckoutSession.brandName;
    document.getElementById('pay-var-name').innerText = currentCheckoutSession.varName;
    document.getElementById('pay-qty').innerText = currentCheckoutSession.qty;
    document.getElementById('pay-subtotal').innerText = `Rp ${currentCheckoutSession.baseTotal.toLocaleString('id-ID')}`;
    
    document.getElementById('pay-kode-unik').innerText = `+ Rp ${currentCheckoutSession.uniqueCode}`;
    document.getElementById('pay-total-final').innerText = `Rp ${currentCheckoutSession.finalTotal.toLocaleString('id-ID')}`;
    document.getElementById('pay-total-header').innerText = `Rp ${currentCheckoutSession.finalTotal.toLocaleString('id-ID')}`;

    const qrisDisplayBox = document.getElementById('qris-qrcode-display');
    const qrisRawStr = siteSettings.qrisRawString; 
    
    if(qrisRawStr && currentCheckoutSession.method === 'qris') {
        qrisDisplayBox.innerHTML = ''; 
        const finalDynamicStr = buildDynamicQris(qrisRawStr, currentCheckoutSession.finalTotal);
        new QRCode(qrisDisplayBox, {
            text: finalDynamicStr || qrisRawStr,
            width: 200, height: 200,
            colorDark : "#000000", colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
    } else {
        qrisDisplayBox.innerHTML = '<div style="color:#ef4444; font-size:0.9rem; font-weight:900; text-align:center; align-self:center;">Pembayaran Manual</div>';
    }
    
    window.startQrisTimer(currentCheckoutSession.date);
    window.switchMainTab('payment');
};

window.resumePayment = function(dbId) {
    const order = orders.find(o => o.dbId === dbId);
    if(!order) return;
    currentCheckoutSession = { 
        dbId: order.dbId, id: order.id, finalTotal: order.finalTotal, 
        uniqueCode: order.uniqueCode, method: order.paymentMethod, date: order.date,
        brandName: order.items[0]?.brandName || 'PRODUK',
        varName: order.items[0]?.exactItemName || order.items[0]?.name,
        qty: order.qty || 1, baseTotal: order.baseTotal
    };
    
    window.openPaymentTab();
};

// ==========================================
// RENDER RIWAYAT PESANAN & TAB FILTER
// ==========================================
function generateHelpButtons(invId, orderStatus, item) {
    let adminWaNum = siteSettings.adminWa || '085656321860';
    if (adminWaNum.startsWith('0')) adminWaNum = '62' + adminWaNum.substring(1);
    
    let actionBtn = '';
    if (orderStatus === 'PENDING') {
        const msg = encodeURIComponent(`Halo Admin, saya sudah bayar cash pesanan *${invId}*. Tolong dicek ya.`);
        actionBtn = `<a href="https://wa.me/${adminWaNum}?text=${msg}" target="_blank" class="btn-brutal" style="width:100%; background:var(--brand-yellow); padding:10px;"><i class="fa-brands fa-whatsapp"></i> Konfirmasi Bayar</a>`;
    } else if (orderStatus === 'SUCCESS') {
        if (item?.processType === 'manual') {
            const msg = encodeURIComponent(`Halo Admin, pesanan *${invId}* SUKSES (Manual). Mohon dikirim ya.`);
            actionBtn = `<a href="https://wa.me/${adminWaNum}?text=${msg}" target="_blank" class="btn-brutal" style="width:100%; background:var(--brand-blue); padding:10px;"><i class="fa-brands fa-whatsapp"></i> Chat Admin</a>`;
        } else {
            const msg = encodeURIComponent(`Halo Admin, saya butuh bantuan untuk pesanan ID: ${invId}.`);
            actionBtn = `<a href="https://wa.me/${adminWaNum}?text=${msg}" target="_blank" class="btn-brutal" style="width:100%; background:var(--brand-green); padding:10px;"><i class="fa-solid fa-circle-info"></i> Info Klaim</a>`;
        }
    } else if (orderStatus === 'EXPIRED') {
        const msg = encodeURIComponent(`Halo Admin, saya sudah membayar untuk pesanan *${invId}* namun status Expired. Tolong.`);
        actionBtn = `<a href="https://wa.me/${adminWaNum}?text=${msg}" target="_blank" class="btn-brutal" style="width:100%; background:#fca5a5; padding:10px;"><i class="fa-brands fa-whatsapp"></i> Komplain Expired</a>`;
    }
    
    if(!actionBtn) return '';
    return `<div style="display:flex; flex-direction:column; gap:8px; margin-top:15px;">${actionBtn}</div>`;
}

window.refreshOrderData = function() {
    if(currentUser && !currentUser.isAnonymous) window.renderUserOrders();
};

window.trackOrder = function() {
    const invId = document.getElementById('track-id').value.trim().toUpperCase();
    if(!invId) return;
    const order = orders.find(o => o.id === invId && o.userEmail === currentUser?.email);
    const resBox = document.getElementById('track-result');
    
    if(!order) {
        resBox.style.display = 'block';
        resBox.innerHTML = `<div style="background:var(--surface); padding:1rem; border:var(--border-thick); border-radius:12px; box-shadow:var(--shadow-brutal); color:#ef4444; font-weight:900;"><i class="fa-solid fa-xmark"></i> Pesanan tidak ditemukan / bukan milik Anda.</div>`;
        return; 
    }
    
    resBox.style.display = 'block';
    resBox.innerHTML = renderSingleOrderHTML(order, 0); 
};

window.filterOrders = function(status, btnEl) {
    document.querySelectorAll('.pesanan-filters .neo-filter-tab').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
    activeOrderFilter = status;
    window.renderUserOrders();
};

window.renderUserOrders = function() {
    const grid = document.getElementById('user-order-grid');
    if(!grid) return;
    
    if(!currentUser || currentUser.isAnonymous) { grid.innerHTML = ''; return; }
    
    let userOrders = orders.filter(o => o.userEmail === currentUser.email);
    
    if (activeOrderFilter === 'unpaid') {
        userOrders = userOrders.filter(o => o.status === 'UNPAID' || o.status === 'PENDING');
    } else if (activeOrderFilter === 'failed') {
        userOrders = userOrders.filter(o => o.status === 'FAILED' || o.status === 'EXPIRED');
    } else if (activeOrderFilter === 'success') {
        userOrders = userOrders.filter(o => o.status === 'SUCCESS');
    }
    
    if(userOrders.length === 0) {
        grid.innerHTML = '<div style="text-align:center; padding: 2rem; font-weight:800; color:var(--text-muted);">Riwayat pesanan kosong untuk filter ini.</div>'; return;
    }
    
    let html = '';
    const renderLimit = userOrders.slice(0, 50);  
    renderLimit.forEach((o, index) => { html += renderSingleOrderHTML(o, index); });
    
    if(userOrders.length > 50) html += `<div style="text-align:center; padding: 1rem; font-weight:800; color:var(--text-muted);">Menampilkan 50 riwayat terbaru.</div>`;
    grid.innerHTML = html;
    setTimeout(observeReveals, 100);
};

function renderSingleOrderHTML(o, index) {
    let bgStatus = ''; let sName = '';
    if(o.status === 'UNPAID') { bgStatus = '#e5e7eb'; sName = 'Belum Dibayar'; }
    else if(o.status === 'PENDING') { bgStatus = 'var(--brand-yellow)'; sName = 'Proses Antrian'; }
    else if(o.status === 'FAILED') { bgStatus = '#fca5a5'; sName = 'Dibatalkan'; }
    else if(o.status === 'EXPIRED') { bgStatus = '#fca5a5'; sName = 'Expired'; }
    else { bgStatus = 'var(--brand-green)'; sName = 'Selesai'; }
    
    let replyHtml = '';
    if (o.status === 'SUCCESS') {
        if (o.adminReply) {
            replyHtml = `
            <div style="background: var(--surface); border: var(--border-thick); border-radius: 8px; margin-top: 15px; box-shadow: 2px 2px 0px #000; overflow:hidden;">
                <div style="background:var(--brand-blue); padding:10px; border-bottom:var(--border-thick); font-weight:900; font-size:0.85rem; color:#000;"><i class="fa-solid fa-envelope-open-text"></i> Detail Akun / Kode</div>
                <div style="padding:15px; color:var(--text); font-weight:800; font-size:0.9rem; line-height:1.5;">${o.adminReply.replace(/\n/g, '<br>')}</div>
            </div>`;
        } else {
            if (o.items[0]?.processType === 'manual') {
                replyHtml = `<div style="background:var(--brand-yellow); border:var(--border-thick); border-radius:8px; padding:10px; margin-top:15px; font-weight:800; font-size:0.85rem; box-shadow: 2px 2px 0px #000; color:#000;"><i class="fa-solid fa-user-clock"></i> Proses Manual Admin. Mohon tunggu.</div>`;
            } else {
                replyHtml = `<div style="background:#fef08a; border:var(--border-thick); border-radius:8px; padding:10px; margin-top:15px; font-weight:800; font-size:0.85rem; box-shadow: 2px 2px 0px #000; color:#000;"><i class="fa-solid fa-clock"></i> Stok sistem sedang antre dikirim...</div>`;
            }
        }
    }
    
    let detailGameHtml = '';
    if (o.items[0]?.type === 'game') {
        detailGameHtml = `
        <div style="background:var(--surface-hover); padding:10px; border-radius:8px; border:2px dashed var(--border); margin-top:10px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:900; text-transform:uppercase; margin-bottom: 2px;">Tujuan Game:</div>
            <div style="font-size:0.9rem; color:var(--text); font-weight:900;">${o.items[0].playerInfo}</div>
        </div>`;
    } else {
        detailGameHtml = `<div style="font-size: 0.85rem; font-weight:600; color: var(--text-muted);">${o.items[0].playerInfo}</div>`;
    }
    
    let actionHtml = (o.status === 'UNPAID') 
         ? `<button class="btn-brutal" style="width:100%; margin-top:15px; background:var(--brand-blue); padding:12px; box-shadow:2px 2px 0px #000;" onclick="window.resumePayment('${o.dbId}')">Lanjut Selesaikan Pembayaran</button>`
        : '';
        
    const helpHtml = generateHelpButtons(o.id, o.status, o.items[0]);
    const animDelay = (index * 0.1) + 's';
    
    return `
        <div class="receipt-anim" style="animation-delay: ${animDelay}; width: 100%; position:relative; margin-bottom:1.5rem; border: var(--border-thick); border-radius: 16px; background:var(--surface); box-shadow:var(--shadow-brutal); overflow:hidden;">
            <div style="border-bottom:var(--border-thick); padding: 15px; display:flex; justify-content:space-between; align-items:center; background: var(--surface-hover);">
                <div>
                    <div style="color:var(--text-muted); font-size: 0.75rem; font-weight:900;">INVOICE</div>
                    <div style="color:var(--text); font-weight: 900; font-size: 1.1rem; letter-spacing: 1px;">${o.id}</div>
                </div>
                <span style="background:${bgStatus}; border: 2px solid #000; padding: 4px 10px; border-radius: 20px; font-weight: 900; font-size: 0.8rem; box-shadow: 2px 2px 0px #000; color:#000;">${sName}</span>
            </div>
            <div style="padding: 15px;">
                <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 800; margin-bottom: 15px;">
                    <i class="fa-regular fa-clock"></i> ${new Date(o.date).toLocaleString('id-ID')}
                </div>
                <div style="border-left: var(--border-thick); padding-left: 10px; margin-bottom: 15px;">
                    ${o.items.map(i => `<div style="font-weight: 900; color: var(--text); text-transform:uppercase; font-size:1.1rem;">${i.name} (x${o.qty || 1})</div>`).join('')}
                    ${detailGameHtml}
                </div>
                ${replyHtml}
            </div>
            <div style="background:var(--surface); border-top:var(--border-thick); padding: 15px;">
                <div style="display:flex; justify-content:space-between; font-size:0.9rem; font-weight:800; margin-bottom:8px;">
                    <span style="color:var(--text-muted);">Subtotal</span>
                    <span>Rp${(o.baseTotal).toLocaleString('id-ID')}</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.9rem; font-weight:800; margin-bottom:8px;">
                    <span style="color:#f59e0b;">Kode Unik</span>
                    <span style="color:#f59e0b;">+Rp${o.uniqueCode || 0}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top: 10px; padding-top: 10px; border-top: 2px dashed var(--border);">
                    <strong style="font-size: 1.2rem; font-weight:900; color: var(--text);">Total Bayar</strong>
                    <strong style="font-size: 1.2rem; font-weight:900; color: var(--text);">Rp${o.finalTotal.toLocaleString('id-ID')}</strong>
                </div>
                ${actionHtml}
                ${helpHtml}
            </div>
        </div>`;
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initApp); } 
else { initApp(); }