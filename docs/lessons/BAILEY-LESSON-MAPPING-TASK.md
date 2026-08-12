# Task: Map Bailey Academy Lessons to App Framework

## Background

The club (West Coast Rangers) has provided all the lesson printouts used by their Junior Academy coaching staff. These have been scraped from the original slides and saved as a markdown file (`Bailey lessons.md`) on the `Bailey` branch of the `kiro` remote.

The file contains **54 slides** (some duplicates), each representing a single lesson/session plan. They cover multiple age groups and academy levels:
- U9 & U10 lessons (Slides 1–33)
- U9 & U10 specific (Slide 34)
- General academy (Slides 35–40)
- U11/U12 specific (Slides 41–45)
- Summer Academy (Slides 46–50)
- Junior Academy (Slides 51–54)

## Source File

- **Branch**: `Bailey` (on `kiro` remote)
- **File**: `Bailey lessons.md`
- **Size**: ~3,150 lines, 54 lesson slides

## Objective

Map the Bailey lesson content to our locked-in lesson framework (defined in `LESSON-CREATION-GUIDE.md`) to:

1. **Identify structural differences** between Bailey's format and our framework
2. **Map matching fields** where content aligns
3. **Identify gaps** — fields our framework requires that Bailey lessons don't provide
4. **Determine what can be auto-populated** vs what needs manual addition
5. **Produce migration-ready SQL** for lessons that can be fully mapped

## Our Framework (from LESSON-CREATION-GUIDE.md)

Each lesson in our system has:
- **Lesson-level**: title, skill, age_group, level, coaching_focus array
- **4 sessions** (each with):
  - session_name (globally unique identifier)
  - title
  - session_type: warmup, skill_intro, progressive, game
  - duration (minutes)
  - age_group
  - organisation (how it runs — detailed description)
  - equipment (list)
  - coaching_points (list, 5-6 per session)
  - steps (step-by-step instructions, 5-6 per session)
  - key_objectives (3 per session)
  - pitch_layout_description

**Standard durations**: 20min (warmup) + 15min (skill_intro) + 15min (progressive) + 15min (game) = 65 min total

## Bailey Lesson Structure (from the scraped slides)

Each Bailey slide has:
- **Lesson Name** (e.g., "Shielding", "1 v 1 Defending")
- **4 Sessions** (each with):
  - Session title (e.g., "Ball Mastery & Juggling", "Shark Attack")
  - Time (varies: 5, 10, 15, 20, 45 minutes)
  - Objectives (2-3 bullet points)
  - Focus (3-4 bullet points)
  - Coaching Points (3-5 bullet points)
- **Notes** (usually "None")

## Field Mapping

| Our Framework Field | Bailey Equivalent | Status |
|---|---|---|
| Lesson title | Lesson Name | ✅ Direct map |
| Lesson skill | Derived from lesson name | ⚠️ Needs classification |
| Lesson age_group | Some slides specify (U9, U10, U11/U12) | ⚠️ Partial — many don't specify |
| Lesson level | Not provided | ❌ Missing — needs manual assignment |
| Lesson coaching_focus | Not provided | ❌ Missing — can derive from session focus areas |
| Session title | Session title (after "—") | ✅ Direct map |
| Session session_type | Not explicitly labelled | ⚠️ Can infer from position (1=warmup, 2=skill_intro, 3=progressive, 4=game) |
| Session duration | Time field | ✅ Direct map (but durations vary from our standard) |
| Session organisation | Not provided | ❌ Missing — this is the "how it runs" description |
| Session equipment | Not provided | ❌ Missing — needs manual addition |
| Session coaching_points | Coaching Points | ✅ Direct map |
| Session steps | Not provided | ❌ Missing — step-by-step instructions |
| Session key_objectives | Objectives | ✅ Direct map (may need rewording) |
| Session pitch_layout_description | Not provided | ❌ Missing |
| Session focus | Focus field | ⚠️ No direct equivalent — could feed into organisation or coaching_focus |

## Key Differences

### Duration Mismatch
Bailey lessons don't follow our standard 20/15/15/15 pattern. Examples:
- Slide 1: 15/10/15/20 = 60 min
- Slide 2: 5/5/15/45 = 70 min
- Slide 3: 15/10/10/25 = 60 min

**Decision needed**: Do we keep Bailey's original durations or standardise to our 65-min format?

### Missing Fields (need to be added)
1. **Organisation** — How each session/drill actually runs. Bailey slides don't describe setup or flow.
2. **Equipment** — No equipment lists provided.
3. **Steps** — No step-by-step instructions. Bailey gives objectives and coaching points but not the "do this, then this" flow.
4. **Pitch layout description** — No pitch/field setup descriptions.
5. **Level** — No difficulty grading (Beginner/Intermediate/Advanced).

### Extra Fields in Bailey (not in our framework)
1. **Focus** — A separate list from coaching points. Could be merged into organisation or coaching_focus.

## Proposed Approach

### Phase 1: Analysis & Classification
- [ ] Read full Bailey file and catalogue all 54 lessons
- [ ] Remove duplicates (some slides appear twice)
- [ ] Classify each lesson by skill (map to our 8 key skills or identify new ones)
- [ ] Classify by age group where possible
- [ ] Note which lessons are relevant for Junior Academy (our primary target)

### Phase 2: Mapping & Gap Analysis
- [ ] For each lesson, map existing fields to our framework
- [ ] Document exactly what's missing per lesson
- [ ] Identify patterns — are the same fields always missing?
- [ ] Determine if "Focus" can fill any gaps

### Phase 3: Content Enrichment
- [ ] Add missing organisation descriptions (how each drill runs)
- [ ] Add equipment lists
- [ ] Add step-by-step instructions
- [ ] Add pitch layout descriptions
- [ ] Assign levels and age groups
- [ ] Standardise or document duration decisions

### Phase 4: SQL Generation
- [ ] Generate migration SQL files following our established pattern
- [ ] Follow session naming convention: `session-<descriptive-name>-<age-group>`
- [ ] Test migrations locally before deploying

## Reference Documents
- `LESSON-CREATION-GUIDE.md` — Our lesson framework/template
- `KEY-SKILLS-REFERENCE.md` — The 8 key skills (4 defending, 4 attacking)
- `LESSON-SYSTEM-ARCHITECTURE.md` — Database schema and session naming conventions
- `Bailey lessons.md` (on `Bailey` branch) — Source content from the club

## Notes
- Some Bailey lessons cover skills not in our current 8-skill framework (e.g., Shielding, Rondo & Possession, Crossing & Finishing, Ways to Break the Line)
- The U11/U12 and Summer/Junior Academy lessons may need different handling than U9/U10
- Duplicate slides (31-33 appear twice, 41-43 appear twice, 51-54 appear twice) need deduplication
