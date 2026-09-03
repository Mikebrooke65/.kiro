# Defining Gant's Guardrails
### A working doc for the coach conversation — Clubfootball.app

---

## Why we're doing this

Gant (the AI feedback assistant) doesn't invent its own opinions about football or coaching. It works from a **steering document** — a written-down version of how our club already thinks about feedback, so Gant can check a coach's comment against it and help refine the wording. If that steering document is vague or thin, Gant's output will be vague and generic too. The better and more specific the coaches' input here, the more useful Gant actually is.

This isn't a technical conversation. It's a coaching conversation — we're just writing down knowledge that currently lives in experienced coaches' heads, so it can be applied consistently across every team, every age group, every coach (including newer or less experienced ones who don't yet have that instinct built in).

## What we're trying to produce

By the end of this process, we need three things, in plain written language (not code, not jargon — just clear coaching language):

1. **A list of phases of play** — the shared vocabulary the whole club uses to talk about what happens in a game
2. **A feedback model** — what "good feedback" looks like at our club, structurally
3. **A tone/style guide** — how we phrase things, especially "areas to work on," so it lands well with a player (and, for younger players, their caregiver reading it)
4. **Continuity language** — how we reference a player's past notes naturally when writing a new one (see Part 3b) — this is a real, in-scope part of Gant's first build, not a future add-on

---

## Part 1: Phases of play

**What we need:** A defined, agreed list of the moments/phases of play the club wants feedback to be organised around. This becomes the checklist Gant uses to make sure feedback is specific rather than vague.

**Existing club framework — worth bringing to the session:** The club currently issues a biannual (twice-yearly) player report card structured around four fixed categories, each with rated sub-skills (Excelling / Competent / Developing):

- **Technical**: first touch & control, striking the ball, dribbling, weak foot, tackling
- **Tactical**: game understanding, creativity, decision-making, positional awareness
- **Physical**: pace, strength, stamina, agility
- **Mental**: respect & manners (standards), work ethic, desire & mentality, self belief, composure

This is a *different* lens from "phases of play" (which describes moments in a game — build-up, transition, final third) — the report card categories describe skill domains, not game moments. Both are useful, but they're not the same thing, and it's worth explicitly asking coaches: **does Gant's phase-of-play tagging need to map into these four existing categories**, so that day-to-day feedback can eventually roll up into the familiar report card structure? Or do these stay as two separate, coexisting frameworks — phases for day-to-day feedback, categories for the biannual summary?

**Key questions for coaches:**
- What are the core phases we want to track? (e.g. attacking, defending, transition — in possession / out of possession — could also be more granular: build-up play, final third, defensive shape, pressing, set pieces, transitions)
- Do younger age groups need a simpler/shorter list than older, more advanced grades? (A U8 phase list is probably not the same as a Youth/Senior one.)
- Is there a maximum useful number? (Too many phases and coaches won't use it consistently; too few and feedback stays generic.)
- Should goalkeepers have their own separate phase list, given the role is quite different?
- **How should the phases-of-play vocabulary relate to the existing Technical/Tactical/Physical/Mental report card categories** — should every phase tag also imply a category, so ongoing feedback can eventually populate the biannual report automatically?

**Level of detail needed:** A short definition per phase (1–2 sentences) is enough — just enough that two different coaches would categorise the same moment the same way. We're not writing a coaching manual, just a shared vocabulary.

---

## Prior art — a research-backed starting point, not a blank page

Added 2026-09-03. Before running this session, it's worth knowing this isn't
unmapped territory — there's a well-established feedback framework worth
bringing to coaches as a starting point, rather than inventing a structure from
scratch.

**Hattie & Timperley's feedback model ("feed up, feed back, feed forward").**
John Hattie's research (with Helen Timperley, 2007) is among the most-cited
work on what makes feedback effective, across education and coaching
contexts. Their model says effective feedback answers three questions:

1. **Feed up — "Where am I going?"** (what's the goal/standard being aimed at)
2. **Feed back — "How am I doing?"** (a clear read on current performance
   against that goal)
3. **Feed forward — "Where to next?"** (a concrete next step)

Research applying this model has found **"feed forward" is the piece most
often missing in practice** — people are relatively good at describing what
happened, less good at saying what to actually do about it. That's directly
relevant to Part 2 below: Gant's feedback model should make the "next step"
element close to non-negotiable, not optional, precisely because it's the part
real feedback (human or AI-assisted) tends to drop.

**Bring this framing to the session** as a check against whatever structure
coaches land on — if the club's model doesn't map onto feed up/back/forward,
that's fine, but it's worth knowing which of the three the model is strong or
weak on.

**One thing to actively steer away from: the "compliment sandwich."**
Praise-criticism-praise is a popular format, but it isn't well supported by
evidence — reviews of the research describe only partial, condition-specific
support for it, and youth-sport-specific commentary notes it's often
ineffective with young athletes particularly (kids tend to remember the
criticism and discount the surrounding praise). This matters for the
**all-positive-feedback decision already made** (Part 2, below): the point
isn't "always sandwich a work-on between two positives," it's that all-positive
feedback should be allowed to just *be* all-positive, and a work-on, when there
is one, doesn't need artificial praise bookending it to be well-received.

*(Sources summarised for compliance with licensing restrictions on verbatim
reproduction — not direct quotes.)*

---

## Part 2: The feedback model

**What we need:** What does a *good* piece of feedback actually contain, structurally, at our club? This is the template Gant checks a coach's draft against.

**Key questions for coaches:**
- **[Decided]** Feedback does not need to always contain a work-on — genuinely all-positive feedback is allowed and will be posted as such. Coaches don't need to manufacture a development point when the honest observation is entirely positive. (This came out of a trial dictation example — a passage of play with no natural work-on — worth sharing with coaches as context for why this was decided, and to confirm it matches their instinct.)
- Should feedback always be tied to a specific phase of play, or is general feedback also acceptable?
- Is there a difference in structure between **team feedback** and **individual player feedback**?
- Should feedback ever reference a specific moment/incident (e.g. "in Saturday's game when...") or should it stay general to avoid singling out a moment publicly?
- How much detail is enough? A one-line comment, or a few sentences?
- Should coaches also record something forward-looking — e.g. a specific thing to try next session — as part of the model, not just an assessment?

**Level of detail needed:** This is the most important part to get right — ideally 3-5 clear rules coaches can hold in their heads. Concrete example: "Every piece of individual feedback should name one strength, one specific area to work on tied to a phase of play, and (where possible) one thing to try in training." That kind of sentence is exactly what Gant needs.

---

## Part 3: Tone and phrasing — especially "work-ons"

**What we need:** How the club wants feedback to actually *read*, particularly the harder part — telling a player (sometimes a child) what they need to improve, without it feeling like criticism.

**Key questions for coaches:**
- Do we have any existing examples of feedback the club is proud of — comments that struck the right tone? (Real examples are gold here — much better than describing the tone in the abstract.)
- Do we have any examples of feedback that *missed the mark* — too blunt, too vague, too negative? (Useful as a "don't do this" reference, described anonymously.)
- Should phrasing differ by age group? (A "work-on" for a 9-year-old probably reads differently than one for a 16-year-old.)
- Are there specific words or framings the club wants to avoid (e.g. "weakness," "failed to," "never") in favour of growth-oriented language (e.g. "developing," "next step is," "an area to focus on")?
- Should feedback always be framed around effort/development rather than fixed ability?

**Level of detail needed:** A handful of real before/after examples (a blunt version and a reworded, club-standard version side by side) will do more work here than a long written policy. If coaches can bring 3-5 examples of comments they've actually written or received, that's ideal raw material.

---

## Part 3b: Referencing history — the language for continuity

**Added 2026-09-03 — this is a real, in-scope piece of Gant's first build, not
a future idea.** When a coach writes a new note about a player, Gant is given
that player's last 4 approved notes as context, and its refined output should
draw on that naturally where relevant — not treat every note as if it's the
first thing ever said about that player.

**What we need:** club-standard phrasing for **referencing continuity** —
noting that something has come up before, without it reading as robotic,
repetitive, or like Gant is quoting a database back at the coach. Some starting
shapes to react to and improve on:

- "This is something we've discussed previously..."
- "One of your known work-ons..."
- "This builds on the comments around your first touch..."
- "Since [last note's date/session], ..."

**Key questions for coaches:**
- Should this phrasing change depending on whether the player has **improved,
  stayed the same, or regressed** on a recurring point? (E.g. "still an area to
  keep building on" vs. "great to see this has clicked since last time.")
- How often is too often? If every single note references history, does it
  start to feel surveillance-like rather than supportive? Is there a sense of
  "only reference it when it's genuinely useful, not as a habit"?
- Does this need to differ for a younger player's parent reading it, vs. an
  older player reading it themselves?

**Level of detail needed:** a handful of example phrases (improved / same /
regressed variants) is enough — this slots into the same tone guide as Part 3,
it's just a specific recurring situation worth having agreed language for
rather than leaving Gant to invent its own each time.

---

## Part 4: A few other things worth asking coaches directly

- Who "owns" the final feedback model going forward — does it get reviewed/updated each season, or is it fixed?
- Should the model differ for goalkeepers vs outfield players?
- Are there things Gant should **never** comment on or flag (e.g. anything about a player's body, fitness level, or comparisons to siblings/other players)?
- If Gant asks a clarifying question that a coach can't easily answer in the moment (e.g. mid-training), is that acceptable, or does it need to be quick enough to use pitch-side?

---

## Part 5: Player self-reflection (context for coaches, not a guardrail item yet)

**Why this is here:** The club already runs a self-reflection process alongside the biannual report card — the player fills in a paper form (biggest strengths, weaknesses, attitude, training consistency) ahead of a short 1:1 with their coach. There's an idea on the table to turn this into a guided, interactive digital experience — where a player could speak their answers rather than write them, with Gant helping structure the reflection through prompts.

**This is a genuinely different guardrails problem from coach-side Gant**, worth flagging to coaches even at this early stage: today, Gant only ever talks to *coaches* — it's a backstage tool, never player-facing. A self-reflection assistant would mean Gant interacting *directly with a child*, which is a meaningfully different risk and design profile (tone, safety, what it can and can't ask or say, how much autonomy it has in the conversation). This isn't something to design in this coach session, but it's worth coaches knowing it's a future idea, since:
- The tone/style guardrails coaches define here (Part 3) may end up being reused or adapted for player-facing self-reflection prompts too
- Coaches may have useful instincts about what makes a self-reflection question land well with different age groups — the same "would a 9-year-old and a 16-year-old need this phrased differently" question from Part 3 applies here too

No action needed from coaches on this yet beyond awareness — it'll come back as its own dedicated design conversation before build.

---

## Suggested format for the session

- Run this as a working session with 3-5 experienced coaches (not just one voice) so the model reflects genuine club consensus, not one person's individual style
- Bring real, anonymised examples of feedback already written manually — these are more useful starting material than starting from a blank page
- Aim to leave the session with: a draft phase-of-play list, a one-paragraph feedback model, and a handful of before/after tone examples
- Treat this as a living document — it can be refined once coaches start seeing Gant's output in practice
