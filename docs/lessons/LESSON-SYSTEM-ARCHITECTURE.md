# Lesson System Architecture
## Consolidated Requirements & Schema Design

---

## Core Principles

### 1. Sessions Are Globally Reusable Assets
- Each session has a **unique name** (serves as natural identifier)
- Sessions exist independently in a global library
- The same session can be used in multiple lessons
- Sessions can be used in different positions (Session 1, 2, 3, or 4)

### 2. Lessons Reference Sessions
- Lessons do NOT own sessions
- Lessons contain 4 references to session IDs
- Deleting a lesson does NOT delete its sessions
- Sessions can exist without being in any lesson

### 3. Admin Workflow
**Long-term (Admin UI)**:
1. Admin builds sessions in Session Builder
2. Admin creates lesson in Lesson Builder
3. Admin selects 4 existing sessions from dropdown
4. Lesson saves with references to those 4 sessions

**Short-term (Bulk Load)**:
1. Create all sessions first (with unique names)
2. Create lessons that reference those sessions
3. Use session unique names to link them

---

## Database Schema

### Sessions Table (Standalone)
```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Unique identifier (natural key)
  session_name TEXT NOT NULL UNIQUE, -- e.g., "session-1v1-shield-and-turn-u9"
  
  -- Metadata
  age_group TEXT NOT NULL, -- e.g., "U9", "U10"
  session_type TEXT NOT NULL, -- "warmup", "skill_intro", "progressive", "game"
  duration INTEGER NOT NULL, -- in minutes
  
  -- Content
  title TEXT NOT NULL, -- Display name
  description TEXT,
  organisation TEXT, -- How it runs
  equipment TEXT[], -- Array of equipment items
  coaching_points TEXT[], -- Array of coaching points
  steps TEXT[], -- Step-by-step instructions
  key_objectives TEXT[], -- Learning objectives
  
  -- Media
  pitch_layout_description TEXT,
  diagram_url TEXT, -- Supabase storage URL: /media/pitch-diagrams/{age-group}/{skill}/{session-name}.png
  video_url TEXT, -- Supabase storage or YouTube/Vimeo URL
  
  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_age_group ON sessions(age_group);
CREATE INDEX idx_sessions_session_type ON sessions(session_type);
CREATE INDEX idx_sessions_session_name ON sessions(session_name);
```

### Lessons Table (References Sessions)
```sql
CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Metadata
  title TEXT NOT NULL,
  description TEXT,
  age_group TEXT NOT NULL,
  skill_category TEXT NOT NULL, -- 'Tackling', 'Marking', 'Pressing', 'Intercepting', 'Dribbling', 'Ball Striking', '1v1', 'Passing/Receiving'
  level TEXT DEFAULT 'Beginner',
  
  -- Session References (4 required)
  session_1_id UUID REFERENCES sessions(id) ON DELETE RESTRICT,
  session_2_id UUID REFERENCES sessions(id) ON DELETE RESTRICT,
  session_3_id UUID REFERENCES sessions(id) ON DELETE RESTRICT,
  session_4_id UUID REFERENCES sessions(id) ON DELETE RESTRICT,
  
  -- Computed
  total_duration INTEGER, -- Sum of 4 session durations
  
  -- Learning
  objectives TEXT[], -- Overall lesson objectives
  coaching_focus TEXT[], -- Key coaching points for the lesson
  
  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CHECK (session_1_id IS NOT NULL),
  CHECK (session_2_id IS NOT NULL),
  CHECK (session_3_id IS NOT NULL),
  CHECK (session_4_id IS NOT NULL)
);

CREATE INDEX idx_lessons_age_group ON lessons(age_group);
CREATE INDEX idx_lessons_skill_category ON lessons(skill_category);
```

### Lesson Deliveries (Unchanged)
```sql
CREATE TABLE lesson_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES users(id),
  delivery_date DATE NOT NULL,
  is_locked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Session Deliveries (Unchanged)
```sql
CREATE TABLE session_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_delivery_id UUID REFERENCES lesson_deliveries(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE RESTRICT,
  delivered BOOLEAN DEFAULT FALSE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Media Storage

### Supabase Storage Bucket
- **Bucket name:** `lesson-media`
- **Public access:** Yes (read-only)
- **Structure:**
  ```
  /media/
    /pitch-diagrams/
      /u9/
        /tackling/
          session-mirror-jockey-u9.png
          session-block-tackle-intro-u9.png
          session-1v1-tackle-pressure-u9.png
          session-tackle-game-u9.png
        /dribbling/
          ...
      /u10/
        ...
    /videos/ (optional)
      /u9/
        /tackling/
          session-mirror-jockey-u9.mp4
          ...
  ```

### Media URL Format
- **Diagrams:** `https://{project}.supabase.co/storage/v1/object/public/lesson-media/media/pitch-diagrams/{age-group}/{skill}/{session-name}.png`
- **Videos:** `https://{project}.supabase.co/storage/v1/object/public/lesson-media/media/videos/{age-group}/{skill}/{session-name}.mp4`

### Media Requirements
- **Diagrams:**
  - Format: PNG
  - Aspect ratio: 4:5 (preferred) or 1:1
  - Min resolution: 800px on short edge
  - Background: White or transparent
  - Style: Clean, mobile-friendly
  
- **Videos (optional):**
  - Format: MP4 (H.264) or external URL (YouTube/Vimeo)
  - Max length: 30-60 seconds
  - Resolution: 720p or 1080p

---

## Session Naming Convention

### Format
`session-<descriptive-name>-<age-group>`

### Examples
- `session-ball-familiarisation-u9`
- `session-1v1-shield-and-turn-u9`
- `session-tackle-technique-basics-u10`
- `session-press-and-cover-u11`

### Rules
- All lowercase
- Hyphens only (no underscores or spaces)
- Must be globally unique
- Must NOT include lesson numbers
- Must NOT include session slot numbers (1-4)
- Age group at the end (if age-specific)

---

## Bulk Load Process

### Step 1: Create All Sessions
```sql
INSERT INTO sessions (session_name, age_group, session_type, duration, title, ...)
VALUES 
  ('session-mirror-jockey-tag-u9', 'U9', 'warmup', 20, 'Mirror Jockey Tag', ...),
  ('session-block-tackle-intro-u9', 'U9', 'skill_intro', 15, 'Block Tackle Introduction', ...),
  ('session-1v1-tackle-pressure-u9', 'U9', 'progressive', 15, '1v1 Tackle Under Pressure', ...),
  ('session-tackle-game-u9', 'U9', 'game', 15, 'Tackle Game Application', ...);
```

### Step 2: Create Lessons Referencing Sessions
```sql
-- First, get session IDs by name
WITH session_ids AS (
  SELECT id, session_name FROM sessions
  WHERE session_name IN (
    'session-mirror-jockey-tag-u9',
    'session-block-tackle-intro-u9',
    'session-1v1-tackle-pressure-u9',
    'session-tackle-game-u9'
  )
)
INSERT INTO lessons (
  title, 
  age_group, 
  skill_category, 
  session_1_id, 
  session_2_id, 
  session_3_id, 
  session_4_id
)
SELECT 
  'Win It Safely: Block & Poke',
  'U9',
  'Tackling',
  (SELECT id FROM session_ids WHERE session_name = 'session-mirror-jockey-tag-u9'),
  (SELECT id FROM session_ids WHERE session_name = 'session-block-tackle-intro-u9'),
  (SELECT id FROM session_ids WHERE session_name = 'session-1v1-tackle-pressure-u9'),
  (SELECT id FROM session_ids WHERE session_name = 'session-tackle-game-u9');
```

---

## Admin UI Workflow (Future)

### Session Builder
1. Admin creates a new session
2. Fills in all session fields
3. Uploads diagram and video
4. Saves with unique `session_name`
5. Session appears in global library

### Lesson Builder
1. Admin creates a new lesson
2. Fills in lesson metadata
3. For each of 4 slots:
   - Dropdown shows filtered sessions:
     - Matching age group
     - Matching session type (warmup, skill_intro, progressive, game)
   - Admin selects session
4. System auto-calculates total duration
5. Saves lesson with 4 session references

---

## Key Differences from Current Schema

| Aspect | Current (Wrong) | Correct (Your Vision) |
|--------|----------------|----------------------|
| Session ownership | Sessions belong to lessons | Sessions are independent |
| Reusability | Cannot reuse sessions | Sessions fully reusable |
| Foreign key | sessions.lesson_id → lessons | lessons.session_X_id → sessions |
| Deletion | Delete lesson = delete sessions | Delete lesson ≠ delete sessions |
| Session identity | UUID only | UUID + unique name |
| Bulk load | Create lesson, then sessions | Create sessions, then lessons |

---

## Migration Strategy

### Option 1: New Migration (Recommended)
Create `010_refactor_lessons_sessions.sql`:
1. Drop existing lesson_deliveries and session_deliveries
2. Drop existing lessons and sessions tables
3. Create new sessions table (standalone)
4. Create new lessons table (with session references)
5. Recreate delivery tables
6. Bulk load new session and lesson data

### Option 2: Data Migration
1. Export existing data
2. Transform to new structure
3. Run migration
4. Import transformed data

---

## Validation Rules

### Session Validation
- `session_name` must be unique
- `session_name` must follow naming convention
- `age_group` must be valid (U4-U17)
- `session_type` must be one of: warmup, skill_intro, progressive, game
- `duration` must be > 0

### Lesson Validation
- All 4 session references must exist
- All 4 sessions should match lesson's age_group (warning if not)
- `total_duration` should equal sum of 4 session durations
- Session types should follow recommended order:
  - Session 1: warmup
  - Session 2: skill_intro
  - Session 3: progressive
  - Session 4: game

---

## Benefits of This Architecture

1. **Reusability**: Build once, use many times
2. **Flexibility**: Mix and match sessions across lessons
3. **Maintainability**: Update a session once, affects all lessons using it
4. **Scalability**: Easy to add new sessions to library
5. **Admin-friendly**: Clear separation between building blocks (sessions) and compositions (lessons)
6. **Bulk load friendly**: Create all sessions first, then reference them

---

## Next Steps

1. Review this architecture against original requirements
2. Create new migration file with correct schema
3. Build bulk load script for initial 32 lessons
4. Update app code to fetch lessons with session references
5. Update Session Builder UI to create standalone sessions
6. Update Lesson Builder UI to reference existing sessions
