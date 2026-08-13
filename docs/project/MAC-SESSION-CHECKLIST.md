# Mac Session Checklist — Capacitor Device Testing

**Goal for this session**: get the app building and running in Xcode
(simulator first, then a real device if possible), test push notification
registration end-to-end, and complete the Firebase/Supabase setup that
needs a working native build to verify.

Machine: daughter's Mac (macOS Tahoe 26.4.1 — confirmed compatible with
Xcode 26.6, the current stable release, and there's 402GB free, well
above what's needed).

---

## Before you go (prep at home)

- [ ] Copy `.env.development` from this project onto a USB stick (or
      similar offline transfer — **not** email/chat, it contains real
      Supabase credentials). This file is `.gitignore`'d, so it will
      **not** come across with the git clone.
- [ ] Confirm you know your GitHub login (`Mikebrooke65`) — you'll sign in
      on her Mac too, same as we did on this laptop today.
- [ ] Ask her to start downloading **Xcode** from the Mac App Store before
      you arrive if possible — it's a large download (several GB) and this
      saves a lot of dead time on the day.
- [ ] Bring this checklist (or have this repo accessible some other way)
      so you're not relying on memory.

---

## On arrival — setup steps (in order)

### 1. Confirm Xcode is installed
- Open **Xcode** from Launchpad/Applications. If it's not there yet, install
  from the Mac App Store now (search "Xcode").
- First launch will prompt to install additional components — say yes,
  this includes Command Line Tools and typically installs Git too.

### 2. Confirm Git works
Open **Terminal** (Applications → Utilities → Terminal, or Spotlight
search "Terminal") and run:
```bash
git --version
```
If it's not installed, macOS will usually prompt you to install Command
Line Tools right there — follow that prompt.

### 3. Install Kiro
Download and install Kiro the same way you did on this laptop (from
kiro.dev, or wherever your original install came from). Drag to
Applications, open it, sign in with your usual account.

### 4. Clone the repository
In Terminal, navigate to wherever you want the project folder (e.g. `~/Documents`), then:
```bash
git clone https://github.com/Mikebrooke65/WCR-Football-App.git
cd WCR-Football-App
```

### 5. Sign in to GitHub on this machine
```bash
gh --version
```
If `gh` (GitHub CLI) isn't installed, install it via Homebrew:
```bash
brew install gh
```
(If Homebrew itself isn't installed, it'll prompt you to install it, or
get it from brew.sh first.)

Then authenticate:
```bash
gh auth login
```
Same flow as before — choose GitHub.com, HTTPS, login with browser.

### 6. Open the project in Kiro
Open Kiro → open the `WCR-Football-App` folder you just cloned. From here,
I (Kiro) will have the same access to this project as I've had on your
Windows laptop.

### 7. Copy the `.env.development` file across
From your USB stick, copy `.env.development` into the root of the cloned
`WCR-Football-App` folder (same level as `package.json`). Without this,
the app won't be able to connect to Supabase.

### 8. Install project dependencies
Ask me to run this once I'm in — it wasn't included in the git clone,
it needs rebuilding fresh on this machine:
```bash
npm install
```

### 9. Install CocoaPods (needed for the iOS build)
```bash
sudo gem install cocoapods
```
(This will ask for her Mac login password — that's normal, `sudo` needs
admin rights to install system-wide.)

---

## The actual work, once setup is done

Ask me to:

1. Run `npm run build` to produce a fresh `dist/`
2. Run `npx cap sync` to make sure the native projects are up to date
3. Run `npx cap open ios` — this opens the project in Xcode directly
4. From Xcode: select a simulator (e.g. iPhone 16), press the ▶ Run button
5. Confirm the app launches in the simulator and looks right
6. Log in with the test credentials (see `docs/deployment/DEPLOYMENT.md`)
7. Confirm the push notification permission prompt appears (simulators
   can request permission but can't actually receive real pushes — for
   that you'll need a real iPhone plugged in via cable, selected as the
   run target in Xcode instead of a simulator)
8. If a real iPhone is available: plug it in, select it as the run target,
   run again, accept the permission prompt, then check the `device_tokens`
   table in Supabase to confirm a real token was saved

---

## If time allows: Firebase service account key

This doesn't need Xcode at all, just a browser — could be done at any
point during the day, or even beforehand:

1. Firebase Console → `club-football-app` project → gear icon (Project
   Settings) → **Service Accounts** tab → **Generate new private key**
2. Store it as a Supabase secret (dashboard → Edge Functions → Secrets, or
   via CLI) — full instructions in
   `supabase/functions/send-message-push/README.md`
3. Once that's done, ask me to deploy the Edge Function and we can set up
   the Database Webhook to test a real end-to-end push notification

---

## Known blockers / things that might come up

- **No paid Apple Developer account yet** — simulators work fine without
  one, but testing push notifications on a *real* iPhone and any App
  Store submission later will need the $99/year account. Not required
  for this session's goals (simulator testing + basic real-device run),
  but flag it if push notifications need real-device confirmation today.
- **First Xcode build can be slow** — indexing and initial build times are
  normal to take several minutes the first time. Not a sign anything's
  wrong.
- **CocoaPods install can be slow/fussy on first run** — if `sudo gem
  install cocoapods` fails, it's sometimes a Ruby version issue on macOS;
  let me know the exact error and I'll troubleshoot from there.
