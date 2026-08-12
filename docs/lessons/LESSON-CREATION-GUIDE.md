# Lesson Creation Guide
## The Definitive Framework for All Lessons and Sessions

Last updated: 2026-03-12

---

## What the App Displays

This is the exact layout a coach sees when viewing a lesson. Every field below must be populated.

### Lesson Level (top of page)

| # | What's shown | DB field | Notes |
|---|---|---|---|
| 1 | Lesson title | `title` | Engaging, descriptive |
| 2 | Tags row | `age_group`, `level`, `total_duration`, `skill_category` | Shown as pill badges |
| 3 | Description | `description` | 2-3 sentences |
| 4 | Learning Objectives | `objectives` | 4 items, action verbs |

### Session Level (repeated × 4, in order)

| # | What's shown | DB field | Notes |
|---|---|---|---|
| 1 | Session type label + duration | `session_type` + `duration` | e.g. "1. Warm-Up & Technical • 15 min" |
| 2 | Session title | `title` | 2-5 words |
| 3 | Pitch diagram image | `diagram_url` | Shown if URL exists, hidden if null |
| 4 | How It Runs | `organisation` | 2-4 sentences, metric |
| 5 | Equipment | `equipment` | Array, shown as tags |
| 6 | Coaching Points | `coaching_points` | 5-6 items |
| 7 | Steps | `steps` | 5-6 items, numbered |
| 8 | Player Learning Objectives | `key_objectives` | 3 items |

### Fields stored but NOT displayed in current UI

| DB field | Table | Purpose |
|---|---|---|
| `coaching_focus` | lessons | Stored for future use / admin reference |
| `pitch_layout_description` | sessions | Used as prompt for generating pitch diagram images |
| `video_url` | sessions | Rendered when present (no videos uploaded yet) |
| `division` | lessons | 'Community' or 'Academy' — for filtering |
| `team_type` | lessons | 'First Kicks', 'Fun Football', 'Junior Football', 'Youth Football', 'Senior' — for filtering |
| `description` | sessions | Optional session-level description (not rendered) |

---

## Field Specifications

### Lesson Fields

| Field | Type | Required | Rules |
|---|---|---|---|
| `title` | TEXT | Yes | Engaging, descriptive. e.g. "Win It Safely: Block & Poke" |
| `description` | TEXT | Yes | 2-3 sentences. What players will learn. |
| `age_group` | TEXT | Yes | e.g. "U9", "U10" |
| `skill_category` | TEXT | Yes | Current values: Tackling, Marking, Pressing, Intercepting, Dribbling, Ball Striking, 1v1, Passing/Receiving. Academy may add new categories (TBD). |
| `level` | TEXT | Yes | 'Beginner', 'Intermediate', or 'Advanced' |
| `total_duration` | INTEGER | Yes | Sum of 4 session durations (minutes) |
| `objectives` | TEXT[] | Yes | Exactly 4 items. Action verbs. Learning outcomes. |
| `coaching_focus` | TEXT[] | Yes | 4 short phrases. Not displayed in app but stored. |
| `division` | TEXT | Yes | 'Community' or 'Academy' |
| `team_type` | TEXT | Yes | 'First Kicks', 'Fun Football', 'Junior Football', 'Youth Football', or 'Senior' |
| `session_1_id` | UUID | Yes | References warmup session |
| `session_2_id` | UUID | Yes | References skill_intro session |
| `session_3_id` | UUID | Yes | References progressive session |
| `session_4_id` | UUID | Yes | References game session |

### Session Fields

| Field | Type | Required | Count | Rules |
|---|---|---|---|---|
| `session_name` | TEXT | Yes | — | Globally unique. See naming convention below. |
| `age_group` | TEXT | Yes | — | e.g. "U9" |
| `session_type` | TEXT | Yes | — | 'warmup', 'skill_intro', 'progressive', 'game' |
| `duration` | INTEGER | Yes | — | Minutes. Bailey's original durations preserved. |
| `title` | TEXT | Yes | — | 2-5 words. Display name. |
| `organisation` | TEXT | Yes | — | 2-4 sentences. Setup, player organisation, activity, progressions. METRIC (metres). |
| `equipment` | TEXT[] | Yes | 3+ | Format: "Item (quantity) for purpose" |
| `coaching_points` | TEXT[] | Yes | 5-6 | Short, actionable. Imperative voice. |
| `steps` | TEXT[] | Yes | 5-6 | Chronological. Include timings. What coach does. |
| `key_objectives` | TEXT[] | Yes | 3 | Learning outcomes specific to this session. |
| `pitch_layout_description` | TEXT | Yes | — | Detailed description for image generation. Dimensions in metres. Specify bib colours, who has the ball, movement arrows. |
| `diagram_url` | TEXT | No | — | Supabase Storage URL. Set after image upload. |
| `video_url` | TEXT | No | — | YouTube/Vimeo URL or Supabase Storage URL. |

---

## Session Naming Convention

### Community Lessons
```
session-{descriptive-name}-{age-group}
```
Examples: `session-mirror-jockey-u9`, `session-block-tackle-intro-u9`

### Academy Lessons
```
session-academy-{topic}-{descriptive-name}-junior
```
Examples: `session-academy-shielding-ball-mastery-junior`, `session-academy-shielding-shark-attack-junior`

### Rules
- All lowercase
- Hyphens only (no spaces or underscores)
- Must be globally unique across ALL sessions
- No lesson numbers or session slot numbers

---

## Session Type Progression

Every lesson has exactly 4 sessions in this order:

| Slot | Type | Label in App | Typical Duration | Focus |
|---|---|---|---|---|
| 1 | `warmup` | Warm-Up & Technical | 15-20 min | Movement, footwork, basic technique |
| 2 | `skill_intro` | Skill Introduction | 10-15 min | Teach the core technique |
| 3 | `progressive` | Progressive Development | 10-15 min | Add pressure, opposition, decisions |
| 4 | `game` | Game Application | 15-45 min | Apply skill in game situations |

Note: Bailey's durations vary from the Community standard (which was 20/15/15/15 = 65 min). Academy lessons preserve Bailey's original durations.

---

## Media (Images & Video)

### Pitch Diagram Images
- Filename: `{session-name}.png` (matches `session_name` field)
- Storage path: `/media/pitch-diagrams/{age-group}/{skill}/{session-name}.png`
- Full URL: `https://{project}.supabase.co/storage/v1/object/public/lesson-media/media/pitch-diagrams/{age-group}/{skill}/{session-name}.png`
- Format: PNG, 4:5 or 1:1 aspect ratio, min 800px on short edge
- The `pitch_layout_description` field is used as the prompt to generate these images

### Videos (optional)
- Format: MP4 (H.264) or external URL (YouTube/Vimeo)
- Max length: 30-60 seconds
- Storage path: `/media/videos/{age-group}/{skill}/{session-name}.mp4`

### Academy Images (from Bailey's .pptx)
- Original images extracted from Google Slides export
- Mapped in `bailey-image-mapping.json`
- Will be renamed to match session names and uploaded to Supabase Storage
- Reused images get copied with session-specific names (one file per session)

---

## SQL Template

### Session INSERT
```sql
INSERT INTO sessions (
  session_name, age_group, session_type, duration, title,
  organisation, equipment, coaching_points, steps, key_objectives,
  pitch_layout_description
) VALUES (
  'session-{name}',
  '{age_group}',
  '{warmup|skill_intro|progressive|game}',
  {duration_minutes},
  '{Title}',
  '{2-4 sentences, metric, how it runs}',
  ARRAY['{equipment items with quantities}'],
  ARRAY['{5-6 coaching points}'],
  ARRAY['{5-6 steps}'],
  ARRAY['{3 key objectives}'],
  '{pitch layout description for image generation}'
);
```

### Lesson INSERT (Community)
```sql
INSERT INTO lessons (
  title, description, age_group, skill_category, level,
  session_1_id, session_2_id, session_3_id, session_4_id,
  total_duration, objectives, coaching_focus
)
SELECT
  '{Lesson Title}',
  '{2-3 sentence description}',
  '{age_group}',
  '{skill_category}',
  'Beginner',
  (SELECT id FROM sessions WHERE session_name = '{session-1-name}'),
  (SELECT id FROM sessions WHERE session_name = '{session-2-name}'),
  (SELECT id FROM sessions WHERE session_name = '{session-3-name}'),
  (SELECT id FROM sessions WHERE session_name = '{session-4-name}'),
  {total_minutes},
  ARRAY['{4 lesson objectives}'],
  ARRAY['{4 coaching focus points}'];
```

### Lesson INSERT (Academy — adds division + team_type)
```sql
INSERT INTO lessons (
  title, description, age_group, skill_category, level,
  session_1_id, session_2_id, session_3_id, session_4_id,
  total_duration, objectives, coaching_focus,
  division, team_type
)
SELECT
  '{Lesson Title}',
  '{2-3 sentence description}',
  '{age_group}',
  '{skill_category}',
  'Beginner',
  (SELECT id FROM sessions WHERE session_name = '{session-1-name}'),
  (SELECT id FROM sessions WHERE session_name = '{session-2-name}'),
  (SELECT id FROM sessions WHERE session_name = '{session-3-name}'),
  (SELECT id FROM sessions WHERE session_name = '{session-4-name}'),
  {total_minutes},
  ARRAY['{4 lesson objectives}'],
  ARRAY['{4 coaching focus points}'],
  'Academy',
  'Junior Football';
```

---

## Migration File Naming

```
supabase/migrations/{number}_{skill}-{age}-lesson-{number}.sql
```

Community examples:
- `012_tackling-u9-lesson-02.sql`
- `017_dribbling-u9-lessons-01-02.sql`

Academy examples:
- `028_academy-shielding-lesson-01.sql`
- `029_academy-2v2-games-lesson-01.sql`

---

## Checklist

### Per Session
- [ ] `session_name` globally unique, follows naming convention
- [ ] `title` is 2-5 words, descriptive
- [ ] `organisation` is 2-4 sentences, uses METRES
- [ ] `equipment` has specific quantities (3+ items)
- [ ] `coaching_points` has 5-6 items (short, actionable)
- [ ] `steps` has 5-6 items (chronological, with timings)
- [ ] `key_objectives` has exactly 3 items
- [ ] `pitch_layout_description` specifies dimensions, bib colours, who has ball
- [ ] `session_type` matches slot position (warmup → skill_intro → progressive → game)

### Per Lesson
- [ ] `title` is engaging and descriptive
- [ ] `description` is 2-3 sentences
- [ ] `objectives` has exactly 4 items (action verbs)
- [ ] `coaching_focus` has 4 short phrases
- [ ] `total_duration` = sum of 4 session durations
- [ ] `division` set ('Community' or 'Academy')
- [ ] `team_type` set (e.g. 'Junior Football')
- [ ] All 4 session references exist and are in correct order

### For Academy Lessons (Bailey's content)
- [ ] Bailey's coaching points preserved exactly (as first items in coaching_points array)
- [ ] Bailey's objectives preserved exactly
- [ ] Bailey's durations preserved exactly
- [ ] Generated fields (organisation, equipment, steps, pitch layout) are sensible
- [ ] Additional coaching points added to reach 5-6 per session

---

## Reference Files

| File | Purpose |
|---|---|
| `LESSON-CREATION-GUIDE.md` | This file — the definitive framework |
| `LESSON-SYSTEM-ARCHITECTURE.md` | Database schema, storage, admin workflow |
| `IMAGE-PROMPT-GUIDELINES.md` | Rules for generating pitch diagram images |
| `supabase/migrations/010_refactor_lessons_sessions.sql` | Schema definition |
| `supabase/migrations/027_add_division_and_team_type.sql` | Division/team_type columns |
| `supabase/migrations/012_tackling-u9-lesson-02.sql` | Example Community lesson |
| `supabase/migrations/028_academy-shielding-lesson-01.sql` | Example Academy lesson |
| `src/pages/LessonDetail.tsx` | App UI — what coaches actually see |
