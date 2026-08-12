# Key Skills Reference
## Official List of 8 Key Skills for Lesson Organization

---

## Complete List

### Defending Skills (4)
1. **Tackling** - Winning the ball through tackles (block, poke, slide)
2. **Marking** - Staying close to opponents, denying space
3. **Pressing** - Applying pressure to force mistakes
4. **Intercepting** - Reading the game and cutting out passes

### Attacking Skills (4)
5. **Dribbling** - Running with the ball, close control, changes of direction
6. **Ball Striking** - Shooting, passing technique, power and accuracy
7. **1v1** - Taking on defenders, creating space in 1v1 situations
8. **Passing/Receiving** - Passing accuracy, first touch, receiving under pressure

---

## Lesson Plan Structure

**Total Lessons:** 32
- 8 skills × 2 lessons per skill × 2 age groups (U9, U10)

**Total Sessions:** 128
- 32 lessons × 4 sessions per lesson

---

## Lesson Distribution

### U9 Lessons (16 lessons, 64 sessions)
**Defending:**
- Tackling: 2 lessons
- Marking: 2 lessons
- Pressing: 2 lessons
- Intercepting: 2 lessons

**Attacking:**
- Dribbling: 2 lessons
- Ball Striking: 2 lessons
- 1v1: 2 lessons
- Passing/Receiving: 2 lessons

### U10 Lessons (16 lessons, 64 sessions)
**Defending:**
- Tackling: 2 lessons
- Marking: 2 lessons
- Pressing: 2 lessons
- Intercepting: 2 lessons

**Attacking:**
- Dribbling: 2 lessons
- Ball Striking: 2 lessons
- 1v1: 2 lessons
- Passing/Receiving: 2 lessons

---

## Current Progress

### Completed:
- ✅ U9 Tackling Lesson 01: "Win It Safely: Block & Poke"
- ✅ U9 Tackling Lesson 02: "Read and React: Timing Your Tackle"

### Remaining:
- 30 lessons to create

---

## Skill Category Usage in Database

When creating lessons, use these EXACT skill category names:

```sql
skill_category TEXT NOT NULL CHECK (skill_category IN (
  'Tackling',
  'Marking',
  'Pressing',
  'Intercepting',
  'Dribbling',
  'Ball Striking',
  '1v1',
  'Passing/Receiving'
))
```

---

## Notes

- 8 skills total: 4 Defending + 4 Attacking
- Each skill has 2 lessons per age group (Lesson 01 and Lesson 02)
- Lesson 01 typically focuses on fundamentals
- Lesson 02 typically builds on Lesson 01 with more complexity
- All lessons follow Beginner level for U9 and U10
- Each lesson has exactly 4 sessions (warmup, skill_intro, progressive, game)

---

## Version History

- **v1.0** - Initial list created (March 9, 2026)
- **v1.1** - Corrected to 8 skills (removed "Defending" as separate skill)
- Official list: 8 skills (4 defending + 4 attacking)

