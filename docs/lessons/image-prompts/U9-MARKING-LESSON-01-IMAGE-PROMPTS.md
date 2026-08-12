# U9 Marking Lesson 01 - Image Generation Prompts
## Following IMAGE-PROMPT-GUIDELINES.md Standards

---

## Image 1: Stick Like Glue
**Filename:** `session-stick-like-glue-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/marking/session-stick-like-glue-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show a 20x20 meter square marked with orange cones at corners. Display 3 pairs of players spread throughout the area: attackers wearing orange bibs without football (soccer balls) moving around space, defenders wearing blue bibs without football (soccer balls) staying within 1 meter maintaining close marking position. Use solid curved arrows to show attacker's movement with changes of direction. Use dashed arrows to show defender's matching movements staying close. Add dotted circles (1 meter radius) around each pair to show marking distance requirement. Include simple legend showing player icons (orange = attacker, blue = defender) and marking distance circle. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 2: Goal Side Marking
**Filename:** `session-goal-side-marking-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/marking/session-goal-side-marking-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show five 12x12 meter grids arranged in a row. Each grid has small goal at one end. Focus detail on center grid: orange player (attacker) with football (soccer ball) dribbling toward goal, blue player (defender) without football (soccer ball) positioned between attacker and goal in goal-side position. Show imaginary dotted line from ball to goal center with defender positioned on that line. Use solid arrow for attacker's movement toward goal. Use angled arrows for defender's adjustment movements to maintain goal-side position. Include small inset showing correct positioning with green checkmark and incorrect positioning (defender behind attacker) with red X mark. Add label "GOAL SIDE" with arrow pointing to correct defender position. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 3: Marking Under Pressure
**Filename:** `session-marking-under-pressure-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/marking/session-marking-under-pressure-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show three 18x12 meter channels side by side. Each channel has small goals at both ends. Focus detail on center channel showing 2v2 game: 2 orange players (one with football (soccer ball) in center, one without ball positioned wide) vs 2 blue players (both without football (soccer ball)). Draw dotted lines connecting each blue defender to their assigned orange attacker showing marking assignments. Use numbers on bibs (1-4) clearly visible. Show tight marking with emphasis circle when ball is near (defender very close to attacker near ball). Show slightly looser marking with larger circle when ball is far (defender giving more space to attacker away from ball). Include arrows showing ball movement and player movements. Add small legend explaining tight vs loose marking distances. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 4: Marking Game
**Filename:** `session-marking-game-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/marking/session-marking-game-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show 30x20 meter pitch with small goals at each end. Display 4v4 game: 4 orange players vs 4 blue players. Each player has visible number on bib (orange: 1-4, blue: 5-8). One orange player in center has football (soccer ball). Draw dotted lines connecting marking pairs showing assignments (orange 1 to blue 5, orange 2 to blue 6, orange 3 to blue 7, orange 4 to blue 8). Show all 8 players spread across pitch in realistic game positions. Add emphasis circle around one marking pair showing tight marking distance. Include small annotation box near one goal showing "-2 pts if assigned player scores" rule. Show arrows indicating ball movement and some player movements. Add small legend explaining marking assignments and special scoring rule. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
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
- [x] Special indicators included (circles, lines, numbers, emphasis, insets)
- [x] Technical specifications closing paragraph included

---

## After Generation

1. **Download images** from AI generator
2. **Verify quality:**
   - 4:5 aspect ratio
   - Minimum 800px short edge
   - White background
   - Clear, high contrast
   - All elements visible and readable
   - Numbers on bibs clearly visible
3. **Rename files** to match session names exactly
4. **Upload to Supabase Storage** at specified paths
5. **Update database** with URLs

---

## Database Update SQL

After uploading images to Supabase Storage, run this SQL to update the session records:

```sql
-- Replace {project-id} with your actual Supabase project ID
UPDATE sessions 
SET diagram_url = 'https://{project-id}.supabase.co/storage/v1/object/public/lesson-media/media/pitch-diagrams/u9/marking/' || session_name || '.png'
WHERE session_name IN (
  'session-stick-like-glue-u9',
  'session-goal-side-marking-u9',
  'session-marking-under-pressure-u9',
  'session-marking-game-u9'
);
```

---

## Notes

- **Image 1 (Stick Like Glue):** Shows close marking with 1-meter distance circles
- **Image 2 (Goal Side Marking):** Emphasizes positioning between attacker and goal with correct/incorrect examples
- **Image 3 (Marking Under Pressure):** Shows 2v2 with marking assignments and tight/loose marking concepts
- **Image 4 (Marking Game):** Illustrates 4v4 with numbered bibs and marking pair assignments

All prompts follow the mandatory 6-section structure from IMAGE-PROMPT-GUIDELINES.md.
