# Dual Threat

**A daily sports trivia game, and the sister site of [ModiDex](https://playmodidex.com).** Each question is one athlete and their Gen 1 Pokémon comp from ModiDex. Clues describe both at once, from vague to obvious, and players guess **both**.

- **Daily Contest:** the same 10 questions for everyone each day (new set at midnight ET), a daily leaderboard, and a spoiler-free share grid (🟩 both · 🟦 athlete · 🟨 Pokémon · ⬜ missed).
- **Sports:** All Sports, NFL, NBA, MLB. Each has its own Daily Contest and leaderboard.
- **Practice:** unlimited random questions that don't count. Today's unplayed Daily Contest questions are left out so practice never spoils them.
- **Host Mode:** a big-screen view for streams. Viewers answer on their phones with a 4-letter room code.

## Scoring

| | Points |
|---|---|
| Athlete | 1 |
| Pokémon | 1 |
| Both (bonus for the connection) | +1, so 3 total |

Answering on an earlier clue multiplies it: **clue 1 ×5, clue 2 ×4, clue 3 ×3, clue 4 ×2, clue 5 ×1**. The bonus uses the multiplier of whichever answer you got second. A perfect question is 15 points and a perfect Daily Contest is 150. The points available are shown as each clue appears.

There's no timer in the Daily Contest or Practice: players tap **Next clue** when they want more help, and the answer shows when both boxes are done or they tap **Reveal the answer**. To bring back automatic clues, set `clueSeconds` (e.g. 20) in `PLAY` in [`js/config.js`](js/config.js). Each box allows 3 guesses, and wrong guesses cost nothing.

---

## How it shares data and sign-in with ModiDex

**Data: read live from ModiDex, nothing copied.** Dual Threat reads `https://playmodidex.com/data/athletes.json` in the browser (GitHub Pages allows other sites to read it). Names, teams, numbers, positions and **comps** all come from there, so a comp written once in ModiDex shows up in both games. Dual Threat only keeps its own **clue file**, [`data/clues.json`](data/clues.json), linked to each athlete by their ModiDex `id`.

- If ModiDex changes an athlete's comp, that clue set is skipped (the clues would be about the wrong Pokémon) until you update it. `node tools/validate.mjs` tells you which ones.
- Clues use **tokens** like `{team}` and `{number}`, filled from ModiDex's data, so trades and new jersey numbers never make a clue wrong.
- If playmodidex.com can't be reached, the game uses the last copy the player's browser saw.

**Sign-in: same Firebase project, same account.** Dual Threat uses ModiDex's Firebase config, so signing in with the same Google account or email gives the same account and the **same username** on both sites. A username picked on either site works on both. Browsers keep sign-ins separate per website, so players sign in once on each site.

**Rules:** both sites share one set of Firestore rules, kept in **ModiDex's** [`firestore.rules`](../Pokemon/firestore.rules). The Dual Threat section adds `matchDaily` (leaderboards) and `matchRooms` (Host Mode).

---

## One-time setup before going live

1. **Publish the rules.** Copy ModiDex's `firestore.rules` into Firebase → Firestore → **Rules**, then click **Publish**. Until you do, the leaderboard says "couldn't load".
2. **Turn on guest sign-in for Host Mode.** In Firebase → Authentication → **Sign-in method**, enable **Anonymous**. Viewers join without an account. It doesn't affect ModiDex.
3. **Add the domain to Firebase.** Authentication → Settings → **Authorized domains**: add `playdualthreat.com` and `www.playdualthreat.com` (plus `modimd1992.github.io` if you use that address).
4. **Create the repo and turn on Pages.** Create a GitHub repo (e.g. `dualthreat`), push this folder, then Settings → Pages → Deploy from branch `main`, folder `/ (root)`.
5. **Domain.** Buy the domain (e.g. `playdualthreat.com` at Porkbun, like ModiDex). Add four `A` records for `@` pointing to 185.199.108.153, 185.199.109.153, 185.199.110.153 and 185.199.111.153, plus a `www` CNAME to `modimd1992.github.io`. Then create a file named `CNAME` in this folder containing just `playdualthreat.com`, and push. If you pick a different name, also change `siteUrl` in `js/config.js` and the `og:` image addresses in `index.html`.

## Run it on your computer

```bash
cd ~/DualThreat
node tools/serve.mjs
```

Then open http://localhost:8090. The dev server also serves your local ModiDex folder (`../Pokemon`), so the game uses your **unpublished** ModiDex comps. Without it, the game falls back to live ModiDex data.

Links: `#daily/nba`, `#practice/mlb`, or just `#nfl` jump straight to a mode.

---

## Adding or editing clue sets

Clue sets live in [`data/clues.json`](data/clues.json):

```json
{
  "athleteId": "nba-chet-holmgren",
  "pokemon": "Dragonair",
  "clues": [
    "It's still young, but it already carries itself like a veteran.",
    "Rivals find it much tougher than its frame suggests.",
    "Long, slender and graceful with surprising reach, it's still evolving into its final form.",
    "A rare, elegant Dragon-type that swats shots for a living in the {sport}.",
    "Wears #{number} for the {team} after starring at Gonzaga, and its first form is a tiny serpent."
  ],
  "why": "Chet Holmgren and Dragonair are both long, slender and graceful..."
}
```

**To add one:**

```bash
node tools/new-clue.mjs "cade cunningham"
```

That adds a draft to the end of the file, with the athlete's ModiDex comp and bio as notes (`_ref`). Write the 5 clues and the `why`, delete the `"draft": true` line, then check it:

```bash
node tools/validate.mjs
```

Other commands:
- `node tools/new-clue.mjs --list nba` lists NBA athletes that don't have a clue set yet.
- `node tools/validate.mjs --show chet` prints one set with the tokens filled in.
- `node tools/validate.mjs --today` prints today's Daily Contest answers (spoilers).

**Tokens** (filled from live ModiDex data): `{sport}` → NBA · `{team}` → Oklahoma City Thunder · `{position}` → power forward · `{number}` → 7 · `{division}` → Northwest Division / AFC North / AL East.

**Writing good clues**
- Every clue describes **both** the athlete and the Pokémon at once.
- **Clue 1 must not give either answer away.** Keep it to a broad trait that fits many players and many Pokémon. Save the famous hooks (Magikarp being useless, Mew's DNA, a player's signature story) for clue 3 or later.
- Clues 1–2: no sport, position, team, color or type.
- Clue 5 should make both gettable for a casual fan: usually `#{number} for the {team}` plus an unmistakable Pokémon trait.
- Never write the athlete's name, nickname, the Pokémon's name or its evolution relatives' names. The validator checks this.
- Use durable facts (draft, college, awards) rather than this season's stats.

**How many sets you need.** Each Daily Contest uses 10 per mode. With 60 sets (20 per sport), All Sports goes about 6 days before questions repeat, and each sport about 2 days. Repeats are spread out (each mode cycles through all its sets before reusing one), but more sets means fewer repeats. `node tools/validate.mjs` shows the current numbers.

**Changing sets mid-day.** A player's saved daily game keeps its questions. Adding or removing sets can change *later* players' questions for today, so publish clue changes late at night.

---

## Host Mode on a stream

1. Open **https://playdualthreat.com/host** on the computer you stream from (also linked in the footer as 🎥 Host Mode).
2. Pick the sport, number of questions, and clue timer (10/15/20 seconds, or Manual). Click **Create room**.
3. Share that browser window in OBS (Window Capture) or your streaming tool. The lobby shows the join address and a big 4-letter code.
4. Viewers go to **playdualthreat.com/join** on their phones and enter the code and a name. Names pop up in the lobby. Click ✕ on a name to remove (and block) that player.
5. Press **N** to start. Controls (also shown as buttons at the bottom):

| Key | Does |
|---|---|
| Space | Reveal the next clue now |
| A | Turn auto clues on/off (the countdown ring shows time to the next clue) |
| R | End the question and reveal both answers, the "why", and the leaderboard |
| N | Next question (or final standings after the last one) |
| H | Hide/show the control bar (so it's not on stream) |
| F | Full screen |

With auto on, the last clue counts down 20 seconds (`hostFinalSeconds`) and then reveals by itself. Refreshing the host page goes back into the same room. **End room** deletes the room and its players.

**Rehearse with no setup:** open `http://localhost:8090/host.html?local`, create a room, then open `http://localhost:8090/join.html?local` in other tabs. Local rooms only work between tabs of one browser.

Notes: scores are worked out on each viewer's phone, so a determined viewer could fake a score. That's fine for a fun stream game, but don't use it for prizes. Each viewer's phone writes once per correct answer, which is well within Firebase's free tier for stream-sized games.

---

## Files

```
index.html, host.html, join.html, privacy.html   pages
css/styles.css, css/host.css                     styles (colors at the top)
data/clues.json                                  ← the clue sets. Edit this.
js/config.js        name, URLs, timing, scoring, modes
js/data.js          loads ModiDex athletes + clue sets
js/clueset.js       joins clues to athletes, fills tokens, style checks
js/game.js          one question's state and scoring
js/question.js      the question screen (clues, timer, answer boxes, reveal)
js/daily.js         picks each day's 10 questions (same for everyone)
js/main.js          Daily Contest and Practice
js/cloud.js         sign-in (shared with ModiDex) and the leaderboard
js/room.js, host.js, join.js                     Host Mode
tools/serve.mjs     local dev server
tools/validate.mjs  checks clue sets
tools/new-clue.mjs  starts a new clue set
tools/bump-version.mjs   run before pushing js/css changes
tools/make-images.html   redraws the share image and icon
```

## Publishing updates

- **Clue changes only** (`data/clues.json`): run `node tools/validate.mjs`, then commit and push.
- **Code or styling** (`js/`, `css/`): run `node tools/bump-version.mjs` first, then commit and push.

## Staying clear of takedowns

Same approach as ModiDex: no official Pokémon art, logos or sprites. Pokémon appear as text only, for comparison. The logo and colors are original, and the footer has the "not affiliated" disclaimer. Don't put "Pokémon" in the site name, domain or thumbnails.
