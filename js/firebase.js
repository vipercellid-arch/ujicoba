import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    signInAnonymously,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    updateProfile,
    GoogleAuthProvider,
    EmailAuthProvider,
    linkWithCredential,
    deleteUser,
    signInWithPopup,
    onAuthStateChanged,
    signOut,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    collection,
    addDoc,
    query,
    where,
    getDocs,
    increment,
    arrayUnion,
    writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Konfigurasi Resmi Firebase Proyek Vipercell
const firebaseConfig = {
    apiKey: "AIzaSyBQGZjl7uj5CRiLWCvPQKjiK4HvIYnXSJg",
    authDomain: "vipercell-fc50e.firebaseapp.com",
    projectId: "vipercell-fc50e",
    storageBucket: "vipercell-fc50e.firebasestorage.app",
    messagingSenderId: "710483059781",
    appId: "1:710483059781:web:b4c27b14ab34c45c892f2c"
};

// Inisialisasi Firebase App, Firestore Database, dan Authentication
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Kunci sesi di penyimpanan lokal browser sejak awal agar tidak ter-reset saat halaman di-refresh
setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn("Firebase Persistence Warning:", err);
});

// Export seluruh fungsi Auth (termasuk Anonim & Link Credential) dan Firestore untuk store.js & admin.js
export {
    signInAnonymously,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    updateProfile,
    GoogleAuthProvider,
    EmailAuthProvider,
    linkWithCredential,
    deleteUser,
    signInWithPopup,
    onAuthStateChanged,
    signOut,
    setPersistence,
    browserLocalPersistence,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    collection,
    addDoc,
    query,
    where,
    getDocs,
    increment,
    arrayUnion,
    writeBatch
};