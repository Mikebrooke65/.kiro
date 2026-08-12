# U9 Passing/Receiving Lesson 01 - Image Generation Prompts
## Following IMAGE-PROMPT-GUIDELINES.md Standards

---

## Image 1: Passing Basics
**Filename:** `session-passing-basics-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/passing-receiving/session-passing-basics-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show a 20x20 meter square marked with cones at corners. Display multiple pairs of orange players positioned 8 meters apart. One player with football (soccer ball) passing to partner (without ball). Draw solid arrows showing pass direction and curved arrows showing player movement after pass. Include large inset diagram showing passing technique in three stages: 1) approach at angle with checkmark, 2) plant foot beside ball/strike with inside of foot with checkmark, 3) follow through toward target with checkmark. Add annotation "INSIDE OF FOOT TECHNIQUE". Show multiple pairs practicing across the square. Emphasize proper technique with foot positioning detail. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 2: Receiving and First Touch
**Filename:** `session-receiving-first-touch-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/passing-receiving/session-receiving-first-touch-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show five 9x9 meter grids arranged in a row. Focus on center grid showing three-stage sequence: 1) Orange player receiving with inside of foot (cushioning football (soccer ball) into space shown with curved arrow), 2) Same orange player receiving with outside of foot (turning away from pressure shown with curved arrow), 3) Same orange player receiving with sole of foot (stopping ball dead shown with downward arrow). Partner orange player with football (soccer ball) passing in each stage. Draw arrows showing ball movement and control direction for each receiving method. Add large annotation "3 SURFACES: INSIDE, OUTSIDE, SOLE". Include small inset showing body position for receiving: sideways on, eyes on ball, balanced stance. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 3: Passing Under Pressure
**Filename:** `session-passing-under-pressure-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/passing-receiving/session-passing-under-pressure-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show three 15x12 meter areas side by side. Focus on center area showing 3v1: 3 orange players (one with football (soccer ball), two without) vs 1 blue player (defender without ball). Draw dotted lines showing passing options between all orange players forming triangle. Draw curved arrows showing player movement to create passing angles. Blue defender pressuring ball carrier with emphasis. Add large annotation "5 PASSES = 1 PT". Display scoreboard showing point system (5 passes = 1 pt, win ball = 1 pt). Include small inset showing proper support positioning: create triangles, not straight lines. Show passing lanes with some blocked by defender (shaded) and some open (clear). Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 4: Passing Game
**Filename:** `session-passing-game-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/passing-receiving/session-passing-game-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show 30x20 meter pitch with small goals at each end. Display 4v4 game: 4 orange players vs 4 blue players. Show passing sequence: first orange player with football (soccer ball) passing to teammate shown with dotted arrow labeled "1", who passes to another teammate shown with dotted arrow labeled "2", who shoots shown with solid arrow labeled "3 SHOOT!". Add large annotation "3 PASSES BEFORE SHOOTING". Display pass counter showing "1... 2... 3... SHOOT!" with emphasis. Show multiple players spread across pitch in realistic game positions with curved arrows indicating support movement. Emphasize teamwork and possession with shaded passing zones. Include small legend showing pass counting system. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Generation Checklist

For each image, verify:

- [x] Opens with "Create a football (soccer) coaching pitch diagram from top-down view"
- [x] Dimensions in meters (20x20, 9x9, 15x12, 30x20)
- [x] Player count and positions specified
- [x] Bib colors: orange (attackers), blue (defenders)
- [x] Ball possession clearly stated for each player
- [x] "football (soccer ball)" terminology used consistently
- [x] Movement arrows described with types (solid, dashed, dotted, curved)
- [x] Special indicators included (insets, sequences, scoreboards, pass counters)
- [x] Technical specifications closing paragraph included

---

## Database Update SQL

After uploading images to Supabase Storage, run this SQL to update the session records:

```sql
-- Replace {project-id} with your actual Supabase project ID
UPDATE sessions 
SET diagram_url = 'https://{project-id}.supabase.co/storage/v1/object/public/lesson-media/media/pitch-diagrams/u9/passing-receiving/' || session_name || '.png'
WHERE session_name IN (
  'session-passing-basics-u9',
  'session-receiving-first-touch-u9',
  'session-passing-under-pressure-u9',
  'session-passing-game-u9'
);
```

---

## Notes

- **Image 1 (Passing Basics):** Three-stage technique inset showing proper inside-of-foot passing
- **Image 2 (Receiving and First Touch):** Three receiving surfaces with control directions
- **Image 3 (Passing Under Pressure):** 3v1 with triangle support positioning and passing lanes
- **Image 4 (Passing Game):** Sequential pass counting (1-2-3-shoot) with team possession

All prompts follow the mandatory 6-section structure from IMAGE-PROMPT-GUIDELINES.md.
