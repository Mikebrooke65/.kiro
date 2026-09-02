# Gant — AI Coaching Feedback Assistant — Requirements

**Status: DRAFT v3 — talked through with the repo owner 2026-09-03, not yet built.**
**Supersedes:** the v1 and v2 drafts of this file (2026-09-03, same day). v1
guessed at a dedicated `/ai-coach` picker screen and a Gant-initiated
clarification model — wrong. v2 fixed that but left several items open (team
notes location, video-review handling, child visibility, editable fields,
naming) — this version closes most of them. Kept in git history if needed;
this file is now the source of truth.

**Origin:** Gant was scoped as future V2 work in two planning docs
(`docs/project/GANT-AI-REQUIREMENTS.md` and
`docs/project/GANT-COACH-GUARDRAILS-CONVERSATION-GUIDE.md`). The repo owner is
considering pulling it forward ahead of its V2 slot. This spec turns those
planning docs — plus a detailed walkthrough of the actual desired screens and
flow — into a buildable requirements set.

**Source of truth for intent:** the two original Gant docs for the *purpose and
constraints* (privacy, model choice, tone philosophy); this spec for the
*screens, data model, and mechanics*, which are now considerably more concrete
than those docs described.

---

## 0. Scope and non-goals

**In scope (V1 of Gant):**
- A **person-detail screen**, reached from the Team page roster, that is the
  single home for an individual's coaching notes and (separately) their
  editable personal fields — see Section 2.
- A **capture** mechanism for a coach/admin to record a raw observation about a
  player or team (Section 3) — v1 build is **one player/team at a time**
  (Section 3.1). Continuous, multi-player dictation with auto-segmentation
  (Section 3.2) is explicitly **phase 2**, scoped now so v1 doesn't block it,
  but not built now.
- A **review** mechanism — entirely separate from capture — where a pending raw
  entry is turned into approved, saved feedback via Gant refinement and a
  coach-driven tick/cross/"Work on" loop (Section 4).
- A **pending queue** so capture and review don't have to happen at the same
  moment (Section 5).
- The Gant guardrails (phases of play, feedback model, tone guide) as **admin-
  editable data via a real desktop screen**, not a SQL-editor workaround
  (Section 9).
- A **guardrails feedback-loop signal** — tracking which entries needed many
  "Work on" rounds or got crossed a lot, surfaced to admins so they can tune the
  guardrails document (Section 10). Human-mediated; the model itself does not
  learn or retrain (Section 8.2).

**Explicitly NOT in scope for this spec (deferred):**
- **Phase 2 — continuous multi-player dictation** with automatic segmentation
  and roster name-matching (Section 3.2). Scoped here so it plugs into the same
  review mechanism later, but not built in this pass.
- **Player-facing self-reflection**, where Gant converses directly with a child.
  Separate safety/design problem, own future spec. Gant only ever talks to
  coaches/admins here.
- **Auto-populating the biannual report card** from accumulated notes. Design
  should keep this *possible* (phase tags, dated entries) but not build it.
- Any change to the existing lesson/session **rating** feedback
  (`session_feedback`, `lesson_feedback`) — untouched, different concern.
- **Editable personal fields** (contact details, etc.) — explicitly **removed
  from this spec's scope** (confirmed 2026-09-03). Whether/how fields like phone
  number become editable in-app, and by whom, is its own decision (risk of
  conflicting with registration/invite-time data — e.g. DOB-driven adult/child
  routing) and needs its own conversation, unrelated to Gant. See Section 12.5.
- **Team page / roster layout redesign** — the roster row already carries Make
  Manager, Make Coach, Give App Access, Add Player, and Remove; this spec adds
  a route into the person-detail screen and a team-notes link on top of that.
  The **visual layout** of the Team page is its own body of work, related to
  but not solved by this spec — see Section 12.6.

---

## 1. Entry point — the Team page roster

**Current state (verified):** `TeamPage.tsx` already shows a roster grouped
Coach → Manager → Player, with age-band-aware contact display and role-gated
actions. There is currently no per-person detail screen — tapping a row does
nothing beyond the inline actions already there (Accept/Deny, Remove, etc.).

- **1.1** — Tapping/selecting a **person's row** on the roster opens a new
  **person-detail screen** for that person (Section 2). This is the single
  entry point for coaching notes — there is no separate dedicated Gant page
  with its own team/player pickers.
- **1.2** — Who can open whose person-detail screen, and what they can do there,
  is role-gated (ties to Section 6):
  - **A player** (or their **caregiver**, acting on their behalf) can open
    **their own** (or their child's) person-detail screen: view notes, view/edit
    their allowed personal fields. They **cannot** add a coaching note.
  - **A coach** can open **any player's** person-detail screen on a team they
    coach: view that player's notes **and add a new note** from that screen.
  - **An admin** can open **anyone's** person-detail screen, same capability as
    a coach, across all teams.
  - A **caregiver sees exactly what their linked child sees** — same screen,
    entered via "my child" rather than themselves (consistent with existing
    caregiver-contact visibility on the roster today).
- **1.3** — **Games page quick link.** The Games page (`src/pages/Games.tsx`)
  already has a per-team context and a player selector for its existing
  free-text feedback form. Instead of a separate capture UI, the "Ask AI Coach"
  /  equivalent entry point on the Games page becomes a **quick link that jumps
  straight into the Team roster/person-detail screen for the team already in
  context** — and, if a player is already highlighted/selected on the Games
  page, straight into *that player's* person-detail screen. This saves the coach
  re-selecting a team they may have several of. **Confirm at build time** that
  `Games.tsx`'s existing `selectedPlayerId` state is available to carry through
  the link.

---

## 2. The person-detail screen

**v1 scope: notes-only** (editable personal fields removed — see 2.2/12.5).
Permission-gated per 1.2:

### 2.1 Coaching notes feed

- **2.1.1** — A list of that person's approved coaching notes (working name —
  Section 13 naming TBD), **newest first**. Each entry shows: **the comment
  text, who said it (the coach's name), and the date**.
- **2.1.2** — **At the top of the list, an automatically generated summary of
  roughly the last 10 notes.** This is a genuine Gant task (a synthesis call,
  not a replay of stored text) — see Section 7 for how/when it's generated.
- **2.1.3** — Same non-disclosure rule as individual notes (Section 6.4): the
  summary and every note read as if written by the coach/club. Nothing in this
  UI ever indicates Gant was involved.
- **2.1.4** — A coach/admin viewing someone else's screen sees the same notes
  feed, **plus** the ability to add a new note (Section 3) right there, in
  context — i.e. this screen is one of the entry points into capture, not just
  a read view.

### 2.2 Editable personal fields — REMOVED FROM SCOPE (confirmed 2026-09-03)

Not part of this spec. See Section 12.5 for why and where this belongs instead.
The person-detail screen in v1 of this build is **notes-only** — no fields
panel.

### 2.3 Found while discussing this — existing visibility gap, not a Gant item

**A player currently cannot see their own phone number on the roster** — it is
visible today only to coaches/managers/admin. Flagged as a real gap (a player
can't tell if their number is missing or wrong) but **out of scope for this
spec** — track separately in `NEXT-SESSION-NOTES.md`, not as a Gant task.

---

## 3. Capture — recording a raw observation

**Capture and review are two separate, independently built surfaces** (repo
owner's explicit instruction). Capture's only job is to produce a **pending
entry** (Section 5) tied to a player or a team. It does not refine, does not
show Gant's response, and does not resolve anything.

### 3.1 V1 — single player/team at a time

- **3.1.1** — The coach/admin selects **one player, or the team**, then
  **dictates or types** one raw observation. Both input modes work identically
  everywhere this screen appears (person-detail screen, Games-page quick link).
- **3.1.2** — Submitting creates one pending entry: `{ team_id, player_id?
  (null = team feedback), raw_text, event_type?, event_id?, captured_at,
  captured_by }`. No Gant call happens at capture time (refinement is a review-
  time step, Section 4) — **OPEN: confirm whether refinement should actually
  fire immediately on capture (as the original Gant docs assumed) or only when
  the coach opens the entry for review.** This matters for the "quick-fire,
  review later" behaviour in 3.1.3 — see the note there.
- **3.1.3** — **Quick-fire capture:** a coach can capture several entries in a
  row (moving from player to player) with **no obligation to review each one
  immediately**. Every capture lands in the same pending queue regardless —
  there is no separate "quick-fire mode" toggle; it's simply the coach's choice
  in the moment whether to open an entry for review right away or keep
  capturing and come back later.

### 3.2 Phase 2 (future, not built now) — continuous multi-player dictation

Scoped now so v1's data model and review mechanism don't need rework later.

- **3.2.1** — A coach on a team screen can dictate **continuously** across
  multiple players in one recording, e.g.: *"Mike — [pause] — that dribbling in
  midfield was perfect... John Smith, your quick passes are..."* — naturally
  naming who each part is about, the way a coach actually talks.
- **3.2.2** — This requires a **segmentation step** (not part of v1): splitting
  the continuous transcript into chunks (by pause and/or name-spotting), then
  **matching each spoken name against that team's roster** (tolerant of messy
  speech-to-text) to resolve a `player_id` per chunk.
- **3.2.3** — **Privacy boundary for phase 2 (confirmed acceptable by the repo
  owner):** the coach necessarily says names out loud — that's inherent to
  natural dictation and can't be designed away. The boundary is drawn
  **immediately after name-matching**: once a chunk is resolved to a
  `player_id`, the **name itself is dropped** and every downstream step
  (refinement, clarification, storage) only ever carries the `player_id`, same
  as the rest of this spec's privacy rule (Section 8.1). Matching happens once,
  locally to the matching step; it does not need to be sent to or logged
  by the Anthropic call.
- **3.2.4** — **OPEN:** whether name-matching/segmentation needs its own AI call
  or can be simple fuzzy string matching against the team roster (likely
  sufficient, and cheaper/faster/more private — decide at build time).
- **3.2.5** — Once segmented and matched, each chunk becomes an ordinary pending
  entry (3.1.2's shape) and flows into the **same** review mechanism as v1 —
  phase 2 only replaces how entries get into the queue, not what happens next.

---

## 4. Review — the tick / cross / Work-on loop

This is the actual screen mechanic, confirmed in detail. It operates on **one
pending entry at a time**, reached either right after capture or later from the
pending queue (Section 5).

- **4.1** — Opening a pending entry shows a **header**: team, player name (or
  "Team"), event type (game/training/video-review), date. Below it, the
  **coach's original raw input** (as captured, unedited) is always visible.
- **4.2** — Gant is called to process the accumulated input so far (the original
  raw text, plus any "Work on" rounds already added — Section 4.5). It returns
  **one of two things**, rendered in the response box below the original input:
  - **A refined comment** — normal styling. This is Gant's attempt at a clean,
    club-standard piece of feedback from what the coach has given it so far.
  - **A clarifying question** — visually distinct styling (different colour/
    font from a refined comment), used when Gant cannot confidently produce a
    refined comment from what it has (e.g. an ambiguous phase of play, missing
    context).
- **4.3** — Available actions depend on which of the two the response box is
  showing:
  - **If it's a refined comment:** **✓ Tick** (approve — save it, done),
    **✗ Cross** (discard everything for this entry, stop, nothing saved), or
    **Work on** (add more input — see 4.5).
  - **If it's a clarifying question:** **no tick available.** Only **✗ Cross**
    (discard, stop) or **Work on** (answer the question — see 4.5).
- **4.4** — **✓ Tick is the only way a note gets saved.** **✗ Cross ends the
  process from any state with nothing saved** — the raw input and any
  in-progress refinement are discarded.
- **4.5** — **"Work on" accepts anything** — the coach can dictate or type
  *any* further input (a correction, additional detail, an answer to a
  question, or a completely different angle — coach's choice, no constraint on
  what "Work on" input has to be). Gant reprocesses the **accumulated** context
  (original input + every prior "Work on" round) and returns, again, either a
  new refined comment or another clarifying question. The loop repeats for as
  many rounds as needed.
- **4.6** — **No cap on the number of "Work on" rounds.** Open-ended by design —
  a hard limit protects against a cost/frustration problem that doesn't
  meaningfully exist here (the ✗ cross already lets a coach bail out any time),
  and round count is expected to fall naturally as coaches get better at
  giving Gant enough up front. (See Section 10 for using round-count as a
  guardrails-quality signal instead of a hard limit.)
- **4.7** — Both **typed and dictated** input work identically at every step of
  this loop — original capture, every "Work on" round, answering a question.
- **4.8** — On **✓ Tick**, the approved feedback is saved (Section 6) and the
  raw/unrefined input for that entry is discarded — it is not retained
  separately once approved.

---

## 5. The pending queue

- **5.1** — Every captured entry (Section 3) lands in a **pending queue**,
  scoped to its capturing coach (and visible to admins). There is no forced
  immediate review.
- **5.2** — A coach can see their outstanding pending entries and open any one
  of them, in any order, to run it through the review loop (Section 4).
  **OPEN:** exact list UX (flat/grouped/sorted) — not walked through yet; a
  simple chronological list is a safe default to build first.
- **5.3** — An entry leaves the queue only when it is **ticked** (saved) or
  **crossed** (discarded). There is no third "leave forever unresolved" outcome
  — an entry can sit in the queue indefinitely, but it always eventually
  resolves one of those two ways when opened.

---

## 6. Storage, roles, and disclosure

**Current state (verified):** `game_feedback` RLS today allows SELECT/INSERT
for admins, coaches, and managers (of their team); no player/caregiver read
policy exists yet.

- **6.1** — Approved (ticked) feedback is stored per person or per team, tied to
  an event where applicable, with **who wrote it and when** (Section 2.1.1).
- **6.2** — Write access (capture + review + tick) is Coach and Admin, plus a
  Manager who holds coach authority on that team (`is_coach`) — the same rule
  already governing the Coaching tab (`tabsForRole` in `main-layout-logic.ts`).
  A plain Player/Manager/Caregiver cannot write notes, only read their own
  (Section 1.2).
- **6.3** — Read access for the **notes feed** on the person-detail screen:
  that person themselves, **AND** (not "or") their caregiver — **confirmed
  2026-09-03: both see it.** A logged-in child (device-login model) sees their
  own status/notes directly, exactly as their caregiver does; this is not an
  either/or. Plus any coach/admin. Never any other player/caregiver.
- **6.4** — Gant's involvement is **never disclosed to players/caregivers**.
  Every note and the auto-summary read as being from the coach. No
  "AI-assisted" flag is ever shown to them (internal `gant_assisted` marker
  stays admin/reporting-only). **OPEN:** whether the **coach** sees the name
  "Gant" anywhere in their own capture/review screens, or whether that name is
  purely internal (admin/build conversation only) even to coaches — ties into
  the naming decision, Section 12.6.
- **6.5** — **Team-scoped notes location (confirmed 2026-09-03):** team notes are
  **not** a separate screen. They live on the **Team roster page itself**, via
  a "Notes" link/section below the team name — same list-plus-summary pattern
  as the person-detail screen (Section 2.1), just scoped to
  `feedback_type='team'` for that `team_id` instead of a player. Read access:
  every member of that team (any role), same disclosure rule as 6.4.

---

## 7. The auto-summary (top of the notes feed)

- **7.1** — The summary at the top of a person's notes feed (2.1.2) synthesizes
  roughly their **last 10** approved notes into a short overview. Exact N could
  become admin-configurable later; 10 is the agreed default.
- **7.2** — **OPEN — generation timing:** computed fresh every time the screen
  is opened (simplest, one extra API call per view), or generated/cached
  whenever a new note is ticked and just re-displayed on open (cheaper, needs
  an invalidation trigger on new-note-approval). Decide at build time; caching
  on approval is the likely better default given this is read often and
  written rarely.
- **7.3** — Same privacy rule as everywhere else (Section 8.1): the summary call
  only ever receives the player's User ID plus their note texts/dates/phase
  tags — never their name or other identifying fields.

---

## 8. Privacy and AI-layer constraints (unchanged from the original Gant docs)

- **8.1** — Only a **User ID** and note text/tags/dates are sent to the
  Anthropic API for refinement, clarification, and summarisation. No player/
  coach name, email, phone, or DOB — **except** the necessary, deliberately
  scoped exception in Section 3.2.3 (phase 2 name-matching, resolved locally,
  never forwarded).
- **8.2** — Gant does **not** learn or improve automatically — Anthropic does
  not train on API request content. Any improvement in Gant's output over time
  comes from a **person editing the guardrails document** (Section 9), informed
  by the usage-signal feedback loop (Section 10) — not from the model adapting
  itself. This is deliberate: an edited guardrails document is transparent and
  reversible; silent model drift would not be.
- **8.3** — The Anthropic API key lives only as a Supabase secret, read
  server-side, never shipped client-side (mirrors `send-email`'s
  `RESEND_API_KEY` pattern).
- **8.4** — Raw audio, if ever recorded (only relevant to the offline fallback,
  Section 11), never leaves the device and is deleted immediately after
  on-device transcription.
- **8.5** — Approved notes are personal information under the NZ Privacy Act
  2020, retained per the same rules as other personal data (ties to V1.R
  retention work and the privacy policy — Gant needs its own privacy-policy
  section before any public/store release).

---

## 9. Guardrails — admin-editable, from the desktop

**Prior art (added 2026-09-03, from web research — this is a well-mapped
problem, not a blank page):** the guardrails conversation guide now includes a
"Prior art" section citing **Hattie & Timperley's feedback model**
("feed up / feed back / feed forward" — where am I going, how am I doing,
where to next) as a starting structure to bring to the coach session, and
flags that the **"compliment sandwich" format lacks strong evidence support**,
particularly with young athletes — directly relevant context for the
already-agreed all-positive-feedback decision (this doc's Req 3.3). See
`docs/project/GANT-COACH-GUARDRAILS-CONVERSATION-GUIDE.md` for detail and
sourcing. **Also worth knowing:** Gant is not a speculative product category —
live competitors doing adjacent things include **Feedz** (voice-to-report AI
coaching feedback, sport-agnostic) and **Coach Sidekick** (full-session
transcript feedback, attributed per-player, coach-approved before release).
Neither uses this spec's tick/cross/Work-on iterative-refinement loop, which
remains a genuine differentiator worth being aware of, not something to
replicate.

- **9.1** — The guardrails (phases-of-play list, feedback model, tone guide —
  produced by the coach working session, Section 0 in tasks.md) are stored as
  **data**, not code, and are editable **only by admins**, from a **real
  desktop admin screen** — not a SQL Editor workaround. This is an upgrade from
  the original draft, which had deferred a UI; the repo owner confirmed this
  should be a proper screen for v1.
- **9.2** — Editing the guardrails takes effect immediately on the next Gant
  call — no app rebuild, no redeploy, no store review cycle.
- **9.3** — The guardrails prompt is reused on every request and should use
  Anthropic prompt caching to control latency/cost.

---

## 10. Guardrails feedback loop (usage signal → admin review)

Confirmed as a genuine v1 design element, not deferred.

- **10.1** — The system tracks, per resolved entry: **how many "Work on" rounds
  it took**, and **whether it ended in tick or cross**.
- **10.2** — These signals are aggregated and surfaced to **admins** (likely on
  the same desktop guardrails screen, Section 9) — e.g. "entries needing 4+
  rounds this month," "entries that were crossed" — so an admin can spot a
  pattern (a phase that's consistently hard to tag, a tone rule coaches keep
  fighting) and **manually update the guardrails document** in response.
- **10.3** — This is explicitly **human-mediated**, not automatic. The model
  does not retrain; a person reads the signal and edits text (ties to 8.2).
- **10.4** — **OPEN:** the exact reporting view (raw list vs aggregated
  pattern-detection) is not designed yet — reasonable to build simple first
  (a sortable list of high-round-count / crossed entries) and refine later.

---

## 11. Offline / dictation handling (unchanged from the original Gant docs)

- **11.1** — Speech-to-text runs on-device (a Capacitor plugin, or Web Speech).
  No speech plugin is installed yet — adding one is part of this build.
- **11.2** — **Preferred: text-level offline queue.** If on-device recognition
  works without connectivity, raw text is captured and queued locally; only the
  Gant call (refinement/clarification/summary) waits for connectivity.
- **11.3** — **Fallback: audio-level offline queue**, only if on-device
  recognition itself needs connectivity — audio held locally, transcribed
  on-device once online, deleted immediately after (8.4). Needs a privacy-
  policy addition if this path is taken.
- **11.4** — **OPEN:** confirm at build time whether the chosen speech plugin
  supports offline recognition (decides 11.2 vs 11.3).

---

## 12. Deferred / not covered, and resolutions from the 2026-09-03 follow-up

**Resolved this session:**

- **Team-level notes location** — see Section 6.5. Lives on the Team roster
  page, not a separate screen.
- **Video-review event handling (confirmed 2026-09-03) — no new mechanism.** A
  coach reviewing footage uses the **exact same capture flow already defined**
  (Section 3.1) — quick-firing through several observations in a row, or one at
  a time, identical to pitch-side capture. `event_type='video_review'` is
  purely a label on the entry, not a different UI or code path.
- **Logged-in child's own-notes visibility** — see Section 6.3. Resolved: yes,
  directly, same as their caregiver.

**Still genuinely open:**

- **12.4** — **Progression review** (Gant noting "same issue as last time" while
  a coach is writing a *new* note) was in the original Gant docs (§5) but not
  walked through this session. It's related to, but distinct from, the
  auto-summary (Section 7) — the summary is read-side (shown to the
  player/caregiver); progression review would be write-side (shown to the
  coach while capturing). Worth a dedicated short conversation — not designed
  yet.
- **12.5** — **Editable personal fields — removed from this spec's scope**
  (confirmed 2026-09-03; see Section 2.2). This belongs to a separate future
  conversation about `TeamPage.tsx`/registration-integrity: which fields are
  safe to edit post-registration without conflicting with invite/confirmation
  records or DOB-driven adult/child routing, and who should be able to edit
  them. Not a Gant requirement. **Related, found-but-unrelated gap:** a player
  currently cannot see their own phone number on the roster at all (visible
  today only to coaches/managers/admin) — track in `NEXT-SESSION-NOTES.md`,
  not here.
- **12.6** — **Team page / roster layout.** The roster row already carries Make
  Manager, Make Coach, Give App Access, Add Player, and Remove; this spec adds
  a route into the person-detail screen (Section 1) and a team-notes link
  (Section 6.5) on top of that. The repo owner flagged the page as "already
  quite messy" — a **visual redesign of the Team page/roster is its own body of
  work**, related to but not solved by this spec. Recommend scoping it
  separately once Gant's screens exist and the actual crowding is visible, or
  in parallel if the button count is already a known problem today.
- **12.7** — **Session suggestions** (Gant docs §7 — practice ideas based on
  identified needs) — untouched, still a phase-2/-3 idea.
- **12.8** — **Naming — the biggest open item per the repo owner (2026-09-03).**
  Two separate names are actually in play:
  1. **"Gant"** itself — the backstage AI layer, never disclosed to players/
     caregivers (6.4). Open sub-question: is "Gant" known even to the *coach*
     using the capture/review screens, or is that name purely internal
     (admin/build-time only), with the coach seeing a different, undisclosed-
     as-AI label too?
  2. **The user-facing feature name** — whatever a player/caregiver/coach sees
     in the UI for the roster's notes link, the person-detail notes feed, and
     the capture/review screens. Candidates discussed: "Coaching Notes" (plain,
     clear), "The Notebook" (more distinctive as a named feature, extends
     naturally to "Team Notebook"), "Progress Notes" (growth-oriented framing,
     matches the tone-guide spirit), "Player Journal/Diary" (personal but
     doesn't extend well to the team-level case).
  **Not decided.** Candidate options could be brought to the Task 0 coach
  guardrails session (Section 9/10 dependency) since that session is already
  about the club's voice — reasonable place to get input, but the repo owner's
  call either way.
