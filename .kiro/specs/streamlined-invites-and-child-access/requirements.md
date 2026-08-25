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

- **6.1 — Adult ticked, actually a Child.** The self-declared DOB comes back
  under 16. Show: "Your date of birth says you're under 16 — is that
  right?" On confirmation, ask for the caregiver's name and email right
  there, and route into the same caregiver-consent request the normal
  Junior path uses (Requirement 4.3/4.4 of the existing spec).
- **6.2 — Child ticked, actually an Adult.** Whoever is completing the
  caregiver's side of the form indicates "actually, I'm an adult" and the
  flow converts them into a normal self-registering adult account in place,
  rather than requiring them to act as their own caregiver.

**Open question, not yet decided:** in 6.1, the person completing the form
at that point is, by definition, under 16 — they are the one providing
their own caregiver's contact details. Worth a deliberate check that this
is acceptable (it's a common enough pattern in youth-facing apps: a minor
naming their own parent/guardian to receive a consent request) rather than
an oversight.

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

- **7.2.1** — Read-mostly access to their own schedule/games, for their own
  team(s) only.
- **7.2.2** — Team-only messaging with the coach.
- **7.2.3** — Nothing beyond that — no other tabs, no roster/contact
  visibility, no cross-team access. This is a genuinely scoped view, not the
  full app with some tabs hidden.
- **Open question, not yet decided:** does this scope include *writing* an
  RSVP themselves, or is RSVP-on-behalf-of-a-child staying exclusively a
  caregiver action (per the caregiver multi-child RSVP design already agreed
  2026-08-20, not yet built — `NEXT-SESSION-NOTES.md`, V1.7 section)? Not
  previously considered against a child having their own login; needs a
  decision.

### 7.3 Safeguarding — flagged, not decided here

- **Open question, explicitly not an engineering-only decision:** should
  coach ↔ child messages be visible to (or copied to) the caregiver, or
  fully private between coach and child? Direct, unsupervised adult–child
  messaging is the kind of thing real youth sports organisations often have
  explicit safeguarding policy on. This should be checked against West
  Coast Rangers' own policy/expectations before it's designed, not decided
  purely as a technical default.

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
  can generate a fresh code/link at any time to activate a new device. This
  mirrors the authority a caregiver already has over every other aspect of
  the child's record.

**Technical note, not a design question:** "permanently signed in" implies
a deliberately long-lived session/refresh-token configuration, longer than
Supabase's default — a real setting to configure on purpose, not something
that falls out of the existing invite mechanism for free.

### 7.5 Open questions carried from the existing multi-caregiver notes

- If more than one caregiver is linked to a child (already-supported,
  many-to-many via `player_caregivers`), can any linked caregiver trigger a
  new device code, or only the one who added the child originally? Not
  previously decided — `NEXT-SESSION-NOTES.md` already notes "two caregivers
  are allowed... don't need to fully solve for V1" for other purposes; this
  redesign adds a new instance of the same open question.
- If a caregiver is removed from a child's link, should the child's existing
  device access be revoked? Not previously considered.

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

### 8.4 "If consent never comes" — still open, not addressed here

Carried unresolved from the original Adult/Child model notes (point 7):
what happens to a child record whose caregiver never responds to the
consent request, and after how long? Ties to the broader data-retention
scoping already underway (`docs/data-retention-scoping.md`, Decision 3c).
Not decided in this document — flagged so it isn't lost twice over.

### 8.5 Multiple caregivers, equal rights — still open, not addressed here

Carried unresolved from the original notes (point 8) and newly relevant to
Section 7.5 above. Not decided here.

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

## 10. Summary of what still needs deciding before this is built

For visibility — everything flagged as an open question above, in one
place:

1. Is a minor naming their own caregiver's contact details (Section 6.1)
   acceptable, or does it need a different handling?
2. Does a child's scoped view (Section 7.2) include writing their own RSVP,
   or does that stay caregiver-only?
3. Are coach ↔ child messages visible to the caregiver, or fully private
   (Section 7.3) — needs input against the club's own safeguarding
   expectations, not just an engineering default.
4. Can any linked caregiver trigger a new device code for a child, or only
   the original one (Section 7.5)?
5. Does removing a caregiver revoke a child's existing device access
   (Section 7.5)?
6. What happens to a child record if caregiver consent never comes, and
   after how long (Section 8.4, pre-existing and still unresolved)?
7. Equal rights between multiple caregivers on one child (Section 8.5,
   pre-existing and still unresolved).

Everything else in this document is written as a settled decision, ready to
be turned into a design and task breakdown once reviewed.
