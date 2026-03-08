# 📘 Kiro Lesson Production Pipeline  
### *Master Process for Generating Lessons, Sessions, and Media for Supabase*

---

## 🏆 Purpose of This Document
This document explains the **complete, end‑to‑end workflow** for producing all lessons and sessions for the Kiro Football Coaching App.

It consolidates:
- The GitHub specification files already created  
- The lesson + session generation workflow  
- Naming conventions  
- Media standards  
- Supabase folder structure  
- The production pipeline for all 32 lessons  

This is your **return‑to reference** for future lesson production.

---

# 1. 📁 GitHub Files That Define the System

These files exist in the `.kiro` directory of the `lesson-plans` branch and MUST be followed for all lesson production.

## Assistant Output Requirements

To ensure all generated lessons are production‑ready, consistent, and compatible with the Kiro coaching app, the assistant must follow these output rules for every lesson:

### 1. Copy‑Safe Filename
- The assistant must generate a clean, copy‑ready filename for the lesson.
- Format: `<AGEGROUP>-<SKILL>-Lesson-<##>.md`

## Session Reuse and Global Session ID Rules

### 1. Sessions Are Reusable
Sessions are not permanently linked to any single lesson.  
A single session may appear in multiple lessons and in different session slots.  
The assistant must treat sessions as globally reusable assets.

### 2. Global Session Library
All sessions are stored in a central session library.  
Lessons do not contain session content; they only reference Session IDs.

### 3. Global Unique Session IDs
Every session must have a globally unique Session ID.  
Session IDs must:
- Not include lesson numbers  
- Not include lesson references  
- Not depend on which lesson uses them  
- Be stable and reusable across the entire curriculum  

### 4. Session ID Naming Requirements
Session IDs must follow the Naming Convention Spec and must:
- Use a unique, descriptive, hyphenated name  
- Include age group where required  
- Never include lesson numbers  
- Never include session slot numbers  

Example:
- `session-1v1-tackle-and-break-u9`
- `session-ball-familiarisation-u7`
- `session-press-and-cover-u11`

### 5. Lessons Reference Sessions
Each lesson contains four session slots.  
Each slot must reference a Session ID from the global session library.

Example:
- Session 1 → `session-ball-familiarisation-u9`
- Session 2 → `session-tackle-technique-basics-u9`
- Session 3 → `session-tracking-runner-u9`
- Session 4 → `session-1v1-tackle-and-break-u9`

### 6. Assistant Responsibilities
When generating lessons, the assistant must:
- Generate or reuse globally unique Session IDs  
- Ensure no session ID is tied to a lesson  
- Ensure lessons only reference Session IDs  
- Ensure session content is generated separately from lessons  


### **1. `lesson-framework.md`**
Defines the mandatory structure for every lesson:
- Lesson metadata  
- 4 sessions  
- Learning objectives  
- Skill alignment  
- Age‑group alignment  

### **2. `session-template-spec.md`**
Defines the structure for every session:
- Session name  
- Duration  
- Organisation  
- Equipment  
- Coaching points  
- Step‑by‑step  
- Key learning objectives  
- Pitch layout description  
- Media fields (diagram + video)

### **3. `naming-convention-spec.md`**
Defines:
- Lesson naming  
- Session naming  
- Media filenames  
- Age‑group prefixes  
- Skill prefixes  
- Versioning rules  

### **4. `media-format-spec.md`**
Defines:
- PNG format  
- Aspect ratios (4:5 or 1:1)  
- Transparent or white background  
- Mobile‑first readability  

### **5. `supabase-setup-spec.md`**
Defines:
- Folder structure  
- Table structure  
- Field requirements  
- Media URL handling  
- Linking lessons → sessions  

These files form the **ruleset** for all lesson and session generation.

---

# 2. 🧩 The 8 Key Skills

### **Defending**
1. Tackling  
2. Marking  
3. Pressing  
4. Intercepting  

### **Attacking**
5. Dribbling  
6. Ball Striking  
7. 1v1  
8. Passing & Receiving  

For each skill:
- **U9** → 2 lessons  
- **U10** → 2 lessons  

Total lessons required:



\[
8 \cdot 2 \cdot 2 = 32
\]



---

# 3. 🏗️ Production Pipeline (End‑to‑End)

This is the official workflow for generating all lessons and sessions.

---

## **Step 1 — Create the Master Lesson Index (Control Panel)**

Create a table (Google Sheet, Notion, or Markdown):

| Skill | Age Group | Lesson # | Lesson Title | Status |
|-------|-----------|----------|--------------|--------|

Populate all 32 lessons.

This prevents duplication and gives you a clear roadmap.

---

## **Step 2 — Generate Each Lesson Using `lesson-framework.md`**

For each lesson:
- Insert skill  
- Insert age group  
- Insert difficulty level  
- Add 4 sessions (using the session template)  
- Add learning objectives  
- Add coaching focus  

Every lesson must follow the exact structure defined in the framework.

---

## **Step 3 — Generate Each Session Using `session-template-spec.md`**

Each session must include:

- Session name  
- Duration  
- Organisation  
- Equipment  
- Coaching points  
- Step‑by‑step  
- Key learning objectives  
- Pitch layout description  
- Media filenames (diagram + video)  

This ensures consistency across all 128 sessions.

---

## **Step 4 — Generate Pitch Layout Images**

For each session:

1. Use the pitch layout description  
2. Create a PNG diagram  
3. Save using naming conventions  
4. Upload to Supabase  

### **Supabase folder path:**
`public/media/pitch-diagrams/{age-group}/{skill}/{lesson-number}/session-{session-number}.png`

Example:
public/media/pitch-diagrams/u9/dribbling/lesson-01/session-01.png

This ensures:
- Predictable paths
- Easy automation
- Clean linking inside Supabase tables

---

## **Step 5 — Upload Media to Supabase**

For each session:

1. Upload the PNG pitch diagram  
2. Upload the MP4 session video (if available)  
3. Copy the public URLs  
4. Insert URLs into the session record fields:
   - `diagram_url`
   - `video_url`

All media must follow the naming conventions defined in `naming-convention-spec.md`.

---

## **Step 6 — Insert Sessions into Supabase**

Each session becomes one row in the `sessions` table.

Required fields:

- `id` (UUID)
- `lesson_id` (foreign key)
- `session_number` (1–4)
- `title`
- `duration`
- `organisation`
- `equipment`
- `coaching_points`
- `steps`
- `key_objectives`
- `pitch_layout_description`
- `diagram_url`
- `video_url`

### **JSON Insert Format (Copy/Paste Ready)**

{
  "lesson_id": "<UUID>",
  "session_number": 1,
  "title": "",
  "duration": "",
  "organisation": "",
  "equipment": "",
  "coaching_points": [],
  "steps": [],
  "key_objectives": [],
  "pitch_layout_description": "",
  "diagram_url": "",
  "video_url": ""
}

---

## **Step 7 — Insert Lessons into Supabase**

Each lesson becomes one row in the `lessons` table.

Required fields:

- `id` (UUID)
- `skill`
- `age_group`
- `lesson_number`
- `title`
- `learning_objectives`
- `coaching_focus`

### **JSON Insert Format**

{
  "skill": "",
  "age_group": "",
  "lesson_number": 1,
  "title": "",
  "learning_objectives": [],
  "coaching_focus": []
}

---

## **Step 8 — Link Lessons → Sessions**

Once all four sessions are created:

- Retrieve the lesson UUID  
- Update each session row with the correct `lesson_id`  
- Confirm all four sessions appear in the Supabase dashboard under the lesson

This ensures the app can fetch:
- Lesson → Sessions  
- Session → Media  

---

# 4. 🧪 Quality Control Checklist

Before marking a lesson “Complete” in the Master Index:

### **Lesson QC**
- Follows `lesson-framework.md`
- Correct skill + age group
- 4 sessions included
- Learning objectives present
- Coaching focus present

### **Session QC**
- Follows `session-template-spec.md`
- All fields completed
- Pitch layout description clear
- Diagram + video filenames correct
- Media uploaded to correct folder
- URLs inserted into session record

### **Media QC**
- PNG format  
- Correct aspect ratio  
- Clean, readable, mobile‑first  
- Filename matches naming convention  
- Stored in correct Supabase path  

---

# 5. 🚀 Final Output of This Pipeline

When the entire workflow is complete, you will have:

- **32 lessons**
- **128 sessions**
- **128 pitch diagrams**
- **128 session videos (optional)**
- Fully populated Supabase tables
- A scalable, repeatable production system

This document is the **master reference** for producing all future lessons.

---
# 6. 🧠 Lesson Generation Workflow (Operational Rules)

This section defines exactly how the assistant must generate a lesson when requested.

## 6.1 Required Inputs
When the user requests a lesson, they must specify:
- Age group (e.g., U9, U10)
- Skill (e.g., Dribbling, 1v1)
- Lesson number (1 or 2 for each age group)

## 6.2 Required Outputs
The assistant must output:
1. A copy‑safe filename  
2. A complete Markdown lesson file  
3. Four Session IDs  
4. Four Session references  
5. Four pitch diagram filenames  
6. Four pitch diagram prompts  
7. Supabase‑ready JSON for the lesson  
8. Supabase‑ready JSON for each session  

All outputs must be delivered in a single response with no chunking.

---

# 7. 🧠 Session Generation Workflow

Sessions are reusable global assets.  
The assistant must generate sessions using the following rules:

## 7.1 Session Structure
Each session must follow `session-template-spec.md` exactly:
- Title  
- Duration  
- Organisation  
- Equipment  
- Coaching points  
- Steps  
- Key learning objectives  
- Pitch layout description  
- Media filenames  

## 7.2 Session ID Rules
Session IDs must:
- Be globally unique  
- Never include lesson numbers  
- Never include session slot numbers  
- Follow naming conventions  
- Include age group where required  

Example:  
`session-1v1-shield-and-turn-u9`

## 7.3 Session Output Requirements
For each session, the assistant must output:
- Session ID  
- Session content  
- Pitch diagram filename  
- Pitch diagram prompt  
- JSON block  

---

# 8. 🖼️ Media Generation Workflow

## 8.1 Pitch Diagram Filenames
Filenames must follow:  
`<session-id>.png`

Example:  
`session-1v1-shield-and-turn-u9.png`

## 8.2 Pitch Diagram Prompts
Each session must include a pitch diagram prompt describing:
- Player positions  
- Cones  
- Areas  
- Movements  
- Ball paths  
- Constraints  

Prompts must be:
- Clear  
- Visual  
- Coach‑friendly  
- Aligned with the pitch layout description  

---

# 9. 🧱 Lesson File Structure Specification

The assistant must output the lesson file in this exact structure:

# <Lesson Title>

## Metadata
- Age Group:  
- Skill:  
- Lesson Number:  
- Difficulty:  

## Learning Objectives
- Objective 1  
- Objective 2  
- Objective 3  

## Coaching Focus
- Focus 1  
- Focus 2  

## Sessions
### Session 1
Session ID: <ID>

### Session 2
Session ID: <ID>

### Session 3
Session ID: <ID>

### Session 4
Session ID: <ID>

---

# 10. 🧱 Session File Structure Specification

Each session must follow this structure:

## <Session Title>

### Duration
<duration>

### Organisation
<organisation>

### Equipment
<equipment>

### Coaching Points
- Point 1  
- Point 2  
- Point 3  

### Steps
1. Step 1  
2. Step 2  
3. Step 3  

### Player Learning Objectives
- Objective 1  
- Objective 2  

### Pitch Layout Description
<description>

### Media
- Diagram: <filename>.png
- Video: <filename>.mp4 (optional)

---

# 11. 🗄️ JSON Output Specification

## 11.1 Lesson JSON
{
  "skill": "",
  "age_group": "",
  "lesson_number": 1,
  "title": "",
  "learning_objectives": [],
  "coaching_focus": []
}

## 11.2 Session JSON
{
  "session_id": "",
  "title": "",
  "duration": "",
  "organisation": "",
  "equipment": "",
  "coaching_points": [],
  "steps": [],
  "key_objectives": [],
  "pitch_layout_description": "",
  "diagram_filename": "",
  "video_filename": ""
}

---

# 12. 🔗 Supabase Linking Rules

- Lessons are inserted first  
- Sessions are inserted second  
- Sessions reference lessons via `lesson_id`  
- Media URLs are inserted after upload  
- Filenames must match naming conventions exactly  

---

# 13. 🧩 End of Operational Specification

This document now contains:
- All structural rules  
- All naming rules  
- All generation rules  
- All media rules  
- All JSON rules  
- All linking rules  
- All assistant output rules  

The assistant can now generate lessons autonomously with zero ambiguity.
