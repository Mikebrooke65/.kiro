# U9 Marking Lesson 02 - Image Generation Prompts
## Following IMAGE-PROMPT-GUIDELINES.md Standards

---

## Image 1: Pass and Follow
**Filename:** `session-pass-and-follow-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/marking/session-pass-and-follow-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show a 20x20 meter square marked with orange cones at corners. Display groups of 3 players: one orange player (attacker) with football (soccer ball) passing to coach positioned at edge of square, two blue players (defenders) without football (soccer balls) communicating about marking assignment. Use solid arrow to show pass from attacker to coach. Use dashed arrow to show attacker's movement following their pass. Use curved arrow to show return pass from coach back to attacker. Add speech bubbles between the two blue defenders showing communication ("I've got them!" "You cover!"). Show defenders adjusting positions as attacker moves. Include small legend explaining pass sequence and communication. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 2: Switching Marks
**Filename:** `session-switching-marks-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/marking/session-switching-marks-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show five 12x12 meter grids arranged in a row. Each grid has small goals at opposite ends. Focus detail on center grid showing 2v2: 2 orange players labeled A and B (one with football (soccer ball), one without) vs 2 blue players labeled 1 and 2 (both without football (soccer balls)). Show initial marking with dotted lines (blue 1 to orange A, blue 2 to orange B). Add large "SWITCH!" text annotation in center. Show curved arrows indicating blue defenders swapping assignments. Draw new dotted lines showing switched assignments (blue 1 to orange B, blue 2 to orange A). Use different line styles (solid vs dashed) to distinguish before and after switch. Add small inset showing the switch sequence in 3 steps. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 3: Marking in Transition
**Filename:** `session-marking-in-transition-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/marking/session-marking-in-transition-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show three 20x15 meter areas side by side. Each area has small goals at both ends. Focus detail on center area showing transition moment: orange team just lost football (soccer ball) to blue team. Blue player in center now has football (soccer ball). Show 3 orange players (now defending, without ball) with dotted arrows indicating rapid movement to find and mark blue players. Add large "3 SECONDS!" timer annotation with clock icon. Draw emphasis circles around organized marking positions showing orange players getting goal-side of blue players. Include small annotation box showing "+1 bonus pt for quick organization". Use motion lines to show urgency of movement. Add small scoreboard showing bonus point system. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 4: Marking Responsibility Game
**Filename:** `session-marking-responsibility-game-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/marking/session-marking-responsibility-game-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show 30x20 meter pitch with small goals at each end. Display 4v4 game: 4 orange players vs 4 blue players. All players have visible numbers on bibs (orange: 1-4, blue: 5-8). One orange player (number 2) has football (soccer ball) in midfield. Draw dotted lines connecting current marking pairs based on assignments. Add speech bubble from coach position at sideline showing "Blue 5 mark Orange 2! Blue 6 mark Orange 3!". Show blue defenders working to deny their assigned orange players. Add emphasis circle around one tight marking pair. Include scoreboard annotation showing "-1 pt if assigned player receives pass, -3 pts if assigned player scores, +2 pts for goal". Show defenders positioned between their assigned players and the ball. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Generation Checklist

For each image, verify:

- [x] Opens with "Create a football (soccer) coaching pitch diagram from top-down view"
- [x] Dimensions in meters (20x20, 12x12, 20x15, 30x20)
- [x] Player count and positions specified
- [x] Bib colors: orange (attackers), blue (defenders)
- [x] Ball possession clearly stated for each player
- [x] "football (soccer ball)" terminology used consistently
- [x] Movement arrows described with types (solid, dashed, dotted, curved)
- [x] Special indicators included (speech bubbles, timers, emphasis, labels, numbers)
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
   - Speech bubbles and text annotations legible
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
  'session-pass-and-follow-u9',
  'session-switching-marks-u9',
  'session-marking-in-transition-u9',
  'session-marking-responsibility-game-u9'
);
```

---

## Notes

- **Image 1 (Pass and Follow):** Shows communication between defenders with speech bubbles
- **Image 2 (Switching Marks):** Illustrates before/after switch with clear labeling (A, B, 1, 2)
- **Image 3 (Marking in Transition):** Emphasizes 3-second rule with timer and urgency
- **Image 4 (Marking Responsibility Game):** Shows coach calling assignments with special scoring rules

All prompts follow the mandatory 6-section structure from IMAGE-PROMPT-GUIDELINES.md.
