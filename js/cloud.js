// Sign-in and online features, on ModiDex's Firebase project.
//
// Same project = same accounts. Signing in with the same Google account or email
// gives the same player id and the same username on both sites. (Each site still
// asks once: browsers keep sign-ins separate per website.)
//
// Firestore (rules live in ModiDex's firestore.rules, since it's one project):
//   handles/{username}, profiles/{uid}.handle   shared with ModiDex (usernames)
//   matchDaily/{date}_{mode}/scores/{uid}     -> { handle, score, grid, at }   daily leaderboard
//   matchRooms/{CODE}                         -> Host Mode room (see room.js)
//   matchRooms/{CODE}/players/{uid}           -> a viewer's name and score
import { FIREBASE_CONFIG } from './firebase-config.js';
import { GAME } from './config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const EMAIL_KEY = `${GAME.storagePrefix}:pref:signInEmail`;
export const HANDLE_RE = /^[a-z0-9_]{3,15}$/;

let fb = null;
let user = null;
let handle = null;
let status = 'off'; // off | loading | ready | error
let ready = null;
const listeners = new Set();

export const cloudEnabled = () => !!FIREBASE_CONFIG;
export const cloudStatus = () => status;
export const currentUser = () => user;
export const isRealUser = () => !!user && !user.isAnonymous;
export const myHandle = () => handle;
export const onCloudChange = (fn) => listeners.add(fn);
const notify = (why) => listeners.forEach((fn) => { try { fn(why); } catch (e) { console.warn(e); } });
export const whenReady = () => ready || Promise.resolve();

// For room.js: Firestore modules and the signed-in user.
export const cloudApi = () => (fb && user ? { ...fb, user } : null);

export function initCloud() {
  if (!FIREBASE_CONFIG) return Promise.resolve();
  if (ready) return ready;
  status = 'loading';
  ready = (async () => {
    try {
      const [appM, authM, fsM] = await Promise.all([
        import(`${SDK}firebase-app.js`), import(`${SDK}firebase-auth.js`), import(`${SDK}firebase-firestore.js`),
      ]);
      const app = appM.initializeApp(FIREBASE_CONFIG);
      const auth = authM.getAuth(app);
      fb = { authM, fsM, auth, db: fsM.getFirestore(app) };

      if (authM.isSignInWithEmailLink(auth, location.href)) {
        let email = null;
        try { email = localStorage.getItem(EMAIL_KEY); } catch { /* ignore */ }
        if (!email) email = prompt('Confirm your email to finish signing in:');
        if (email) {
          await authM.signInWithEmailLink(auth, email, location.href);
          try { localStorage.removeItem(EMAIL_KEY); } catch { /* ignore */ }
        }
        history.replaceState(null, '', location.pathname + location.hash);
      }

      // Wait for the first auth answer so callers know who's signed in.
      await new Promise((resolve) => {
        let first = true;
        authM.onAuthStateChanged(auth, async (u) => {
          user = u;
          handle = null;
          if (u && !u.isAnonymous) {
            try {
              const snap = await fsM.getDoc(fsM.doc(fb.db, 'profiles', u.uid));
              handle = snap.exists() ? snap.data().handle || null : null;
            } catch (e) { console.warn('[profiles] could not read username:', e); }
          }
          status = 'ready';
          if (first) { first = false; resolve(); }
          notify('auth');
        });
      });
    } catch (e) {
      console.warn('[profiles] could not start:', e);
      status = 'error';
      notify('error');
    }
  })();
  return ready;
}

export async function signInWithGoogle() {
  await fb.authM.signInWithPopup(fb.auth, new fb.authM.GoogleAuthProvider());
}

export async function emailSignInLink(email) {
  await fb.authM.sendSignInLinkToEmail(fb.auth, email, { url: location.origin + location.pathname, handleCodeInApp: true });
  try { localStorage.setItem(EMAIL_KEY, email); } catch { /* ignore */ }
}

// Host Mode viewers join without an account. Needs "Anonymous" sign-in turned on in Firebase.
export async function ensureSignedIn() {
  await initCloud();
  if (!fb) throw new Error('offline');
  if (!user) await fb.authM.signInAnonymously(fb.auth);
  return user || fb.auth.currentUser;
}

export async function signOut() { await fb.authM.signOut(fb.auth); }

// Claim a username. It's shared with ModiDex (same "handles" list), so a name picked
// here is your ModiDex username too. Throws 'invalid' or 'taken'.
export async function claimHandle(raw) {
  const h = String(raw || '').trim().toLowerCase();
  if (!HANDLE_RE.test(h)) throw new Error('invalid');
  const { fsM, db } = fb;
  const me = user.uid;
  const ref = (...p) => fsM.doc(db, ...p);
  await fsM.runTransaction(db, async (tx) => {
    const hs = await tx.get(ref('handles', h));
    const p = await tx.get(ref('profiles', me));
    if (hs.exists() && hs.data().uid !== me) throw new Error('taken');
    if (!hs.exists()) tx.set(ref('handles', h), { uid: me });
    const old = p.exists() ? p.data().handle : null;
    if (old && old !== h) tx.delete(ref('handles', old));
    tx.set(ref('profiles', me), p.exists()
      ? { handle: h, name: h, updatedAt: fsM.serverTimestamp() }
      : { handle: h, name: h, friends: [], groups: [], updatedAt: fsM.serverTimestamp() }, { merge: true });
  });
  handle = h;
  notify('handle');
  return h;
}

// ---------- daily leaderboard ----------
const boardCol = (date, modeId) => fb.fsM.collection(fb.db, 'matchDaily', `${date}_${modeId}`, 'scores');

// Your posted score for that day, or null.
export async function myDailyScore(date, modeId) {
  if (!isRealUser()) return null;
  const snap = await fb.fsM.getDoc(fb.fsM.doc(boardCol(date, modeId), user.uid));
  return snap.exists() ? snap.data() : null;
}

// Posts once per day and mode. Returns the score on the board (yours from another
// device wins if you already posted).
export async function postDailyScore(date, modeId, score, grid) {
  if (!isRealUser() || !handle) return null;
  const ref = fb.fsM.doc(boardCol(date, modeId), user.uid);
  const existing = await fb.fsM.getDoc(ref);
  if (existing.exists()) return existing.data();
  const data = { handle, score, grid, at: fb.fsM.serverTimestamp() };
  await fb.fsM.setDoc(ref, data);
  return data;
}

// Top scores plus your rank. Ties share a rank.
export async function dailyBoard(date, modeId, max = 25) {
  const { fsM } = fb;
  const col = boardCol(date, modeId);
  // One orderBy only, so Firestore needs no extra index. Ties: whoever posted first.
  const snap = await fsM.getDocs(fsM.query(col, fsM.orderBy('score', 'desc'), fsM.limit(max)));
  const rows = snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
    .sort((a, b) => b.score - a.score || (a.at?.toMillis?.() ?? 0) - (b.at?.toMillis?.() ?? 0));
  let mine = null;
  if (isRealUser()) {
    const me = await fsM.getDoc(fsM.doc(col, user.uid));
    if (me.exists()) {
      const above = await fsM.getCountFromServer(fsM.query(col, fsM.where('score', '>', me.data().score)));
      mine = { uid: user.uid, ...me.data(), rank: above.data().count + 1 };
    }
  }
  const total = (await fsM.getCountFromServer(col)).data().count;
  let rank = 0, last = null;
  rows.forEach((r, i) => { if (r.score !== last) { rank = i + 1; last = r.score; } r.rank = rank; });
  return { rows, mine, total };
}
