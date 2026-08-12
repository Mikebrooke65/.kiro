# U9 Intercepting Lesson 01 - Image Generation Prompts
## Following IMAGE-PROMPT-GUIDELINES.md Standards

---

## Image 1: Read the Pass
**Filename:** `session-read-the-pass-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/intercepting/session-read-the-pass-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show a 20x20 meter square marked with orange cones at corners. Display groups of 3: two orange players (attackers without football (soccer ball)) positioned 8 meters apart, one blue player (defender without ball) in middle. One orange player has football (soccer ball) preparing to pass. Draw dotted lines showing potential pass directions to other orange player. Show blue defender watching passer with emphasis on eye contact and body language reading. Use curved arrow to show defender's anticipated movement to intercept. Include small inset diagram showing key body language cues to read: eyes direction, hips angle, foot position. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 2: Cutting Passing Lanes
**Filename:** `session-cutting-passing-lanes-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/intercepting/session-cutting-passing-lanes-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show five 12x12 meter grids arranged in a row. Focus detail on center grid showing 3v1: 3 orange players (one with football (soccer ball), two without) in triangle formation vs 1 blue player (defender without ball) in center. Draw dotted lines showing passing lanes between all orange players. Show blue defender positioned to block one passing lane with emphasis and shaded zone indicating blocked lane. Other passing lanes shown as open with arrows. Add annotation "BLOCK MOST DANGEROUS PASS" pointing to blocked lane. Include small scoreboard showing point system (1 pt for interception, 1 pt for 5 passes). Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 3: Interception Timing
**Filename:** `session-interception-timing-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/intercepting/session-interception-timing-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show three 18x12 meter channels side by side. Focus detail on center channel showing 3v2: 3 orange players (one with football (soccer ball), two without) vs 2 blue players (both without ball). First blue defender pressuring ball carrier. Second blue defender positioned to read pass with dotted arrow showing timed interception run. Add three-stage timing diagram showing: 1) "TOO EARLY" with red X mark and defender moving before pass, 2) "PERFECT TIMING" with green checkmark and defender intercepting pass, 3) "TOO LATE" with red X mark and pass completed. Include scoreboard showing "2 pts for interception". Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 4: Interception Game
**Filename:** `session-interception-game-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/intercepting/session-interception-game-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show 30x20 meter pitch with small goals at each end. Display 4v4 game: 4 orange players vs 4 blue players. One orange player has football (soccer ball) preparing to pass to teammate. Blue defender positioned to intercept with large emphasis circle. Draw dotted line showing anticipated pass path. Draw solid arrow showing defender's interception run cutting across pass path. Add large annotation "+2 BONUS PTS FOR INTERCEPTION". Include small inset diagram showing difference between interception (cutting out pass cleanly) vs tackle (winning ball through contact). Show multiple players spread across pitch in realistic game positions. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Generation Checklist

For each image, verify:

- [x] Opens with "Create a football (soccer) coaching pitch diagram from top-down view"
- [x] Dimensions in meters (20x20, 12x12, 18x12, 30x20)
- [x] Player count and positions specified
- [x] Bib colors: orange (attackers), blue (defenders)
- [x] Ball possession clearly stated for each player
- [x] "football (soccer ball)" terminology used consistently
- [x] Movement arrows described with types (solid, dashed, dotted, curved)
- [x] Special indicators included (emphasis, insets, timing stages, annotations)
- [x] Technical specifications closing paragraph included

---

## Database Update SQL

After uploading images to Supabase Storage, run this SQL to update the session records:

```sql
-- Replace {project-id} with your actual Supabase project ID
UPDATE sessions 
SET diagram_url = 'https://{project-id}.supabase.co/storage/v1/object/public/lesson-media/media/pitch-diagrams/u9/intercepting/' || session_name || '.png'
WHERE session_name IN (
  'session-read-the-pass-u9',
  'session-cutting-passing-lanes-u9',
  'session-interception-timing-u9',
  'session-interception-game-u9'
);
```

---

## Notes

- **Image 1 (Read the Pass):** Shows body language reading with inset of key cues
- **Image 2 (Cutting Passing Lanes):** Illustrates blocking dangerous pass in 3v1 triangle
- **Image 3 (Interception Timing):** Three-stage timing diagram showing too early/perfect/too late
- **Image 4 (Interception Game):** Shows interception vs tackle difference with bonus points

All prompts follow the mandatory 6-section structure from IMAGE-PROMPT-GUIDELINES.md.
