# Streamlined Invites & Child Account Access — Requirements

**Status: DRAFT — for review, not yet built.**
**Date: 2026-08-25.**
**Origin:** live-testing the `add-player-and-dob-age-model` spec (shipped
2026-08-21) surfaced two real UX gaps, which were fixed same-day (see
`CHANGELOG.md`'s two 2026-08-25 entries). Working through those gaps in
conversation led to a bigger rethink of how Add Player, invite redemption,
and the Junior/child model should work — this document is that rethink,
written up as one place to review before any of it is built.

**Relationship to the existing spec:** this **extends and partially
supersedes** `.kiro/specs/add-player-and-dob-age-model/requirements.md` —
specifically Requirement 1.2 (Add Player's DOB capture), Requirement 3.4
(adult self-declaration), and Requirement 4.1 (Junior DOB capture). It does
not touch Requirements 5–8 (caregiver invites, roster visibility, Approvals
nav) except where noted. It also **reverses** a decision recorded in
`NEXT-SESSION-NOTES.md` under "Adult / Child User Model — CONFIRMED &
EXPANDED (2026-08-18)": Model A ("child never logs in") is no longer the
agreed model — see Section 4.

---

## 1. Add Player capture — simplified

**Current behaviour:** the Manager types an exact date of birth for the
person being added, which routes Adult vs Junior at a 16-year threshold
(Requirement 1.2/2.1 of the existing spec).

**New requirement:** a Manager rarely knows an exact birthdate for someone
they're adding — they know the person's name and roughly whether they're an
adult or a child. Add Player should ask for exactly that:

- **1.1** — Name of the person being added.
- **1.2** — A tick/toggle: **Adult** or **Child**. This replaces the exact
  DOB field as the routing input. No calendar date is typed by the Manager
  at this step, for either branch.
- **1.3** — If **Child** is ticked: caregiver's name and caregiver's email
  (unchanged from today — see Section 3 on why this stays a real, required
  email, not a best-effort field).
- **1.4** — If **Adult** is ticked: the adult's own email (unchanged from
  today — see Section 3).

**Rationale:** the exact DOB is not something the Manager can be expected to
know reliably, and asking for it invites guesswork that nobody downstream
ever independently checks (this is exactly the shape of the "Caregiver DOB
Correction Threshold" gap parked in `NEXT-SESSION-NOTES.md` — see Section 8.1
for how this section resolves it). The Adult/Child tick is a judgement call
the Manager is actually equipped to make.

---

## 2. Existing-user bypass

**Current behaviour:** every invite — Add Player (adult), a caregiver
invite, and the Club Admin flow that assigns an already-verified user as a
new team's Manager — sends the recipient through a full "create your
account" registration form (name, password, DOB, privacy consent), even
when that email already belongs to a real, verified account. The server
already handles this safely today (confirmed in `redeem-invite/index.ts`:
an existing profile means nothing is created or overwritten, the person is
just added to the new team) — but the client shows the full form regardless,
and everything typed into it is silently discarded.

**New requirement:**

- **2.1** — Before rendering the registration form, check whether the
  invite's recipient email already belongs to a real account.
- **2.2** — If it does: skip the registration form entirely. Show a short
  "You already have an account — join {team} as {role}?" confirmation and a
  single action that adds the existing account to the new team, with no
  name/password/DOB fields shown at all.
- **2.3** — If it doesn't: today's registration form, as modified by
  Sections 1, 3, and 4 below.
- **2.4** — Applies to **every** invite-generation path that can name an
  already-existing user, not just Add Player: the caregiver-invite path, and
  the Club Admin "assign an existing verified user as a new team's Manager"
  flow (`CompetitionsPage.tsx`).

**Resolves:** the "Existing-User Invite Shortcut" item parked in
`NEXT-SESSION-NOTES.md` — see Section 8.2.

**Open implementation note:** this needs a small, narrowly-scoped server
check the (unauthenticated) redemption page can call before it knows
anything else about the invite — today nothing exposes "does this email
have an account" to the client at that point. Scope it to the specific
invite code already in hand (not an arbitrary-email lookup), to avoid
turning it into a general email-enumeration endpoint.

---

## 3. Email stays verified — explicitly not a "best attempt" field

Early in this conversation, a version of this redesign considered letting
the Manager share a bare invite link over any channel (WhatsApp, Messenger,
etc.) with no email captured at all, treating the eventual email as
something the recipient fills in and confirms themselves — the same
treatment as the name fields.

**This was explicitly walked back.** Decision: **keep the current, already-
shipped behaviour** — the captured email (adult's own, or the caregiver's)
stays the thing invites are actually sent to, and stays **locked/read-only**
at redemption, exactly as shipped 2026-08-25 (see `CHANGELOG.md`,
"Add Player / DOB age model — self-registration UX follow-up"). This
preserves the matching-address auto-confirm path (an exact match between
the invite's address and what's submitted skips the slower email-
confirmation gate) rather than pushing more registrations into that gate by
default.

- **3.1** — No change to the existing email-lock behaviour. Do not build
  the "share a bare link, email agreed later" version.
- **3.2** — Caregiver email likewise stays a real, required field — not
  optional, not best-effort. A genuine consent request needs somewhere real
  to land.

---

## 4. Phone number — optional, unverified

- **4.1** — A phone number may be captured or offered at redemption. It is
  never validated and nothing downstream depends on it being correct or
  present. "People either add it or they don't" — no format checking, no
  required-field treatment, no confirmation loop.

(Note: `users.cellphone` already exists as a column; today it's always
written as an empty string at self-registration. This is new *capture* UI,
not a new schema column.)

---

## 5. Self-declared DOB at redemption — symmetric validation

Because Add Player no longer collects an exact DOB (Section 1), DOB is
collected once, at redemption, from whoever actually knows it — and
validated in the direction that matches which tick was made:

- **5.1** — If **Adult** was ticked: the redemption form asks "Your date of
  birth." Must resolve to 16 or older — rejected otherwise (unchanged from
  today's adult self-declaration behaviour), with the wrong-tick handling in
  Section 6 replacing today's flat rejection message.
- **5.2** — If **Child** was ticked: the redemption form is addressed to the
  caregiver, and asks "Your child's date of birth." Must resolve to under
  16 — if it doesn't, see Section 6.
- **5.3** — If **Child**: the form also asks for the child's first and last
  name at this point — from the caregiver, not carried over from whatever
  the Manager typed as the child's "name" in Add Player (Section 1.1, which
  is now just a label to identify who's being invited, not the record of
  truth).

**Resolves:** the "Caregiver DOB Correction Threshold" item parked in
`NEXT-SESSION-NOTES.md` — see Section 8.1 for why this design dissolves the
underlying problem rather than needing a bolt-on fix.

---

## 6. Wrong-tick self-correction

When the Manager's Adult/Child tick doesn't match the self-declared DOB,
the person in front of the screen corrects it themselves — no bounce back
to the Manager to redo Add Player.

- **6.1 — Adult ticked, actually a Child — RESOLVED: bounces back to the
  Manager.** The self-declared DOB comes back under 16. Show: "Your date of
  birth says you're under 16 — is that right?" On confirmation, this does
  **not** let the under-16 person name their own caregiver inline. Instead
  it stops there and routes back to the original Manager to restart the
  process as a proper Junior addition (Section 1, Child branch) — the
  Manager re-adds them as a Child, which then correctly asks for a
  caregiver's name and email from the Manager's side, not the minor's.
  Decided this way specifically because a named caregiver now gets ongoing
  authority over the child's account (device-login codes, Section 7.4;
  message visibility, Section 7.3) — letting a minor self-name that person
  inline was judged too easy a route to handing that authority to the wrong
  person. The Manager restarting the process applies a real-world check
  that a self-service flow can't.
- **6.2 — Child ticked, actually an Adult.** Whoever is completing the
  caregiver's side of the form indicates "actually, I'm an adult" and the
  flow converts them into a normal self-registering adult account in place,
  rather than requiring them to act as their own caregiver.

---

## 7. Child accounts and scoped access — Model A reversed

**This is the biggest change in this document.** `NEXT-SESSION-NOTES.md`
records "Model A CONFIRMED — child never logs in, caregiver is the account"
(2026-08-18), with direct child access explicitly rejected for V1 and filed
under a "V2/V3 — a scoped child view" future-direction note. **That decision
is reversed as of this document**: real-world testing and conversations
with colleagues surfaced that under-16 players need direct access to see
their own schedule and message their coach — this is table-stakes parity
with Heja (the app this product replaces), not a nice-to-have.

The design landed on is much closer to the "scoped child view" that was
already sketched as a future idea than to a full independent account
(Model B, explicitly still rejected) — brought forward into V1 scope
instead of deferred.

### 7.1 What a child's account is

- **7.1.1** — A child gets a real, independent login — not just a data
  record managed by a caregiver's account.
- **7.1.2** — That access is entirely **authorised through, and dependent
  on, a caregiver link** (`player_caregivers`) — a child cannot self-onboard
  independently of a caregiver, mirroring the existing consent model for
  how a child enters the roster at all.

### 7.2 What a child's account can see and do

**Revised:** rather than a maximally-restricted single-purpose view, a
child's account mirrors the existing adult/caregiver bottom-nav structure
(V1.5 Role-Aware Mobile Navigation), scoped to their own team(s):

- **7.2.1** — **Home** tab.
- **7.2.2** — **Team** tab.
- **7.2.3** — **Schedule** tab.
- **7.2.4** — **Messages** tab, for messaging with the coach.
- All four are scoped to the child's own team(s) only — no cross-team
  access.

**RESOLVED — RSVP:** a child can write their own RSVP for an event, and a
caregiver can also RSVP on the child's behalf for the same event — both are
valid, independent paths, not mutually exclusive ("effectively two people
can RSVP for a child — the child or the caregiver"). This builds directly
on the caregiver multi-child RSVP design already agreed 2026-08-20, not yet
built — `NEXT-SESSION-NOTES.md`, V1.7 section — which now needs to account
for a child also being able to write their own RSVP, not only a caregiver
RSVPing for them.

**RESOLVED — conflicting RSVPs:** simple last-write-wins. Whoever most
recently edited the RSVP for that child — the child or the caregiver — is
the current, displayed answer. No conflict-surfacing, no locking, no
"which one wins by role" logic. If the child and caregiver genuinely
disagree about attendance, that's a family conversation to have between
themselves, not something the app arbitrates.

**RESOLVED — Team tab visibility:** the Team tab already has a standing,
role-based visibility model, and a child's account simply inherits it —
no new rule is needed:

- **Standard tier** — everyone on the Team tab sees names and role only
  (Manager / Coach / Player / Caregiver). This is what a child sees, same
  as any Player or Caregiver already sees today.
- **Manager/Coach tier** — Managers and Coaches additionally see contact
  details (email and cell phone, where on file). A child's account is never
  a Manager or Coach, so it never reaches this tier — a child's Team tab
  carries no new contact-detail exposure beyond what any existing Player
  already sees.

This closes the open question raised above: extending the Team tab to a
child doesn't expose anything new, because the existing role-gate already
excludes non-Manager/Coach viewers from contact details.

### 7.3 Safeguarding — direction resolved, mechanism still needs thinking

**RESOLVED — direction:** a caregiver can see all of their child's
messages. Not by being copied into the conversation as a participant, but
through some separate view/access into their own child's message history.
This settles the "fully private, no caregiver visibility at all" option —
that's off the table.

- **Open question, not yet decided:** what that caregiver-side view
  actually looks like — a dedicated "view {child}'s messages" screen, a
  digest/notification, something that mirrors the child's own Messages tab
  read-only, etc. Needs real thought before it's designed.
- Still worth sanity-checking this direction against West Coast Rangers'
  own safeguarding policy/expectations, even though the "caregiver can
  always see" principle itself is now settled rather than open.

### 7.4 Login mechanism — caregiver-issued device code

Since a child mostly has no email of their own, and the whole point of this
model is that access flows through the caregiver, login does not use
Supabase's normal email/password mechanism.

- **7.4.1** — A caregiver, from their own account, can deliberately trigger
  "give {child} their own access" — this is a caregiver-initiated action,
  not automatic the moment a caregiver link exists.
- **7.4.2** — Triggering it generates a code, using the same
  code-generation mechanism already used for every other invite in this app
  (an 8-character code, `generateCode()` in `invites-api.ts`), wrapped in a
  shareable link the same way existing invites are.
- **7.4.3** — The caregiver can distribute that link/code however suits the
  family — read it aloud, write it down, copy-paste it into WhatsApp/
  Messenger/SMS, exactly as adult invite links already can be shared today.
- **7.4.4** — The child opens the link **once**, on their own device. No
  password is set and no username is typed. That redemption does not create
  a new account or ask for any registration details — it establishes a
  session for the child's existing (synthetic-email) `users` row.
- **7.4.5** — Once redeemed, that device is **permanently signed in** —
  the child never re-enters a code on that device again.
- **7.4.6** — If the device is lost, replaced, or logged out, the caregiver
  can generate a fresh code/link at any time to activate a new device.
  Generating that fresh code **supersedes and invalidates any previous
  device session** for that child — a lost/stolen device stops working the
  moment a replacement code is issued, with no separate revoke step needed.
  This mirrors the authority a caregiver already has over every other
  aspect of the child's record.

**Technical note, not a design question:** "permanently signed in" implies
a deliberately long-lived session/refresh-token configuration, longer than
Supabase's default — a real setting to configure on purpose, not something
that falls out of the existing invite mechanism for free.

**RESOLVED (flagged on review 2026-08-25, decided same day) — device
revocation:** generating a new device code for a child automatically ends
every other active session for that child. One action — "get a new
code" — both activates the replacement device and signs the old one out,
so a caregiver dealing with a lost or stolen phone doesn't need a separate
"sign out everywhere" step. Update 7.4.6 accordingly: it's not just "the
caregiver can generate a fresh code," it's "generating a fresh code
supersedes and invalidates any previous device session for that child."

### 7.5 Multiple caregivers — adding, rights, and access questions — resolved

- **RESOLVED — how additional caregivers get added.** A child's first
  caregiver comes from the normal Add Player / caregiver-invite flow
  (Sections 1 and 5). Any **additional** caregiver beyond the first must be
  added by a club **admin** — not self-service by an existing caregiver,
  and not the Manager. This is a deliberate extra check on who else gets
  linked to a child's record.
- **RESOLVED — equal rights.** Once a caregiver is in the system and linked
  to a child, all caregivers for that child have identical rights — no
  primary/secondary distinction. This settles the "Multiple caregivers,
  equal rights" item carried from the original notes (Section 8.5): yes,
  equal rights, confirmed.
- **RESOLVED** — any caregiver linked to a child (already-supported,
  many-to-many via `player_caregivers`) can trigger a new device code, not
  only the one who added the child originally. Consistent with equal
  rights above.
- **RESOLVED** — removing a caregiver from a child's link does **not**
  automatically revoke that child's existing device access. Instead, it
  sends a message/notification to a club admin, and the admin makes the
  actual decision on whether to revoke the child's device access at that
  point.

---

## 8. How this resolves — and doesn't resolve — what was already parked

### 8.1 "Caregiver DOB Correction Threshold" — resolved by this design

The parked concern was: nothing stops a caregiver "correcting" a child's DOB
on the Approve screen to something that would make them 16+, and it would
still go through as a Junior. Under this redesign, the caregiver is never
*correcting* a Manager's guess — DOB is collected for the first time at
redemption, from the caregiver, with a validation that already runs in the
needed direction (Section 5.2). The specific "Approve screen" correction
flow shipped 2026-08-25 stays useful for existing/in-flight Junior records
created under the old flow, but new Add Player submissions under this
design don't create that gap in the first place.

### 8.2 "Existing-User Invite Shortcut" — resolved by this design

Directly addressed in Section 2.

### 8.3 "Aging up" — deliberately still deferred

`NEXT-SESSION-NOTES.md` (Adult/Child model, point 10) already noted:
"Age-boundary transition — when a child moves to U17/Open, define the path
from caregiver-proxy to their own login (manual in V1 is fine)." This was
explicitly raised again in this conversation and just as explicitly
deferred — it can wait. Worth noting it now looks different post-redesign:
a Junior already has *some* login (Section 7) before they turn 16, so
"aging up" may become "upgrading a scoped child account into a full,
independent adult account" rather than "creating a login for the first
time." Not solved here; flagged so the eventual design doesn't start from
scratch.

### 8.4 "If consent never comes" — resolved in direction, one number to confirm

Carried unresolved from the original Adult/Child model notes (point 7):
what happens to a child record whose caregiver never responds to the
consent request, and after how long?

**RESOLVED — direction:** while consent is outstanding, the child shows on
the team list as **pending** — visible to the Manager, who is expected to
follow up directly with the caregiver. If consent still hasn't come after a
set period, the pending record automatically drops off the team list.

- **Not yet finalised — the exact period.** Proposed: **2 months**, though
  possibly shorter — needs a final call before this is built. Ties to the
  broader data-retention scoping already underway
  (`docs/data-retention-scoping.md`, Decision 3c), which should stay
  consistent with whatever period is settled on here.

### 8.5 Multiple caregivers, equal rights — resolved

Carried unresolved from the original notes (point 8). **Now resolved in
Section 7.5**: all caregivers linked to a child have equal rights, and any
caregiver beyond the first must be added by a club admin.

---

## 9. Privacy policy and app-store classification — likely invalidated assumptions

This is important enough to call out on its own, separate from the feature
design above, because it risks being missed until store submission.

The current privacy policy draft (`docs/privacy-policy-draft.md`) and Open
Decision 3b's conclusion ("almost certainly adults-only audience... keeps
it out of [Google Play] Families policy") were both built on the *old*
Model A assumption: no child DOB collected, no child login, minimal child
data ("first/last name only, no contact, no DOB, no photo" — Adult/Child
model point 5). **This redesign invalidates that assumption directly**:
DOB is now collected for children, children get their own device-bound
login, and children can message a coach.

- **9.1** — The privacy policy draft needs rewriting to reflect what's
  actually collected and who actually uses the app directly, once this
  design is built.
- **9.2** — Open Decision 3b (adults-only audience declaration) needs to be
  re-examined, not assumed — a real child end-user population is a
  different conversation with Google/Apple than "an app about children,
  used by adults."
- **9.3** — The existing legal caveat stands and is now more load-bearing:
  "the privacy-law framing... needs review against the NZ Privacy Act and
  the app-store children's policies before launch." This was true before;
  it's a harder requirement now that children are direct end-users rather
  than only data subjects.

**Recommendation: treat this as a hard gate before V1.9 store submission**,
not a parallel-track item that might slip past it unnoticed.

---

## 10. Branding — every new touchpoint here follows the existing rule

**Not a new decision — a reminder that the existing standing rule applies
to everything in this document.** The project already has a resolved
policy (`.kiro/steering/project-standards.md`, cross-referenced in
`NEXT-SESSION-NOTES.md` V1.B, "Club Branding Config"): no new build
hardcodes a club name, colour, logo, domain, or URL. Club identity (name,
short name, app title, app subtitle, logo, primary colour, app URL) comes
from `club_settings` via the `useClubBranding()` hook on the client, or
from environment variables on Edge Functions — never typed directly into a
component or function. This is what lets the same app be handed to a
different club (the document's own example: a Gold Coast club) by changing
data, not code.

This matters here specifically because this document introduces several
**new** screens and pieces of copy that don't exist yet, so the 2026-08-14
hardcoded-branding audit couldn't have caught them. Flagging the ones that
will carry club/app identity, so whoever builds this checks them against
`useClubBranding()` / env vars rather than typing a name in:

- **10.1** — The device-code share link and its surrounding text (Section
  7.4.2/7.4.3) — whatever a caregiver sees/shares ("join {app_title}",
  or similar) must pull the app/club name from config, not be hardcoded.
- **10.2** — The "give {child} their own access" caregiver-facing copy
  (Section 7.4.1).
- **10.3** — The existing-user bypass confirmation screen (Section 2.2,
  "You already have an account — join {team} as {role}?") — the team name
  is already data-driven; any surrounding club branding (logo, colour,
  club name) on that screen still needs to come from `club_settings`.
- **10.4** — Whatever caregiver message-view UI is eventually designed
  (Section 7.3).
- **10.5** — Checked already, not just flagged: the redemption-screen
  caption text and Welcome-screen copy shipped 2026-08-25 (this document's
  own origin) were audited just now and contain no hardcoded club name —
  they're safe as shipped.

No action needed beyond keeping this list in view when each of these is
actually built — the mechanism (`useClubBranding()` / env vars) already
exists, this is just making sure nothing new slips past it.

---

## 11. Summary of what still needs deciding before this is built

For visibility — everything flagged as an open question above, in one
place:

1. **RESOLVED** — a minor does not name their own caregiver inline. If
   Adult-ticked-actually-Child comes back, it bounces back to the original
   Manager to restart the process as a proper Junior addition (Section
   6.1), specifically because a named caregiver now carries ongoing
   authority (device codes, message visibility) that shouldn't be handed
   out via self-service.
2. **RESOLVED** — a child can write their own RSVP, and a caregiver can
   also RSVP on the child's behalf; both are valid (Section 7.2).
   Conflicts resolve as simple last-write-wins — whoever edited most
   recently is the current answer. Not the app's job to arbitrate beyond
   that.
3. **RESOLVED in direction** — caregivers can see all of a child's
   messages, not as a participant copied into the thread but via some
   separate view (Section 7.3). The mechanism/UI for that view still needs
   designing, and it's still worth sanity-checking against the club's own
   safeguarding expectations.
4. **RESOLVED** — any linked caregiver can trigger a new device code for a
   child, not only the original one (Section 7.5).
5. **RESOLVED** — removing a caregiver does not auto-revoke a child's
   device access; it notifies a club admin, who decides (Section 7.5).
6. **RESOLVED in direction, one number to confirm** — a child with
   outstanding consent shows as "pending" on the team list for the Manager
   to follow up on, and auto-drops off after a set period. Proposed 2
   months, possibly shorter — final period not yet confirmed (Section 8.4).
7. **RESOLVED** — all caregivers linked to a child have equal rights; any
   caregiver beyond the first must be added by a club admin (Section 7.5 /
   8.5).
8. **RESOLVED** — a child's Team tab inherits the existing standard/
   Manager-Coach tiered visibility model: names + role for everyone,
   contact details for Manager/Coach only. No new exposure from adding the
   Team tab to a child's view (Section 7.2).
9. **RESOLVED** — see item 2: last-write-wins, no separate conflict
   handling.
10. **RESOLVED** — generating a new device code for a child automatically
    ends every other active session for that child, so a lost/stolen
    device stops working the moment a replacement is issued. No separate
    revoke action needed (Section 7.4).

**Everything in this document is now a settled decision** except item 3
(caregiver message-visibility direction is resolved; the actual view/UI
still needs designing). Ready to be turned into a design and task
breakdown.
