# Round 50 — SPEC: profile lines on doors in the room canvas and the elevation DXF; fit checks

Steps 455–458, on branch `elevation-doors` (designer, after step 454, **1157 tests**) and `feature/drawing` (geometry, after step 421, **69 tests**). The API doesn't change (it passes the payload through). No Supabase (plan P18).
**Round 49 (DXF import) is moved to later** (Kyle, 2026-10-09). Profiles are drawn by hand in the editor for now.

**Done when:**
- A door style's picked profiles draw on every door, drawer front and 5-piece panel that uses the style, in the **room canvas** and in the **elevation DXF**. Each point picked in the profile's **Drawn → elevation** list becomes a rectangle at that point's x offset from the slot's edge (plan P4).
- Outside-edge lines draw on slabs too, including short fronts that the short-face rule turns into slabs. Slab-applied molding lines sit on the molding inset.
- **Fit checks** warn (amber dashed outline on the canvas, a message in face properties): a pick that is missing or the wrong kind; a profile that cuts deeper than the door is thick; edge + inside/applied profiles wider than a stile, rail or mid rail/stile; profiles too big for the panel/molding opening. The door style tool's section also says when a profile cuts too deep.
- Nothing changes for rooms with no picks: every existing test and the golden payload snapshot stay the same.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **455** | designer | Model: `doorProfileOffsets`, `partProfileLines` | 1157 → **1160** |
| **456** | geometry | `profileLines` on a door detail, drawn on DOOR_DETAILS | 69 → **71** |
| **457** | designer | `runDoorDetails` adds `lines` + fit warnings; payload sends `profileLines` | 1160 → **1162** |
| **458** | designer | UI: canvas draws the lines; warning messages; too-deep note in the section | 1162 |

**456 must be in before you export a DXF with 457 in.** Geometry rejects unknown payload keys, so an older geometry refuses `profileLines`.

Codex writes the code (PROMPT-CONVENTIONS rule 10). No throwaway build was made for this SPEC. Every expected value was worked out by hand from the rules below, `DEFAULT_DOOR_STYLE` (13/16" thick, 3" stiles and rails, short-face 2 1/8" / 1 5/8" / 4 13/16"), `DOOR_DESIGNS`, `fixtures/sectionProfiles.json` and the golden G1 numbers already pinned in `runDoorDetails.test.js` (G1's 24" base door at x 30.0625, z 4.125, 23.875 × 30.125; its opening 33.0625, 7.125, 17.875 × 24.125; the right leaf of the 36" pair at x 72.0625, same z and height, 17.875 wide). If a test fails, fix the code, not the number, unless the number contradicts a rule here; then stop and say what you got.

---

## §1 Decisions (2026-10-09)

**Offsets.** A picked profile's **elevation drawn points** (`profile.drawnPoints.elevation`, point ids) each give an offset `d` = that point's x. Each `d` becomes one rectangle: the slot's reference rectangle **inset by `d`** on all four sides (negative `d` = outset). Arched rails are round 51; every rectangle is square-cornered for now.

| Slot | Reference rectangle | Which `d` draw | Why |
|---|---|---|---|
| `outside` | the part's outline | `d > 0` | x < 0 is outside the door (P20); x = 0 is the outline itself |
| `inside` | each frame opening | `d ≠ 0` | x < 0 is on the stile, x > 0 on the panel; x = 0 is the opening line, already drawn |
| `panel` | each frame opening | `d > 0` | x < 0 is the tongue, hidden behind the stile |
| `applied` (5-piece) | each frame opening | `d ≠ 0` | laps both the stile and the panel |
| `applied` (slab-applied) | each molding rectangle | `d ≠ 0` | the molding's 0, 0 is the inset line (P17) |

- "≠ 0" and "> 0" use EPS = 1e-6. Offsets are rounded to 6 places, de-duplicated and sorted ascending.
- The frame openings / molding rectangles (`openings`) still draw as today. On slab-applied the inset line stays even with a profile picked (it's the molding's 0, 0 line).
- A rectangle is **dropped** if its width or height is ≤ EPS, or if it pokes outside the part's outline (beyond EPS). Identical rectangles (same four numbers) are drawn once.
- **Which slots draw on a part** follows its detail's construction (`partDetail`): `five_piece` → outside, then per opening inside, panel, applied; `slab_applied` → outside, then per opening applied; `slab` (slab design, sheet panel, or a short front under the cutoff) → outside only.
- Only slots in `design.slots` with a string pick are read, the same as `doorSection` (SPEC-48.4). Archived picks draw. A pick that is missing or not the slot's kind draws nothing and warns `door-profile-missing`.
- A profile with **no drawn points adds no lines** (plan open question 3: the default stays "none"). Kyle picks them on the editor's **Drawn** panel.

**Open line = cut, closed = applied (P21), read here for the first time — in the depth check.** A profile with **any open loop** cuts the door; if its lowest point (`sectionProfileBounds(profile).minY`) is below −thickness − EPS it warns `door-profile-too-deep` for that slot. Closed shapes (applied pieces) are never too deep. This check is per style, so every part using the style gets it.

**Reach.** For each placed slot: `reachIn = max(0, bounds.maxX)` (how far it goes toward the door's middle from its line), `reachOut = max(0, −bounds.minX)` (how far it goes the other way), both rounded to 6 places. Bounds include arc extremes (`sectionProfileBounds`).

**Fit checks per part** (`five_piece` and `slab_applied` only — a slab part gets none):
- `edgeIn` = outside's `reachIn` (0 if no outside pick); `frameOut` = the larger of inside's and applied's `reachOut` (0 if neither).
- For each side in the order **left, right, top, bottom**, with the part's **final** size (stile/rail after overrides and the short-face rule; on slab-applied that's the molding inset): `edgeIn + frameOut > size + EPS` → `{ code: 'door-profile-too-wide', side }`.
- Mid rails and mid stiles (final widths): if `frameOut > 0` and any has `2 × frameOut > width + EPS` → one `{ code: 'door-profile-too-wide', side: 'mid' }`.
- `inward` = the largest `reachIn` of inside, panel and applied: if `inward > 0` and any opening has `2 × inward > min(width, height) + EPS` → one `{ code: 'door-profile-panel-too-small' }`.
- The panel profile's `reachOut` (its tongue) is never checked against the stile: it's hidden in the groove, and the groove is still the fixed shop standard.

**Payload.** A door detail gets `profileLines: [{ x, z, width, height }]` beside `openings`, sent only when the room draws details and there are lines. A slab part with an outside profile sends `profileLines` alone. Geometry draws them on **DOOR_DETAILS**, the same way and with the same hidden-line rules as openings.

**Canvas.** Profile lines draw under the same *Door details* switch, thinner and darker than the opening lines (`#64748b`, 0.75 px) so the frame opening still reads first.

**Not in round 50:** arched rails (51), crown/top mold/base/nosing profiles (50.1), plan-view profile shapes (`drawnPoints.plan`), the raised panel / groove shape from the panel profile in the section, the DXF detail block (52.1), DXF import (later).

---

## §2 Step 455 — designer model: `doorProfileOffsets`, `partProfileLines`

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/model/doorProfileLines.js` | — | the two functions |
| NEW `src/elevation/model/__tests__/doorProfileLines.test.js` | — | 3 tests, verbatim |

**Contract.** Reuse `DOOR_PROFILE_SLOTS` (`./doorStyles.js`), `doorProfileSlotKind` and `sectionProfileBounds` (`./sectionProfiles.js`). A local `round6` (`Number(v.toFixed(6))`, `-0` → `0`), the same as `doorSection.js`; every number returned goes through it (no `-0` anywhere). `const EPS = 1e-6`.

`export function doorProfileOffsets(style, design, profiles = [])` → `{ slots, warnings }`. Doc: *SPEC-50 a door style's picked profiles as elevation offsets, with their reach and the style-level warnings.*
- `{ slots: {}, warnings: [] }` when `design` is falsy.
- For each `slot` of `DOOR_PROFILE_SLOTS`, **in that order**, where `design.slots.includes(slot)` and `typeof style?.profiles?.[slot] === 'string'`:
  - Find the profile by id. Missing, or `profile.kind !== doorProfileSlotKind(slot)` → push `{ code: 'door-profile-missing', slot }` and go to the next slot.
  - `b = sectionProfileBounds(profile)`.
  - `lines`: for each id in `profile.drawnPoints?.elevation ?? []` with a point in `profile.geometry.points`, `x = round6(point[0])`; keep `x > EPS` for `outside`/`panel`, `Math.abs(x) > EPS` for `inside`/`applied`; unique; sorted ascending.
  - `slots[slot] = { profileId, name: profile.name, lines, reachIn: round6(Math.max(0, b.maxX)), reachOut: round6(Math.max(0, -b.minX)) }` (insert in slot order).
  - If `Number.isFinite(style.thickness)` and some loop has `closed === false` and `b.minY < -style.thickness - EPS` → push `{ code: 'door-profile-too-deep', slot }`.

`export function partProfileLines(offsets, detail, rect)` → `{ lines, warnings }`. `detail` is `partDetail(...)`'s result; `rect` is the part's `{ x, z, width, height }`. Doc: *SPEC-50 one part's profile lines (rectangles in wall coordinates) and its fit warnings.*
- `inset(r, d)` = `{ x: r.x + d, z: r.z + d, width: r.width − 2d, height: r.height − 2d }`, each round6.
- Add a rectangle only if width > EPS, height > EPS, it lies inside `rect` (each edge within EPS), and no identical rectangle is already in `lines`.
- Order: `offsets.slots.outside?.lines` on `rect`; then, if `detail.construction === 'five_piece'`, for each of `detail.openings` in order: inside's lines, panel's, applied's; if `'slab_applied'`, for each opening: applied's lines. Any other construction: outside only and `warnings: []`.
- Warnings (five_piece / slab_applied): exactly §1 *Fit checks per part*, using `detail.sizes.stiles.left/right`, `detail.sizes.rails.top/bottom`, `detail.sizes.midRails[].width`, `detail.sizes.midStiles[].width` and `detail.openings`. Order: the side warnings (left, right, top, bottom), then `mid`, then `door-profile-panel-too-small`.

**NEW `src/elevation/model/__tests__/doorProfileLines.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../doorStyles.js';
import { partDetail } from '../doorDetails.js';
import { doorProfileOffsets, partProfileLines } from '../doorProfileLines.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [, BEAD, CROWN] = sample.profiles;
const [FIVE, SLAB, SLAB_AM] = DOOR_DESIGNS;
const line = (from, to) => ({ type: 'line', from, to });
const box = (x, z, width, height) => ({ x, z, width, height });
const profile = (id, name, kind, points, segs, closed, elevation) => ({
  id, name, kind, version: 1, archived: false, drawnPoints: { elevation },
  geometry: { units: 'in', points, loops: [{ id: 'L1', closed, segs }] },
});
const ROUND = profile('sp-round', 'Round 1/4', 'door_outside',
  { a: [0.25, 0], b: [0, -0.25], c: [0, -0.8125] },
  [{ type: 'arc', from: 'a', to: 'b', center: [0.25, -0.25], ccw: true }, line('b', 'c')], false, ['a']);
const STEP = profile('sp-step', 'Step', 'door_inside',
  { p: [-0.25, 0], q: [-0.25, -0.125], r: [0, -0.125] }, [line('p', 'q'), line('q', 'r')], false, ['p', 'q', 'r']);
const RAISED = profile('sp-raised', 'Raised 2', 'door_panel',
  { m: [-0.375, -0.5625], n: [0.125, -0.3125], o: [1.5, -0.0625], q: [2, -0.0625] },
  [line('m', 'n'), line('n', 'o'), line('o', 'q')], false, ['o', 'm', 'n']);
const AM = profile('sp-am', 'Applied 1', 'applied_molding',
  { u: [-0.25, 0], v: [0.75, 0], w: [0.75, 0.375], k: [-0.25, 0.375] },
  [line('u', 'v'), line('v', 'w'), line('w', 'k'), line('k', 'u')], true, ['v', 'u']);
const LIBRARY = [ROUND, STEP, RAISED, AM, BEAD, CROWN];
const style = (profiles, patch = {}) => ({
  ...DEFAULT_DOOR_STYLE, ...patch, profiles: { outside: null, inside: null, panel: null, applied: null, ...profiles },
});
const ALL = style({ outside: 'sp-round', inside: 'sp-step', panel: 'sp-raised', applied: 'sp-bead' });
const ROUND_SLOT = { profileId: 'sp-round', name: 'Round 1/4', lines: [0.25], reachIn: 0.25, reachOut: 0 };

describe('SPEC-50 door profile offsets', () => {
  it('reads each pick\'s drawn points as offsets with its reach, and warns on bad picks and cuts past the back', () => {
    expect(doorProfileOffsets(ALL, FIVE, LIBRARY)).toEqual({
      slots: {
        outside: ROUND_SLOT,
        inside: { profileId: 'sp-step', name: 'Step', lines: [-0.25], reachIn: 0, reachOut: 0.25 },
        panel: { profileId: 'sp-raised', name: 'Raised 2', lines: [0.125, 1.5], reachIn: 2, reachOut: 0.375 },
        applied: { profileId: 'sp-bead', name: 'Half bead', lines: [0.5], reachIn: 0.5, reachOut: 0 },
      },
      warnings: [],
    });
    expect(doorProfileOffsets({ ...ALL, thickness: 0.75 }, FIVE, LIBRARY).warnings)
      .toEqual([{ code: 'door-profile-too-deep', slot: 'outside' }]);
    const broken = doorProfileOffsets(
      style({ outside: 'sp-round', inside: 'sp-crown', panel: 'gone', applied: 'sp-bead' }), FIVE, LIBRARY,
    );
    expect([Object.keys(broken.slots), broken.warnings]).toEqual([['outside', 'applied'], [
      { code: 'door-profile-missing', slot: 'inside' },
      { code: 'door-profile-missing', slot: 'panel' },
    ]]);
    expect(doorProfileOffsets(ALL, SLAB, LIBRARY)).toEqual({ slots: { outside: ROUND_SLOT }, warnings: [] });
    expect([doorProfileOffsets(DEFAULT_DOOR_STYLE, FIVE, LIBRARY), doorProfileOffsets(ALL, null, LIBRARY)])
      .toEqual([{ slots: {}, warnings: [] }, { slots: {}, warnings: [] }]);
  });

  it('draws each offset as a rectangle from its edge, drops what doesn\'t fit, and checks the frame and the panel', () => {
    const offsets = doorProfileOffsets(ALL, FIVE, LIBRARY);
    const lines = (rect, sizes) => partProfileLines(offsets, partDetail(ALL, FIVE, rect, sizes), rect);
    expect(lines(box(0, 0, 15, 30))).toEqual({
      lines: [
        box(0.25, 0.25, 14.5, 29.5),
        box(2.75, 2.75, 9.5, 24.5),
        box(3.125, 3.125, 8.75, 23.75),
        box(4.5, 4.5, 6, 21),
        box(3.5, 3.5, 8, 23),
      ],
      warnings: [],
    });
    expect(lines(box(0, 0, 19.375, 5.875))).toEqual({
      lines: [
        box(0.25, 0.25, 18.875, 5.375),
        box(2.75, 1.625, 13.875, 2.625),
        box(3.125, 2, 13.125, 1.875),
        box(3.5, 2.375, 12.375, 1.125),
      ],
      warnings: [{ code: 'door-profile-panel-too-small' }],
    });
    expect(lines(box(0, 0, 15, 30), { stiles: { left: 0.375 }, midRails: [{ at: 15, width: 0.375 }] }).warnings).toEqual([
      { code: 'door-profile-too-wide', side: 'left' },
      { code: 'door-profile-too-wide', side: 'mid' },
    ]);
  });

  it('puts slab-applied molding lines on the inset, and gives a slab or a short front only its edge lines', () => {
    const C = style({ outside: 'sp-round', inside: 'sp-step', applied: 'sp-am' }, { designId: 'slab-applied' });
    const offsets = doorProfileOffsets(C, SLAB_AM, LIBRARY);
    expect([Object.keys(offsets.slots), offsets.slots.applied.lines, offsets.warnings])
      .toEqual([['outside', 'applied'], [-0.25, 0.75], []]);
    const rect = box(0, 0, 15, 30);
    expect(partProfileLines(offsets, partDetail(C, SLAB_AM, rect), rect)).toEqual({
      lines: [box(0.25, 0.25, 14.5, 29.5), box(2.75, 2.75, 9.5, 24.5), box(3.75, 3.75, 7.5, 22.5)],
      warnings: [],
    });
    const narrow = { stiles: { left: 0.375, right: 0.375 } };
    expect(partProfileLines(offsets, partDetail(C, SLAB_AM, rect, narrow), rect).warnings).toEqual([
      { code: 'door-profile-too-wide', side: 'left' },
      { code: 'door-profile-too-wide', side: 'right' },
    ]);
    const short = box(0, 0, 15, 4.75);
    expect(partProfileLines(offsets, partDetail(C, SLAB_AM, short), short))
      .toEqual({ lines: [box(0.25, 0.25, 14.5, 4.25)], warnings: [] });
    const plain = doorProfileOffsets(ALL, FIVE, LIBRARY);
    expect(partProfileLines(plain, partDetail(ALL, SLAB, rect), rect).lines).toEqual([box(0.25, 0.25, 14.5, 29.5)]);
  });
});
```

How the numbers come out:
- **Round-over** (outside, open): drawn `a` → 0.25. Points span x 0 to 0.25; its arc from 90° to 180° (ccw) passes no axis extreme strictly inside, so reachIn 0.25, reachOut 0. Lowest point −13/16 = the door's thickness, so not too deep at 13/16"; at 3/4" it is.
- **Step** (inside, open): drawn `p`, `q` both x −0.25 → one offset; `r` is x 0 → dropped. Points x −0.25 to 0 → reachIn 0, reachOut 0.25.
- **Raised 2** (panel, open): drawn `o` 1.5, `m` −0.375 (dropped, panel keeps x > 0), `n` 0.125 → [0.125, 1.5]. x −0.375 to 2 → reachIn 2, reachOut 0.375. Lowest −9/16, not too deep.
- **Half bead** (applied, closed): `s` 0 dropped, `t` 0.5. x 0 to 0.5. Closed → no depth check.
- **Applied 1** (applied, closed): `v` 0.75, `u` −0.25 → [−0.25, 0.75]; reachIn 0.75, reachOut 0.25.
- Bad picks: Crown on inside is the wrong kind, `'gone'` is missing → both warn, in slot order; neither is in `slots`. Slab: only `outside` is in its slots.
- **15 × 30 five-piece**: opening (3, 3, 9 × 24). Outside 0.25 → (0.25, 0.25, 14.5 × 29.5). Inside −0.25 → outset (2.75, 2.75, 9.5 × 24.5). Panel 0.125 → (3.125, 3.125, 8.75 × 23.75); 1.5 → (4.5, 4.5, 6 × 21). Applied 0.5 → (3.5, 3.5, 8 × 23). Frame: 0.25 + max(0.25, 0) = 0.5 ≤ 3. Inward 2 → 4 ≤ 9.
- **19 3/8 × 5 7/8 drawer**: short-face rails (5.875 − 2.125) / 2 = 1.875, opening (3, 1.875, 13.375 × 2.125). Panel 1.5 → height 2.125 − 3 < 0 → dropped. 2 × 2 = 4 > 2.125 → panel too small. Rails 1.875 ≥ 0.5.
- **Left stile 3/8 with a 3/8 mid rail**: 0.5 > 0.375 on the left; 2 × 0.25 = 0.5 > 0.375 on the mid rail. Openings are 11.625 × 11.8125, so the panel fits.
- **Slab AM 15 × 30**: molding rectangle (3, 3, 9 × 24). Inside isn't one of its slots, so it's ignored, not missing. Applied −0.25 → (2.75, 2.75, 9.5 × 24.5), 0.75 → (3.75, 3.75, 7.5 × 22.5). With a 3/8" inset left and right: 0.25 + 0.25 = 0.5 > 0.375 on both. 4 3/4" tall is under the 4 13/16" cutoff → slab → edge line only, no checks.

**Don't touch:** every existing file. **Count:** 1157 + 3 = **1160**.

---

## §3 Step 456 — geometry: `profileLines`

Repo `cabinetry_designer_geometry`, branch `feature/drawing`.

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/drawing/models.py` | 203 | `PayloadDoorDetail.profileLines` |
| `src/drawing/elevation_dxf.py` | 214 | draw them with the openings |
| `tests/test_door_details.py` | 126 | append 2 tests, verbatim |
| `README.md` | — | one line where `doorDetails` is described |

**Contract.**
- `PayloadDoorDetail` (models.py ~97–106): add `profileLines: list[PayloadHole] = []` after `openings`. Docstring: *A part's frame openings (5-piece) or molding rectangles (Slab AM) (SPEC-46.4) and its profile lines (SPEC-50), drawn at its part's depth on DOOR_DETAILS; its style tag on DOOR_TAGS (none = no tag).*
- `elevation_dxf.py` (`detail_shapes`, ~162–173): `lines=_opening_lines([*detail.openings, *detail.profileLines])`, and the filter becomes `if detail.openings or detail.profileLines`. Update `_opening_lines`' docstring: *The four sides of each door opening or profile line rectangle, in wall coordinates (SPEC-46.4, SPEC-50).* Nothing else changes.
- README: wherever `doorDetails` is listed, add that a detail may also carry `profileLines` (rectangles from door profiles, SPEC-50), drawn on DOOR_DETAILS like openings.

**Append to `tests/test_door_details.py`**, verbatim:

```python
# G1's base door with a 1/4" round-over (outside, 1/4" in) and a 1/4" step on the stile (inside, 1/4" out) (SPEC-50).
PROFILE_LINES = [_box(30.3125, 4.375, 23.375, 29.625), _box(32.8125, 6.875, 18.375, 24.625)]


def test_profile_lines_draw_on_door_details_beside_the_openings():
    msp = _msp(_payload([DOOR], [{"partId": "door", "openings": [DOOR_OPENING], "profileLines": PROFILE_LINES}]))
    details = _lines(msp, "DOOR_DETAILS")
    assert len(details) == 12
    assert _length(details) == pytest.approx(276)
    assert len(_lines(msp, "FACES")) == 4


def test_a_part_can_send_profile_lines_alone_and_they_must_have_size():
    msp = _msp(_payload([DOOR], [{"partId": "door", "profileLines": PROFILE_LINES[:1]}]))
    details = _lines(msp, "DOOR_DETAILS")
    assert len(details) == 4
    assert _length(details) == pytest.approx(106)
    with pytest.raises(ValidationError):
        draw(_payload([DOOR], [{"partId": "door", "profileLines": [_box(30, 4, 0, 29)]}]))
```

Numbers: the opening is 2 × (17.875 + 24.125) = 84, the round-over line 2 × (23.375 + 29.625) = 106, the step line 2 × (18.375 + 24.625) = 86 → 276. None of the rectangles touch, so 12 lines. If the hidden-line pass splits a line and the count differs while the length is right, report it instead of changing the test.

**Don't touch:** the HLR, the writer, layers, tags, every other test. **Count:** 69 + 2 = **71**.

---

## §4 Step 457 — designer: lines and fit warnings on each part; `profileLines` in the payload

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/doorDetails.js` | 120 | `runDoorDetails`: `lines` on each part, profile warnings |
| `src/elevation/model/elevationDoorDetails.js` | 33 | send `profileLines` |
| `src/elevation/model/__tests__/runDoorDetails.test.js` | 125 | add `lines: []` to 2 expectations; append 1 test, verbatim |
| `src/elevation/model/__tests__/elevationDoorDetails.test.js` | 102 | append 1 test, verbatim |

**Contract.**
- `doorDetails.js`: import `{ doorProfileOffsets, partProfileLines }` from `./doorProfileLines.js`. In `runDoorDetails`, before `addPart`: `const profiles = settings?.sectionProfiles ?? [];` and `const offsetsByStyle = new Map();` (keyed by the style object). In `addPart`, after `const detail = …`:
  - `offsets` = the cached `doorProfileOffsets(style, design, profiles)` for this style (compute and store on first use).
  - `const fit = partProfileLines(offsets, detail, rect);`
  - The pushed part gets `lines: fit.lines` right after `openings`.
  - Warnings, in this order, each spread with `pieceId, key` like the resolver's: `resolved.warnings`, then `offsets.warnings`, then `fit.warnings`.
  - `partDetail` and the rest of the file don't change. Update `runDoorDetails`' doc to *Every face-on part's door detail, profile lines and warnings, in drawing order (SPEC-46.2, SPEC-50).*
- `elevationDoorDetails.js`: after the `entry.openings` block, `if (details && part.lines.length) entry.profileLines = part.lines.map(({ x, z, width, height }) => ({ x, z, width, height }));`. The push condition becomes `entry.openings || entry.profileLines || tags`. Doc: add *and profile lines (SPEC-50)* after "openings".
- `runDoorDetails.test.js`: in the first test's `toEqual({…})` for `${CAB_24}:r`, add `lines: [],` after `openings: [box(33.0625, 7.125, 17.875, 24.125)],`. In the back-panel test's `toEqual([{…}])`, add `lines: [],` after `openings: [box(3.75, 39, 64.5, 35.25)],`. Nothing else in the existing tests changes.

**Append to `src/elevation/model/__tests__/runDoorDetails.test.js`**, verbatim (everything it uses is already imported or defined at the top of the file):

```js
describe('SPEC-50 profile lines and profile warnings for a run', () => {
  const line = (from, to) => ({ type: 'line', from, to });
  const ROUND = {
    id: 'sp-round', name: 'Round 1/4', kind: 'door_outside', version: 1, archived: false, drawnPoints: { elevation: ['a'] },
    geometry: {
      units: 'in',
      points: { a: [0.25, 0], b: [0, -0.25], c: [0, -0.8125] },
      loops: [{ id: 'L1', closed: false, segs: [{ type: 'arc', from: 'a', to: 'b', center: [0.25, -0.25], ccw: true }, line('b', 'c')] }],
    },
  };
  const STEP = {
    id: 'sp-step', name: 'Step', kind: 'door_inside', version: 1, archived: false, drawnPoints: { elevation: ['p'] },
    geometry: {
      units: 'in',
      points: { p: [-0.25, 0], q: [-0.25, -0.125], r: [0, -0.125] },
      loops: [{ id: 'L1', closed: false, segs: [line('p', 'q'), line('q', 'r')] }],
    },
  };
  const withProfiles = { ...settings, sectionProfiles: [ROUND, STEP] };

  /** G1's base run with every face in P, P's picks set to `picks`. */
  function profiled(picks) {
    const room = structuredClone(stored('G1 Euro kitchen'));
    room.doorStyles = [{ ...P, profiles: { ...P.profiles, ...picks } }];
    room.doorStyleId = 'ds-p';
    const synced = syncRoom(room, withProfiles);
    const wall = synced.walls.find((candidate) => candidate.runs.some((run) => run.id === G1_BASE));
    const view = resolveWall(synced, wall, 'front');
    return runDoorDetails(synced, view, view.runs.find((run) => run.id === G1_BASE), withProfiles);
  }

  it('gives each door its profile lines, and flags every part when a pick is missing', () => {
    const result = profiled({ outside: 'sp-round', inside: 'sp-step' });
    expect(part(result, `${CAB_24}:r`).lines)
      .toEqual([box(30.3125, 4.375, 23.375, 29.625), box(32.8125, 6.875, 18.375, 24.625)]);
    expect(part(result, `${CAB_36}:r:right`).lines)
      .toEqual([box(72.3125, 4.375, 17.375, 29.625), box(74.8125, 6.875, 12.375, 24.625)]);
    expect(result.warnings).toEqual([]);
    const missing = profiled({ panel: 'gone' });
    expect(missing.parts.every(({ lines }) => lines.length === 0)).toBe(true);
    expect([missing.warnings.length, missing.warnings[0]]).toEqual([
      7, { code: 'door-profile-missing', slot: 'panel', pieceId: CAB_24, key: `${CAB_24}:r` },
    ]);
  });
});
```

**Append to `src/elevation/model/__tests__/elevationDoorDetails.test.js`**, verbatim:

```js
describe('SPEC-50 profile lines in the payload', () => {
  const line = (from, to) => ({ type: 'line', from, to });
  const ROUND = {
    id: 'sp-round', name: 'Round 1/4', kind: 'door_outside', version: 1, archived: false, drawnPoints: { elevation: ['a'] },
    geometry: {
      units: 'in',
      points: { a: [0.25, 0], b: [0, -0.25], c: [0, -0.8125] },
      loops: [{ id: 'L1', closed: false, segs: [{ type: 'arc', from: 'a', to: 'b', center: [0.25, -0.25], ccw: true }, line('b', 'c')] }],
    },
  };
  const STEP = {
    id: 'sp-step', name: 'Step', kind: 'door_inside', version: 1, archived: false, drawnPoints: { elevation: ['p'] },
    geometry: {
      units: 'in',
      points: { p: [-0.25, 0], q: [-0.25, -0.125], r: [0, -0.125] },
      loops: [{ id: 'L1', closed: false, segs: [line('p', 'q'), line('q', 'r')] }],
    },
  };
  const withProfiles = { ...settings, sectionProfiles: [ROUND, STEP] };
  const P = { ...DEFAULT_DOOR_STYLE, id: 'ds-p', label: 'P', profiles: { outside: 'sp-round', inside: 'sp-step', panel: null, applied: null } };
  const S = { ...SL, profiles: { ...SL.profiles, outside: 'sp-round' } };

  /** G1 A with P on the room and the 36" pair in S (slab), `patch` on the room. */
  function build(patch) {
    const copy = { ...structuredClone(stored('G1 Euro kitchen')), ...patch, doorStyles: [P, S], doorStyleId: 'ds-p' };
    const base = copy.walls.flatMap((wall) => wall.runs).find((run) => run.id === BASE);
    gridLeaves(base.grid).find((node) => node.id === CAB_36).face = { type: 'pair_door', size: null, styleId: 'ds-s' };
    const synced = syncRoom(copy, withProfiles);
    return elevationDoorDetails(synced, wallWith(synced, BASE), 'front', withProfiles);
  }

  it('sends profile lines beside the openings, a slab part\'s lines alone, and nothing when details are off', () => {
    const result = build({});
    expect(result.find(({ partId }) => partId === `${CAB_24}:r`)).toEqual({
      partId: `${CAB_24}:r`,
      openings: [box(33.0625, 7.125, 17.875, 24.125)],
      profileLines: [box(30.3125, 4.375, 23.375, 29.625), box(32.8125, 6.875, 18.375, 24.625)],
    });
    expect(result.find(({ partId }) => partId === `${CAB_36}:rright`))
      .toEqual({ partId: `${CAB_36}:rright`, profileLines: [box(72.3125, 4.375, 17.375, 29.625)] });
    expect(build({ doorDetails: false })).toEqual([]);
  });
});
```

Numbers: the 24" door (30.0625, 4.125, 23.875 × 30.125) inset 1/4 → (30.3125, 4.375, 23.375 × 29.625); its opening (33.0625, 7.125, 17.875 × 24.125) outset 1/4 → (32.8125, 6.875, 18.375 × 24.625). The pair's right leaf (72.0625, 4.125, 17.875 × 30.125) inset 1/4 → (72.3125, 4.375, 17.375 × 29.625); its opening (75.0625, 7.125, 11.875 × 24.125) outset 1/4 → (74.8125, 6.875, 12.375 × 24.625). In S (slab) the leaf has no opening, so it sends only the edge line. The round-over is exactly 13/16" deep, the same as the door: no warning. With the `'gone'` panel pick, each of the 7 base-run faces gets one `door-profile-missing`.

**Don't touch:** `partDetail`, `doorSizes.js`, the resolver, `drawingPayload.js`, the golden fixture and snapshot (they have no picks, so they don't change). **Count:** 1160 + 2 = **1162**.

---

## §5 Step 458 — UI: draw the lines; warning messages; too-deep note

UI only, no new tests.

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/components/DoorDetails.jsx` | 49 | draw `part.lines` |
| `src/elevation/components/properties/FaceProperties.jsx` | 378 | 4 messages |
| `src/elevation/components/DoorSectionView.jsx` | 109 | too-deep note |

**Contract.**
- `DoorDetails.jsx`: inside the fragment, right after the `showDetails && part.openings.map(…)` block, add `showDetails && part.lines.map(…)` the same way (`wallRectToScreen`, skip when the screen rect is under 2 px either way), with `key={`line-${index}`}`, `stroke="#64748b"`, `strokeWidth={0.75}`, `fillEnabled={false}`, `listening={false}`. Profile warnings already carry the part's `key`, so the amber outline needs no change.
- `FaceProperties.jsx` `WARNING_MESSAGES`: add
  - `'door-profile-missing'`: *A profile picked in this face's door style is missing or the wrong kind — it isn't drawn.*
  - `'door-profile-too-deep'`: *A profile in this face's door style cuts deeper than the door is thick.*
  - `'door-profile-too-wide'`: *The door style's edge and inside/applied profiles are wider than a stile or rail on this face.*
  - `'door-profile-panel-too-small'`: *The panel (or molding) opening is too small for the door style's profiles.*
- `DoorSectionView.jsx`: import `doorProfileOffsets` from `../model/doorProfileLines.js`. Next to the `section` line: `const deep = doorProfileOffsets(style, design, profiles).warnings.filter(({ code }) => code === 'door-profile-too-deep').map(({ slot }) => SLOT_LABELS[slot]);`. After the skipped note, when `deep.length`: `<p className="text-xs text-amber-300">Cuts deeper than the door is thick: {deep.join(', ')}.</p>`.

**Don't touch:** the model, `RunGroup.jsx`, the store, the DXF.

Gate: `npm test && npm run lint && npm run build`; 1162 tests.

---

## End-to-end check (Kyle, after 458)

1. **Make two profiles** (Library → Profiles):
   - *Round 1/4*, kind **Door outside edge**: an **open** line from (1/4, 0) arcing to (0, −1/4) and down to (0, −13/16). On **Drawn**, tick the point at (1/4, 0).
   - *Step*, kind **Door inside profile**: an **open** line (−1/4, 0) → (−1/4, −1/8) → (0, −1/8). On **Drawn**, tick (−1/4, 0).
2. **Pick them** in Library → Team door style (outside and inside). The section shows the rounded corner and the rabbet.
3. **Room canvas** (Door details on): every 5-piece door gets a thin line 1/4" inside its edge and one 1/4" outside its frame opening (on the stile). Short drawer fronts follow their shrunk rails. Fronts under 4 13/16" (slabs) get only the edge line.
4. **Slab AM style**: pick an applied molding drawn closed with a drawn point on each side of 0: lines on both sides of the inset line.
5. **Fit checks**: set the thickness to 3/4" → the section says the round-over cuts too deep and the doors get amber outlines; the face properties say why. Put 3/8" on a door's left stile (Stiles & rails override) → *wider than a stile or rail*. Pick a raised panel with drawn points 2" in on a short drawer → *panel too small*. Change a picked profile's kind in its Details → *missing or the wrong kind* (an archived pick still draws).
6. **Export the elevation DXF** (geometry 456 must be running): the profile lines are on DOOR_DETAILS with the openings, hidden behind nearer parts like the openings are.

**Known for now:**
- A profile with no drawn points adds nothing. Tick points on the editor's **Drawn** panel.
- Arched rails, crown/base/nosing profiles and profile shapes in plan view are later rounds (51, 50.1).
- The raised panel and groove in the section are still the fixed shop standard; the fit check doesn't look at the tongue.

---

## Plan updates to make at the next plan edit

- §10: 48.2, 48.3, 48.4 ✅ (48.4's own plan updates still apply). **49 (DXF import) moves to "later"** (Kyle 2026-10-09: not needed yet). Row **50** → ✅ when done, steps 455–458.
- §3.5 *Fit checks* → as built in SPEC-50 §1 (missing pick, too deep for open loops, too wide per side and mid, panel/molding opening too small).
- §3.6: the per-slot offset table from SPEC-50 §1 (outside `> 0`; inside and applied both ways; panel `> 0`; slab-applied keeps the inset line).
- Open question 3 answered for now: no drawn points = no lines.
