# Elevation Lab — SPEC-21 (math in inputs, crown line under soffits, plan dimension lanes)

Steps 106–108. The earlier SPEC files still apply; this file is the source of truth for what follows. SPEC-20 must be done first.

A round of fixes from Kyle's pass over SPEC-20.

## After this SPEC you can

- Type math into any inch box: `30 1/2 + 3/4`, `(36 - 1 1/2) / 2`, `2 * 15 3/8`, `8'6"`. The box shows the result when you commit.
- Drop a wall's top-of-crown line below a soffit, and the cabinets under that soffit follow the crown line instead of the soffit. They get crown, not the soffit's molding.
- See the right inherited **Box top** placeholder on an upper or tall that's under a soffit.
- Read plan depth dimensions for runs that share the same stretch of wall: bases at the run's centre, uppers to the left of centre, talls to the right.
- See a depth number that doesn't fit stay at the middle of its dimension line, popped out sideways with a short leader, the way elevation dimensions do.
- See the wall length as the outermost plan dimension, with the wing-wall breakdown row between it and the wall.

## Not in this SPEC

- More than one top-of-crown line per wall, with each run choosing which line it grows to. Logged in `TODO.md`. §2's `governingSoffit` is written so that feature only changes which crown top goes into the comparison.
- Dragging a plan depth dimension to a different spot, or a per-run lane override. The type lanes come first. An override comes later if they aren't enough.
- Math in the few non-inch inputs (the face section count, the wall number). They stay integer boxes.
- The back-side landing row in plan. It stays where it is.

---

## §1 Math in inch inputs (`model/units.js`)

`parseInches(str)` becomes an expression evaluator. Every inch box in the elevation UI already goes through `InchInput` → `parseInches`, and so does typed live entry (`useLiveEntry`), so this is the whole feature. There's no new dependency. mathjs is ~170 kB for four operators, and its lexer doesn't know `30 1/2` or `8'6"`.

**Grammar**, with whitespace skipped between tokens:

```
expr   := term (('+' | '-') term)*
term   := factor (('*' | '/') factor)*
factor := ('+' | '-') factor | measure | '(' expr ')'
measure:= number ( '"' | "'" [compound] )?
```

**Numbers** are tried in this order at the current position (sticky regexes):

1. **Mixed**: `/(\d+)\s+(\d+)\s*\/\s*(\d+)/y`. That's `30 1/2`. The whole number and the fraction are separated by whitespace only. If the numerator is `>=` the denominator, or the denominator is 0, the whole parse is invalid (`null`). Today's `2 2/2` rule stays.
2. **Decimal**: `/\d+(?:\.\d*)?|\.\d+/y`.

A plain fraction like `3/4` is just division.

**Units** can follow a number, with optional whitespace before the mark:

- `"` is consumed and changes nothing.
- `'` means feet, so the value is × 12. Then it tries a **compound inch part**: skip whitespace, then a number (mixed or decimal) with an optional `"`. If it lexes, its value is added and the measure ends. If it doesn't, or the number is followed by `'`, the position is restored and the measure is just the feet.

**A hyphen is always minus.** `30-1/2` and `30 - 1/2` are both 29 1/2, and `8'-6` is 90. That matches ff-job-schedule. Write a mixed number with a space (`30 1/2`) and feet-and-inches without a hyphen (`8'6"`, `8' 6"`). **This changes today's parse:** `30-1/2` used to be 30 1/2. The existing round-trip case in `units.test.js` changes to match (§5).

**Result.** Any leftover token, unknown character, unbalanced bracket or non-finite result gives `null`. That covers `1/0`. Otherwise the result is `normalizeResult(value)`, the existing 1e-12 rounding. `parseInches` still takes a string and returns `number | null`, so `InchInput` and `useLiveEntry` don't change.

## §2 Top of crown below a soffit (`model/profile.js`, `model/soffits.js`)

```js
// profile.js
boxTopOf(profile) → profile.boxTop ?? profile.crownTop − moldingStack(profile)

// soffits.js
governingSoffit(wall, run, profile) → soffit | null
```

- **`boxTopOf`** is exported from `profile.js` and `model/index.js`. `resolveVertical` uses it (`const boxTop = boxTopOf(q)`) with no change in behaviour.
- **`governingSoffit`**: `soffit = soffitOverRun(wallViewForRun(wall, run), run)`. If it's `null`, return `null`. The profile's crown top is `boxTopOf(profile) + moldingStack(profile)`. Return `soffit` when `soffit.bottom <= crownTop + 1e-6`, otherwise `null`. A tie goes to the soffit, so its molding choice applies when the crown line sits exactly at the soffit bottom. Only the lowest overlapping soffit is checked. If the crown line is below the lowest one, it's below all of them.
- **`profileUnderSoffit(profile, wall, run)`** uses `governingSoffit(wall, run, profile)` in place of `soffitOverRun`. The rest is unchanged.
- **`runMolding(wall, run, profile)`**: with a profile it's `governingSoffit(wall, run, profile)?.molding ?? 'crown'`. Without one it keeps today's `soffitOverRun` behaviour, so SPEC-19 and SPEC-20 tests don't change.
- **`soffitConflicts`, `soffitEndType` and `soffitOverRun`** are unchanged. A run under a low crown line tops out below the soffit, so it has no conflict.

Later, with several crown lines, a run's chosen line supplies `crownTop`, and `governingSoffit` compares against that. Nothing else moves.

**UI (same step, two lines):**

- `PropertiesPanel` `RunProperties`: `inheritedValues.boxTop = boxTopOf(profileUnderSoffit(profile, wall, run))`. That's the Box top placeholder, which ignored soffits before.
- `RunGroup`: `runMolding(wall, run, profile)`. `profile` is already resolved a few lines above.

## §3 Plan depth dimensions (`plan/depthDimension.js`, new, pure)

```js
export const DEPTH_LANE_SHIFT = 28;      // px along the wall per lane
export const DEPTH_POPOUT_LEADER = 10;   // px
export const DEPTH_LANES = { [BASE]: 0, [UPPER]: -1, [TALL]: 1 };   // anything else: 0
depthDimension(run, depth, scale, fontSize = PLAN_DIM_FONT_SIZE)
  → { x, fits, label: { x, offset }, leader: { x1, x2, offset } | null }
```

All `x` values are elevation `x` on the run's side, and `offset` is the distance out from that face. The component converts them with `elevationToPlan(frame, x, offset)`.

- `lane = DEPTH_LANES[run.cabinetTypeId] ?? 0`, and `side = lane < 0 ? -1 : 1`.
- `margin = Math.min(run.width / 2, 6 / scale)`.
- `x = clamp(run.x + run.width / 2 + lane × DEPTH_LANE_SHIFT / scale, run.x + margin, run.x + run.width − margin)`.
- `textPx = formatInches(depth).length × 0.6 × fontSize + 8`, and `fits = depth × scale >= textPx + 4`. These are SPEC-20's numbers.
- **Fits:** `label = { x, offset: depth / 2 }` and `leader = null`. The label is drawn as it is today, beside the line.
- **Doesn't fit:** the label stays at the middle of the line and pops out sideways toward `side`:
  - `leader = { x1: x, x2: x + side × DEPTH_POPOUT_LEADER / scale, offset: depth / 2 }`;
  - `label = { x: x + side × (DEPTH_POPOUT_LEADER + 2 + fontSize / 2) / scale, offset: depth / 2 }`.

So uppers pop left, and bases and talls pop right. A base's label lands between its line and a tall's lane.

`PlanRunFootprint` draws the depth line and its ticks at `dim.x`. It draws the leader (`#64748b`, `0.75 / scale`) when `dim.leader` is set, and the text at `dim.label` with `offsetY = fits ? fontSize + 2 / scale : fontSize / 2`. The rotation is unchanged. SPEC-20's "set out past the front" placement and its leader are removed.

## §4 Plan wall dimension rows (`plan/PlanWallShape.jsx`)

The wall length is always the outermost row on the exterior side.

```js
const hasFrontLandings = landingsOn(room, wallSideView(wall, 'front')).length > 0;
const innerRowOffset = wall.thickness + 22 / scale;
const dimensionOffset = innerRowOffset + (hasFrontLandings ? 20 / scale : 0);  // wall length
const extensionEndOffset = dimensionOffset + 4 / scale;
const numberOffset = dimensionOffset + 24 / scale;
// landing rows: front at innerRowOffset; back at innerRowOffset + 20 / scale (unchanged)
```

With no wing walls on the front, nothing moves. With them, the breakdown row takes the 22 px slot, the wall length moves out to 42 px, and the wall-number bubble stays 24 px past it.

---

## §5 Tests

Numbering continues from SPEC-20 (last was 179). Expect 469 passing before step 106.

### Step 106 (`units.test.js`, a new `describe('SPEC-21 inch math')` at the end)

- **180.** A single `it` looping over the cases, with `expect(parseInches(input), input).toBe(expected)`:

  | input | expected |
  |---|---:|
  | `30 1/2 + 3/4` | 31.25 |
  | `30-1/2` | 29.5 |
  | `55 - 4.5 / 2` | 52.75 |
  | `(55 - 4.5)/2` | 25.25 |
  | `30 - 1/2` | 29.5 |
  | `12-3` | 9 |
  | `(36 - 1 1/2) / 2` | 17.25 |
  | `2 * 15 3/8` | 30.75 |
  | `-1/2` | -0.5 |
  | `-(2 1/2 + 1)` | -3.5 |
  | `24" + 3/4"` | 24.75 |
  | `8'` | 96 |
  | `8'6"` | 102 |
  | `8' 6 1/2` | 102.5 |
  | `8'-6` | 90 |
  | `8' - 6` | 90 |
  | `.5 + 1.25` | 1.75 |

- **181.** A single `it`: each of `''`, `'abc'`, `'1/0'`, `'2 2/2'`, `'3 feet'`, `'30 +'`, `'(30'`, `'30)'`, `'2(3)'`, `'1..5'`, `"8''"`, `'5 5'` gives `null`.

**One existing case changes.** In the `round-trips %s` table, `['30-1/2', 30.5, '30 1/2"']` becomes `['30-1/2', 29.5, '29 1/2"']`. Every other existing case, `2 2/2` included, must still pass unchanged. Expect 471 passing.

### Step 107 (`soffits.test.js`, a new `describe('SPEC-21 crown line under soffits')` at the end)

The helpers are the file's own (`upper`, `makeWall`, `makeRoom`, `SF`, `wallById`, `runById`). Add `resolveProfile` and `boxTopOf` from `'../profile.js'`, and `governingSoffit` to the `'../soffits.js'` import.

```js
const lowCrown = (crownTop) => syncRoom(makeRoom([makeWall('S', 0, 0, 144, 0, {
  profile: { crownTop },
  soffits: [SF({ molding: 'none' })],
  runs: [upper('U1', { x: 40, width: 60 })],
})]), DEFAULT_SETTINGS);
```

- **182.** For each crown top, `room = lowCrown(crownTop)`, `wall = wallById(room, 'S')`, `run = runById(room, 'U1')` and `profile = resolveProfile(DEFAULT_SETTINGS, room, wall)`:
  - `80`: `{ z, height }` is `{ z: 54, height: 20 }`, `runMolding(wall, run, profile)` is `'crown'`, and `roomDiagnostics(room, DEFAULT_SETTINGS).U1` has no `soffit-conflict`;
  - `84`: `{ z: 54, height: 30 }`, and `runMolding(...)` is `'none'`;
  - `96`: `{ z: 54, height: 30 }`, and `runMolding(...)` is `'none'`.
- **183.**
  - `boxTopOf({ crownTop: 96, crownStackHeight: 6 })` is `90`;
  - `boxTopOf({ crownTop: 96, crownStackHeight: 6, boxTop: 70 })` is `70`;
  - with `room = lowCrown(96)`, `wall = wallById(room, 'S')` and `run = runById(room, 'U1')`:
    - `governingSoffit(wall, run, { ...DEFAULT_SETTINGS.defaultProfile, crownTop: 84 })?.id` is `'SF'`;
    - `governingSoffit(wall, run, { ...DEFAULT_SETTINGS.defaultProfile, boxTop: 70 })` is `null`, because its crown top is 76;
    - `governingSoffit(wall, { ...run, x: 0, width: 30 }, DEFAULT_SETTINGS.defaultProfile)` is `null`, because nothing overlaps.

Expect 473 passing.

### Step 108 (new `src/elevation/plan/__tests__/depthDimension.test.js`)

- **184.** With `const run = (cabinetTypeId, x, width) => ({ cabinetTypeId, x, width });`:

```js
expect(depthDimension(run(CABINET_TYPE_IDS.BASE, 20, 60), 24.875, 4)).toEqual({
  x: 50, fits: true, label: { x: 50, offset: 12.4375 }, leader: null,
});
expect(depthDimension(run(CABINET_TYPE_IDS.UPPER, 100, 60), 12.875, 2)).toEqual({
  x: 116, fits: false, label: { x: 106.75, offset: 6.4375 }, leader: { x1: 116, x2: 111, offset: 6.4375 },
});
expect(depthDimension(run(CABINET_TYPE_IDS.TALL, 0, 24), 24.875, 1)).toEqual({
  x: 18, fits: false, label: { x: 36.5, offset: 12.4375 }, leader: { x1: 18, x2: 28, offset: 12.4375 },
});
```

The tall is clamped: its centre plus 28 is 40, but the right margin allows 18.

Expect 474 passing. The rest of step 108 is UI, checked by hand.
