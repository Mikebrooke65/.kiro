# U9 Ball Striking Lesson 02 - Image Generation Prompts
## Following IMAGE-PROMPT-GUIDELINES.md Standards

---

## Image 1: First Time Striking
**Filename:** `session-first-time-striking-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/ball-striking/session-first-time-striking-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show a 20x20 meter square marked with cones at corners. Display groups of 3 orange players forming triangles (8-10 meters apart). Player 1 with football (soccer ball) passing to Player 2 (without ball), who strikes first-time to Player 3 (without ball). Draw solid arrows showing pass sequence: Player 1 to Player 2, then Player 2 first-time strike to Player 3. Add curved arrows showing rotation pattern. Add large annotation "NO CONTROL - STRIKE FIRST TIME" with emphasis on Player 2. Include small inset showing body position for first-time strike: player behind ball, balanced stance, striking through ball. Show multiple triangle groups practicing across the square. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 2: Power and Placement
**Filename:** `session-power-and-placement-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/ball-striking/session-power-and-placement-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show five shooting stations arranged in a row. Each station has small goal 10 meters away with targets. Focus detail on center station showing two-stage sequence: 1) Orange player with football (soccer ball) performing power shot with laces (high follow-through shown with curved arrow), 2) Same orange player performing placement shot with side-foot (low follow-through shown with curved arrow). Draw arrows showing different shot trajectories: power shot higher arc, placement shot lower arc to corner. Add small legend showing "POWER = LACES" with laces icon and "PLACEMENT = SIDE-FOOT" with side-foot icon. Mark target zones on goals: high zone for power, low corner zones for placement. Show multiple stations with players practicing both techniques. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 3: Shooting from Angles
**Filename:** `session-shooting-from-angles-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/ball-striking/session-shooting-from-angles-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show three shooting areas side by side. Each area has small goal. Display three different shooting positions: 1) 0 degrees (straight on) with orange player and football (soccer ball) directly in front of goal, 2) 45 degrees (angle) with orange player and football (soccer ball) at angle to goal, 3) 90 degrees (side) with orange player and football (soccer ball) at side of goal. Draw dotted lines showing shooting angles to far post from each position. Add solid arrows showing shot paths to far post. Add large annotation "ANGLES → FAR POST" with emphasis. Include small inset showing body position for angled shots: body open to goal, striking across ball. Mark near post with red X and far post with green checkmark for angled positions. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 4: Volleys and Half-Volleys
**Filename:** `session-volleys-and-half-volleys-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/ball-striking/session-volleys-and-half-volleys-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show 30x20 meter pitch with small goals at each end. Display 4v4 game: 4 orange players vs 4 blue players. Show two scenarios with emphasis: 1) Orange player striking volley (football (soccer ball) shown in air above player) with motion lines, 2) Another orange player striking half-volley (football (soccer ball) shown just after bounce with small bounce arc). Draw solid arrows showing ball flight and strikes toward goal. Add large scoreboard showing "3 PTS VOLLEY, 2 PTS HALF-VOLLEY, 1 PT REGULAR". Show coach or player at sideline with football (soccer ball) serving ball into play with curved arrow. Display multiple players spread across pitch in realistic game positions. Include small inset showing difference between volley (ball in air) and half-volley (ball just after bounce). Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Generation Checklist

For each image, verify:

- [x] Opens with "Create a football (soccer) coaching pitch diagram from top-down view"
- [x] Dimensions in meters (20x20, 8-10m spacing, 10m distance, 30x20)
- [x] Player count and positions specified
- [x] Bib colors: orange (attackers), blue (defenders)
- [x] Ball possession clearly stated for each player
- [x] "football (soccer ball)" terminology used consistently
- [x] Movement arrows described with types (solid, dashed, dotted, curved)
- [x] Special indicators included (insets, annotations, scoreboards, sequences)
- [x] Technical specifications closing paragraph included

---

## Database Update SQL

After uploading images to Supabase Storage, run this SQL to update the session records:

```sql
-- Replace {project-id} with your actual Supabase project ID
UPDATE sessions 
SET diagram_url = 'https://{project-id}.supabase.co/storage/v1/object/public/lesson-media/media/pitch-diagrams/u9/ball-striking/' || session_name || '.png'
WHERE session_name IN (
  'session-first-time-striking-u9',
  'session-power-and-placement-u9',
  'session-shooting-from-angles-u9',
  'session-volleys-and-half-volleys-u9'
);
```

---

## Notes

- **Image 1 (First Time Striking):** Triangle passing with first-time strike emphasis and body position inset
- **Image 2 (Power and Placement):** Two-stage sequence showing both techniques with trajectory differences
- **Image 3 (Shooting from Angles):** Three angle positions with far post targeting emphasis
- **Image 4 (Volleys and Half-Volleys):** Game scenario with point system and technique comparison inset

All prompts follow the mandatory 6-section structure from IMAGE-PROMPT-GUIDELINES.md.
