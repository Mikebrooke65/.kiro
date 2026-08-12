# Lesson System Testing Checklist

## Pre-Testing Setup

- [ ] Review `LESSON-SYSTEM-SUMMARY.md` to understand what was created
- [ ] Review `TESTING-LESSON-SYSTEM.md` for detailed instructions
- [ ] Have Supabase SQL Editor open
- [ ] Have app running locally (`npm run dev`)
- [ ] Logged in as admin user

---

## Step 1: Database Migration

- [ ] Open Supabase SQL Editor
- [ ] Copy contents of `supabase/migrations/010_refactor_lessons_sessions.sql`
- [ ] Execute migration
- [ ] Check for errors (should be none)
- [ ] Verify tables created:
  - [ ] `sessions` table exists
  - [ ] `lessons` table exists
  - [ ] `lesson_deliveries` table exists
  - [ ] `session_deliveries` table exists

---

## Step 2: Verify Sample Data

- [ ] Run query: `SELECT COUNT(*) FROM sessions;` → Should return 4
- [ ] Run query: `SELECT COUNT(*) FROM lessons;` → Should return 1
- [ ] Run query to see session names:
  ```sql
  SELECT session_name, title, session_type, duration 
  FROM sessions 
  ORDER BY session_type;
  ```
- [ ] Verify 4 sessions exist with correct names
- [ ] Run query to see lesson with sessions:
  ```sql
  SELECT l.title, l.age_group, l.skill_category,
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
- [ ] Verify lesson "Win It Safely: Block & Poke" exists with all 4 sessions linked

---

## Step 3: Storage Setup (Optional for Now)

- [ ] Go to Supabase Storage
- [ ] Create bucket: `lesson-media`
- [ ] Set bucket to public
- [ ] Create folder structure:
  - [ ] `media/`
  - [ ] `media/pitch-diagrams/`
  - [ ] `media/pitch-diagrams/u9/`
  - [ ] `media/pitch-diagrams/u9/tackling/`

**Note:** You can skip uploading images for now and test without them

---

## Step 4: Update App Code

- [ ] Backup old LessonDetail:
  ```bash
  mv src/pages/LessonDetail.tsx src/pages/LessonDetail-OLD.tsx
  ```
- [ ] Rename new LessonDetail:
  ```bash
  mv src/pages/LessonDetail-NEW.tsx src/pages/LessonDetail.tsx
  ```
- [ ] Check if dev server reloaded (should auto-reload)
- [ ] Check browser console for errors

---

## Step 5: Test in App - Coaching Page

- [ ] Navigate to Coaching page (`/coaching`)
- [ ] Select a U9 team from dropdown
- [ ] Check "Available Lessons" section
- [ ] Verify lesson appears:
  - [ ] Title: "Win It Safely: Block & Poke"
  - [ ] Age group badge: U9
  - [ ] Skill badge: Tackling (Dark Grey)
  - [ ] Duration: 65 min
- [ ] Click the lesson card once (should select it - blue checkbox)
- [ ] Click the lesson card again (should navigate to detail page)

---

## Step 6: Test Lesson Detail Page

### Header Section
- [ ] "Back to Coaching" button works
- [ ] Lesson title displays: "Win It Safely: Block & Poke"
- [ ] Badges display:
  - [ ] U9 (blue)
  - [ ] Beginner (grey)
  - [ ] 65 min (grey)
  - [ ] Tackling (dark grey)
- [ ] Favorite button works (star icon toggles)
- [ ] Description displays
- [ ] Print button exists
- [ ] Share button exists

### Learning Objectives Section
- [ ] "Learning Objectives" heading displays
- [ ] 4 objectives display with green checkmarks:
  - [ ] "Understand when to tackle and when to delay"
  - [ ] "Execute safe block tackles with correct body shape"
  - [ ] "Use poke tackles to win the ball in tight spaces"
  - [ ] "Maintain balance and control when defending"

### Session 1: Mirror Jockey
- [ ] Session number badge: 1 (blue circle)
- [ ] Title: "Mirror Jockey"
- [ ] Duration: "20 minutes • Warm-Up & Technical"
- [ ] "How It Runs" section displays organisation text
- [ ] Equipment section displays 3 items
- [ ] Coaching Points section displays 5 points
- [ ] Steps section displays 6 numbered steps
- [ ] Player Learning Objectives section displays 3 objectives

### Session 2: Block Tackle Introduction
- [ ] Session number badge: 2
- [ ] Title: "Block Tackle Introduction"
- [ ] Duration: "15 minutes • Skill Introduction"
- [ ] All sections display correctly
- [ ] Equipment: 3 items
- [ ] Coaching Points: 6 points
- [ ] Steps: 6 steps
- [ ] Objectives: 3 items

### Session 3: 1v1 Tackle Under Pressure
- [ ] Session number badge: 3
- [ ] Title: "1v1 Tackle Under Pressure"
- [ ] Duration: "15 minutes • Progressive Development"
- [ ] All sections display correctly
- [ ] Equipment: 4 items
- [ ] Coaching Points: 6 points
- [ ] Steps: 6 steps
- [ ] Objectives: 3 items

### Session 4: Tackle Game Application
- [ ] Session number badge: 4
- [ ] Title: "Tackle Game Application"
- [ ] Duration: "15 minutes • Game Application"
- [ ] All sections display correctly
- [ ] Equipment: 4 items
- [ ] Coaching Points: 5 points
- [ ] Steps: 5 steps
- [ ] Objectives: 3 items

---

## Step 7: Test Data Integrity

- [ ] Navigate back to Coaching page
- [ ] Select different team (still U9)
- [ ] Verify lesson still appears
- [ ] Navigate to lesson detail again
- [ ] Verify all data still displays correctly
- [ ] Refresh browser page
- [ ] Verify data persists after refresh

---

## Step 8: Check Browser Console

- [ ] Open browser DevTools (F12)
- [ ] Check Console tab for errors
- [ ] Check Network tab for failed requests
- [ ] Verify Supabase API calls are successful
- [ ] Note any warnings or errors

---

## Step 9: Test with Images (If Uploaded)

If you uploaded pitch diagrams:
- [ ] Each session shows pitch diagram image
- [ ] Images load correctly
- [ ] Images are properly sized
- [ ] Images have correct aspect ratio
- [ ] No broken image icons

---

## Step 10: Document Results

### What Worked ✅
- List everything that worked correctly
- Note any pleasant surprises
- Document good UX elements

### What Didn't Work ❌
- List any errors encountered
- Note missing or incorrect data
- Document confusing UX elements

### What Needs Improvement 🔧
- List areas for enhancement
- Note performance issues
- Document missing features

---

## Post-Testing Actions

### If Everything Works
- [ ] Update LESSON-SYSTEM-ARCHITECTURE.md with "TESTED ✅" note
- [ ] Commit all changes to git
- [ ] Push to prototype branch
- [ ] Begin generating remaining 31 lessons

### If Issues Found
- [ ] Document issues in TESTING-LESSON-SYSTEM.md
- [ ] Update LESSON-SYSTEM-ARCHITECTURE.md with fixes needed
- [ ] Create list of required changes
- [ ] Prioritize fixes
- [ ] Re-test after fixes

---

## Success Criteria

All items below should be ✅:

- [ ] Migration runs without errors
- [ ] 4 sessions created in database
- [ ] 1 lesson created with correct session references
- [ ] Lesson appears in Coaching page
- [ ] Lesson detail page loads
- [ ] All 4 sessions display with complete data
- [ ] No console errors
- [ ] Data persists across page refreshes
- [ ] Navigation works correctly
- [ ] Architecture is validated

---

## Notes Section

Use this space to write notes during testing:

```
Date: ___________
Tester: ___________

Notes:
- 
- 
- 

Issues Found:
- 
- 
- 

Questions:
- 
- 
- 
```

---

## Next Session Planning

After testing is complete:

1. Review all notes and issues
2. Update architecture documents
3. Plan fixes for any issues
4. Decide on next lesson to generate
5. Plan bulk generation strategy for remaining 31 lessons
