# Testing the Lesson System

## Quick Start Guide

### Step 1: Run the Migration

1. Open Supabase SQL Editor
2. Copy the contents of `supabase/migrations/010_refactor_lessons_sessions.sql`
3. Execute the migration
4. Verify tables created:
   - `sessions` (should have 4 rows)
   - `lessons` (should have 1 row)
   - `lesson_deliveries` (empty)
   - `session_deliveries` (empty)

### Step 2: Verify Data

Run these queries in Supabase SQL Editor:

```sql
-- Check sessions
SELECT session_name, title, session_type, duration 
FROM sessions 
ORDER BY session_type;

-- Check lesson
SELECT l.title, l.age_group, l.skill_category, l.total_duration,
       s1.title as session_1,
       s2.title as session_2,
       s3.title as session_3,
       s4.title as session_4
FROM lessons l
JOIN sessions s1 ON l.session_1_id = s1.id
JOIN sessions s2 ON l.session_2_id = s2.id
JOIN sessions s3 ON l.session_3_id = s3.id
JOIN sessions s4 ON l.session_4_id = s4.id;
```

Expected results:
- 4 sessions with names: session-mirror-jockey-u9, session-block-tackle-intro-u9, session-1v1-tackle-pressure-u9, session-tackle-game-u9
- 1 lesson: "Win It Safely: Block & Poke" with all 4 sessions linked

### Step 3: Create Media Storage Bucket

1. Go to Supabase Storage
2. Create new bucket: `lesson-media`
3. Make it public
4. Create folder structure:
   ```
   media/
     pitch-diagrams/
       u9/
         tackling/
   ```

### Step 4: Upload Placeholder Images

For now, create 4 placeholder images (or skip this step):
- `session-mirror-jockey-u9.png`
- `session-block-tackle-intro-u9.png`
- `session-1v1-tackle-pressure-u9.png`
- `session-tackle-game-u9.png`

Upload to: `media/pitch-diagrams/u9/tackling/`

### Step 5: Update Session Records with Media URLs

```sql
-- Update diagram URLs (replace {project} with your Supabase project ID)
UPDATE sessions 
SET diagram_url = 'https://{project}.supabase.co/storage/v1/object/public/lesson-media/media/pitch-diagrams/u9/tackling/' || session_name || '.png'
WHERE session_name LIKE 'session-%u9';
```

### Step 6: Test in the App

1. Make sure you're on the `prototype` branch
2. Start dev server: `npm run dev`
3. Login as admin (mikerbrooke@outlook.com / Linda2024!)
4. Navigate to Coaching page
5. Select a U9 team
6. Verify lesson appears in "Available Lessons"
7. Click lesson to view detail
8. Verify all 4 sessions display correctly

### Step 7: Check Lesson Detail Page

The app should fetch and display:
- Lesson title: "Win It Safely: Block & Poke"
- Lesson description
- 4 session blocks with:
  - Session title
  - Duration
  - Description
  - Equipment list
  - Coaching points
  - Steps
  - Key objectives
  - Pitch diagram (if uploaded)

---

## Expected App Behavior

### Coaching Page (Mobile)
- Team selector dropdown
- "Available Lessons" section shows:
  - Lesson title
  - Age group badge (U9)
  - Skill category badge (Tackling - Dark Grey)
  - Duration (65 min)
  - Click to navigate to detail

### Lesson Detail Page
- Header with lesson title and metadata
- 4 session cards:
  1. Mirror Jockey (20 min) - Warmup
  2. Block Tackle Introduction (15 min) - Skill Intro
  3. 1v1 Tackle Under Pressure (15 min) - Progressive
  4. Tackle Game Application (15 min) - Game
- Each card expandable to show full details
- Pitch diagrams display if URLs are set
- Print/Export button (future)

---

## Troubleshooting

### Issue: Lesson doesn't appear
**Check:**
- Migration ran successfully
- Lesson exists in database
- User's team age_group matches lesson age_group (U9)
- RLS policies allow user to read lessons

**Query to verify:**
```sql
SELECT * FROM lessons WHERE age_group = 'U9';
```

### Issue: Sessions don't display
**Check:**
- All 4 session_X_id fields are populated
- Session IDs are valid UUIDs
- Sessions exist in sessions table

**Query to verify:**
```sql
SELECT l.title, 
       l.session_1_id, l.session_2_id, l.session_3_id, l.session_4_id,
       s1.title as s1_title, s2.title as s2_title, 
       s3.title as s3_title, s4.title as s4_title
FROM lessons l
LEFT JOIN sessions s1 ON l.session_1_id = s1.id
LEFT JOIN sessions s2 ON l.session_2_id = s2.id
LEFT JOIN sessions s3 ON l.session_3_id = s3.id
LEFT JOIN sessions s4 ON l.session_4_id = s4.id;
```

### Issue: Images don't load
**Check:**
- Storage bucket exists and is public
- Files uploaded to correct path
- diagram_url in sessions table is correct
- URL format: `https://{project}.supabase.co/storage/v1/object/public/lesson-media/media/pitch-diagrams/u9/tackling/{session-name}.png`

**Query to verify:**
```sql
SELECT session_name, diagram_url FROM sessions;
```

---

## Next Steps After Testing

1. **If everything works:**
   - Generate remaining 31 lessons
   - Create all session content
   - Generate/upload pitch diagrams
   - Update app UI if needed

2. **If issues found:**
   - Document the issue
   - Update LESSON-SYSTEM-ARCHITECTURE.md
   - Fix migration if needed
   - Update app code if needed
   - Re-test

3. **App updates needed:**
   - Update Coaching.tsx to fetch lessons with new schema
   - Update LessonDetail.tsx to display sessions correctly
   - Ensure session data structure matches new schema
   - Test with real team data

---

## Database Queries for Development

### Get all sessions for a lesson
```sql
SELECT 
  l.title as lesson_title,
  s.session_name,
  s.title as session_title,
  s.session_type,
  s.duration
FROM lessons l
CROSS JOIN LATERAL (
  VALUES 
    (l.session_1_id, 1),
    (l.session_2_id, 2),
    (l.session_3_id, 3),
    (l.session_4_id, 4)
) AS session_refs(session_id, session_number)
JOIN sessions s ON s.id = session_refs.session_id
WHERE l.id = '<lesson-uuid>'
ORDER BY session_refs.session_number;
```

### Find lessons using a specific session
```sql
SELECT l.title, l.age_group, l.skill_category
FROM lessons l
WHERE l.session_1_id = (SELECT id FROM sessions WHERE session_name = 'session-mirror-jockey-u9')
   OR l.session_2_id = (SELECT id FROM sessions WHERE session_name = 'session-mirror-jockey-u9')
   OR l.session_3_id = (SELECT id FROM sessions WHERE session_name = 'session-mirror-jockey-u9')
   OR l.session_4_id = (SELECT id FROM sessions WHERE session_name = 'session-mirror-jockey-u9');
```

### Check for orphaned sessions (not used in any lesson)
```sql
SELECT s.session_name, s.title
FROM sessions s
WHERE NOT EXISTS (
  SELECT 1 FROM lessons l
  WHERE l.session_1_id = s.id
     OR l.session_2_id = s.id
     OR l.session_3_id = s.id
     OR l.session_4_id = s.id
);
```
