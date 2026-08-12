# Capacitor Mobile App — Scoping Document

**Status:** Draft for review
**Goal:** Ship WCR Football App to the App Store and Google Play as a real installable app, with working push notifications, without rewriting the existing React/Vite/Supabase stack.

---

## 1. Why Capacitor

- Wraps the existing built app (`dist/`) inside a native shell — no rewrite of React code, routing, or Supabase integration
- Single codebase serves web (Netlify), iOS, and Android
- Gives access to native APIs we need: push notifications, deep links, splash/status bar theming
- Free and open source; no vendor lock-in beyond the wrapper itself

---

## 2. Prerequisites

| Item | Cost | Needed when |
|---|---|---|
| Apple Developer Program | **$99/year** | Once testing push notifications on a real iPhone, or before App Store submission |
| Google Play Console | **$25 one-time** | Before distributing to testers or publishing |
| Firebase project (FCM) | Free | Before building push notifications (step 5) |
| A Mac + Xcode | — | Required for any iOS build (Apple restriction, not Capacitor's) |
| Android Studio | Free | Any OS, needed for Android builds |

Confirms cost estimate given earlier in this project's planning conversation (~£100 total to get both store accounts active); the $99/€/£ figure varies slightly by source and exchange rate but is in the right range.

---

## 3. Current app — what Capacitor needs to know

Checked directly against this codebase before writing this scope:

- **Stack:** React 18 + TypeScript, Vite 6, Tailwind v4, Supabase (auth, DB, Realtime, Storage). Build output: `dist/`.
- **Auth flow:** `signInWithPassword` only (`src/contexts/AuthContext.tsx`). **No magic links, no OAuth providers in use.** This significantly reduces auth complexity versus the generic Capacitor+Supabase guidance — the PKCE + custom URL scheme + `exchangeCodeForSession` pattern (needed for magic-link apps) is **not required** for the core login flow.
- **Password reset:** `resetPasswordForEmail()` sends an email with `redirectTo: window.location.origin/reset-password`. Inside a wrapped native app, this link currently opens a browser rather than returning to the app. **Decision needed** — see open question 1 below.
- **Invite codes:** `/invite/:code` links (lite user registration, `LiteLandingPage.tsx`) are shared via email/SMS outside the app. These need to open the installed app directly (App Links on Android, Universal Links on iOS) rather than a browser. Already flagged as a future requirement in `KIRO_HANDOVER.md`.
- **Realtime:** Team Messaging (`MessagingContext.tsx`) relies on Supabase Realtime over WebSocket. Mobile OSes suspend WebSockets when the app is backgrounded — needs an explicit reconnect on app resume, or messages will appear frozen until manual refresh.

---

## 4. Build order

### Step 1 — Install & initialize Capacitor
```bash
npm install @capacitor/core @capacitor/cli
npx cap init
npm install @capacitor/app @capacitor/push-notifications @capacitor/status-bar @capacitor/splash-screen
```
- App ID must be a reverse-domain identifier (e.g. `nz.wcr.app`) — **cannot be changed later without relisting the app**. Needs deciding upfront.
- `capacitor.config.ts`: `webDir: 'dist'`, `server.androidScheme: 'https'` (avoids mixed-content issues with Supabase's HTTPS endpoints).
- Confirm `vite.config.ts` doesn't hardcode an absolute `base` path (should be default `/`) — Capacitor serves from `capacitor://localhost` / `https://localhost`, not a real domain.
```bash
npm run build
npx cap add ios
npx cap add android
```
Day-to-day loop from here: **edit code → `npm run build` → `npx cap sync` → run/test in Xcode or Android Studio.**

### Step 2 — Password reset link handling
Given email/password is the only login method, this is the only auth-adjacent piece needed (not the full magic-link deep-link pattern from generic guides). Two options:
- **A. Leave as-is:** reset link opens the device's default browser, user resets password there, then re-opens the app and logs in manually. Zero extra code. Slightly less polished, but perfectly acceptable for V1.
- **B. Wire up return-to-app:** register a custom URL scheme, catch it via `@capacitor/app`'s `appUrlOpen` listener, deep-link back into the app after reset. More native-feeling, more setup.
Recommendation: **Option A for V1**, revisit if it becomes a support pain point.

### Step 3 — Invite code deep links
For invite links (`/invite/:code`) to open the installed app instead of a browser:
- Android: **App Links** (`assetlinks.json` hosted on your domain + intent filter in manifest)
- iOS: **Universal Links** (`apple-app-site-association` file + associated domains entitlement)
This is separate infrastructure from step 2 and can be built independently. Worth scoping as its own small piece rather than bundling into initial Capacitor setup — not required to ship a working V1 app, but closes a real gap for the lite-user invite flow once native apps exist.

### Step 4 — Realtime reconnect on resume
```ts
import { App } from '@capacitor/app';
App.addListener('appStateChange', ({ isActive }) => {
  if (isActive) supabase.realtime.connect();
});
```
Small, cheap fix. Should be done before shipping Team Messaging on mobile — otherwise messages will look stalled after backgrounding.

### Step 5 — Push notifications (the core V1 gap)
1. Firebase project → add `google-services.json` (Android) + `GoogleService-Info.plist` + APNs key (iOS)
2. Register device, store token in a new `device_tokens` table in Supabase
3. Supabase DB webhook on relevant table INSERT (e.g. `events`, `announcements`, or a new `messages` row) → Edge Function → looks up tokens → posts to FCM
4. This is the single feature that most closes the credibility gap with Heja — a schedule change or new message should push a notification, not just update silently in-app

### Step 6 — Native shell polish
- Icons/splash: `npx capacitor-assets generate` from one source image
- Safe area insets in global CSS for iPhone notch/home indicator
- `@capacitor/status-bar` to match club branding instead of OS default

### Step 7 — Store submission
- **Apple** is stricter — Guideline 4.2 rejects "bare webview" apps. Push notifications + native navigation (which we'll have) are enough to clear this. Review: hours to a few days, budget for one resubmit cycle on first attempt.
- **Google Play** review is typically faster and more lenient on wrapped web apps.
- Both require: privacy policy URL (mandatory given Supabase collects personal data), app icon + screenshots, Apple's App Privacy questionnaire / Google's Data Safety form.

---

## 5. Sequencing relative to the rest of V1

Per the earlier planning conversation, the three critical V1 gaps versus Heja are: **RSVP, push notifications, and app distribution.** Recommended order:

1. Capacitor setup (Step 1) — no store accounts needed yet, test on emulator/sideloaded Android APK
2. Push notifications end-to-end (Step 5) — this is when the Apple Developer account becomes necessary, since APNs testing requires a real device + paid account
3. Realtime resume fix (Step 4) — quick, do alongside step 5
4. RSVP feature — build with push notification triggers already in place, so RSVP reminders work from day one
5. Store accounts + submission (Step 7) — Google Play when ready for testers; Apple account should already exist from step 2
6. Invite deep links (Step 3) — can trail behind, not required for initial ship

---

## 6. Open questions

1. **Password reset UX** — accept Option A (browser handoff) for V1, or invest in Option B (return-to-app) now?
2. **App ID** — what reverse-domain identifier do we lock in? (e.g. `nz.wcr.app`, `com.wcrfootball.app`) — cannot change post-launch without relisting.
3. **Push notification triggers** — which events should fire a push in V1? Candidates: new schedule event, event change/cancellation, new team message, RSVP reminder (pending RSVP feature). Recommend scoping this list explicitly before building the Edge Function.
4. **Privacy policy** — does one already exist for WCR Football App? Required by both stores before submission.

---

## Sources
Original technical brief drafted by the user (via Claude) and reviewed against this codebase. Store guidance and Capacitor/Firebase integration details:
- [Sending Push Notifications — Supabase Docs](https://supabase.com/docs/guides/functions/examples/push-notifications)
- [Push Notifications - Firebase | Capacitor Documentation](https://capacitorjs.com/docs/guides/push-notifications-firebase)
- [App Store Review Guidelines: Guideline 4.2](https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper)
