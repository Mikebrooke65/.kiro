# U9 Dribbling Lesson 01 - Image Generation Prompts
## Following IMAGE-PROMPT-GUIDELINES.md Standards

---

## Image 1: Close Control
**Filename:** `session-close-control-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/dribbling/session-close-control-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show a 20x20 meter square marked with orange cones at corners. Display multiple orange players each with football (soccer ball) dribbling freely throughout area. Use curved arrows to show random movement patterns with ball staying close to feet. Draw dotted circles (1 meter radius) around each player showing close control zone. Include small inset diagrams in corner showing four touch types with foot positions: 1) sole roll, 2) inside touch, 3) outside touch, 4) pull back. Emphasize ball control with annotation "BALL STAYS CLOSE". Use consistent icons, colors (orange), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 2: Change of Direction
**Filename:** `session-change-of-direction-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/dribbling/session-change-of-direction-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show five 12x12 meter grids arranged in a row. Each grid has 4 cones forming square (3 meters apart). Focus detail on center grid: orange player with football (soccer ball) dribbling figure-8 pattern around cones. Use curved arrows to show dribbling path with sharp direction changes at each cone. Add angle indicators showing 90-degree turns at cones. Include small diagrams showing inside-foot turn technique and outside-foot turn technique with foot positions. Show blue defender (without ball) following behind in progression stage. Emphasize sharp turns with annotation "SHARP CHANGES". Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 3: Dribbling Under Pressure
**Filename:** `session-dribbling-under-pressure-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/dribbling/session-dribbling-under-pressure-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show three 15x10 meter channels side by side. Focus detail on center channel showing 1v1: orange player with football (soccer ball) dribbling toward far end, blue player (defender without ball) applying pressure from behind and side. Use arrows to show attacker's dribbling path with direction changes to escape pressure. Emphasize body positioning with attacker between ball and defender using shielding technique. Include small inset diagram showing correct shielding: body between ball and opponent, arms out for balance, low center of gravity. Add annotation "PROTECT WITH BODY". Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 4: Dribbling Game
**Filename:** `session-dribbling-game-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/dribbling/session-dribbling-game-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show 30x20 meter pitch with small goals at each end. Display 4v4 game: 4 orange players vs 4 blue players. One orange player with football (soccer ball) dribbling toward goal, taking on blue defender. Use arrows to show dribbling path beating defender and approaching goal line. Emphasize player dribbling over goal line (not shooting) with annotation "DRIBBLE OVER LINE TO SCORE". Include small scoreboard showing "2 pts for dribbled goal, 3 pts if beat 2+ opponents". Show multiple players spread across pitch with focus on dribbling action near goal. Add emphasis circle on dribbling moment. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Generation Checklist

For each image, verify:

- [x] Opens with "Create a football (soccer) coaching pitch diagram from top-down view"
- [x] Dimensions in meters (20x20, 12x12, 15x10, 30x20)
- [x] Player count and positions specified
- [x] Bib colors: orange (attackers/dribblers), blue (defenders)
- [x] Ball possession clearly stated for each player
- [x] "football (soccer ball)" terminology used consistently
- [x] Movement arrows described with types (solid, dashed, dotted, curved)
- [x] Special indicators included (circles, insets, technique diagrams, annotations)
- [x] Technical specifications closing paragraph included

---

## Database Update SQL

After uploading images to Supabase Storage, run this SQL to update the session records:

```sql
-- Replace {project-id} with your actual Supabase project ID
UPDATE sessions 
SET diagram_url = 'https://{project-id}.supabase.co/storage/v1/object/public/lesson-media/media/pitch-diagrams/u9/dribbling/' || session_name || '.png'
WHERE session_name IN (
  'session-close-control-u9',
  'session-change-of-direction-u9',
  'session-dribbling-under-pressure-u9',
  'session-dribbling-game-u9'
);
```

---

## Notes

- **Image 1 (Close Control):** Shows free dribbling with touch type insets and control zones
- **Image 2 (Change of Direction):** Illustrates figure-8 pattern with sharp turns and technique details
- **Image 3 (Dribbling Under Pressure):** Emphasizes shielding technique with body positioning inset
- **Image 4 (Dribbling Game):** Shows dribbling to score with special scoring rules

All prompts follow the mandatory 6-section structure from IMAGE-PROMPT-GUIDELINES.md.
