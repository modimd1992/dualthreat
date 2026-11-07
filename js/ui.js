// Small UI helpers shared by every page: toast, dialogs, and the account panel.
import { GAME } from './config.js';
import {
  claimHandle, cloudEnabled, cloudStatus, currentUser, emailSignInLink, isRealUser,
  myHandle, signInWithGoogle, signOut,
} from './cloud.js';
import { esc } from './util.js';

let toastTimer = null;
export function toast(msg, ms = 2200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// Opens a <dialog> with a title and body HTML. Returns the dialog element.
export function openDialog(id, title, body) {
  const dlg = document.getElementById(id);
  dlg.innerHTML = `
    <div class="dlg-head"><h2 id="${id.replace('dlg-', '')}-title">${title}</h2>
      <button class="icon-btn dlg-close" aria-label="Close">✕</button></div>
    <div class="dlg-body">${body}</div>`;
  dlg.querySelector('.dlg-close').addEventListener('click', () => dlg.close());
  if (!dlg.dataset.wired) {
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.dataset.wired = '1';
  }
  if (!dlg.open) dlg.showModal();
  return dlg;
}

// ---------- account ----------
// The same sign-in as ModiDex: one account and one username for both sites.
export function accountHtml() {
  if (!cloudEnabled()) return `<p>Accounts aren't set up on this copy of the game.</p>`;
  if (cloudStatus() === 'loading') return `<p class="muted">Connecting…</p>`;
  if (cloudStatus() === 'error') return `<p>Couldn't reach the sign-in service. Check your connection and try again.</p>`;
  const u = currentUser();
  if (!u || u.isAnonymous) {
    return `
      <p>Sign in to post your Daily Contest scores to the leaderboard. It's the <b>same account as ${esc(GAME.sisterName)}</b>: use the same Google account or email and you'll keep your username.</p>
      <button class="btn btn-primary btn-block" data-act="google">Continue with Google</button>
      <form class="email-form" data-act="email">
        <input type="email" required placeholder="you@example.com" aria-label="Email" autocomplete="email">
        <button class="btn" type="submit">Email me a link</button>
      </form>
      <p class="small">No password needed. We only use your email to sign you in.</p>`;
  }
  const h = myHandle();
  return `
    <p>Signed in as <b>${esc(u.email || u.displayName || 'player')}</b>.</p>
    ${h
      ? `<p>Username: <b>@${esc(h)}</b> <span class="small">(shared with ${esc(GAME.sisterName)})</span></p>`
      : `<p>Pick a username for the leaderboard. It becomes your ${esc(GAME.sisterName)} username too.</p>
         <form class="email-form" data-act="handle">
           <input type="text" required minlength="3" maxlength="15" pattern="[A-Za-z0-9_]{3,15}" placeholder="username" aria-label="Username" autocapitalize="off" spellcheck="false">
           <button class="btn btn-primary" type="submit">Save</button>
         </form>
         <p class="small">3–15 letters, numbers or _</p>`}
    <p><a href="${esc(GAME.sisterUrl)}">Open ${esc(GAME.sisterName)} →</a></p>
    <button class="btn btn-block" data-act="signout">Sign out</button>`;
}

export function wireAccount(root, rerender) {
  root.querySelector('[data-act="google"]')?.addEventListener('click', async () => {
    try { await signInWithGoogle(); } catch (e) { if (e.code !== 'auth/popup-closed-by-user') toast('Sign-in failed. Try again.'); }
  });
  root.querySelector('form[data-act="email"]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = e.target.querySelector('input').value.trim();
    try { await emailSignInLink(email); toast(`Link sent to ${email}`, 3500); } catch { toast('Could not send the link.'); }
  });
  root.querySelector('form[data-act="handle"]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await claimHandle(e.target.querySelector('input').value); toast('Username saved'); rerender(); } catch (err) {
      toast(err.message === 'taken' ? 'That username is taken' : err.message === 'invalid' ? '3–15 letters, numbers or _' : 'Could not save the username');
    }
  });
  root.querySelector('[data-act="signout"]')?.addEventListener('click', async () => { await signOut(); rerender(); });
}

export const canPost = () => isRealUser() && !!myHandle();
