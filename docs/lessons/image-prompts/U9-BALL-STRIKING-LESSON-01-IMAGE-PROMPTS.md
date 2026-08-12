# U9 Ball Striking Lesson 01 - Image Generation Prompts
## Following IMAGE-PROMPT-GUIDELINES.md Standards

---

## Image 1: Striking Technique
**Filename:** `session-striking-technique-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/ball-striking/session-striking-technique-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show a 20x20 meter square marked with cones at corners. Small goals or markers at opposite ends. Display pairs of orange players positioned 10 meters apart. One orange player with football (soccer ball) striking to partner (orange player without ball). Arrows show ball path between partners. Include large inset diagram showing striking technique in three stages: 1) plant foot beside ball with checkmark, 2) strike with laces/ankle locked with checkmark, 3) follow through toward target with checkmark. Add annotation "TECHNIQUE OVER POWER". Show multiple pairs practicing across the square. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 2: Shooting Accuracy
**Filename:** `session-shooting-accuracy-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/ball-striking/session-shooting-accuracy-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show five shooting stations arranged in a row. Each station has small goal (3 meters wide) with target markers in both corners. Orange player positioned 8 meters from goal with football (soccer ball). Draw dotted lines showing aiming lines from player to both corners. Draw arrows showing shot paths to corners. Add large annotation "2 PTS CORNERS, 1 PT CENTER" with scoreboard. Include small inset showing side-foot technique for accuracy: inside of foot, follow through to target. Emphasize corner targets with shaded zones. Show multiple stations with players at different stages. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 3: Shooting Under Pressure
**Filename:** `session-shooting-under-pressure-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/ball-striking/session-shooting-under-pressure-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show three 15x12 meter areas side by side. Focus detail on center area showing 2v1: 2 orange players (one with football (soccer ball), one without) vs 1 blue player (defender without ball). Orange player with ball in shooting position preparing quick shot. Draw solid arrow showing quick shot toward goal at end of area. Blue defender attempting to block with arms raised. Add large annotation "SHOOT EARLY" with emphasis. Include scoreboard showing "2 pts goal, 1 pt on target, 1 pt block". Show urgency with motion lines around shooting action. Display other areas with similar setups. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 4: Shooting Game
**Filename:** `session-shooting-game-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/ball-striking/session-shooting-game-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show 30x20 meter pitch with small goals at each end. Mark shooting zones with dotted lines 8 meters from each goal. Display 4v4 game: 4 orange players vs 4 blue players. One orange player with football (soccer ball) positioned outside shooting zone preparing to shoot from distance. Draw solid arrow showing shot from distance toward goal. Add large annotation "2 PTS OUTSIDE ZONE, 1 PT INSIDE ZONE" with emphasis on shooting zones. Shade the zones outside 8-meter line to highlight bonus area. Show multiple players spread across pitch in realistic game positions. Include small legend showing zone boundaries and point values. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Generation Checklist

For each image, verify:

- [x] Opens with "Create a football (soccer) coaching pitch diagram from top-down view"
- [x] Dimensions in meters (20x20, 3m goals, 15x12, 30x20)
- [x] Player count and positions specified
- [x] Bib colors: orange (attackers), blue (defenders)
- [x] Ball possession clearly stated for each player
- [x] "football (soccer ball)" terminology used consistently
- [x] Movement arrows described with types (solid, dashed, dotted)
- [x] Special indicators included (insets, annotations, scoreboards, zones)
- [x] Technical specifications closing paragraph included

---

## Database Update SQL

After uploading images to Supabase Storage, run this SQL to update the session records:

```sql
-- Replace {project-id} with your actual Supabase project ID
UPDATE sessions 
SET diagram_url = 'https://{project-id}.supabase.co/storage/v1/object/public/lesson-media/media/pitch-diagrams/u9/ball-striking/' || session_name || '.png'
WHERE session_name IN (
  'session-striking-technique-u9',
  'session-shooting-accuracy-u9',
  'session-shooting-under-pressure-u9',
  'session-shooting-game-u9'
);
```

---

## Notes

- **Image 1 (Striking Technique):** Three-stage inset showing proper technique progression
- **Image 2 (Shooting Accuracy):** Corner targets with point system, side-foot technique inset
- **Image 3 (Shooting Under Pressure):** 2v1 scenario emphasizing quick decision-making
- **Image 4 (Shooting Game):** Zone-based scoring to encourage distance shooting

All prompts follow the mandatory 6-section structure from IMAGE-PROMPT-GUIDELINES.md.
