# Gant — AI Coaching Feedback Assistant
### Requirements Draft — Clubfootball.app v2/future build

*Captured from planning conversation, [date]*

---

## 1. Purpose

Gant is an AI-assisted layer that helps coaches write higher-quality, consistent player and team feedback. It replaces a process the club currently does manually. Gant supports coaches by:

- Reviewing and refining feedback a coach has written
- Checking alignment against the club's standard feedback model and defined phases of play
- Ensuring feedback is framed positively and constructively
- Holding a short clarification conversation with the coach where needed
- Reviewing a player's past feedback history to identify recurring vs new issues, and prompting the coach to reflect on progression
- Suggesting coaching session/practice ideas based on identified areas of need (surfaced on the coaching page)

Gant assists coaches. It does not write, approve, or post feedback unilaterally — the coach retains full editorial control at every step.

## 2. Model

- **Claude Sonnet 5** (via Anthropic API)
- Chosen over Haiku 4.5 because the task requires reasoning across a coach's feedback history (spotting recurring vs new issues, assessing progression over time) and holding a multi-turn clarification conversation — both better suited to Sonnet's reasoning strength than Haiku's single-shot classification/rewrite strength.
- Reference material (club feedback model, phases-of-play list, tone/style guide) should be supplied via a stable system prompt and cached (prompt caching) since it's reused on every coach interaction.

## 3. Usage contexts

Gant needs to support two distinct real-world usage patterns, not just a single linear flow:

- **Live capture** (at a game or training session): Coach dictates feedback in the moment, timing/flow and internet access permitting. In this context, coaches will typically keep hitting "record" for different players/moments in quick succession, without pausing to review or refine each one immediately — the priority is capturing the observation before it's lost, not perfecting the wording pitch-side.
- **Reflective capture** (at home, reviewing video footage or working from memory after the fact): Same underlying need — capture a raw observation — but with more time available per entry and likely less time pressure.

In both contexts, **Gant's first refinement pass always happens automatically** — every raw entry gets cleaned up, phase-tagged, and drafted into refined feedback the moment it's captured. What's optional is what the coach does next: approve that first draft immediately, send it back for further refinement, or simply move straight on to capturing the next piece of play (for the same player or a different one), leaving the refined draft sitting unapproved until later. This has direct implications for the data flow in Section 4 below.

## 4. Data flow

1. **Raw input (record)**: Coach dictates a comment about a team or an individual player. This is held in an **unrefined, in-progress state**, visible only to that coach (and admin).
2. **Refinement (automatic, always happens)**: Immediately after capture, Gant processes the raw comment into structured, refined commentary — checked against the club's feedback model, phases of play, and tone guidelines. This step is not optional and requires no coach action to trigger.
3. **Coach decision point (optional path)**: Once the refined draft appears, the coach can:
   - **Approve/save it immediately** — becomes visible per the existing feedback visibility rules (team feedback visible to the team; individual feedback visible only to that player and their caregiver) (see Section 6), or
   - **Send it back for further refinement** via the clarification loop (step 5 below), or
   - **Move straight on to capturing the next piece of play** — for the same player or a different one — leaving this refined draft sitting unapproved. The coach can keep recording additional raw entries without needing to resolve each one first, producing a **queue of pending refined drafts** tied to that session (game/training/video review).
4. **Metadata capture**: Refined output is captured against:
   - Date
   - Event type (training, game, or video review)
   - Team
   - Player (where player-specific — saved under that player's record)
5. **Clarification loop**: Gant may ask the coach clarifying questions (e.g. to align a comment to the correct phase of play, or to understand context). **~3 rounds is a working expectation** — the estimate is that around 90% of feedback sessions should reach a locked-down result within 3 rounds — not a hard technical cap. See open question below on whether a hard ceiling is still needed for the remaining edge cases.
6. **Post-session review list**: For any drafts left pending (per step 3), the coach returns to a **list of their pending Gant outputs** after the session and, for each one, either approves/saves it or sends it back for refinement. Entries can be worked through in any order.

   Both paths — instant approval right after the first refinement, and deferred approval via the review list — are first-class and equally supported. As coaches build trust in Gant's output, usage will likely shift toward instant approval; the review list exists for whatever's left pending, not as a mandatory step.
7. **Disposal of raw input**: The original unrefined text for a given entry is **discarded once that entry's refined output has been approved/saved**. It is not retained separately.

## 5. Historical review / progression tracking

- When a coach writes feedback about a player, Gant reviews that player's **past feedback** (already-posted entries) to identify whether the current comment reflects:
  - The **same issue** raised previously, or
  - A **new/different issue**
- Gant may prompt the coach to reflect on **progression** — e.g. asking whether a previously flagged area has improved, stayed the same, or is a new development.
- This is a coaching-quality aid, not an automated assessment — Gant surfaces the comparison and asks; it does not draw its own conclusion about the player's development without coach input.

## 6. Offline / no-coverage handling

Live capture (Section 3) often happens pitch-side, where connectivity can be patchy or absent. Gant needs a defined behaviour for this case rather than assuming a connection is always available.

**Two possible approaches — to confirm which is achievable with the chosen on-device speech recognition:**

- **Preferred: text-level offline queue.** If on-device speech-to-text can run without connectivity (many native iOS/Android recognisers support this for common languages), the raw *text* is captured and held in a local queue on the device. Only the Gant refinement call (which needs the Anthropic API) waits for connectivity. This keeps the privacy story simple and consistent with Section 9 (audio never transits or is stored beyond the device) even when offline.
- **Fallback: audio-level offline queue.** If on-device speech-to-text itself requires connectivity, raw audio must be recorded and held in a local queue instead, with speech-to-text run once connectivity returns (still on-device), after which the audio file is deleted. This is a meaningful addition to the privacy policy's Gant section if it's the path taken — audio would temporarily exist on-device in a no-coverage scenario, even though it's still never transmitted off the device and is deleted immediately after successful transcription.

**Flow once connectivity returns:**
```
Queued items (text or audio, per above)
   → sent to Supabase Edge Function
   → Gant refinement proceeds as normal
   → appears in the coach's review list / decision point per Section 4
```

**To confirm with Kiro:** whether the chosen on-device speech recognition (Capacitor plugin) supports offline operation, which determines whether Option A or B above applies.

## 7. Session suggestions (coaching page)

- Separately, Gant can suggest coaching session or practice ideas based on the areas of need identified across a team or player's feedback history.
- Surfaced on the coaching page, for the coach's use in planning.

## 8. Data & privacy constraints (carried from privacy policy)

- Gant is linked only to a **User ID** — no player/coach name, contact details, or date of birth is passed to the AI layer.
- User ID is still treated as personal information under the Privacy Act 2020 (since it may be linkable back to an individual within the app) — same access, retention, and security protections apply as the rest of the app's personal data.
- Refined, posted feedback is retained under the same 12-month rule as other personal information (see privacy policy: "How long we keep your information").
- Unrefined/raw input is not retained.

## 9. Technical architecture

Gant is an API integration, not a separate Claude account or a trained/fine-tuned model. The guardrails (phases-of-play list, feedback model, tone guide) live as a **system prompt** — text sent to Claude with every single request — rather than anything uploaded to or "learned" by Anthropic. This means guardrails can be edited any time without retraining, redeploying the app, or an app store review cycle.

**Stack:** Supabase Edge Functions (backend build: Kiro)

**Data flow (technical):**
```
Coach dictates in app (iOS/Android, Capacitor)
   → raw text sent to a Supabase Edge Function
   → Edge Function holds the Anthropic API key as a secret
       (Supabase secrets/env vars — never in client-side code)
   → Edge Function calls api.anthropic.com/v1/messages
       with [guardrails system prompt + raw dictated text]
   → Claude returns refined feedback (+ any clarifying question)
   → Edge Function returns it to the app
   → Coach reviews, approves or sends back per Section 4
```

**Key implementation points:**
- **API key**: generated via Anthropic Console (business/commercial account, separate from any personal Claude.ai login), stored only as a Supabase secret, never shipped in the Capacitor app bundle (client-side code is extractable, so no credentials belong there).
- **Guardrails storage**: stored as a constant/config in the Edge Function or a Supabase table read at request time — allows updates by redeploying the function or editing a row, not by shipping a new app build.
- **Prompt caching**: since the guardrails system prompt is large and reused on every request, Anthropic's prompt caching should be used to control latency/cost.
- **Dictation-to-text layer**: speech-to-text conversion happens **on-device** (native iOS/Android speech recognition via Capacitor), before the raw text is sent to the Edge Function. This means audio itself does not transit through Supabase or Anthropic — only the resulting text does, which simplifies the data-handling/privacy picture (no raw audio storage or transmission to account for).
- **Mobile latency**: the clarification loop (~3 rounds typical, Section 4) means multiple round-trips to the API — test on real mobile network conditions pitch-side, not just wifi.
- **Commercial terms**: use of the Claude API to power Gant within Clubfootball.app is standard, permitted commercial use under Anthropic's Commercial Terms of Service (building AI features into a customer-facing product). Output ownership sits with Clubfootball.app; Anthropic does not train on API request content.

## 10. Test case: dictation → refinement walkthrough

A trial run using realistic messy coach dictation (repeated words, false starts, no structure) was used to sanity-check the refinement layer. Findings:

- **Transcription cleanup** (removing "um"s, repeated words, false starts) is reliable regardless of guardrail quality — this is a language-processing task, not a judgment-dependent one.
- **Phase-tagging and structural judgment** is the part that depends on well-built guardrails — e.g. correctly identifying build-up play, 1v1s, and final-third delivery from a rambling description.
- **Edge case surfaced**: the test comment was entirely strength-based, with no natural "work-on." This has since been resolved (see Section 12) — all-positive feedback is allowed.

## 11. Open questions / to confirm before build

- [ ] How far back does "past feedback" review look — full history, or a rolling window (e.g. current + prior season)?
- [ ] **Offline behaviour (Section 6)**: confirm with Kiro whether the chosen on-device speech recognition supports fully offline operation. This determines whether the no-coverage fallback needs to queue raw audio (requiring a privacy policy update) or can stay at text-level (no policy change needed).
- [ ] **Review list UX**: for a coach with pending raw entries after a session, how should the review list be presented — flat chronological, grouped by player, sorted by "needs attention" (Gant has a clarifying question) vs "ready to approve"? Also worth confirming: should there be a fast "approve immediately" action right after refinement (single tap, no detour through a list), for coaches who trust Gant's output and don't want to defer? Worth a quick coach input on what would actually be usable pitch-side/post-session.
- [ ] ~3 rounds is the expected typical resolution point (90% of sessions) — for the remaining ~10%, should there be a hard technical ceiling (e.g. 5 rounds, then fall back to manual editing), or should the loop continue as needed?
- [ ] Should Gant's session suggestions be limited to a defined library of drills/practices, or can it generate novel suggestions?
- [ ] Confirm final name — "Gant" as working name; check availability/trademark conflicts before public use.
- [x] ~~Confirm whether Gant-assisted refinement should be visually indicated to players/caregivers reading posted feedback~~ — **Resolved: no.** Feedback is presented as from the coach; Gant is not disclosed (see Section 12).
- [x] ~~Does every individual feedback entry require a strength + a work-on, or can purely positive feedback be posted as-is when that's genuinely the case?~~ — **Resolved: yes, all-positive feedback is allowed** (see Section 12).
- [x] ~~Confirm what performs speech-to-text conversion~~ — **Resolved: on-device** (native iOS/Android recognition). Only text transits to the backend; no raw audio storage/transmission involved, except in a no-coverage fallback scenario (see Section 6 and Section 9).

## 12. Decisions confirmed

- **Attribution**: Posted feedback is presented as being from the coach — not flagged, labelled, or attributed to Gant in any way visible to players or caregivers. Gant is a backstage support tool that helps coaches write better feedback; it is not a visible participant in the feedback relationship. This resolves the corresponding open question in Section 11.
- **All-positive feedback is allowed**: Feedback does not need to always contain a "work-on." Where a coach's genuine observation is entirely positive, Gant should refine and structure it as such rather than prompting the coach to manufacture a development point. This resolves the edge case surfaced by the dictation test case (Section 10).

## 13. Relationship to existing biannual report card & player self-reflection

The club currently issues a **biannual (twice-yearly) player report card** — a fixed-format PDF covering four skill categories (Technical, Tactical, Physical, Mental), each with rated sub-skills (Excelling / Competent / Developing), plus a written coach comment and "next steps." This sits alongside a **paper-based player self-reflection form**, completed by the player ahead of a ~10 minute 1:1 with their coach, covering biggest strengths/weaknesses, training consistency, and attitude. The coach then writes and sends the report.

Reviewing a real (anonymised) example of both documents surfaced two future-scope ideas worth capturing now, even though neither is being built yet:

### 13.1 Ongoing Gant feedback as the evidence base for the biannual report
Today, a coach writing the twice-yearly report is working largely from memory across a season. Once Gant-assisted feedback capture (Sections 3–4) is live and accumulating a season's worth of approved, dated, phase-tagged entries per player, that log becomes a much richer evidence base for the coach to draw on when writing the biannual report — rather than the report being a from-memory exercise, it becomes a synthesis of many small, already-captured observations.

This has a direct implication for Section 5 (Historical review): the "past feedback" Gant reviews for progression-tracking is the same underlying data that would eventually inform the biannual report. Worth designing the data model with this end use in mind from the start, rather than bolting it on later.

**Open design question**: should the four existing report-card categories (Technical/Tactical/Physical/Mental) become the roll-up structure that phases-of-play feedback maps into, so a biannual report could eventually be semi-auto-populated (coach reviews and edits a Gant-drafted summary, rather than starting blank)? This is a bigger and later step than Gant's initial scope (Section 1) — flagged here as a natural next-phase extension, not a v1 requirement — and should be discussed with coaches in the guardrails session (see coach guardrails doc, Part 1) since it affects how phases of play should be defined now.

### 13.2 Guided, spoken self-reflection for players
There's an idea to replace the paper self-reflection form with a guided, interactive digital version — where a player speaks their answers (similar dictation-first approach to the coach side) and Gant helps structure the reflection into the same kind of prompts the paper form uses today (biggest strengths, weaknesses, training consistency, attitude).

**This is a meaningfully different guardrails and safety problem from everything else in this document**, and shouldn't be treated as a simple extension of coach-side Gant:

- Everywhere else in this spec, Gant only ever interacts with **coaches** — it is a backstage tool, never player-facing, and never converses with a minor directly (Section 12: Attribution).
- A self-reflection assistant would mean Gant **conversing directly with a child**, which changes the design and safety profile substantially — appropriate question framing, tone, what it can/can't ask or probe on, how much conversational latitude it has, and what happens if a player says something concerning during a reflection session are all new considerations that don't apply to the coach-facing tool.
- This should be scoped as its **own dedicated design and safety conversation** before any build work starts — not something to fold into the current coach guardrails session or the existing Gant requirements, even though it may reuse some of the same tone/style thinking (see coach guardrails doc, Part 5).

**Not yet decided / explicitly out of scope for the current build:**
- [ ] Whether Gant should ever converse directly with a player, versus only cleaning up/structuring what they've already said with no interactive back-and-forth
- [ ] What additional safety guardrails would be needed for any direct player-facing interaction (age-appropriate tone, escalation path if a player discloses something concerning, caregiver visibility into the self-reflection process)
- [ ] Whether player self-reflection data would carry the same retention/deletion rules as coach feedback, or need its own policy given it originates from a minor
