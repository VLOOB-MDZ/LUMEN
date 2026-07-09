/*
 * LUMEN × Firebase — the shared sky.
 * Optional by design: without VITE_FIREBASE_* config in .env.local the app
 * falls back to the original localStorage-only sky.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore, collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc,
  addDoc, increment, serverTimestamp,
} from 'firebase/firestore';

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseEnabled = !!(cfg.apiKey && cfg.projectId);

let db = null;
let auth = null;
if (firebaseEnabled) {
  const app = initializeApp(cfg);
  db = getFirestore(app);
  auth = getAuth(app);
}

// Signs in anonymously and streams the shared wishes.
// onUser(uid) fires when the anonymous session is ready;
// onWishes(list) fires on every sky change (including our own local writes).
// Returns an unsubscribe function.
export function connectSky({ onUser, onWishes }) {
  if (!firebaseEnabled) return () => {};
  const offAuth = onAuthStateChanged(auth, (user) => {
    if (user) onUser(user.uid);
    else signInAnonymously(auth).catch(() => onUser(null));
  });
  const offSnap = onSnapshot(collection(db, 'wishes'), (snap) => {
    const now = Date.now();
    const list = snap.docs.map((d) => {
      const w = d.data();
      const created = w.createdAt && w.createdAt.toMillis ? w.createdAt.toMillis() : now;
      return {
        wid: d.id,
        text: w.text || '',
        by: w.by || '',
        l: w.l, t: w.t,
        tint: w.tint || '#e6ecff',
        base: w.prayers || 0,
        days: Math.max(0, Math.floor((now - created) / 864e5)),
        expiresAt: w.expiresAt || null,
        lifeIdx: w.lifeIdx || 0,
        uid: w.uid || '',
        flagCount: w.flagCount || 0,
      };
    });
    onWishes(list);
  }, () => { /* offline or rules issue — the local sky keeps shining */ });
  return () => { offAuth(); offSnap(); };
}

export function newWishId() {
  return doc(collection(db, 'wishes')).id;
}

export function releaseWish(wid, uid, w) {
  return setDoc(doc(db, 'wishes', wid), {
    text: w.text, by: w.by, l: w.l, t: w.t, tint: w.tint,
    expiresAt: w.expiresAt, lifeIdx: w.lifeIdx,
    uid, prayers: 0, flagCount: 0,
    createdAt: serverTimestamp(),
  }).catch(() => {});
}

export function rewriteWish(wid, w) {
  return updateDoc(doc(db, 'wishes', wid), {
    text: w.text, by: w.by, expiresAt: w.expiresAt, lifeIdx: w.lifeIdx,
  }).catch(() => {});
}

export function restWish(wid) {
  return deleteDoc(doc(db, 'wishes', wid)).catch(() => {});
}

export function prayForWish(wid) {
  return updateDoc(doc(db, 'wishes', wid), { prayers: increment(1) }).catch(() => {});
}

export function reportWish(wid, reason) {
  updateDoc(doc(db, 'wishes', wid), { flagCount: increment(1) }).catch(() => {});
  return addDoc(collection(db, 'reports'), {
    wid, reason, createdAt: serverTimestamp(),
  }).catch(() => {});
}
