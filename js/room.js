// Host Mode rooms: a tiny live connection between the host's big screen and viewers' phones.
//
// Two versions with the same functions:
//  - Firebase (real streams): matchRooms/{CODE} and matchRooms/{CODE}/players/{uid}.
//    Viewers join as guests, so "Anonymous" sign-in must be on in Firebase.
//  - Local test (?local in the address): rooms live in this browser and update between
//    tabs, so you can rehearse on one computer with no setup.
//
// Room:   { host, mode, ids: [questionIds], q, clue, phase, auto, clueSeconds, clueAt, banned, createdAt }
//         phase: 'lobby' | 'question' | 'reveal' | 'final' | 'closed'
// Player: { name, score, answers: { [q]: { a, p, pts } }, joinedAt, updatedAt }
//         a / p = the clue number the athlete / Pokémon was locked at (0 = not got)
import { cloudApi, ensureSignedIn } from './cloud.js';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O (look like 1 and 0)
export const newCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
export const isLocal = () => new URLSearchParams(location.search).has('local');

// ---------- Firebase ----------
function firebaseRoom() {
  const api = () => {
    const a = cloudApi();
    if (!a) throw new Error('not-signed-in');
    return a;
  };
  const roomRef = (a, code) => a.fsM.doc(a.db, 'matchRooms', code);
  const playersCol = (a, code) => a.fsM.collection(a.db, 'matchRooms', code, 'players');
  return {
    async uid() { return (await ensureSignedIn()).uid; },
    async createRoom(data) {
      const a = (await ensureSignedIn(), api());
      for (let tries = 0; tries < 8; tries++) {
        const code = newCode();
        const ref = roomRef(a, code);
        try {
          const existing = await a.fsM.getDoc(ref);
          // A code in use by someone else's live room is skipped. Your own old room is reused.
          if (existing.exists() && existing.data().host !== a.user.uid) continue;
          await a.fsM.setDoc(ref, { ...data, host: a.user.uid, banned: [], createdAt: Date.now() });
          return code;
        } catch (e) {
          if (e.code !== 'permission-denied') throw e;
        }
      }
      throw new Error('no-code');
    },
    async getRoom(code) {
      await ensureSignedIn();
      const snap = await api().fsM.getDoc(roomRef(api(), code));
      return snap.exists() ? snap.data() : null;
    },
    watchRoom(code, cb) {
      const a = api();
      return a.fsM.onSnapshot(roomRef(a, code), (s) => cb(s.exists() ? s.data() : null), (e) => console.warn('[room]', e));
    },
    async updateRoom(code, patch) { const a = api(); await a.fsM.updateDoc(roomRef(a, code), patch); },
    watchPlayers(code, cb) {
      const a = api();
      return a.fsM.onSnapshot(playersCol(a, code), (s) => cb(s.docs.map((d) => ({ uid: d.id, ...d.data() }))), (e) => console.warn('[room]', e));
    },
    watchMe(code, cb) {
      const a = api();
      return a.fsM.onSnapshot(a.fsM.doc(playersCol(a, code), a.user.uid), (s) => cb(s.exists() ? s.data() : null), () => {});
    },
    async setMe(code, data) {
      const a = api();
      await a.fsM.setDoc(a.fsM.doc(playersCol(a, code), a.user.uid), { ...data, updatedAt: Date.now() }, { merge: true });
    },
    async kick(code, uid) {
      const a = api();
      await a.fsM.updateDoc(roomRef(a, code), { banned: a.fsM.arrayUnion(uid) });
      await a.fsM.deleteDoc(a.fsM.doc(playersCol(a, code), uid));
    },
    async closeRoom(code, players) {
      const a = api();
      await a.fsM.updateDoc(roomRef(a, code), { phase: 'closed' });
      await Promise.all(players.map((p) => a.fsM.deleteDoc(a.fsM.doc(playersCol(a, code), p.uid)).catch(() => {})));
      await a.fsM.deleteDoc(roomRef(a, code)).catch(() => {});
    },
  };
}

// ---------- local test (between tabs of one browser) ----------
function localRoom() {
  const KEY = (code) => `dualthreat:localroom:${code}`;
  const chan = 'BroadcastChannel' in window ? new BroadcastChannel('dualthreat-local') : null;
  const subs = new Set();
  let me = sessionStorage.getItem('dualthreat:localUid');
  if (!me) { me = `tab-${Math.random().toString(36).slice(2, 8)}`; sessionStorage.setItem('dualthreat:localUid', me); }
  const read = (code) => { try { return JSON.parse(localStorage.getItem(KEY(code))); } catch { return null; } };
  const ping = () => subs.forEach((fn) => fn());
  const write = (code, v) => {
    if (v) localStorage.setItem(KEY(code), JSON.stringify(v)); else localStorage.removeItem(KEY(code));
    chan?.postMessage(code);
    setTimeout(ping, 0);
  };
  chan?.addEventListener('message', ping);
  window.addEventListener('storage', ping);
  const watch = (fn) => { subs.add(fn); setTimeout(fn, 0); return () => subs.delete(fn); };
  return {
    async uid() { return me; },
    async createRoom(data) { const code = newCode(); write(code, { room: { ...data, host: me, banned: [], createdAt: Date.now() }, players: {} }); return code; },
    async getRoom(code) { return read(code)?.room || null; },
    watchRoom(code, cb) { let last = null; return watch(() => { const r = read(code)?.room || null; const s = JSON.stringify(r); if (s !== last) { last = s; cb(r); } }); },
    async updateRoom(code, patch) { const v = read(code); if (v) { v.room = { ...v.room, ...patch }; write(code, v); } },
    watchPlayers(code, cb) { let last = null; return watch(() => { const p = read(code)?.players || {}; const s = JSON.stringify(p); if (s !== last) { last = s; cb(Object.entries(p).map(([uid, d]) => ({ uid, ...d }))); } }); },
    watchMe(code, cb) { let last; return watch(() => { const p = read(code)?.players?.[me] || null; const s = JSON.stringify(p); if (s !== last) { last = s; cb(p); } }); },
    async setMe(code, data) {
      const v = read(code);
      if (!v || v.room.banned?.includes(me)) throw new Error('permission-denied');
      v.players[me] = { ...(v.players[me] || {}), ...data, updatedAt: Date.now() };
      write(code, v);
    },
    async kick(code, uid) { const v = read(code); if (v) { v.room.banned = [...(v.room.banned || []), uid]; delete v.players[uid]; write(code, v); } },
    async closeRoom(code) { const v = read(code); if (v) { v.room.phase = 'closed'; write(code, v); } setTimeout(() => write(code, null), 1500); },
  };
}

export const roomApi = () => (isLocal() ? localRoom() : firebaseRoom());

// Standings: highest score first; ties share a rank.
export function standings(players) {
  const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.name).localeCompare(String(b.name)));
  let rank = 0, last = null;
  return sorted.map((p, i) => { if (p.score !== last) { rank = i + 1; last = p.score; } return { ...p, rank }; });
}
