# Privacy Policy — DRAFT

> **STATUS: DRAFT — NOT PUBLISHED.** This is a working draft for the app's
> privacy statement, required before Google Play / App Store submission
> (V1.9). It is **not legal advice** — the children's-data and retention
> sections in particular should be reviewed by someone qualified before
> publishing. Starting point recommended by the roadmap: the NZ Privacy
> Commissioner's Priv-o-matic generator.
>
> **How to read this file:** the policy text is the draft wording. Lines
> beginning `> ⚠️ REVIEW` are open issues raised 2026-08-17 that must be
> resolved before this is published — they are notes to ourselves, not part
> of the policy. Delete every REVIEW note before publishing.
>
> Review flags are also summarised at the bottom under "Open issues".

---

Privacy Policy — [App Name]

Last updated: [date]

> ⚠️ REVIEW (naming): the app product is club-agnostic (served from
> clubfootball.app); "West Coast Rangers" is the first club using it. Decide
> whether the policy is published under the product name or the club name,
> and set [App Name] accordingly. This affects who the "we" is throughout.

## What information we collect

We collect personal information from you, including:

- Name
- Email address
- Phone number — optional, see below
- Team/club affiliation and role — player, parent, coach, manager

We do not collect analytics or crash-reporting data, and the app contains no
third-party advertising or tracking software.

> ✅ RESOLVED 2026-08-19: the "device information via analytics/crash reporting"
> line was removed and replaced with the positive statement above. Checked — the
> app ships no analytics or crash-reporting SDK (no Firebase Analytics,
> Crashlytics, Sentry, etc.). If such a tool is added later (Firebase makes
> Crashlytics easy), update BOTH this statement AND the store questionnaires at
> the same time.

## Why we collect it

We collect your personal information in order to provide an app that assists
users with their football experience in their club environment.

Specifically, this information is used to add unique users to the app and to
record their relationship to a team, as one of the following:

- A player in the team
- A manager of the team
- A coach of the team
- A person with general admin responsibility for the team
- A caregiver of a player listed in a team for players under 16 — where
  "under 16" is determined by the player's age as at 1 January of the year
  being managed

Your information is also used to run the app's core features: team messaging
between members, the schedule of games and events, and coaching resources.

> ⚠️ REVIEW (feature completeness — confirm at publish time): the line above
> lists the features live as of 2026-08-19 (Team Messaging, Schedule/events,
> Coaching resources). **RSVP/availability (V1.7) is NOT yet live** — add it
> here the moment it ships, and reflect it in the store questionnaires at the
> same time. Re-check this list against the app on the day you publish.

## Optional information

Providing some information is optional. If you choose not to enter your phone
number, this won't be shared with your team's managers or coaches.

> ⚠️ REVIEW: add any other optional fields and what not providing them
> affects.

## How we keep your information safe

Your information is stored using Supabase, a cloud database provider, with
servers located in Singapore. This means your personal information is held
outside New Zealand.

> ✅ CONFIRMED 2026-08-17: Singapore is correct — this is the region the
> Supabase project was set up in, taken directly from the Supabase project
> settings. (Note for internal reference: this is a different region from the
> Resend email sending domain, which is Tokyo / ap-northeast-1.)

Supabase holds SOC 2 Type II and ISO 27001 certifications and encrypts data
at rest (AES-256) and in transit (TLS). We have taken reasonable steps to
ensure your information receives a comparable standard of protection to that
required under New Zealand's Privacy Act 2020.

Access to your information within the app is controlled by a role-based
hierarchy:

- A player (and, where the player is under 16, their caregiver(s)) is part of
  a team, and their name is shared within that team.
- A player's email and contact details are shared with the team's coach(es)
  and manager(s).
- Admin users have access to all information across the app.

Information is only shared according to this hierarchy — it is not shared
more broadly within the app, or with other teams or clubs, unless required by
law.

## How long we keep your information

Your information is used by the app for the year that is being managed (e.g.
the current football season). If you continue in a role — as a player,
manager, coach, admin, or caregiver — into the following year, your
information is carried forward and continues to be used.

If you no longer hold a role in the following year, your information is
retained for one further year. After 12 months of not holding a role, the app
automatically deletes your associated private information.

> ⚠️ REVIEW (MUST FIX — policy promises something the app can't do yet):
> the app currently has **no deletion mechanism** — only "mark inactive"
> (a deliberate design rule; nothing is ever deleted). This paragraph
> promises automatic deletion after 12 months, which does not exist in code.
> Before publishing, either:
>   (a) build the scheduled deletion job so the app does what this says, or
>   (b) reword to describe what actually happens today (retained, marked
>       inactive) and only add the deletion promise once it's built.
> Publishing (a promise) + not doing it = a false statement to users and the
> stores. This is roadmap open decision 3c.

## Your rights

You have the right to ask for a copy of any personal information we hold about
you, and to ask for it to be corrected if you think it is wrong. To do this,
contact us at [privacy@clubfootball.app].

> ⚠️ REVIEW (MUST FIX — contact must be monitored): the clubfootball.app
> domain is currently **send-only** in Resend ("Enable Receiving" off, no
> mailbox), so privacy@clubfootball.app may not receive anything. The Privacy
> Act requires a working channel to exercise access/correction rights, so
> this address must land somewhere a person actually monitors. Same
> underlying gap as the open EMAIL_REPLY_TO decision.

## Coach feedback on player performance

[PLANNED — v2 feature, not yet live] In a future version, the app will allow
coaches to record feedback about team and individual player performance —
including strengths and areas of focus. This replaces a process the club
currently does manually.

This feedback:

- Can only be entered by coaches and admin users
- Is only visible once a coach posts it — it is not visible while still in
  draft
- Team feedback, once posted, is visible to anyone in that team
- Individual feedback, once posted, is only visible to that player and, where
  applicable, their caregiver (a caregiver can only see feedback for their own
  associated player, not other players)
- Is not visible to other players, other teams, or anyone outside this
  hierarchy
- Is used only to support the player's development and their coach's
  planning — it is not used for any other purpose

If a player or caregiver wants to clarify, discuss, or seek a correction to
feedback, the app provides a process to automatically communicate this back to
the relevant coach. Players are also actively encouraged to give their own
feedback.

Detailed individual and team feedback is personal information, and is deleted
under the same rule as the rest of your information — 12 months after you no
longer hold a role at the club (see "How long we keep your information"
above).

> ⚠️ REVIEW (unreleased feature): this whole section describes a v2 feature
> that isn't live. It's honestly labelled [PLANNED], which is fine, but a
> published privacy policy normally describes current behaviour, and the
> store privacy questionnaires MUST match what the app does *now*, not the
> v2 vision. Either keep this clearly marked as future and make sure the
> store forms describe only live behaviour, or remove it until the feature
> ships. Also inherits the deletion-mechanism gap flagged above.

## Anonymised summary data

Separately, coaches and admin use agreed feedback to build an ongoing summary
of team and player development, scored against a defined list of phases of
play in football (e.g. attacking, defending, transition) and rated
accordingly.

This summary is aggregated — it is associated only with an age group and team,
and is not intended to identify any individual. It is used only to understand
overall team progress through the grades, coaching effectiveness, and typical
player development within a year group, never to identify or profile a person.
Because it is aggregated in this way, it may be retained for longer than the
12-month period described above.

> ⚠️ REVIEW (de-identification — confirm before publishing): the claim was
> softened from "cannot be linked back to any individual" to "aggregated … not
> intended to identify". With small squads a team+age-group summary can
> sometimes single out a player (e.g. the only goalkeeper in a team of 9).
> Before publishing, confirm the data model genuinely aggregates rather than
> storing per-player rows tagged with a team — if it stores per-player detail,
> this is personal information and the 12-month deletion rule applies to it too.

## Purpose limitation

All information collected by the app is used only to support users in their
participation in football through their club and team. It is not used for
advertising, sold to third parties, or used to build a profile of you beyond
what is needed to run the app.

## Overseas disclosure

To run the app we use a small number of trusted service providers, some of
which store or process your information outside New Zealand. We share only the
information each provider needs to do its job, and only for that purpose:

- **Supabase** — our database and hosting provider. Stores all of the personal
  information described above. Servers are in Singapore.
- **Google (Firebase Cloud Messaging)** — delivers push notifications to your
  device. Receives a device notification token, not your profile information.
- **Resend** — sends invitation and notification emails on our behalf.
  Receives the recipient's email address and the content of the email. Email is
  sent from a server in Japan.
- **Netlify and Cloudflare** — host the app and manage its web address. These
  process technical connection information such as IP addresses in the normal
  course of serving the app.

We do not sell your information, and we do not share it with any provider for
advertising.

> ⚠️ REVIEW (confirm at publish time): this list is complete as of 2026-08-19.
> Re-check it against the app before publishing — if any new third-party
> service is added (analytics, payments, SMS, etc.) it must be added here and
> in the store questionnaires. Country statements: Supabase Singapore and
> Resend Japan are confirmed; Netlify/Cloudflare are global CDNs (data may be
> processed in multiple regions) — the wording above is deliberately general
> for that reason.

## Children's information

> ⚠️ REVIEW (MUST FIX — highest store scrutiny; section still to write):
> Apple and Google both examine this closely for club/team apps. The body of
> this policy already describes the caregiver model; the piece still missing
> is **consent**: for an under-16, who agrees to the data being held? In the
> current flow a manager adds players and caregiver contact details — the
> caregiver isn't necessarily the person who ticked the in-app consent box.
> State the consent chain plainly:
>   - Is data collected directly from minors, or only via an adult
>     (manager/caregiver) account?
>   - Who provides consent for an under-16's data, and how is it recorded?
>     (The app records consent in users.privacy_consent_at.)
>   - How can a caregiver review or request correction/removal of their
>     child's data?
> Also decide the Play Console target-audience declaration (roadmap decision
> 3b): this looks like an app *about* children used by *adults*, which likely
> keeps it out of Google's Families programme — but that must be a deliberate
> call, not a default.

## Device permissions

The app may request the following permissions on your device:

- **Push notifications** — to send you team messages, schedule changes and
  reminders. You can turn these off in your device settings.

> ⚠️ REVIEW: checked 2026-08-17 — no camera, photo-library, location,
> microphone or file-access plugins are currently installed, so push
> notifications are the only permission to declare. Update this list if any
> such capability is added (e.g. a team photo/avatar upload).

## Changes to this policy

We may update this policy from time to time. The most current version will
always be available in the app and at [website/URL].

> ⚠️ REVIEW: set [website/URL] to the hosted location. Roadmap decision:
> host at clubfootball.app/privacy as a **static HTML page**, not a React
> route, so store reviewers can reach it even if the app bundle fails to
> load.

## Contact us

If you have any questions about this policy or how we handle your information,
contact us at [privacy@clubfootball.app].

> ⚠️ REVIEW: same monitored-mailbox issue as "Your rights" above.

---

## Open issues summary (delete this whole section before publishing)

Raised 2026-08-17 during review of the first draft.

**Must fix before publishing — NEED A DECISION FROM MIKE:**

1. **Deletion mechanism doesn't exist.** The retention section promises
   automatic deletion after 12 months; the app only has "mark inactive".
   Decision needed: (a) build the scheduled deletion job, or (b) reword to
   describe current behaviour and add the promise later. (Roadmap decision 3c.)
   — Option (a) is code work; option (b) is a wording change I can do in minutes.
2. **Privacy contact mailbox may not receive mail.** clubfootball.app is
   send-only; privacy@ must land somewhere monitored. Decision needed: which
   real, monitored email address should access/correction requests go to?
   (Ties to the open EMAIL_REPLY_TO decision.)
3. **Children's information section — needs facts + a decision.** The consent
   chain for under-16s is the key missing piece and the most scrutinised part.
   Need from Mike: who provides consent for an under-16 (the caregiver, at what
   point?), and the Play Console target-audience call (decision 3b — app *about*
   children used by *adults*). Once confirmed I can write the section.

**Should review — NEED A DECISION FROM MIKE:**

- **Naming:** publish under the product name (Club Football / clubfootball.app)
  or the club name (West Coast Rangers FC)? Sets who "we" is and fills [App Name].
- **v2 coach-feedback section:** keep it in, clearly marked [PLANNED], or remove
  it until the feature ships? Either way the store questionnaires must describe
  only live behaviour.

**Confirmed / resolved:**

- ✅ Supabase region is Singapore (from the Supabase project settings).
- ✅ No analytics or crash-reporting SDK ships today — the collection line was
  removed and a positive "we do not collect" statement added.
- ✅ Push notifications are the only device permission currently requested.
- ✅ **Overseas disclosure section written** (2026-08-19) — Supabase, Firebase
  Cloud Messaging, Resend, Netlify/Cloudflare, each with what it receives.
  Re-confirm the list is complete at publish time.
- ✅ **Live features listed** under "Why we collect it" (Team Messaging,
  Schedule, Coaching resources). Add RSVP when V1.7 ships.
- ✅ **Anonymised-summary claim softened** from "cannot be linked back" to
  "aggregated / not intended to identify". Still confirm the data model before
  publishing.

**Not legal advice.** Have the children's-data and retention sections
reviewed by someone qualified before publishing.
