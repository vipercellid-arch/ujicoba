import { 
    db, auth,
    signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword,
    sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, onAuthStateChanged,
    signOut, setPersistence, browserLocalPersistence,
    doc, setDoc, getDoc, updateDoc, deleteDoc, onSnapshot, collection, addDoc, increment, arrayUnion, query, where, getDocs 
} from './firebase.js';

// ==========================================
// KONFIGURASI DATABASE
// ==========================================
const appId = typeof __app_id !== 'undefined' ? __app_id : 'vipercell-prod';
const isWorkspace = typeof __app_id !== 'undefined';
const pathProducts = isWorkspace ? `artifacts/${appId}/public/data/products` : 'products';
const pathOrders = isWorkspace ? `artifacts/${appId}/public/data/orders` : 'orders';
const pathSettings = isWorkspace ? `artifacts/${appId}/public/data/settings` : 'settings';
const pathUsers = isWorkspace ? `artifacts/${appId}/public/data/users` : 'users';
const pathPromos = isWorkspace ? `artifacts/${appId}/public/data/promos` : 'promos';
const pathChats = isWorkspace ? `artifacts/${appId}/public/data/chats` : 'chats';
const pathStocks = isWorkspace ? `artifacts/${appId}/public/data/stocks` : 'stocks';

// ==========================================
// STATE & VARIABEL GLOBAL
// ==========================================
let products = [];
let groupedBrands = []; 
let orders = [];
let promos = [];
let siteSettings = { 
    logoText: 'VIPER', logoAccent: 'CELL', logoImgBase64: '', marquee: 'Selamat Datang di Vipercell',
    qrisRawString: '', adminWa: '085656321860', igLink: '', ttLink: '',
    newsList: [], banners: [], isStoreOpen: true, waChannelLink: '', botQrisActive: false
};
let userProfile = { name: '', phone: '' };
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
let isRobloxValid = false;

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
        if (outcome === 'accepted') {
            pwaPrompt.style.display = 'none';
        }
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
    if(metaTheme) metaTheme.setAttribute('content', newTheme === 'dark' ? '#020617' : '#ffffff');
    
    const icon = document.getElementById('theme-icon');
    if(icon) icon.className = newTheme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
};

window.showToast = function(title, msg, type = 'info', actionCallback = null) {
    const container = document.getElementById('toast-container');
    if(!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    let icon = '<i class="fa-solid fa-circle-info"></i>';
    if(type === 'success') icon = '<i class="fa-solid fa-circle-check"></i>';
    if(type === 'warning') icon = '<i class="fa-solid fa-triangle-exclamation"></i>';
    if(type === 'error') icon = '<i class="fa-solid fa-circle-xmark"></i>';
    
    toast.innerHTML = `<div class="toast-icon">${icon}</div><div class="toast-content"><h4>${title}</h4><p>${msg}</p></div>`;
    
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
    if(el) { 
        el.classList.remove('active'); document.body.classList.remove('no-scroll'); 
        if(id === 'modal-payment') clearInterval(qrisInterval);
    }
};

window.handleLogoClick = () => window.switchMainTab('katalog');

window.customAlert = (title, message, type = 'info') => {
    const titleEl = document.getElementById('ca-title');
    const descEl = document.getElementById('ca-desc');
    const iconEl = document.getElementById('ca-icon');
    const alertEl = document.getElementById('custom-alert');
    
    if(titleEl) titleEl.innerText = title;
    if(descEl) descEl.innerHTML = message;
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
    if(alertEl) alertEl.classList.remove('active');
    document.body.classList.remove('no-scroll');
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
        setTimeout(() => { window.scrollTo(0, 1); }, 100);
        
        await setPersistence(auth, browserLocalPersistence);
        
        onAuthStateChanged(auth, async (user) => {
            currentUser = user;
            if (user && !user.isAnonymous) {
                document.getElementById('btn-login-user').style.display = 'none';
                const userDoc = await getDoc(doc(db, pathUsers, user.uid));
                if(userDoc.exists()) {
                    userProfile = { ...userProfile, ...userDoc.data() };
                    document.getElementById('prof-name').value = userProfile.name || '';
                    document.getElementById('prof-phone').value = userProfile.phone || '';
                } else {
                    userProfile = { name: '', phone: '' };
                }
                
                document.getElementById('prof-email').value = user.email || '';
                document.getElementById('nav-profil').style.display = 'flex';
                document.getElementById('nav-pesanan').style.display = 'flex';
                document.getElementById('nav-bot-pesanan').style.display = 'flex';
                
                if(document.getElementById('nav-bot-lacak')) document.getElementById('nav-bot-lacak').style.display = 'none';
                if(document.getElementById('btn-cek-pesanan')) document.getElementById('btn-cek-pesanan').style.display = 'none';
                
                window.renderUserOrders();
                updateProfileStats();
            } else {
                document.getElementById('btn-login-user').style.display = 'inline-flex';
                document.getElementById('nav-profil').style.display = 'none';
                document.getElementById('nav-pesanan').style.display = 'none';
                document.getElementById('nav-bot-pesanan').style.display = 'none';
                
                if(document.getElementById('nav-bot-lacak')) document.getElementById('nav-bot-lacak').style.display = 'flex';
                if(document.getElementById('btn-cek-pesanan')) document.getElementById('btn-cek-pesanan').style.display = 'inline-flex';
            }
            document.getElementById('user-chat-fab').style.display = 'flex';
            listenUserChat();
            listenData();
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
        
        let activeTabBtn = document.querySelector('.tab-btn.active');
        let curFilter = activeTabBtn ? (activeTabBtn.innerText.includes('Aplikasi') ? 'app' : activeTabBtn.innerText.includes('Game') ? 'game' : 'all') : 'all';
        window.renderBrands(curFilter);
    });

    onSnapshot(collection(db, pathPromos), (snapshot) => {
        promos = [];
        snapshot.forEach((docSnap) => { promos.push({ dbId: docSnap.id, ...docSnap.data() }); });
        if(selectedProductForBuy) window.calculateDirectBuyTotal();
    });
    
    onSnapshot(collection(db, pathOrders), (snapshot) => {
        let newOrders = [];
        const now = Date.now();
        
        snapshot.forEach((docSnap) => {
            let data = { dbId: docSnap.id, ...docSnap.data() };
            const orderTime = new Date(data.date).getTime();
            
            if(data.status === 'UNPAID') {
                if(now - orderTime > 240000) { 
                    updateDoc(doc(db, pathOrders, data.dbId), { status: 'EXPIRED' });
                    data.status = 'EXPIRED';
                }
            } else if (data.status === 'EXPIRED') {
                if(now - orderTime > 86400000) { 
                    deleteDoc(doc(db, pathOrders, data.dbId));
                    return; 
                }
            }
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
        
        const trackModal = document.getElementById('modal-cek-pesanan');
        if(trackModal && trackModal.classList.contains('active')) {
            const currentTrackId = document.getElementById('track-id').value.trim().toUpperCase();
            if(currentTrackId) window.trackOrder(); 
        }
        
        updateOrderBadges();
        
        if(currentUser && !currentUser.isAnonymous) {
            window.renderUserOrders();
            updateProfileStats();
        }
        initialOrderLoad = false;
    });
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
    localStorage.setItem('vipercell_anon_name', name);
    
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
        body.innerHTML = '<p style="text-align:center; color:var(--text-muted); font-size:0.85rem; margin-top:30px;"> Belum ada obrolan. Tuliskan pertanyaan Anda untuk terhubung dengan Admin.</p>';
        return;
    }
    
    let html = '';
    userChatMessages.forEach(msg => {
        const isUser = msg.sender === 'user';
        html += `
            <div class="chat-msg ${isUser ? 'user' : 'admin'}">
                ${msg.text}
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
window.toggleNewsAccordion = function(element) { element.parentElement.classList.toggle('open'); };

window.openAuthModal = function() {
    window.switchAuthTab('login');
    window.switchMainTab('auth');
};

window.switchAuthTab = function(tab) {
    document.getElementById('form-login').style.display = tab==='login' ? 'block' : 'none';
    document.getElementById('form-register').style.display = tab==='register' ? 'block' : 'none';
    document.getElementById('form-reset').style.display = tab==='reset' ? 'block' : 'none';
    
    document.getElementById('auth-divider').style.display = tab==='reset' ? 'none' : 'flex';
    document.getElementById('auth-google-btn').style.display = tab==='reset' ? 'none' : 'flex';
    
    const btnL = document.getElementById('tab-login');
    const btnR = document.getElementById('tab-register');
    if(btnL) btnL.className = tab==='login' ? 'active' : '';
    if(btnR) btnR.className = tab==='register' ? 'active' : '';
    
    const title = document.getElementById('auth-title');
    const subtitle = document.getElementById('auth-subtitle');
    if(tab==='reset') {
        title.innerText = 'Lupa Sandi'; subtitle.innerText = 'Tenang, mari kita pulihkan akunmu.';
    } else {
        title.innerText = tab==='login' ? 'Masuk Akun' : 'Daftar Baru';
        subtitle.innerText = tab==='login' ? 'Masuk untuk transaksi.' : 'Buat akun sekarang untuk menyimpan riwayat pesanan.';
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
    btn.innerText = 'Memproses...'; btn.disabled = true;
    try {
        await signInWithEmailAndPassword(auth, em, pw);
        window.switchMainTab('katalog');
        window.customAlert('Sukses', 'Berhasil masuk.', 'success');
    } catch(e) { window.customAlert('Gagal', 'Email atau password salah.', 'error'); } 
    finally { btn.innerText = 'Masuk Sekarang'; btn.disabled = false; }
};

window.processRegister = async function() {
    const name = document.getElementById('auth-r-name').value.trim();
    const em = document.getElementById('auth-r-email').value.trim();
    const pw = document.getElementById('auth-r-pass').value.trim();
    
    if(!name || !em || pw.length < 6) { 
        window.customAlert('Peringatan', 'Harap lengkapi form dan Password minimal 6 karakter.', 'warning'); return; 
    }
    
    const btn = document.getElementById('btn-do-register');
    btn.innerText = 'Memproses...'; btn.disabled = true;
    try {
        const cred = await createUserWithEmailAndPassword(auth, em, pw);
        await setDoc(doc(db, pathUsers, cred.user.uid), { email: em, name: name, phone: '', role: 'user', createdAt: new Date().toISOString() });
        window.switchMainTab('profil');
        window.customAlert('Sukses', 'Akun berhasil didaftarkan.', 'success');
    } catch(e) { window.customAlert('Gagal', 'Email mungkin sudah terdaftar.', 'error'); } 
    finally { btn.innerText = 'Buat Akun Baru'; btn.disabled = false; }
};

window.processReset = async function() {
    const em = document.getElementById('auth-res-email').value.trim();
    if(!em) { window.customAlert('Error', 'Masukkan email terdaftar.', 'error'); return; }
    try {
        await sendPasswordResetEmail(auth, em);
        window.customAlert('Terkirim', 'Tautan reset telah dikirim ke email kamu.', 'success');
        window.switchAuthTab('login');
    } catch(e) { window.customAlert('Error', 'Gagal mengirim tautan reset.', 'error'); }
};

window.sendProfileResetPassword = async function() {
    if(!currentUser || currentUser.isAnonymous) return;
    try {
        await sendPasswordResetEmail(auth, currentUser.email);
        window.customAlert('Terkirim', 'Cek kotak masuk email kamu untuk membuat sandi baru.', 'success');
    } catch (e) { window.customAlert('Gagal', 'Terjadi kesalahan sistem.', 'error'); }
};

window.processGoogleLogin = async function() {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        const userDoc = await getDoc(doc(db, pathUsers, result.user.uid));
        if (!userDoc.exists()) {
            // Auto register via google
            await setDoc(doc(db, pathUsers, result.user.uid), { email: result.user.email, name: result.user.displayName, phone: '', role: 'user', createdAt: new Date().toISOString() });
        }
        window.switchMainTab('katalog');
        window.customAlert('Sukses', 'Berhasil masuk via Google.', 'success');
    } catch (error) {}
};

window.logoutUser = async function() {
    await signOut(auth);
    window.switchMainTab('katalog');
    window.customAlert('Logout', 'Anda telah keluar dari akun.', 'info');
};

window.saveUserProfile = async function() {
    if(!currentUser || currentUser.isAnonymous) return;
    const name = document.getElementById('prof-name').value.trim();
    const phone = document.getElementById('prof-phone').value.trim();
    try {
        await setDoc(doc(db, pathUsers, currentUser.uid), { name, phone }, { merge: true });
        userProfile.name = name; userProfile.phone = phone;
        window.customAlert('Tersimpan', 'Profil berhasil diperbarui.', 'success');
    } catch(e) { window.customAlert('Error', 'Gagal menyimpan profil.', 'error'); }
};

function updateProfileStats() {
    if(!currentUser || currentUser.isAnonymous) return;
    const successCount = orders.filter(o => o.userEmail === currentUser.email && o.status === 'SUCCESS').length;
    const statEl = document.getElementById('prof-stat-success');
    if(statEl) statEl.innerText = successCount;
}

// ==========================================
// RENDER UI & KATALOG
// ==========================================
window.applySettingsToUI = function() {
    const logoDasar = siteSettings.logoText || 'VIPER';
    const logoAksen = siteSettings.logoAccent || 'CELL';
    
    const slt = document.getElementById('site-logo-text');
    const flt = document.getElementById('footer-logo-text-2');
    if(slt) slt.innerHTML = `${logoDasar}<span>${logoAksen}</span>`;
    if(flt) flt.innerHTML = `${logoDasar}<span>${logoAksen}</span>`;
    
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
    const waHref = `https://wa.me/${adminWaNum}?text=${encodeURIComponent('Halo Min')}`;
    
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
        grid.innerHTML = '<div style="text-align:center; color:var(--text-muted)">Belum ada informasi terbaru.</div>';
        return;
    }
    
    let html = '';
    visibleList.forEach(news => {
        const imgHtml = news.imageUrl ? `<img src="${news.imageUrl}" style="width:100%; border-radius: 8px; margin-bottom: 15px;" loading="lazy">` : '';
        html += `
            <div class="tut-accordion-card">
                <div class="tut-accordion-header" onclick="window.toggleNewsAccordion(this)">
                    <span>${news.title}</span>
                    <i class="fa-solid fa-chevron-down icon-arrow"></i>
                </div>
                <div class="tut-accordion-body">
                    <div class="tutorial-info">
                        ${imgHtml}
                        <p>${news.desc.replace(/\n/g, '<br>')}</p>
                    </div>
                </div>
            </div>`;
    });
    grid.innerHTML = html;
};

window.filterBrands = function(type, btnEl) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
    window.renderBrands(type);
};

window.renderBrands = function(filter) {
    const grid = document.getElementById('brand-grid');
    if(!grid) return;
    
    const filteredBrands = filter === 'all' ? groupedBrands : groupedBrands.filter(b => b.type === filter);
    
    if(filteredBrands.length === 0) { 
        grid.innerHTML = `<div style="text-align:center; grid-column: 1/-1; color:var(--text-muted);">Katalog kosong.</div>`; 
        return; 
    }
    
    let html = '';
    filteredBrands.forEach(b => {
        const typeName = b.type === 'game' ? 'Game' : 'Aplikasi';
        const imgHtml = b.imgUrlBase64 
            ? `<img src="${b.imgUrlBase64}" alt="${b.brandName}" loading="lazy">` 
            : `<div style="width:100%; height:100%; background:var(--primary-gradient); display:flex; align-items:center; justify-content:center; font-size:3rem; font-weight:bold; color:rgba(255,255,255,0.3);">${b.brandName.charAt(0)}</div>`;
        
        const badgeHtml = b.isGangguan ? '<span class="card-badge" style="background:var(--warning); color:black;">MAINTENANCE</span>' : `<span class="card-badge">${typeName}</span>`;
        const clickAction = b.isGangguan ? `window.customAlert('Maintenance Server', 'Mohon maaf, produk ini sedang dalam gangguan jaringan.', 'warning')` : `window.openDirectBuyModal('${b.brandName}')`;
        const cssClass = b.isGangguan ? 'brand-card reveal sold-out' : 'brand-card reveal';
        
        html += `
            <div class="${cssClass}" onclick="${clickAction}">
                <div class="brand-img-wrapper">
                    ${imgHtml}
                    ${badgeHtml}
                </div>
                <div class="brand-content">
                    <h3>${b.brandName}</h3>
                    <p style="font-size:0.75rem; color:var(--text-muted); margin-top:5px;">Pilih Nominal/Item</p>
                </div>
            </div>`;
    });
    grid.innerHTML = html;
    setTimeout(observeReveals, 100);
};

// ==========================================
// ROBLOX AVATAR CHECKER (MULTI-PROXY)
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
    if (data && data.data && data.data.length > 0 && data.data[0].imageUrl) {
        return data.data[0].imageUrl;
    }
    throw new Error("Gagal memuat avatar");
}

function initRobloxChecker() {
    const usernameInput = document.getElementById('buy-id');
    const avatarImg = document.getElementById('roblox-avatar-img');
    const statusIcon = document.getElementById('roblox-status-icon');
    const loadingIcon = document.getElementById('roblox-loading-icon');
    
    if(!usernameInput || !avatarImg) return;

    usernameInput.addEventListener('input', () => {
        clearTimeout(typingTimer);
        isRobloxValid = false;
        statusIcon.style.display = 'none';
        statusIcon.classList.remove('fa-xmark', 'fa-check');
        
        if (usernameInput.value.trim().length > 0) {
            loadingIcon.style.display = 'inline-block';
            avatarImg.src = `https://ui-avatars.com/api/?name=?&background=random`;
            typingTimer = setTimeout(async () => {
                const username = usernameInput.value.trim();
                try {
                    const userId = await getRobloxUserId(username);
                    const avatarUrl = await getRobloxAvatar(userId);
                    avatarImg.src = avatarUrl;
                    statusIcon.classList.add('fa-check');
                    statusIcon.style.color = 'var(--success)';
                    statusIcon.style.display = 'inline-block';
                    isRobloxValid = true;
                } catch (error) {
                    statusIcon.classList.add('fa-xmark');
                    statusIcon.style.color = 'var(--danger)';
                    statusIcon.style.display = 'inline-block';
                    avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random`;
                } finally {
                    loadingIcon.style.display = 'none';
                }
            }, doneTypingInterval);
        } else {
            loadingIcon.style.display = 'none';
            avatarImg.src = "https://ui-avatars.com/api/?name=?&background=random";
        }
    });
}

// ==========================================
// PROSES PEMBELIAN (CHECKOUT)
// ==========================================
window.selectPaymentUI = function(val, el) {
    document.querySelectorAll('input[name="payment_method"]').forEach(input => { input.parentElement.classList.remove('active'); });
    el.classList.add('active'); el.querySelector('input').checked = true;
    window.calculateDirectBuyTotal();
};

window.openDirectBuyModal = function(brandName) {
    const brandObj = groupedBrands.find(b => b.brandName === brandName);
    if(!brandObj) return;
    if(brandObj.isGangguan) { window.customAlert('Maintenance Server', 'Mohon maaf, produk sedang gangguan.', 'warning'); return; }
    
    currentCheckoutBrand = brandObj; selectedProductForBuy = null; appliedPromo = null;
    isRobloxValid = false; // Reset validasi Roblox
    
    if (typeof grecaptcha !== 'undefined') grecaptcha.reset();
    
    document.getElementById('buy-promo-code').value = '';
    document.getElementById('buy-promo-msg').innerHTML = '';
    document.getElementById('buy-brand-name').innerText = brandObj.brandName;
    document.getElementById('buy-brand-badge').innerText = brandObj.type === 'game' ? 'TOP UP GAME' : 'APLIKASI PREMIUM';
    
    const imgEl = document.getElementById('buy-brand-img');
    if(brandObj.imgUrlBase64) { imgEl.src = brandObj.imgUrlBase64; imgEl.style.display = 'block'; }
    else { imgEl.style.display = 'none'; }
    
    const itemGrid = document.getElementById('buy-item-grid');
    const sortedItems = [...brandObj.items].sort((a, b) => (a.priceNum||0) - (b.priceNum||0));
    
    let html = '';
    sortedItems.forEach(item => {
        const normalPrice = item.priceNum || 0;
        const isSold = item.soldOut;
        let badgeHtml = item.processType === 'manual' ? `<span class="discount-badge" style="background:var(--warning);">Manual</span>` : '';
        let priceHtml = `<div class="price-wrapper"><span class="price-normal">Rp${normalPrice.toLocaleString('id-ID')}</span></div>`;
        
        html += `
            <div class="item-card ${isSold ? 'sold-out' : ''}" id="buy-card-${item.dbId}" onclick="${isSold ? '' : `window.selectItemToBuy('${item.dbId}')`}">
                ${badgeHtml}
                <h4>${item.name}</h4>
                ${priceHtml}
            </div>
        `;
    });
    itemGrid.innerHTML = html;
    
    const fields = document.getElementById('buy-detail-fields');
    fields.innerHTML = ''; // Reset Form
    
    let inpType = brandObj.items[0]?.inputType || 'id_zone';
    let fmtDesc = brandObj.desc ? brandObj.desc.replace(/\n/g, '<br>') : '';
    let extraDesc = fmtDesc ? `<p style="font-size:0.8rem; color:var(--primary-light); background:rgba(37,99,235,0.1); padding:8px; border-radius:8px; margin-bottom:10px;"><i class="fa-solid fa-circle-info"></i> ${fmtDesc}</p>` : '';
    
    let isRoblox = brandObj.brandName.toLowerCase().includes('roblox');
    
    if(brandObj.type === 'game') {
        if (isRoblox) {
            const tpl = document.getElementById('roblox-checker-template');
            if (tpl) {
                fields.appendChild(tpl.content.cloneNode(true));
                initRobloxChecker();
            }
        } else {
            isRobloxValid = true; // Auto valid untuk game non-roblox
            if(inpType === 'id_only') {
                fields.innerHTML = `
                    ${extraDesc}
                    <div class="form-group">
                        <label for="buy-id">ID Player / Target (Wajib)</label>
                        <input type="text" id="buy-id" class="form-control" placeholder="Contoh: 123456789" required>
                        <small style="color:var(--danger); display:block; margin-top:5px; font-weight:bold;">*Kesalahan penulisan ID bukan tanggung jawab sistem.</small>
                    </div>`;
            } else if(inpType === 'custom') {
                fields.innerHTML = `
                    ${extraDesc}
                    <div class="form-group">
                        <label for="buy-id">Informasi Akun / Server / Karakter (Wajib)</label>
                        <input type="text" id="buy-id" class="form-control" placeholder="Contoh: Server Asia, Nickname Budi" required>
                        <small style="color:var(--danger); display:block; margin-top:5px; font-weight:bold;">*Kesalahan penulisan data bukan tanggung jawab sistem.</small>
                    </div>`;
            } else {
                fields.innerHTML = `
                    ${extraDesc}
                    <div class="form-group">
                        <label for="buy-id">ID Player (Wajib)</label>
                        <input type="text" id="buy-id" class="form-control" placeholder="Contoh: 12345678" required>
                        <small style="color:var(--danger); display:block; margin-top:5px; font-weight:bold;">*Kesalahan penulisan ID bukan tanggung jawab sistem.</small>
                    </div>
                    <div class="form-group">
                        <label for="buy-zone">Zone ID / Server</label>
                        <input type="text" id="buy-zone" class="form-control" placeholder="Contoh: 1234">
                    </div>`;
            }
        }
    } else {
        isRobloxValid = true;
        fields.innerHTML = `
            ${extraDesc}
            <p style="font-size:0.85rem; color:var(--text-muted); text-align:center; padding: 1.2rem; background:rgba(37,99,235,0.08); border-radius:10px; border:1px dashed var(--primary-light);">Informasi akun premium akan dikirimkan otomatis setelah sukses dibayar.</p>`;
    }
    
    const emailInput = document.getElementById('buy-email');
    if(currentUser && !currentUser.isAnonymous && currentUser.email) {
        emailInput.value = currentUser.email;
    } else {
        emailInput.value = '';
    }
    
    const defaultPayCard = document.querySelector('input[name="payment_method"][value="qris"]');
    if(defaultPayCard) window.selectPaymentUI('qris', defaultPayCard.parentElement);
    
    window.calculateDirectBuyTotal();
    window.openModal('modal-buy-direct');
};

window.selectItemToBuy = function(dbId) {
    selectedProductForBuy = currentCheckoutBrand.items.find(i => i.dbId === dbId);
    document.querySelectorAll('.item-card').forEach(el => el.classList.remove('selected'));
    document.getElementById(`buy-card-${dbId}`).classList.add('selected');
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
        appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)">Kode promo tidak valid/aktif.</span>`;
    } else if (p.usedCount >= p.maxUses) {
        appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)">Kode promo melampaui kuota.</span>`;
    } else if (p.targetBrand !== 'all' && p.targetBrand !== currentCheckoutBrand.brandName) {
        appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)">Khusus produk ${p.targetBrand}.</span>`;
    } else if (p.targetUser === 'new') {
        const hasOrders = currentUser && orders.some(o => o.userEmail === currentUser.email);
        if (hasOrders) {
            appliedPromo = null; msgEl.innerHTML = `<span style="color:var(--danger)">Khusus Transaksi Pertama.</span>`;
        } else { 
            appliedPromo = { dbId: p.dbId, code: p.code, amount: p.amount, type: p.type || 'nominal' };
            msgEl.innerHTML = `<span style="color:var(--success)"><i class="fa-solid fa-check"></i> Promo berhasil dipakai!</span>`;
        }
    } else {
        appliedPromo = { dbId: p.dbId, code: p.code, amount: p.amount, type: p.type || 'nominal' };
        msgEl.innerHTML = `<span style="color:var(--success)"><i class="fa-solid fa-check"></i> Promo berhasil dipakai!</span>`;
    }
    window.calculateDirectBuyTotal();
};

window.calculateDirectBuyTotal = function() {
    const btnProc = document.getElementById('btn-process-buy');
    
    if(!selectedProductForBuy) {
        document.getElementById('buy-total-price').innerText = 'Rp0';
        btnProc.innerText = 'Pilih Item Dahulu'; btnProc.disabled = true; return;
    }
    
    let baseTotal = selectedProductForBuy.priceNum;
    let disc = 0;
    
    if(appliedPromo) {
        if(appliedPromo.type === 'percent') disc = Math.round(baseTotal * (appliedPromo.amount / 100));
        else disc = appliedPromo.amount;
        
        if(disc > baseTotal) disc = baseTotal;
        baseTotal -= disc;
    } 
    
    document.getElementById('buy-total-price').innerText = `Rp${baseTotal.toLocaleString('id-ID')}`;
    
    if (siteSettings.isStoreOpen === false) {
        btnProc.innerText = 'Toko Sedang Tutup'; btnProc.disabled = true;
        btnProc.style.background = 'var(--danger)'; btnProc.style.boxShadow = 'none'; return;
    }
    
    btnProc.style.background = 'var(--primary-gradient)';
    btnProc.innerHTML = '<i class="fa-solid fa-cart-shopping"></i> Checkout & Bayar'; btnProc.disabled = false;
};

window.processDirectCheckout = async function() {
    if(!selectedProductForBuy) return;
    
    // Anti-Bot Validator (reCAPTCHA v2)
    if (typeof grecaptcha !== 'undefined') {
        const recaptchaResponse = grecaptcha.getResponse();
        if(recaptchaResponse.length === 0) {
            window.customAlert('Verifikasi Gagal', 'Harap centang kotak reCAPTCHA untuk memvalidasi bahwa Anda manusia.', 'warning');
            return;
        }
    }
    
    const emailInput = document.getElementById('buy-email').value.trim();
    if(!emailInput || !emailInput.includes('@')) { 
        window.customAlert('Peringatan', 'Alamat Email wajib diisi dengan format yang benar!', 'warning'); 
        return; 
    }
    
    let playerInfo = '';
    let isRobloxType = currentCheckoutBrand.brandName.toLowerCase().includes('roblox');
    
    if(currentCheckoutBrand.type === 'game') {
        const pid = document.getElementById('buy-id').value.trim();
        const zol = document.getElementById('buy-zone') ? document.getElementById('buy-zone').value.trim() : '';
        
        if(!pid) { window.customAlert('Peringatan', 'Target tujuan wajib diisi!', 'warning'); return; }
        
        if(isRobloxType && !isRobloxValid) {
            window.customAlert('Validasi Roblox', 'Username Roblox belum ditemukan. Pastikan ketikan benar dan tunggu centang hijau.', 'warning');
            return;
        }
        
        let inpType = currentCheckoutBrand.items[0]?.inputType || 'id_zone';
        if(isRobloxType) playerInfo = `Roblox User: ${pid}`;
        else if(inpType === 'id_only') playerInfo = `ID: ${pid}`;
        else if(inpType === 'custom') playerInfo = `Info: ${pid}`;
        else playerInfo = `ID: ${pid} | Zone: ${zol}`;
    } else {
        playerInfo = `Akun Premium (Delivery Type: ${selectedProductForBuy.processType === 'manual' ? 'Manual' : 'Auto'})`;
    }
    
    // Guest Account Generation
    let targetUserEmail = emailInput;
    if(!currentUser || currentUser.isAnonymous) {
        try {
            const guestId = "GUEST_" + Date.now();
            await setDoc(doc(db, pathUsers, guestId), { 
                email: emailInput, 
                name: emailInput.split('@')[0], 
                role: 'guest', 
                emailVerified: false, 
                isTemporary: true,
                createdAt: new Date().toISOString() 
            });
        } catch (e) { console.error("Gagal buat akun guest:", e); }
    }
    
    let rawTotal = selectedProductForBuy.priceNum;
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
        items: [singleItem], finalTotal: finalTotal, baseTotal: baseTotal,
        uniqueCode: uniqueCode, promoCode: promoUsedCode, promoDiscount: discountPromo,
        status: paymentMethod === 'cash' ? 'PENDING' : 'UNPAID',
        paymentMethod: paymentMethod, adminReply: '', date: new Date().toISOString()
    };
    
    try {
        const docRef = await addDoc(collection(db, pathOrders), newOrder);
        currentCheckoutSession = { dbId: docRef.id, id: invId, finalTotal: finalTotal, method: paymentMethod, date: newOrder.date };
        
        if(appliedPromo) {
            await updateDoc(doc(db, pathPromos, appliedPromo.dbId), { usedCount: increment(1) }).catch(e=>{});
        }
        
        window.closeModal('modal-buy-direct');
        if (typeof grecaptcha !== 'undefined') grecaptcha.reset();
        
        if(paymentMethod === 'qris') setTimeout(() => window.openQRISModal(), 300);
        else window.finishCashOrder();
    } catch (e) { 
        window.customAlert("Error", "Gagal menghubungkan pesanan ke server, coba lagi.", "error"); 
    }
};

window.finishCashOrder = function() {
    let adminWaNum = siteSettings.adminWa || '085656321860';
    if (adminWaNum.startsWith('0')) adminWaNum = '62' + adminWaNum.substring(1);
    
    const waText = `Halo Admin Vipercell, saya melakukan pesanan dengan metode CASH/Manual.\n\n*Invoice ID:* ${currentCheckoutSession.id}\n*Total Bayar:* Rp${currentCheckoutSession.finalTotal.toLocaleString('id-ID')}\n\nMohon dicek ya Min.`;
    const waUrl = `https://wa.me/${adminWaNum}?text=${encodeURIComponent(waText)}`;
    
    const successMsg = `ID Pesanan Anda: <strong style="color:var(--primary-light)">${currentCheckoutSession.id}</strong><br><br><span style="color:var(--warning); font-weight:bold;">PENTING:</span> Segera hubungi admin untuk melakukan konfirmasi transfer. Pesanan akan masuk setelah divalidasi.`;
    
    document.getElementById('ca-extra-action').innerHTML = `
        <a href="${waUrl}" target="_blank" class="btn btn-primary" style="display:flex; justify-content:center; width:100%; margin-top:15px; font-weight:bold; padding: 12px; font-size:1rem; box-shadow: 0 5px 15px rgba(37,99,235,0.4);">
            <i class="fa-brands fa-whatsapp" style="font-size:1.2rem; margin-right:8px;"></i> Hubungi Admin Sekarang
        </a>`;
        
    window.customAlert('Menunggu Pembayaran', successMsg, 'info');
    currentCheckoutSession = null;
    if(currentUser && !currentUser.isAnonymous) window.switchMainTab('pesanan');
};

// ==========================================
// DYNAMIC QRIS (CRC16 CCITT-FALSE)
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
        if (idx !== -1) {
            base = rawQris.substring(0, idx + 4);
        } else {
            return rawQris; // Format tidak dikenal, kembalikan mentah
        }
    }
    
    let tag54 = "54" + String(amount).length.toString().padStart(2, '0') + amount;
    let newBase;
    
    if (base.includes("5802ID")) {
        newBase = base.replace("5802ID", tag54 + "5802ID");
    } else {
        newBase = base.replace("6304", tag54 + "6304");
    }
    
    return newBase + calculateCrc16Ccitt(newBase);
}

window.startQrisTimer = function(orderDate) {
    clearInterval(qrisInterval);
    const timerEl = document.getElementById('qris-timer-display');
    const timeText = document.getElementById('qris-time-left');
    if(!timerEl || !timeText) return;
    
    timerEl.style.display = 'block';
    const startTime = new Date(orderDate).getTime();
    
    qrisInterval = setInterval(() => {
        const diff = Date.now() - startTime;
        const remain = 240000 - diff; // 4 Menit
        
        if(remain <= 0) {
            clearInterval(qrisInterval);
            timeText.innerText = "EXPIRED"; timeText.style.color = "var(--danger)";
        } else {
            const m = Math.floor(remain / 60000);
            const s = Math.floor((remain % 60000) / 1000);
            timeText.innerText = `0${m}:${s < 10 ? '0'+s : s}`;
        }
    }, 1000);
};

window.openQRISModal = function() {
    const qrisDisplayBox = document.getElementById('qris-qrcode-display');
    const qrErrorMsg = document.getElementById('qris-error-msg');
    const qrisRawStr = siteSettings.qrisImageBase64; // Asumsi admin menyimpan String QRIS Mentah di field ini
    
    if(qrisRawStr) {
        qrisDisplayBox.style.display = 'flex'; 
        qrErrorMsg.style.display = 'none';
        qrisDisplayBox.innerHTML = ''; // Kosongkan canvas lama
        
        const finalDynamicStr = buildDynamicQris(qrisRawStr, currentCheckoutSession.finalTotal);
        new QRCode(qrisDisplayBox, {
            text: finalDynamicStr || qrisRawStr,
            width: 220,
            height: 220,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
    } else {
        qrisDisplayBox.style.display = 'none'; 
        qrErrorMsg.style.display = 'block';
    }
    
    document.getElementById('pay-total-display').innerText = `Rp${currentCheckoutSession.finalTotal.toLocaleString('id-ID')}`;
    if(currentCheckoutSession.date) window.startQrisTimer(currentCheckoutSession.date);
    
    window.openModal('modal-payment');
};

window.copyNominal = function() {
    if(!currentCheckoutSession) return;
    const nominal = currentCheckoutSession.finalTotal.toString();
    navigator.clipboard.writeText(nominal).then(() => {
        const btn = document.getElementById('btn-copy-nominal');
        if(!btn) return;
        const oldHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Disalin';
        btn.style.backgroundColor = '#10b981'; btn.style.color = 'white';
        setTimeout(() => {
            btn.innerHTML = oldHtml; btn.style.backgroundColor = 'transparent'; btn.style.color = 'var(--text)';
        }, 2000);
    });
};

window.resumePayment = function(dbId) {
    window.closeModal('modal-cek-pesanan'); 
    setTimeout(() => {
        const order = orders.find(o => o.dbId === dbId);
        if(!order) return;
        currentCheckoutSession = { dbId: order.dbId, id: order.id, finalTotal: order.finalTotal, method: order.paymentMethod, date: order.date };
        if(order.paymentMethod === 'cash') window.finishCashOrder();
        else window.openQRISModal();
    }, 300); 
};

window.downloadQRIS = function() {
    const qrisDisplayBox = document.getElementById('qris-qrcode-display');
    const canvas = qrisDisplayBox.querySelector('canvas');
    if (canvas) {
        const link = document.createElement('a');
        link.download = `QRIS-Vipercell.png`; link.href = canvas.toDataURL("image/png"); link.click();
    } else {
        window.customAlert("Gagal", "Tidak ada gambar QRIS valid yang dirender.", "error");
    }
};

window.goToPesananFromPay = function() {
    window.closeModal('modal-payment');
    const orderIdToTrack = currentCheckoutSession ? currentCheckoutSession.id : '';
    currentCheckoutSession = null;
    
    if(currentUser && !currentUser.isAnonymous) window.switchMainTab('pesanan');
    else if (orderIdToTrack) {
        document.getElementById('track-id').value = orderIdToTrack;
        window.trackOrder(); window.openModal('modal-cek-pesanan');
    }
};

// ==========================================
// FITUR BANTUAN & LACAK PESANAN
// ==========================================
function generateHelpButtons(invId, orderStatus, item) {
    let adminWaNum = siteSettings.adminWa || '085656321860';
    if (adminWaNum.startsWith('0')) adminWaNum = '62' + adminWaNum.substring(1);
    
    let actionBtn = '';
    if (orderStatus === 'PENDING') {
        const msg = encodeURIComponent(`Halo Admin, saya sudah transfer/bayar untuk pesanan *${invId}*. Tolong dicek ya Min.`);
        actionBtn = `<a href="https://wa.me/${adminWaNum}?text=${msg}" target="_blank" class="btn btn-warning" style="width:100%; font-weight:bold;"><i class="fa-brands fa-whatsapp"></i> Konfirmasi Pembayaran</a>`;
    } else if (orderStatus === 'SUCCESS') {
        if (item?.processType === 'manual') {
            const msg = encodeURIComponent(`Halo Admin, pesanan *${invId}* saya statusnya SUKSES (Manual). Mohon segera dikirim ya.`);
            actionBtn = `<a href="https://wa.me/${adminWaNum}?text=${msg}" target="_blank" class="btn btn-primary" style="width:100%; font-weight:bold;"><i class="fa-brands fa-whatsapp"></i> Hubungi Admin (Kirim Pesanan)</a>`;
        } else {
            const msg = encodeURIComponent(`Halo Admin, saya butuh bantuan untuk pesanan otomatis ID: ${invId}.`);
            actionBtn = `<a href="https://wa.me/${adminWaNum}?text=${msg}" target="_blank" class="btn btn-success" style="width:100%; font-weight:bold;"><i class="fa-solid fa-circle-info"></i> Bantuan / Info Klaim</a>`;
        }
    } else if (orderStatus === 'EXPIRED') {
        const msg = encodeURIComponent(`Halo Admin, saya sudah membayar untuk pesanan *${invId}* namun statusnya Expired di web. Mohon bantuannya.`);
        actionBtn = `<a href="https://wa.me/${adminWaNum}?text=${msg}" target="_blank" class="btn btn-danger" style="width:100%; font-weight:bold;"><i class="fa-brands fa-whatsapp"></i> Komplain Pembayaran Expired</a>`;
    }
    
    if(!actionBtn) return '';
    return `
    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed var(--border);">
        <p style="font-size: 0.8rem; color:var(--text-muted); margin-bottom: 8px;">Pusat Bantuan Layanan:</p>
        <div style="display:flex; flex-direction:column; gap:8px;">${actionBtn}</div>
    </div>`;
}

window.refreshOrderData = function() {
    if(currentUser && !currentUser.isAnonymous) window.renderUserOrders();
    const trackModal = document.getElementById('modal-cek-pesanan');
    if(trackModal && trackModal.classList.contains('active')) window.trackOrder();
    
    const btnRefresh = document.querySelector('.section-header .btn-outline');
    if(btnRefresh) {
        const ogText = btnRefresh.innerHTML;
        btnRefresh.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Data Terbaru';
        setTimeout(() => { btnRefresh.innerHTML = ogText; }, 1000);
    }
};

window.forceRefreshOrder = function(invId) { document.getElementById('track-id').value = invId; window.trackOrder(); };

window.trackOrder = function() {
    const invId = document.getElementById('track-id').value.trim().toUpperCase();
    if(!invId) return;
    const order = orders.find(o => o.id === invId);
    const resBox = document.getElementById('track-result');
    
    if(!order) {
        resBox.style.display = 'block';
        resBox.innerHTML = `<p style="color:var(--danger); background:var(--surface); padding:1rem; border-radius:8px; border:1px solid var(--border);"><i class="fa-solid fa-xmark"></i> Pesanan tidak ditemukan.</p>`;
        return; 
    }
    const sBadge = order.status === 'UNPAID' ? 'status-unpaid' : order.status === 'PENDING' ? 'status-pending' : order.status === 'FAILED' ? 'status-failed' : order.status === 'EXPIRED' ? 'status-failed' : 'status-success';
    const sName = order.status === 'UNPAID' ? 'Belum Dibayar' : order.status === 'PENDING' ? 'Menunggu Proses' : order.status === 'FAILED' ? 'Gagal/Batal' : order.status === 'EXPIRED' ? 'Waktu Expired' : 'Sukses & Selesai';
    
    let actionHtml = '';
    if (order.status === 'UNPAID') actionHtml = `<button class="btn btn-primary" style="width:100%; margin-top:1rem;" onclick="window.resumePayment('${order.dbId}')">Lanjut Selesaikan Pembayaran</button>`;
    
    let successAnimHtml = (order.status === 'SUCCESS') ? `
        <div class="payment-success-anim">
            <div class="checkmark-circle"><i class="fa-solid fa-check"></i></div>
            <h3 style="color: var(--success); font-weight: 800; font-size: 1.5rem;">Pembayaran Berhasil!</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem;">Pesanan kamu sudah terverifikasi sistem.</p>
        </div>` : '';
        
    let replyHtml = '';
    if (order.status === 'SUCCESS') {
        if (order.adminReply) {
            replyHtml = `
            <div class="auto-delivery-box reveal-visible">
                <div class="auto-delivery-title"><i class="fa-solid fa-envelope-open-text"></i> Detail Info Pesanan / Akun</div>
                <div class="auto-delivery-data">${order.adminReply}</div>
            </div>`;
        } else {
            if (order.items[0]?.processType === 'manual') {
                replyHtml = `
                <div class="auto-delivery-box reveal-visible" style="border-color:var(--primary-light); background: rgba(37, 99, 235, 0.08);">
                    <div class="auto-delivery-title" style="color:var(--primary-light);"><i class="fa-solid fa-user-clock"></i> Proses Manual Admin</div>
                    <div class="auto-delivery-data" style="color:var(--text-muted); background:transparent; border:none; padding:0;">Pembayaran berhasil. Pesanan ini diproses manual, mohon tunggu sebentar.</div>
                </div>`;
            } else {
                replyHtml = `
                <div class="auto-delivery-box reveal-visible" style="border-color:var(--warning);">
                    <div class="auto-delivery-title" style="color:var(--warning);"><i class="fa-solid fa-clock"></i> Menunggu Stok Sistem</div>
                    <div class="auto-delivery-data" style="color:var(--text-muted); background:transparent; border:none; padding:0;">Pembayaran sukses. Stok otomatis sedang antre untuk dikirim, mohon ditunggu.</div>
                </div>`;
            }
        }
    }
    
    let detailGameHtml = '';
    if (order.items[0]?.type === 'game') {
        detailGameHtml = `
        <div style="background:rgba(37,99,235,0.05); padding:10px; border-radius:8px; border:1px dashed var(--primary-light); margin-top:5px;">
            <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom: 2px;">Data / Tujuan Game:</div>
            <div style="font-size:0.85rem; color:var(--text); font-weight:600;">${order.items[0].playerInfo}</div>
        </div>`;
    } else {
        detailGameHtml = `<div style="font-size: 0.8rem; color: var(--text-muted);">${order.items[0].playerInfo}</div>`;
    }
    
    const helpHtml = generateHelpButtons(order.id, order.status, order.items[0]);
    
    resBox.style.display = 'block';
    resBox.innerHTML = `
    ${successAnimHtml}
    <div class="receipt-card receipt-anim" style="margin-top:0; position:relative;">
        <div class="receipt-header">
            <div>
                <div style="color:var(--text-muted); font-size: 0.75rem;">INVOICE</div>
                <div style="color:var(--primary-light); font-weight: 800; font-size: 1.1rem; letter-spacing: 1px;">${order.id}</div>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
                <span class="status-badge ${sBadge}">${sName}</span>
                <button class="btn btn-outline" style="padding:4px 8px; border-radius:50%; font-size:0.8rem;" onclick="window.forceRefreshOrder('${order.id}')" title="Refresh"><i class="fa-solid fa-rotate-right"></i></button>
            </div>
        </div>
        <div class="receipt-body">
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 15px;">
                <i class="fa-regular fa-clock"></i> ${new Date(order.date).toLocaleString('id-ID')}
            </div>
            <div style="border-left: 2px solid var(--primary); padding-left: 10px; margin-bottom: 15px;">
                ${order.items.map(i => `<div style="font-weight: 600; color: var(--text);">${i.name}</div>`).join('')}
                ${detailGameHtml}
            </div>
            ${replyHtml}
        </div>
        <div class="receipt-footer">
            <div class="receipt-row">
                <span style="color:var(--text-muted);">Harga Normal</span>
                <span>Rp${(order.baseTotal + order.promoDiscount).toLocaleString('id-ID')}</span>
            </div>
            ${order.promoDiscount > 0 ? `
            <div class="receipt-row">
                <span style="color:var(--success);">Promo (${order.promoCode})</span>
                <span style="color:var(--success);">-Rp${order.promoDiscount.toLocaleString('id-ID')}</span>
            </div>` : ''}
            <div class="receipt-row">
                <span style="color:var(--warning);">Kode Unik</span>
                <span style="color:var(--warning);">+Rp${order.uniqueCode || 0}</span>
            </div>
            <div class="receipt-row" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border);">
                <strong style="font-size: 1.1rem; color: var(--text);">Total Bayar</strong>
                <strong style="font-size: 1.1rem; color: var(--primary-light);">Rp${order.finalTotal.toLocaleString('id-ID')}</strong>
            </div>
            ${actionHtml}
            ${helpHtml}
        </div>
    </div>`;
};

window.renderUserOrders = function() {
    const grid = document.getElementById('user-order-grid');
    if(!grid) return;
    
    if(!currentUser || currentUser.isAnonymous) { grid.innerHTML = ''; return; }
    
    const userOrders = orders.filter(o => o.userEmail === currentUser.email);
    
    if(userOrders.length === 0) {
        grid.innerHTML = '<div style="text-align:center; padding: 2rem; color:var(--text-muted);">Belum ada riwayat pesanan.</div>'; return;
    }
    
    let html = '';
    const renderLimit = userOrders.slice(0, 50);  
    
    renderLimit.forEach((o, index) => {
        const sBadge = o.status === 'UNPAID' ? 'status-unpaid' : o.status === 'PENDING' ? 'status-pending' : o.status === 'FAILED' ? 'status-failed' : o.status === 'EXPIRED' ? 'status-failed' : 'status-success';
        const sName = o.status === 'UNPAID' ? 'Belum Dibayar' : o.status === 'PENDING' ? 'Proses Antrian' : o.status === 'FAILED' ? 'Dibatalkan' : o.status === 'EXPIRED' ? 'Waktu Expired' : 'Selesai';
        
        let replyHtml = '';
        if (o.status === 'SUCCESS') {
            if (o.adminReply) {
                replyHtml = `
                <div class="auto-delivery-box reveal-visible">
                    <div class="auto-delivery-title"><i class="fa-solid fa-envelope-open-text"></i> Detail Info Pesanan / Akun</div>
                    <div class="auto-delivery-data">${o.adminReply}</div>
                </div>`;
            } else {
                if (o.items[0]?.processType === 'manual') {
                    replyHtml = `
                    <div class="auto-delivery-box reveal-visible" style="border-color:var(--primary-light); background: rgba(37, 99, 235, 0.08);">
                        <div class="auto-delivery-title" style="color:var(--primary-light);"><i class="fa-solid fa-user-clock"></i> Proses Manual Admin</div>
                        <div class="auto-delivery-data" style="color:var(--text-muted); background:transparent; border:none; padding:0;">Pembayaran berhasil terverifikasi. Pesanan ini diproses secara manual.</div>
                    </div>`;
                } else {
                    replyHtml = `
                    <div class="auto-delivery-box reveal-visible" style="border-color:var(--warning);">
                        <div class="auto-delivery-title" style="color:var(--warning);"><i class="fa-solid fa-clock"></i> Menunggu Stok Sistem</div>
                        <div class="auto-delivery-data" style="color:var(--text-muted); background:transparent; border:none; padding:0;">Pembayaran sukses, stok otomatis sedang antre diproses.</div>
                    </div>`;
                }
            }
        }
        
        let detailGameHtml = '';
        if (o.items[0]?.type === 'game') {
            detailGameHtml = `
            <div style="background:rgba(37,99,235,0.05); padding:10px; border-radius:8px; border:1px dashed var(--primary-light); margin-top:5px;">
                <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom: 2px;">Data / Tujuan Game:</div>
                <div style="font-size:0.85rem; color:var(--text); font-weight:600;">${o.items[0].playerInfo}</div>
            </div>`;
        } else {
            detailGameHtml = `<div style="font-size: 0.8rem; color: var(--text-muted);">${o.items[0].playerInfo}</div>`;
        }
        
        let actionHtml = (o.status === 'UNPAID') 
             ? `<button class="btn btn-primary" style="width:100%; margin-top:1rem;" onclick="window.resumePayment('${o.dbId}')">Lanjut Selesaikan Pembayaran</button>`
            : '';
            
        const helpHtml = generateHelpButtons(o.id, o.status, o.items[0]);
        const animDelay = (index * 0.1) + 's';
        
        html += `
            <div class="receipt-card receipt-anim" style="animation-delay: ${animDelay}; width: 100%; position:relative; margin-bottom:1rem;">
                <div class="receipt-header">
                    <div>
                        <div style="color:var(--text-muted); font-size: 0.75rem;">INVOICE</div>
                        <div style="color:var(--primary-light); font-weight: 800; font-size: 1.1rem; letter-spacing: 1px;">${o.id}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span class="status-badge ${sBadge}">${sName}</span>
                        <button class="btn btn-outline" style="padding:4px 8px; border-radius:50%; font-size:0.8rem;" onclick="window.refreshOrderData()" title="Refresh"><i class="fa-solid fa-rotate-right"></i></button>
                    </div>
                </div>
                <div class="receipt-body">
                    <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 15px;">
                        <i class="fa-regular fa-clock"></i> ${new Date(o.date).toLocaleString('id-ID')}
                    </div>
                    <div style="border-left: 2px solid var(--primary); padding-left: 10px; margin-bottom: 15px;">
                        ${o.items.map(i => `<div style="font-weight: 600; color: var(--text);">${i.name}</div>`).join('')}
                        ${detailGameHtml}
                    </div>
                    ${replyHtml}
                </div>
                <div class="receipt-footer">
                    <div class="receipt-row">
                        <span style="color:var(--text-muted);">Harga Normal</span>
                        <span>Rp${(o.baseTotal + o.promoDiscount).toLocaleString('id-ID')}</span>
                    </div>
                    ${o.promoDiscount > 0 ? `
                    <div class="receipt-row">
                        <span style="color:var(--success);">Promo (${o.promoCode})</span>
                        <span style="color:var(--success);">-Rp${o.promoDiscount.toLocaleString('id-ID')}</span>
                    </div>` : ''}
                    <div class="receipt-row">
                        <span style="color:var(--warning);">Kode Unik</span>
                        <span style="color:var(--warning);">+Rp${o.uniqueCode || 0}</span>
                    </div>
                    <div class="receipt-row" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border);">
                        <strong style="font-size: 1.1rem; color: var(--text);">Total Bayar</strong>
                        <strong style="font-size: 1.1rem; color: var(--primary-light);">Rp${o.finalTotal.toLocaleString('id-ID')}</strong>
                    </div>
                    ${actionHtml}
                    ${helpHtml}
                </div>
            </div>`;
    });
    
    if(userOrders.length > 50) html += `<div style="text-align:center; padding: 1rem; color:var(--text-muted);">Menampilkan 50 riwayat pesanan terbaru.</div>`;
    grid.innerHTML = html;
    setTimeout(observeReveals, 100);
};

// Inisialisasi Aplikasi
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initApp); } 
else { initApp(); }