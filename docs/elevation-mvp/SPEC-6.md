# Elevation Lab — Spec 6: Non-90° corners, filler distribution, run overhang

Extends SPEC.md … SPEC-5.md (steps 1–19 are built). Source of truth for steps 20–22.
Codex cannot run the app (it's behind a login): rely on unit tests, `npm run build` and `npm run lint`. If something is ambiguous, pick the simplest option, leave a `// SPEC-QUESTION:` comment, and mention it in your summary.
No storage migration. New run fields are optional and default when missing.

## 1. Corner clearance at any angle (`model/corners.js`)
At an inside corner with interior angle θ between walls A and B:
- **Face term** (today's rule): `faceReserve = frontDepth(neighborRun) / sin θ`. It clears the cabinet faces where they meet the wall.
- **Back term** (new): when θ < 90°, this run's own **box** reaches the neighbor's front plane before its face does. The requirement at depth y is `x(y) = faceReserve + y · cot θ`, so the binding value is at `y = run.depth`:
  `backReserve = run.depth × cot θ` when θ < 90°, otherwise 0.
- **`cornerReserve(...)` returns `faceReserve + backReserve`**, taking the max over the compatible anchored neighbor runs as it does today.

Reference values with `frontDepth(neighbor) = 24.875` and `run.depth = 24` (within 1e-3):

| θ | face | back | total |
|---|---|---|---|
| 60° | 28.7232 | 13.8564 | 42.5796 |
| 75° | 25.7525 | 6.4308 | 32.1833 |
| 90° | 24.875 | 0 | 24.875 |
| 135° | 35.1786 | 0 | 35.1786 |

### 1.1 Per-run override
New optional run field: `cornerClearance: { left, right }`, each `'auto' | 'face' | number`, default `'auto'`.
- `'auto'` → face + back, as above.
- `'face'` → face term only (the designer accepts the boxes touching at the back, e.g. when the neighbor's cabinet is shallower there).
- a number → use exactly that reserve in inches, ignoring both terms.
- The override applies only to that side of that run, and only where the reserve applies (an anchored side at an inside corner).

### 1.2 Corner filler minimum scales with angle
`cornerFillerMin(settings, θ) = settings.cornerFillerMinWidth / sin θ`, clamped to at most `4 × settings.cornerFillerMinWidth`.
1 1/2" at 90° → 1.7321 at 60°, 2.1213 at 135°, 3 at 150°. `endMinWidthsForRun` uses it for an anchored inside-corner side, and `settings.fillerMinWidth` everywhere else.

### 1.3 Angled corner metadata
When a flex filler sits on an anchored inside-corner side whose θ ≠ 90 (±0.5°), its piece from `splitRun` carries `cornerAngle: θ`, so a later step (DXF, estimate) knows it's cut at an angle. Nothing else uses it yet.

## 2. Flex filler distribution (`model/splitRun.js`)
Today every flex filler gets the same minimum and the leftover is split evenly, so both ends always come out equal. With per-side minimums they need to differ.
- `opts.endMinWidths = {left, right}` already exists. Treat them as **per-side minimums**.
- `reserve = Σ (minimum of each flex filler)` (only the sides that are flex).
- `cabSpace = available − reserve`; `autoW = floorTo(cabSpace / nAuto, roundTo)` as today.
- `leftover = available − nAuto × autoW`; `extra = leftover − reserve` (≥ 0 by construction).
- Each flex filler = `its minimum + floorTo(extra / flexCount, 1/16)`, with any remainder going to the **left** flex filler, so the widths still add up exactly.
- With one flex filler, it takes `minimum + extra`. The existing `wide-filler` and `over-constrained` rules are unchanged.

Worked example: run 120, left flex min 1.5, right flex min 3 (corner), no fixed items, max 36 → reserve 4.5, cabSpace 115.5, 4 autos at 28.5 (115.5/4 = 28.875 floored to 1/2), leftover 6, extra 1.5, each filler +0.75 → **2.25, 28.5 × 4, 3.75**.

## 3. Run overhang past wall ends
New setting `maxRunOverhang: 36`.
- **Validation** (`overlap.js` `validateRunPlacement`): a run is in bounds when `run.x >= −maxRunOverhang` and `run.x + run.width <= L + maxRunOverhang`. Outside that → error `out-of-bounds` as today. Run-vs-run conflicts on the same wall are unchanged.
- **Diagnostics** (`roomDiagnostics`): a run whose x < 0 or whose end > L gets warning `{code: 'overhang', left, right}` with the amounts (0 when that side doesn't overhang).
- **Drawing** (`canvas/drag.js` and `createRun`): clamp the drawn rectangle to `[−maxRunOverhang, L + maxRunOverhang]` instead of `[0, L]`.
- **Stretching** (`stretchRun`): the same range. The 2" snap to a wall end still applies, and anchoring still requires an inside corner (SPEC-5 §4).
- **Anchored runs** are positioned by their reserve as today; an anchored side never overhangs.
- **Automatic end panels** (SPEC-5 §4.2) already apply to an overhanging side, since it isn't anchored and isn't adjacent to another run.
- **Dimension chains** (`model/dimensions.js`): a chain now spans `[min(0, firstRunStart), max(L, lastRunEnd)]` instead of `[0, L]`. Gap segments outside the wall keep kind `'open'`. Both chains must still be contiguous and sum to that range.
- **`DimensionRow`** takes an optional `wallEndMarks: number[]` (wall-local positions) and draws a heavier tick at each one, so 0 and L stay visible when a run runs past them.
- **Plan view:** footprints already come from the elevation coordinates, so an overhanging run simply draws past the wall. Give the part beyond the wall a dashed edge so it reads as overhang, and keep the existing cross-wall collision check.

## 4. UI
- **Run properties:**
  - Per side, a "Corner clearance" control shown only when that side is anchored at an inside corner: a select (Auto / Face only / Custom) plus an inch input for Custom. Show the resolved reserve read-only, e.g. `Reserve 42 9/16" (face 28 3/4" + back 13 7/8")`.
  - An overhang line when the run extends past a wall end: `Overhangs left 6"`, styled as a warning.
  - The corner info line gains the angle it already knows, e.g. `Inside corner 60° · Wall 2`.
- **Settings panel:** add `maxRunOverhang`.
- Everything else stays as it is.

## 5. Required tests (vitest)
Room R (SPEC-2): A (0,0)→(120,0), B (120,0)→(120,96), A.end ↔ B.start. Use `frontDepth` 24.875 (24" boxes) unless noted. Tolerance 1e-3.

**Corner clearance**
1. 90°: reserve 24.875 (unchanged).
2. 60° corner (B rotated accordingly), run depth 24 → 42.5796; with `cornerClearance.right = 'face'` → 28.7232; with `= 30` → 30.
3. 135° → 35.1786 (back term 0).
4. 75°, run depth 12 (an upper) → 25.7525 + 12 × cot 75° = 25.7525 + 3.2154 = 28.9679.
5. `cornerFillerMin`: 90° → 1.5; 60° → 1.7321; 135° → 2.1213; 150° → 3; clamped at 4 × 1.5 = 6 for very sharp angles (e.g. 10°).
6. A flex filler at a 60° anchored inside corner carries `cornerAngle: 60`; at 90° it has no `cornerAngle`.

**Filler distribution**

7. The §2 worked example → [2.25, 28.5, 28.5, 28.5, 28.5, 3.75], summing to 120.
8. Equal minimums (1.5 and 1.5) reproduce today's result for SPEC §11 case 1 (run 120 → [2, 29, 29, 29, 29, 2]).
9. One flex filler at min 3, the other end a 0.75 end panel, run 96, no fixed items → [0.75, 30.5, 30.5, 30.5, 3.75], summing to 96.
10. All existing splitRun tests still pass.

**Overhang**

11. A run x −6 w 60 on a 120" wall → valid, warning `overhang` with left 6, right 0.
12. x 100 w 60 (end 160 on a 120" wall = 40" overhang) → error `out-of-bounds`, since 40 > maxRunOverhang 36. With w 50 (end 150, overhang 30) → valid, warning right 30.
13. `horizontalChains` for a wall with a run from −6 to 54 → the inner chain starts at −6 and the outer chain spans −6 … 120, both contiguous.
14. `stretchRun` dragging a left edge to −10 → allowed (within 36); to −50 → rejected with `out-of-bounds`, room unchanged.
