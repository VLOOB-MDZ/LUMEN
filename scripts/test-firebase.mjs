// One-off smoke test for the Firestore setup. Run: node scripts/test-firebase.mjs
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  getFirestore, collection, doc, setDoc, getDocs, deleteDoc, updateDoc,
  increment, serverTimestamp,
} from 'firebase/firestore';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
);

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});

const auth = getAuth(app);
const db = getFirestore(app);

const { user } = await signInAnonymously(auth);
console.log('1. anonymous sign-in OK, uid =', user.uid);

const ref = doc(collection(db, 'wishes'));
await setDoc(ref, {
  text: 'smoke test — may this write succeed', by: 'claude', l: 50, t: 50,
  tint: '#e6ecff', expiresAt: null, lifeIdx: 0,
  uid: user.uid, prayers: 0, flagCount: 0, createdAt: serverTimestamp(),
});
console.log('2. create wish OK, id =', ref.id);

await updateDoc(ref, { prayers: increment(1) });
console.log('3. prayer increment OK');

try {
  await setDoc(doc(collection(db, 'wishes')), {
    text: 'x'.repeat(201), by: '', l: 50, t: 50, tint: '#fff',
    expiresAt: null, lifeIdx: 0, uid: user.uid, prayers: 0, flagCount: 0,
    createdAt: serverTimestamp(),
  });
  console.log('4. FAIL: 201-char wish was accepted (rules too loose!)');
} catch (e) {
  console.log('4. rules rejected 201-char wish OK (' + e.code + ')');
}

try {
  await updateDoc(ref, { prayers: increment(5) });
  console.log('5. FAIL: +5 prayers was accepted (rules too loose!)');
} catch (e) {
  console.log('5. rules rejected +5 prayers OK (' + e.code + ')');
}

const snap = await getDocs(collection(db, 'wishes'));
console.log('6. read sky OK,', snap.size, 'wish(es) in the sky');

await deleteDoc(ref);
console.log('7. delete own wish OK — sky left clean');
process.exit(0);
