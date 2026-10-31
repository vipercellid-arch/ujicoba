/* ============================================================================
 * VIPERCELL PURE VPS MYSQL & AUTH CLIENT SDK (v31.2)
 * Nama File : js/vps_db.js
 * Terhubung 100% langsung ke Server VPS MySQL (https://api.vipercell.cloud)
 * Tanpa ketergantungan layanan eksternal pihak ketiga.
 * ============================================================================ */

export const app = { name: "vipercell-vps-app" };
export const analytics = null;
export const browserLocalPersistence = "LOCAL";
export const indexedDBLocalPersistence = "INDEXED_DB";

export class GoogleAuthProvider {
    setCustomParameters() {}
}
export class EmailAuthProvider {
    static credential(email, password) {
        return { email, password, providerId: "password" };
    }
}

const MYSQL_SESSION_STORAGE_KEY = "vipercell_mysql_auth_user_v31";
const MYSQL_TOKEN_STORAGE_KEY = "vipercell_mysql_jwt_v31";

export function getMysqlApiBaseUrl() {
    try {
        const customUrl = localStorage.getItem("vipercell_api_base_url");
        if (customUrl && customUrl.startsWith("http")) {
            return customUrl.replace(/\/api\/digiflazz.*$/i, "").replace(/\/+$/, "");
        }
    } catch (_) {}
    return "https://api.vipercell.cloud";
}

function getBridgeSecretKey() {
    try {
        return localStorage.getItem("vipercell_bridge_secret_v31") || "VIPERCELL_BRIDGE_SECRET_2026";
    } catch (_) {
        return "VIPERCELL_BRIDGE_SECRET_2026";
    }
}

function getAuthToken() {
    try {
        return localStorage.getItem(MYSQL_TOKEN_STORAGE_KEY) || "";
    } catch (_) {
        return "";
    }
}

export async function callMysqlApi(endpointPath, payload = {}, method = "POST") {
    const baseUrl = getMysqlApiBaseUrl();
    const headers = {
        "Content-Type": "application/json",
        "X-Vipercell-Bridge-Key": getBridgeSecretKey()
    };
    const token = getAuthToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const opts = { method, headers };
    if (method !== "GET" && method !== "HEAD") {
        opts.body = JSON.stringify(payload || {});
    }

    const res = await fetch(`${baseUrl}${endpointPath}`, opts);
    const data = await res.json().catch(() => ({ ok: false, message: "Respon server bukan JSON valid" }));
    if (!res.ok || data.ok === false) {
        const err = new Error(data.message || `HTTP Error ${res.status}`);
        err.code = data.code || `mysql/http-${res.status}`;
        throw err;
    }
    return data;
}

if (typeof window !== "undefined") {
    window.callVipercellMysqlApiV311 = callMysqlApi;
    window.getVipercellMysqlBaseUrlV311 = getMysqlApiBaseUrl;
}

function readLocalColCache(colName) {
    try {
        const raw = localStorage.getItem(`vpc_mysql_col_${colName}`);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === "object") ? parsed : {};
    } catch (_) {
        return {};
    }
}

function writeLocalColCache(colName, mapObj) {
    try {
        localStorage.setItem(`vpc_mysql_col_${colName}`, JSON.stringify(mapObj || {}));
    } catch (_) {}
}

// ============================================================================
// ENGINE AUTENTIKASI MURNI VPS MYSQL
// ============================================================================
const authListeners = new Set();

function enhanceUserObject(u) {
    if (!u) return null;
    return {
        uid: String(u.uid),
        email: String(u.email || "").toLowerCase(),
        displayName: String(u.displayName || u.name || u.email?.split("@")[0] || "Member"),
        phoneNumber: String(u.phone || u.phoneNumber || ""),
        photoURL: String(u.photoURL || ""),
        emailVerified: true,
        isAnonymous: Boolean(u.isAnonymous),
        isGuest: Boolean(u.isAnonymous),
        role: String(u.role || "user"),
        providerData: u.providerData || [{ providerId: u.providerId || "password" }],
        getIdToken: async () => getAuthToken(),
        reload: async () => {}
    };
}

function loadSavedMysqlUser() {
    try {
        const raw = localStorage.getItem(MYSQL_SESSION_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.uid) return enhanceUserObject(parsed);
    } catch (_) {}
    return null;
}

export const auth = {
    currentUser: loadSavedMysqlUser(),
    name: "vipercell-mysql-auth"
};

function notifyAuthStateChanged() {
    const snapUser = auth.currentUser;
    authListeners.forEach(cb => {
        try { cb(snapUser); } catch (e) { console.error("Auth listener error:", e); }
    });
}

function persistAuthUser(userObj, tokenStr = "") {
    if (userObj) {
        const enhanced = enhanceUserObject(userObj);
        auth.currentUser = enhanced;
        try {
            localStorage.setItem(MYSQL_SESSION_STORAGE_KEY, JSON.stringify(enhanced));
            if (tokenStr) localStorage.setItem(MYSQL_TOKEN_STORAGE_KEY, tokenStr);
        } catch (_) {}
    } else {
        auth.currentUser = null;
        try {
            localStorage.removeItem(MYSQL_SESSION_STORAGE_KEY);
            localStorage.removeItem(MYSQL_TOKEN_STORAGE_KEY);
        } catch (_) {}
    }
    notifyAuthStateChanged();
}

export const persistenceReady = Promise.resolve();
export async function setPersistence() { return true; }

export function onAuthStateChanged(_authInstance, nextOrObserver, errorCallback) {
    const cb = typeof nextOrObserver === "function" ? nextOrObserver : nextOrObserver?.next;
    if (typeof cb !== "function") return () => {};
    authListeners.add(cb);

    setTimeout(async () => {
        try {
            if (auth.currentUser && !auth.currentUser.isAnonymous && getAuthToken()) {
                try {
                    const meRes = await callMysqlApi("/api/auth/me", {}, "GET");
                    if (meRes && meRes.user) {
                        auth.currentUser = enhanceUserObject(meRes.user);
                        localStorage.setItem(MYSQL_SESSION_STORAGE_KEY, JSON.stringify(auth.currentUser));
                    }
                } catch (_) {}
            }
            cb(auth.currentUser);
        } catch (err) {
            if (typeof errorCallback === "function") errorCallback(err);
        }
    }, 10);

    return () => { authListeners.delete(cb); };
}

export async function signInAnonymously() {
    if (auth.currentUser && !auth.currentUser.isAnonymous) {
        return { user: auth.currentUser };
    }
    let guestUid = "";
    try {
        guestUid = localStorage.getItem("vipercell_mysql_guest_uid") || "";
        if (!guestUid) {
            guestUid = "guest_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
            localStorage.setItem("vipercell_mysql_guest_uid", guestUid);
        }
    } catch (_) {
        guestUid = "guest_" + Date.now().toString(36);
    }
    const guestUser = enhanceUserObject({
        uid: guestUid,
        email: "",
        displayName: "Pengunjung",
        isAnonymous: true,
        providerData: []
    });
    persistAuthUser(guestUser, "");
    return { user: guestUser };
}

export async function createUserWithEmailAndPassword(_authInstance, email, password) {
    const isAdminContext = typeof document !== "undefined" && Boolean(document.getElementById("btn-admin-login"));
    const res = await callMysqlApi("/api/auth/register", {
        email: String(email || "").trim().toLowerCase(),
        password: String(password || ""),
        isAdminContext
    });
    const user = enhanceUserObject(res.user);
    persistAuthUser(user, res.token || "");
    return { user };
}

export async function signInWithEmailAndPassword(_authInstance, email, password) {
    const isAdminContext = typeof document !== "undefined" && Boolean(document.getElementById("btn-admin-login"));
    const res = await callMysqlApi("/api/auth/login", {
        email: String(email || "").trim().toLowerCase(),
        password: String(password || ""),
        isAdminContext
    });
    const user = enhanceUserObject(res.user);
    persistAuthUser(user, res.token || "");
    return { user };
}

export async function signInWithPopup() {
    // Karena seluruh sistem menggunakan MySQL mandiri di VPS tanpa pihak ketiga, arahkan ke form Email & Sandi / Daftar Cepat
    const err = new Error("Silakan masuk atau daftar menggunakan Email & Kata Sandi di atas.");
    err.code = "auth/use-email-password";
    throw err;
}

export async function signOut() {
    try {
        if (getAuthToken()) await callMysqlApi("/api/auth/logout", {});
    } catch (_) {}
    persistAuthUser(null, "");
    return true;
}

export async function updatePassword(userObj, newPassword) {
    const uid = userObj?.uid || auth.currentUser?.uid || "";
    await callMysqlApi("/api/auth/update-password", { uid, newPassword: String(newPassword || "") });
    return true;
}

export async function updateProfile(userObj, profilePatch) {
    const uid = userObj?.uid || auth.currentUser?.uid || "";
    if (!uid) return;
    if (auth.currentUser && auth.currentUser.uid === uid) {
        auth.currentUser = enhanceUserObject({
            ...auth.currentUser,
            displayName: profilePatch?.displayName || auth.currentUser.displayName,
            photoURL: profilePatch?.photoURL || auth.currentUser.photoURL
        });
        try { localStorage.setItem(MYSQL_SESSION_STORAGE_KEY, JSON.stringify(auth.currentUser)); } catch (_) {}
    }
}

export async function updateEmail(userObj, newEmail) {
    const uid = userObj?.uid || auth.currentUser?.uid || "";
    if (auth.currentUser && auth.currentUser.uid === uid) {
        auth.currentUser.email = String(newEmail || "").toLowerCase();
        try { localStorage.setItem(MYSQL_SESSION_STORAGE_KEY, JSON.stringify(auth.currentUser)); } catch (_) {}
    }
}

export async function sendPasswordResetEmail(_authInstance, email) {
    await callMysqlApi("/api/auth/request-reset-otp", { email: String(email || "").toLowerCase().trim() });
    return true;
}

export async function verifyPasswordResetCode(_authInstance, code) { return code; }
export async function confirmPasswordReset(_authInstance, code, newPassword) {
    const email = (typeof document !== "undefined" && document.getElementById("auth-res-email")?.value) || "";
    await callMysqlApi("/api/auth/verify-reset-otp", { email, otpCode: code, newPassword });
    return true;
}
export async function applyActionCode() { return true; }
export async function checkActionCode() { return { data: { email: auth.currentUser?.email || "" } }; }
export async function sendEmailVerification() { return true; }
export async function linkWithCredential(userObj) { return { user: userObj || auth.currentUser }; }
export async function linkWithPopup(userObj) { return { user: userObj || auth.currentUser }; }
export async function deleteUser() { return signOut(); }

// ============================================================================
// ENGINE DATABASE VPS MYSQL
// ============================================================================
export const db = { name: "vipercell-mysql-db" };

function normalizeCollectionName(rawPath) {
    const parts = String(rawPath || "").split("/").map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return "settings";
    const dataIdx = parts.indexOf("data");
    if (dataIdx !== -1 && parts[dataIdx + 1]) return parts[dataIdx + 1];
    return parts[0];
}

function generateAutoId() {
    const rand = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
    return "vc_" + Date.now().toString(36) + "_" + rand;
}

export function collection(_dbOrRef, ...pathSegments) {
    const colName = normalizeCollectionName(pathSegments.join("/"));
    return { __type: "collection", collection: colName, path: colName };
}

export function doc(firstArg, ...pathSegments) {
    if (firstArg && firstArg.__type === "collection" && pathSegments.length === 0) {
        const autoId = generateAutoId();
        return { __type: "doc", collection: firstArg.collection, id: autoId, path: `${firstArg.collection}/${autoId}` };
    }
    if (firstArg && firstArg.__type === "collection" && pathSegments.length > 0) {
        const id = String(pathSegments[pathSegments.length - 1]);
        return { __type: "doc", collection: firstArg.collection, id, path: `${firstArg.collection}/${id}` };
    }
    const joined = pathSegments.join("/");
    const parts = joined.split("/").map(s => s.trim()).filter(Boolean);
    const id = parts.length >= 2 ? parts[parts.length - 1] : generateAutoId();
    const colPath = parts.length >= 2 ? parts.slice(0, -1).join("/") : parts[0];
    const colName = normalizeCollectionName(colPath);
    return { __type: "doc", collection: colName, id: String(id), path: `${colName}/${id}` };
}

export function where(field, op, value) { return { __constraint: "where", field, op, value }; }
export function orderBy(field, direction = "asc") { return { __constraint: "orderBy", field, direction }; }
export function limit(count) { return { __constraint: "limit", count: Number(count || 100) }; }

export function query(targetRef, ...constraints) {
    return {
        __type: "query",
        collection: targetRef.collection,
        path: targetRef.path,
        constraints: constraints.filter(Boolean)
    };
}

export function increment(n) { return { __op: "increment", value: Number(n || 0) }; }
export function arrayUnion(...values) { return { __op: "arrayUnion", values }; }
export function arrayRemove(...values) { return { __op: "arrayRemove", values }; }
export function serverTimestamp() { return Date.now(); }

function makeDocSnapshot(colName, id, rawData) {
    const existsFlag = rawData !== null && rawData !== undefined;
    const cloned = existsFlag ? JSON.parse(JSON.stringify(rawData)) : undefined;
    if (cloned && typeof cloned === "object" && !cloned.dbId) cloned.dbId = String(id);
    return {
        id: String(id),
        ref: { __type: "doc", collection: colName, id: String(id), path: `${colName}/${id}` },
        exists: () => existsFlag,
        data: () => (existsFlag ? JSON.parse(JSON.stringify(cloned)) : undefined)
    };
}

function makeQuerySnapshot(colName, docsArray, prevDocsMap = null) {
    const docSnaps = docsArray.map(item => makeDocSnapshot(colName, item.id, item.data));
    const changes = [];
    if (prevDocsMap) {
        const nextMap = new Map();
        docSnaps.forEach((ds, idx) => {
            const serialized = JSON.stringify(ds.data());
            nextMap.set(ds.id, { ds, serialized, idx });
            if (!prevDocsMap.has(ds.id)) {
                changes.push({ type: "added", doc: ds, newIndex: idx, oldIndex: -1 });
            } else if (prevDocsMap.get(ds.id).serialized !== serialized) {
                changes.push({ type: "modified", doc: ds, newIndex: idx, oldIndex: prevDocsMap.get(ds.id).idx });
            }
        });
        prevDocsMap.forEach((oldEntry, oldId) => {
            if (!nextMap.has(oldId)) {
                changes.push({ type: "removed", doc: oldEntry.ds, newIndex: -1, oldIndex: oldEntry.idx });
            }
        });
    } else {
        docSnaps.forEach((ds, idx) => {
            changes.push({ type: "added", doc: ds, newIndex: idx, oldIndex: -1 });
        });
    }
    return {
        empty: docSnaps.length === 0,
        size: docSnaps.length,
        docs: docSnaps,
        forEach: (cb) => docSnaps.forEach(cb),
        docChanges: () => changes
    };
}

export async function getDoc(docRef) {
    try {
        const res = await callMysqlApi("/api/mysql/db", {
            action: "getDoc",
            collection: docRef.collection,
            id: docRef.id
        });
        if (res.exists && res.data) {
            const cache = readLocalColCache(docRef.collection);
            cache[docRef.id] = res.data;
            writeLocalColCache(docRef.collection, cache);
        }
        return makeDocSnapshot(docRef.collection, docRef.id, res.exists ? res.data : null);
    } catch (_) {
        const cache = readLocalColCache(docRef.collection);
        return makeDocSnapshot(docRef.collection, docRef.id, cache[docRef.id] || null);
    }
}

export async function getDocs(colOrQuery) {
    try {
        const res = await callMysqlApi("/api/mysql/db", {
            action: "getDocs",
            collection: colOrQuery.collection,
            constraints: colOrQuery.constraints || []
        });
        const docs = res.docs || [];
        if (!colOrQuery.constraints || colOrQuery.constraints.length === 0) {
            const cache = {};
            docs.forEach(d => { cache[d.id] = d.data; });
            writeLocalColCache(colOrQuery.collection, cache);
        }
        return makeQuerySnapshot(colOrQuery.collection, docs);
    } catch (_) {
        const cache = readLocalColCache(colOrQuery.collection);
        const docs = Object.entries(cache).map(([id, data]) => ({ id, data }));
        return makeQuerySnapshot(colOrQuery.collection, docs);
    }
}

export async function setDoc(docRef, data, options = {}) {
    const cache = readLocalColCache(docRef.collection);
    cache[docRef.id] = options?.merge ? { ...(cache[docRef.id] || {}), ...(data || {}), dbId: docRef.id } : { ...(data || {}), dbId: docRef.id };
    writeLocalColCache(docRef.collection, cache);

    await callMysqlApi("/api/mysql/db", {
        action: "setDoc",
        collection: docRef.collection,
        id: docRef.id,
        data,
        merge: Boolean(options && options.merge)
    });
    triggerCollectionListenersNow(docRef.collection);
    return true;
}

export async function addDoc(colRef, data) {
    const newId = (data && (data.dbId || data.id)) ? String(data.dbId || data.id) : generateAutoId();
    const payload = { ...(data || {}), dbId: newId };
    const cache = readLocalColCache(colRef.collection);
    cache[newId] = payload;
    writeLocalColCache(colRef.collection, cache);

    await callMysqlApi("/api/mysql/db", {
        action: "setDoc",
        collection: colRef.collection,
        id: newId,
        data: payload,
        merge: false
    });
    triggerCollectionListenersNow(colRef.collection);
    return { __type: "doc", collection: colRef.collection, id: newId, path: `${colRef.collection}/${newId}` };
}

export async function updateDoc(docRef, data) {
    const cache = readLocalColCache(docRef.collection);
    if (cache[docRef.id]) {
        cache[docRef.id] = { ...cache[docRef.id], ...(data || {}), dbId: docRef.id };
        writeLocalColCache(docRef.collection, cache);
    }
    await callMysqlApi("/api/mysql/db", {
        action: "updateDoc",
        collection: docRef.collection,
        id: docRef.id,
        data
    });
    triggerCollectionListenersNow(docRef.collection);
    return true;
}

export async function deleteDoc(docRef) {
    const cache = readLocalColCache(docRef.collection);
    delete cache[docRef.id];
    writeLocalColCache(docRef.collection, cache);

    await callMysqlApi("/api/mysql/db", {
        action: "deleteDoc",
        collection: docRef.collection,
        id: docRef.id
    });
    triggerCollectionListenersNow(docRef.collection);
    return true;
}

export function writeBatch() {
    const ops = [];
    return {
        set(docRef, data, options = {}) {
            ops.push({ type: "set", collection: docRef.collection, id: docRef.id, data, merge: Boolean(options?.merge) });
        },
        update(docRef, data) {
            ops.push({ type: "update", collection: docRef.collection, id: docRef.id, data });
        },
        delete(docRef) {
            ops.push({ type: "delete", collection: docRef.collection, id: docRef.id });
        },
        async commit() {
            if (ops.length === 0) return;
            await callMysqlApi("/api/mysql/db", { action: "batch", ops });
            const touched = new Set(ops.map(o => o.collection));
            touched.forEach(c => triggerCollectionListenersNow(c));
        }
    };
}

export async function runTransaction(_dbInstance, updateFunction) {
    const ops = [];
    const tx = {
        async get(docRef) { return await getDoc(docRef); },
        set(docRef, data, options = {}) {
            ops.push({ type: "set", collection: docRef.collection, id: docRef.id, data, merge: Boolean(options?.merge) });
            return tx;
        },
        update(docRef, data) {
            ops.push({ type: "update", collection: docRef.collection, id: docRef.id, data });
            return tx;
        },
        delete(docRef) {
            ops.push({ type: "delete", collection: docRef.collection, id: docRef.id });
            return tx;
        }
    };
    const result = await updateFunction(tx);
    if (ops.length > 0) {
        await callMysqlApi("/api/mysql/db", { action: "batch", ops });
        const touched = new Set(ops.map(o => o.collection));
        touched.forEach(c => triggerCollectionListenersNow(c));
    }
    return result;
}

const activeSnapshots = new Set();
const collectionVersions = {};
let pollLoopStarted = false;

async function evaluateListenerEntry(entry) {
    try {
        if (entry.target.__type === "doc") {
            const snap = await getDoc(entry.target);
            const nextHash = JSON.stringify(snap.exists() ? snap.data() : null);
            if (entry.lastHash !== nextHash) {
                entry.lastHash = nextHash;
                entry.onNext(snap);
            }
        } else {
            const qSnap = await getDocs(entry.target);
            const docsArr = qSnap.docs.map(d => ({ id: d.id, data: d.data() }));
            const nextHash = JSON.stringify(docsArr);
            if (entry.lastHash !== nextHash) {
                entry.lastHash = nextHash;
                const fullSnap = makeQuerySnapshot(entry.target.collection, docsArr, entry.prevDocsMap);
                const nextMap = new Map();
                fullSnap.docs.forEach((ds, idx) => {
                    nextMap.set(ds.id, { ds, serialized: JSON.stringify(ds.data()), idx });
                });
                entry.prevDocsMap = nextMap;
                entry.onNext(fullSnap);
            }
        }
    } catch (err) {
        if (typeof entry.onError === "function") entry.onError(err);
    }
}

function triggerCollectionListenersNow(colName) {
    activeSnapshots.forEach(entry => {
        if (entry.target.collection === colName) {
            evaluateListenerEntry(entry);
        }
    });
}

function startMysqlRealtimePollLoop() {
    if (pollLoopStarted) return;
    pollLoopStarted = true;
    setInterval(async () => {
        if (activeSnapshots.size === 0) return;
        try {
            const res = await callMysqlApi("/api/mysql/versions", {}, "GET");
            const verMap = res.versions || {};
            const changedCollections = new Set();
            for (const [col, ver] of Object.entries(verMap)) {
                if (collectionVersions[col] !== ver) {
                    collectionVersions[col] = ver;
                    changedCollections.add(col);
                }
            }
            if (changedCollections.size > 0) {
                activeSnapshots.forEach(entry => {
                    if (changedCollections.has(entry.target.collection)) {
                        evaluateListenerEntry(entry);
                    }
                });
            }
        } catch (_) {}
    }, 2500);
}

export function onSnapshot(target, onNext, onError) {
    const entry = { target, onNext, onError, lastHash: undefined, prevDocsMap: null };
    activeSnapshots.add(entry);
    evaluateListenerEntry(entry);
    startMysqlRealtimePollLoop();
    return () => { activeSnapshots.delete(entry); };
}


