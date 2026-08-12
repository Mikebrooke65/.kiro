# U9 Pressing Lesson 01 - Image Generation Prompts
## Following IMAGE-PROMPT-GUIDELINES.md Standards

---

## Image 1: Close Down Speed
**Filename:** `session-close-down-speed-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/pressing/session-close-down-speed-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show a 20x20 meter square marked with orange cones at corners. Display multiple pairs: orange player (attacker) with football (soccer ball) standing in center, blue player (defender) without football (soccer ball) positioned 10 meters away. Use solid arrow to show defender's sprint toward attacker. Use dashed line to show final 2 meters where defender slows down for controlled arrival. Add emphasis circle around defender's arrival position showing balanced stance. Include small inset diagram showing correct body position at arrival: low, wide, balanced with arms out. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 2: Pressing Angles
**Filename:** `session-pressing-angles-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/pressing/session-pressing-angles-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show five 12x12 meter grids arranged in a row. Each grid has small goal at one end. Focus detail on center grid: orange player (attacker) with football (soccer ball) in center of grid, blue player (defender) without football (soccer ball) approaching from side at angle. Use curved arrow to show defender's angled approach from side. Use dotted line with arrow to show forced direction away from goal toward sideline. Small goal positioned at top of grid. Add large annotation "PRESS FROM SIDE" with arrow pointing to approach angle. Include small inset showing incorrect straight-on approach with red X mark. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 3: Pressing Triggers
**Filename:** `session-pressing-triggers-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/pressing/session-pressing-triggers-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show three 18x12 meter channels side by side. Focus detail on center channel showing 2v1: 2 orange players (one with football (soccer ball), one without) vs 1 blue player (defender without ball). Mark three emphasis zones with labels: 1) "HEAVY TOUCH" near ball with starburst icon, 2) "PASS MOMENT" showing pass between attackers with arrow, 3) "FACING AWAY" showing attacker turned toward own goal. Use arrows to show defender's pressing runs to each trigger moment. Add small legend box explaining three pressing triggers. Include small scoreboard showing point system (1 pt for winning ball, 1 pt for 5 passes). Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 4: Pressing Game
**Filename:** `session-pressing-game-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/pressing/session-pressing-game-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show 30x20 meter pitch with small goals at each end. Divide pitch in half with dotted line. Display 4v4 game: 4 orange players vs 4 blue players. Show moment where orange player just lost football (soccer ball) to blue player in orange half (opponent's half). Emphasize orange half with light shading labeled "OPPONENT'S HALF". Show orange players immediately pressing blue player with ball using arrows indicating pressing movements from multiple directions. Add large "5 SECONDS!" timer annotation with clock icon. Include small annotation box showing "+1 bonus pt for winning ball in 5 sec in opponent's half". Show urgency with motion lines. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
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
- [x] Special indicators included (emphasis zones, insets, timers, labels)
- [x] Technical specifications closing paragraph included

---

## Database Update SQL

After uploading images to Supabase Storage, run this SQL to update the session records:

```sql
-- Replace {project-id} with your actual Supabase project ID
UPDATE sessions 
SET diagram_url = 'https://{project-id}.supabase.co/storage/v1/object/public/lesson-media/media/pitch-diagrams/u9/pressing/' || session_name || '.png'
WHERE session_name IN (
  'session-close-down-speed-u9',
  'session-pressing-angles-u9',
  'session-pressing-triggers-u9',
  'session-pressing-game-u9'
);
```

---

## Notes

- **Image 1 (Close Down Speed):** Shows sprint then controlled arrival with body position inset
- **Image 2 (Pressing Angles):** Emphasizes angled approach vs straight-on with correct/incorrect examples
- **Image 3 (Pressing Triggers):** Illustrates three trigger moments for pressing decisions
- **Image 4 (Pressing Game):** Shows counter-pressing with 5-second rule in opponent's half

All prompts follow the mandatory 6-section structure from IMAGE-PROMPT-GUIDELINES.md.
