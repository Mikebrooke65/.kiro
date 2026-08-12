# U9 Passing/Receiving Lesson 02 - Image Generation Prompts
## Following IMAGE-PROMPT-GUIDELINES.md Standards

---

## Image 1: Passing Patterns
**Filename:** `session-passing-patterns-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/passing-receiving/session-passing-patterns-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show a 20x20 meter square marked with cones. Center area divided into three sections showing three different passing patterns side by side: 1) Square pattern with 4 orange players at corners (one with football (soccer ball)), solid arrows showing pass direction and curved arrows showing follow movement, 2) Diamond pattern with 4 orange players in diamond formation (one with football (soccer ball)), dotted arrows showing diagonal passes to opposite corners, 3) Triangle pattern with 3 orange players in triangle (one with football (soccer ball)), arrows showing pass and rotate movement. Add large annotation "3 PATTERNS: SQUARE, DIAMOND, TRIANGLE". Emphasize movement after pass with curved arrows and "PASS AND FOLLOW" labels. Show numbered sequence (1, 2, 3, 4) for each pattern. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 2: Receiving on the Move
**Filename:** `session-receiving-on-the-move-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/passing-receiving/session-receiving-on-the-move-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show five 12x12 meter grids arranged in a row. Focus on center grid showing three-stage sequence: 1) Orange receiver (without ball) checking away from orange passer (with football (soccer ball)) shown with dotted arrow and "CHECK AWAY" label, 2) Same receiver checking back to ball shown with solid arrow and "CHECK TO" label, 3) Receiver controlling football (soccer ball) with open body position (sideways on, shown with icon) and first touch forward shown with arrow. Draw movement pattern clearly: away, to, control forward. Add large annotation "CHECK AWAY → CHECK TO → OPEN BODY". Include small inset showing open body position detail: sideways on stance, can see both passer and field, first touch forward into space. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 3: Combination Passing
**Filename:** `session-combination-passing-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/passing-receiving/session-combination-passing-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show three 18x12 meter areas side by side. Each area has small goal at one end. Focus on center area showing 3v2: 3 orange players (one with football (soccer ball), two without) vs 2 blue players (both without ball). Display two combination examples with emphasis: 1) One-two combination shown with numbered arrows (1: pass, 2: move into space with curved arrow, 3: receive back, 4: shoot), 2) Overlap run shown with player running around ball carrier with curved arrow and "OVERLAP" label. Add large annotation "2 PTS COMBINATION GOAL, 1 PT REGULAR". Display scoreboard showing point system. Emphasize creative movement and passing with motion lines. Include small inset showing one-two timing: pass, sprint, receive. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 4: Possession Game
**Filename:** `session-possession-game-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/passing-receiving/session-possession-game-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show 30x20 meter pitch with four small goals (two at each end, positioned on left and right sides). Display 4v4 game: 4 orange players vs 4 blue players. Orange player with football (soccer ball) in center. Draw dotted lines showing multiple passing options to orange teammates. Draw curved arrows showing potential switches of play to open goals on opposite side. Add large annotation "SCORE IN EITHER GOAL + BONUS FOR 5+ PASSES". Display pass counter showing "1... 2... 3... 4... 5... BONUS!". Show both goals at one end clearly to emphasize multiple scoring options. Multiple players spread across pitch with curved arrows indicating support angles and switching play. Emphasize width and switching with shaded zones. Include small legend showing scoring system. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
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
- [x] Special indicators included (patterns, sequences, combinations, multiple goals)
- [x] Technical specifications closing paragraph included

---

## Database Update SQL

After uploading images to Supabase Storage, run this SQL to update the session records:

```sql
-- Replace {project-id} with your actual Supabase project ID
UPDATE sessions 
SET diagram_url = 'https://{project-id}.supabase.co/storage/v1/object/public/lesson-media/media/pitch-diagrams/u9/passing-receiving/' || session_name || '.png'
WHERE session_name IN (
  'session-passing-patterns-u9',
  'session-receiving-on-the-move-u9',
  'session-combination-passing-u9',
  'session-possession-game-u9'
);
```

---

## Notes

- **Image 1 (Passing Patterns):** Three patterns side by side showing square, diamond, and triangle formations
- **Image 2 (Receiving on the Move):** Check away/check to sequence with open body position emphasis
- **Image 3 (Combination Passing):** One-two and overlap combinations with point system
- **Image 4 (Possession Game):** Four goals (two per end) emphasizing switching play and possession bonus

All prompts follow the mandatory 6-section structure from IMAGE-PROMPT-GUIDELINES.md.
