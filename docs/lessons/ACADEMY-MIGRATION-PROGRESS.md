# Academy Lesson Migration Progress

## Task
Generate SQL migrations for all Bailey Academy lessons.

## Key Files
- `bailey-lessons-raw.md` — Raw Bailey content (UTF-16 encoded, read with `Get-Content -Encoding Unicode`)
- `bailey-image-mapping.json` — Image-to-session mapping for all 47 slides
- `BAILEY-HEADER-TO-SCRAPE-MAPPING.md` — Header names (authoritative) vs scrape names
- `LESSON-CREATION-GUIDE.md` — Definitive framework
- `supabase/migrations/028_academy-shielding-lesson-01.sql` — Slide 1 (Shielding)
- `supabase/migrations/029_academy-lessons-batch.sql` — Slides 2-40 (batch)

## Migration Stats
- **028**: 1 lesson, 4 sessions (Shielding)
- **029**: 37 lessons, 148 sessions (all remaining slides with scraped content)
- **Total**: 38 lessons, 152 sessions

## Completed Slides

| Scrape # | Header # | Lesson Title | Status |
|----------|----------|-------------|--------|
| 1 | 1 | Shielding | ✅ (028) |
| 2 | 2 | 2 v 2s / Games | ✅ (029) |
| 3 | 3 | 1 v 1 – Defending | ✅ (029) |
| 4 | 4 | Pass & Control / Games | ✅ (029, 4th session generated) |
| 5 | 5 | 1 v 1 – 50/50 Contest | ✅ (029) |
| 6 | 6 | Pass & Control | ✅ (029) |
| 7 | 7 | Shooting Technique – Laces | ✅ (029) |
| 8 | 8 | Pass & Control (variant) | ✅ (029, 4th session generated) |
| 9 | 9 | 2 v 1 / 3 v 2 – Defending | ✅ (029) |
| 10 | 10 | Pass & Control | ⏭️ SKIPPED (duplicate of slide 6) |
| 11 | 12 | 1 v 1 – Turns | ✅ (029) |
| 12 | 15 | Passing & Receiving | ✅ (029) |
| 13 | 18 | 1 v 1 – Dribbling | ✅ (029) |
| 14 | 19 | Kicking Techniques (U11/U12) | ✅ (029, age_group=U11) |
| 15 | 21 | Rondo & Possession | ✅ (029) |
| 16 | 22 | 1 v 1 – Attacking | ✅ (029) |
| 17 | 23 | Passing (Punch Pass) | ✅ (029) |
| 18 | 24 | 1 v 1 Defending (Central) | ✅ (029) |
| 19 | 25 | Shooting (Power) | ✅ (029) |
| 20 | 26 | Rondo & Games | ✅ (029, 4th session generated) |
| 21 | 27 | 1 v 1 Attacking (Wide) | ✅ (029) |
| 22 | 28 | Passing & Receiving (Movement) | ✅ (029) |
| 23 | 29 | 1 v 1 Defending (Recovery) | ✅ (029) |
| 24 | 30 | Shooting (1 v 1 Finishing) | ✅ (029) |
| 25 | 31 | Rondo (Support Play) | ✅ (029) |
| 26 | 32 | 1 v 1 Attacking (Finishing) | ✅ (029) |
| 27 | 33 | Passing (Speed of Play) | ✅ (029) |
| 28 | — | 1 v 1 Defending (Pressing) | ✅ (029) |
| 29 | — | Shooting (Combination Play) | ✅ (029) |
| 30 | — | Rondo (Decision Making) | ✅ (029) |
| 31 | — | 1 v 1 Finishing | ✅ (029) |
| 32 | — | Pass & Control (Lofted) | ✅ (029) |
| 33 | — | Pass & Control – Building Up | ✅ (029) |
| 34 | 34 | 1 v 1 Attacking (U9 & U10) | ✅ (029) |
| 35 | 35 | Ways to Break the Line | ✅ (029) |
| 36 | 36 | Ways to Break the Line | ⏭️ SKIPPED (duplicate of 35) |
| 37 | 37 | Crossing & Finishing | ✅ (029) |
| 38 | 38 | 1 v 1 Defending (Expanded) | ✅ (029) |
| 39 | 39 | Defending Transition (U9/U10) | ✅ (029) |
| 40 | 40 | Pass & Control – Defending Process (U11/U12) | ✅ (029, age_group=U11) |

## Missing Slides (NO scraped content — need Bailey to re-scrape)

| Header # | Lesson Title | Programme |
|----------|-------------|-----------|
| 11 | Ways to Break the Line | Junior Academy |
| 13 | 1 v 1 – Shielding | U9 & U10 |
| 14 | 1 v 1 – Shielding | U11 & U12 |
| 16 | 1 v 1 – Beating the Defender | U9 & U10 |
| 17 | Pass & Control – Building Up | Junior Academy |
| 20 | Pass & Control – Receiving Under Pressure | Junior Academy |
| 41 | 1 v 1 – 50/50 Contest | Junior Academy |
| 42 | 1 v 1 Finishing | Junior Academy |
| 43 | Shooting Technique | Junior Academy |
| 44 | Attacking Transition | Junior Academy |
| 45 | Shielding | Junior Summer Academy |
| 46 | 1 v 1 Competitiveness | Youth Summer Academy |
| 47 | Defending 1 v 1 + Underload | Youth Summer Academy |

## Duplicates Skipped
- Slide 10: identical to slide 6 (Pass & Control)
- Slide 36: identical to slide 35 (Ways to Break the Line)
- Scrape slides 41-54 in raw file: age-specific variants and repeats (U11/U12, Summer Academy, Junior Academy duplicates)

## Lessons with Generated 4th Session
- Slide 4: Pass & Control / Games (Bailey had 3 sessions)
- Slide 8: Pass & Control variant (Bailey had 3 sessions)
- Slide 20: Rondo & Games (Bailey had 3 sessions)

## Next Steps
1. ✅ SQL migrations complete for all 38 lessons with scraped content
2. Ask Bailey to re-scrape the 13 missing slides
3. Build image rename/copy script using `bailey-image-mapping.json` + session names
4. Upload images to Supabase Storage
5. Run UPDATE queries to set `diagram_url` for each session
6. Bailey to review skill_category assignments (currently using best-guess categories)
