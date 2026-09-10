# Character generation review

Generated with built-in image_gen from the two prompts in each variant's PROMPT.md and the shared README.md contract. Nine variants, eighteen selected PNGs. Existing male-001 assets and prompt files were preserved.

| Variant | Movement | Seated / talking | Source prompts |
| --- | --- | --- | --- |
| female-001 | [move.png](female-001/move.png) | [sit-talk.png](female-001/sit-talk.png) | [PROMPT.md](female-001/PROMPT.md) |
| female-002 | [move.png](female-002/move.png) | [sit-talk.png](female-002/sit-talk.png) | [PROMPT.md](female-002/PROMPT.md) |
| female-003 | [move.png](female-003/move.png) | [sit-talk.png](female-003/sit-talk.png) | [PROMPT.md](female-003/PROMPT.md) |
| female-004 | [move.png](female-004/move.png) | [sit-talk.png](female-004/sit-talk.png) | [PROMPT.md](female-004/PROMPT.md) |
| female-005 | [move.png](female-005/move.png) | [sit-talk.png](female-005/sit-talk.png) | [PROMPT.md](female-005/PROMPT.md) |
| male-002 | [move.png](male-002/move.png) | [sit-talk.png](male-002/sit-talk.png) | [PROMPT.md](male-002/PROMPT.md) |
| male-003 | [move.png](male-003/move.png) | [sit-talk.png](male-003/sit-talk.png) | [PROMPT.md](male-003/PROMPT.md) |
| male-004 | [move.png](male-004/move.png) | [sit-talk.png](male-004/sit-talk.png) | [PROMPT.md](male-004/PROMPT.md) |
| male-005 | [move.png](male-005/move.png) | [sit-talk.png](male-005/sit-talk.png) | [PROMPT.md](male-005/PROMPT.md) |

## Verified file properties

All eighteen selected files are 8-bit RGBA PNGs with actual transparent pixels (alpha minimum 0, maximum 255). Transparent pixel coverage is 65–73%. All sheets were visually inspected for a twelve-sprite, four-column, three-row layout. Direction corrections were generated for male-002 movement and female-004, female-005, male-002 seated/talking; unwanted facial hair was corrected on male-005 seated/talking.

Eight files are exactly 1448 × 1086. The following ten are 1447 × 1087 and need dimension normalization before slicing into exact 362 × 362 cells:

- female-001/move.png
- female-001/sit-talk.png
- female-002/move.png
- female-003/move.png
- female-003/sit-talk.png
- female-005/move.png
- male-002/move.png
- male-002/sit-talk.png
- male-003/move.png
- male-004/sit-talk.png

## Remaining visual review

These are generated assets for review, not certified production-ready animation. Several movement sheets have near-duplicate opposing strides and imperfect passing poses. Frame anchors, apparent scale, and the walk loop still require animation cleanup. Identity and linework can vary between movement and seated/talking sheets, particularly female-002 hair texture and male-005 rendering style. male-003 seated frames contain a laptop. Review these deviations before game integration.

## Prompt handling

The original PROMPT.md text was used for every variant. Generation instructions reinforced screen-relative row directions, equal cells, full-body padding, and actual alpha transparency. Seated/talking generation initially used movement images as references; reference-based outputs with baked checkerboard backgrounds were rejected in favor of new generation using the same written character specification. Final corrections reinforced left/right screen directions and clean-shaven male-005 identity. No CLI/API fallback or pixel-processing edits were used.

