import { cellPieces } from './cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';
import { frontDepth } from './corners.js';
import { runDoorThickness } from './doorStyleResolve.js';
import { teamDoorStyle } from './doorStyles.js';
import { extendPieces } from './extensions.js';
import { findCollisions } from './footprints.js';
import { frameRegions } from './frames.js';
import { gridLeaves, runItems } from './grid.js';
import { insideEndBoundary, insideEndSides } from './insideEnds.js';
import { stepEndSides } from './stepEnds.js';
import {
  isFollowAnchor,
  isJointAnchor,
  deeperJoinedSides,
  jointEndTypes,
  pruneFollows,
  pruneJoints,
} from './joints.js';
import { resolveLandings } from './landings.js';
import { pruneLines } from './layoutLines.js';
import { placeAttachedOpenings } from './linePlacement.js';
import { labelOpenings, runBlocksOpening } from './openings.js';
import { recessWarnings, withRunPlane } from './recesses.js';
import { wallLength } from './geometry.js';
import { validateRunPlacement } from './overlap.js';
import { runEndThickness, wallPanelThickness } from './panelThickness.js';
import { resolveProfile, resolveVertical } from './profile.js';
import { splitRun, syncAutoItems } from './splitRun.js';
import { pruneStacks, resolveStacks } from './stacks.js';
import { runFrame, runSeamGap } from './styles.js';
import { profileUnderSoffit, soffitConflicts } from './soffits.js';
import { computeWallOrder } from './topology.js';
import { runTop } from './tops.js';
import { resolveTopSegments } from './topSegments.js';
import {
  WALL_SIDES,
  wallEndPanelAt,
  wallSideOf,
  wallSideView,
  wallViewForRun,
} from './wallSides.js';
import { isPanelOnlyRun, panelRunMiters, wallEndPanels } from './wallEndPanels.js';
import { cloneRun, cloneRoom } from './roomClone.js';
import { endMinWidthsForRun, horizontalResolution, casingClearanceWarnings, cornerLapWarnings } from './runAnchors.js';
import { placeRoom, splitOptionsForRun } from './placement.js';
import { returnFaceWarnings } from './returnWarnings.js';
import { flexRoom, unflexRoom } from './runFlex.js';

const PIN_EPSILON = 1e-6;

function withPartPick(next, end) {
  return {
    ...next,
    ...(end.styleId != null ? { styleId: end.styleId } : {}),
    ...(end.sizes != null ? { sizes: end.sizes } : {}),
  };
}

/** Base and tall runs standing on the floor, each with counterTop: the top of what it really carries. */
function floorRunsWithTops(wall, runs, profile) {
  return runs
    .filter((run) => (run.cabinetTypeId === CABINET_TYPE_IDS.BASE
      || run.cabinetTypeId === CABINET_TYPE_IDS.TALL) && !run.stack?.below)
    .map((run) => ({ ...run, counterTop: run.z + run.height + runTop(wall, run, profile).height }));
}

/** A run with its derived seam gap (SPEC-36), stored only when there is one. */
function withSeamGap(room, run, settings) {
  const gap = runSeamGap(room, run, settings);
  if (gap > 0) return run._seamGap === gap ? run : { ...run, _seamGap: gap };
  if (run._seamGap === undefined) return run;
  const { _seamGap, ...rest } = run;
  void _seamGap;
  return rest;
}

/** Back-panel-only runs follow their deepest panel before resolving their geometry. */
function withPanelOnlyDepth(run) {
  if (!isPanelOnlyRun(run)) return run;
  const depth = Math.max(...gridLeaves(run.grid)
    .filter((leaf) => leaf.kind === 'panel').map((leaf) => leaf.depth));
  return run.depth === depth ? run : { ...run, depth };
}

/** A run with its derived face frame, stored only for inset styles. */
function withFrame(room, run, settings) {
  const frame = runFrame(room, run, settings);
  if (frame) {
    if (run._frame?.thickness === frame.thickness && run._frame?.drop === frame.drop
      && run._frame?.bead === frame.bead) return run;
    return { ...run, _frame: frame };
  }
  if (run._frame === undefined) return run;
  const { _frame, ...rest } = run;
  void _frame;
  return rest;
}

/** A Euro run's derived front plane thickness, stored only when it differs from the team default. */
function withDoorThickness(room, wall, run, settings) {
  if (!run._frame) {
    const thickness = runDoorThickness(room, wall, run, settings);
    if (Math.abs(thickness - teamDoorStyle(settings).thickness) > 1e-9) {
      return run._doorThickness === thickness ? run : { ...run, _doorThickness: thickness };
    }
  }
  if (!Object.hasOwn(run, '_doorThickness')) return run;
  const { _doorThickness, ...rest } = run;
  void _doorThickness;
  return rest;
}

/** A run's derived panel thicknesses, only where they differ from the team default. */
function withEndThickness(room, wall, run, settings) {
  const thickness = Object.fromEntries(Object.entries(runEndThickness(room, wall, run, settings))
    .filter(([, value]) => Math.abs(value - teamDoorStyle(settings).thickness) > 1e-9));
  if (Object.keys(thickness).length > 0) {
    return JSON.stringify(run._endThickness) === JSON.stringify(thickness)
      ? run : { ...run, _endThickness: thickness };
  }
  if (!Object.hasOwn(run, '_endThickness')) return run;
  const { _endThickness, ...rest } = run;
  void _endThickness;
  return rest;
}

function withInsideEnds(room, wall, run, settings) {
  const { _insideEnds, ...base } = run;
  const view = wallViewForRun(wall, base);
  const layout = splitRun(base, settings, splitOptionsForRun(room, view, base, settings));
  const entries = insideEndSides(base, cellPieces(base, layout), settings)
    .filter((entry) => entry.choice !== 'none')
    .map((entry) => entry.choice === 'panel'
      ? { ...entry, boundary: insideEndBoundary(base.grid, entry.leafId, entry.side) } : entry);
  if (entries.length) {
    return JSON.stringify(_insideEnds) === JSON.stringify(entries) ? run : { ...base, _insideEnds: entries };
  }
  return Object.hasOwn(run, '_insideEnds') ? base : run;
}

/** Steps use the final inside-panel layout and never change its widths. */
function withStepEnds(room, wall, run, settings) {
  const { _stepEnds, ...base } = run;
  const view = wallViewForRun(wall, base);
  const layout = splitRun(base, settings, splitOptionsForRun(room, view, base, settings));
  const entries = stepEndSides(base, cellPieces(base, layout), settings, room)
    .filter((entry) => entry.choice !== 'none');
  if (entries.length) {
    return JSON.stringify(_stepEnds) === JSON.stringify(entries) ? run : { ...base, _stepEnds: entries };
  }
  return Object.hasOwn(run, '_stepEnds') ? base : run;
}

/** A wall's derived panel thicknesses, only where they differ from the team default. */
function withWallPanelThickness(room, wall, settings) {
  const thickness = Object.fromEntries(Object.entries(wallPanelThickness(room, wall, settings))
    .filter(([, value]) => value !== null && Math.abs(value - teamDoorStyle(settings).thickness) > 1e-9));
  if (Object.keys(thickness).length > 0) {
    return JSON.stringify(wall._endPanelThickness) === JSON.stringify(thickness)
      ? wall : { ...wall, _endPanelThickness: thickness };
  }
  if (!Object.hasOwn(wall, '_endPanelThickness')) return wall;
  const { _endPanelThickness, ...rest } = wall;
  void _endPanelThickness;
  return rest;
}

/**
 * A face frame run's joined ends that die into a deeper neighbour (SPEC-38.4): `_frame.dieIn` gives,
 * per side, an end of type None whose neighbour is deeper, so the frame's stile overhangs the box
 * there like a free end.
 */
function withDieIns(wall) {
  const deeper = deeperJoinedSides(wall);
  return {
    ...wall,
    runs: wall.runs.map((run) => {
      if (!run._frame) return run;
      const sides = deeper.get(run.id);
      const found = {
        left: Boolean(sides?.left) && run.ends.left.type === 'none',
        right: Boolean(sides?.right) && run.ends.right.type === 'none',
      };
      const { dieIn, ...frame } = run._frame;
      void dieIn;
      if (found.left || found.right) return { ...run, _frame: { ...frame, dieIn: found } };
      return dieIn === undefined ? run : { ...run, _frame: frame };
    }),
  };
}

/** Panel-only runs share their drawn miter widths when laying out auto root items. */
function withPanelMiters(room, wall, settings) {
  return {
    ...wall,
    runs: wall.runs.map((run) => {
      const miters = isPanelOnlyRun(run) ? panelRunMiters(room, wall, run, settings) : {};
      const widths = { left: miters.left?.width ?? 0, right: miters.right?.width ?? 0 };
      if (widths.left || widths.right) {
        return run._panelMiters?.left === widths.left && run._panelMiters?.right === widths.right
          ? run : { ...run, _panelMiters: widths };
      }
      const { _panelMiters, ...rest } = run;
      return _panelMiters === undefined ? run : rest;
    }),
  };
}

/**
 * A face frame run beside a wall end panel (SPEC-36.2): `_frame.wallPanels` gives, per side, the
 * panel's width and top and how the frame meets it. Auto: mitered over the panel's edge unless the
 * panel stands in front of the frame or above the run's box, then it dies into it. The panel's
 * `frame` ('miter' or 'butt') overrides.
 */
function withWallPanels(room, wall, settings) {
  const panels = wallEndPanels(room, wall, settings);
  return {
    ...wall,
    runs: wall.runs.map((run) => {
      if (!run._frame) return run;
      const found = { left: null, right: null };
      for (const panel of panels) {
        const side = panel[wallSideOf(run)];
        if (!side.runIds.includes(run.id)) continue;
        const flush = side.depth <= frontDepth(run, settings) + PIN_EPSILON
          && panel.top <= run.z + run.height + PIN_EPSILON;
        found[side.side] = {
          width: panel.width,
          top: panel.top,
          join: wall.endPanels?.[panel.endpoint]?.frame ?? (flush ? 'miter' : 'butt'),
        };
      }
      const { wallPanels, ...frame } = run._frame;
      if (found.left || found.right) return { ...run, _frame: { ...frame, wallPanels: found } };
      return wallPanels === undefined ? run : { ...run, _frame: frame };
    }),
  };
}

/**
 * Resolve all stored horizontal, vertical, and automatic-item geometry in a room.
 *
 * @param {object} room
 * @param {object} settings
 * @returns {object}
 */
export function syncRoom(room, settings) {
  // SPEC-RF1: solve every run from its drawn span; the flex goes back on at the end.
  let nextRoom = cloneRoom(resolveLandings(unflexRoom(room)));
  nextRoom.walls = nextRoom.walls.map((wall) => pruneStacks(pruneFollows(pruneJoints(pruneLines(wall)))));
  // FX1: a wall's height is derived (team → … → room → wall.profile.wallHeight); only a typed wall height overrides.
  nextRoom.walls = nextRoom.walls.map((wall) => {
    // Saved walls and older fixtures bypass createWall; use the same legacy-value rule.
    const thicknessOverride = wall.thicknessOverride !== undefined ? wall.thicknessOverride
      : (Number.isFinite(wall.thickness) && wall.thickness !== DEFAULT_SETTINGS.wallThickness
        ? wall.thickness : null);
    return {
      ...wall,
      height: resolveProfile(settings, nextRoom, wall).wallHeight,
      thicknessOverride,
      thickness: thicknessOverride ?? settings.wallThickness,
      runs: wall.runs.map(withPanelOnlyDepth),
    };
  });
  nextRoom.walls = nextRoom.walls.map((wall) => ({
    ...withWallPanelThickness(nextRoom, wall, settings),
    runs: wall.runs.map((run) => withRunPlane(
      wall,
      withEndThickness(
        nextRoom, wall, withDoorThickness(
          nextRoom, wall, withFrame(nextRoom, withSeamGap(nextRoom, run, settings), settings), settings,
        ), settings,
      ),
    )),
  }));
  nextRoom.wallOrder = computeWallOrder(nextRoom, nextRoom.wallOrder ?? []);
  // LL3: openings attached to a layout line sit on it, before labels (left to right) and run anchors read them.
  nextRoom = placeAttachedOpenings(nextRoom, settings);
  // Door and window labels follow wall order, then left to right (typed labels stay).
  nextRoom = labelOpenings(nextRoom, settings);
  nextRoom = placeRoom(nextRoom, settings);

  nextRoom = {
    ...nextRoom,
    walls: nextRoom.walls.map((wall) => {
      const profile = resolveProfile(settings, nextRoom, wall);
      const runs = wall.runs.map(cloneRun);
      for (const typeId of [
        CABINET_TYPE_IDS.BASE,
        CABINET_TYPE_IDS.TALL,
        CABINET_TYPE_IDS.UPPER,
      ]) {
        for (let index = 0; index < runs.length; index += 1) {
          const run = runs[index];
          if (run.cabinetTypeId !== typeId || run.heightMode === 'manual') continue;
          const vertical = resolveVertical(
            run,
            profileUnderSoffit(profile, wall, run),
            floorRunsWithTops(
              wall,
              runs.filter((candidate) => wallSideOf(candidate) === wallSideOf(run)),
              profile,
            ),
            wall,
          );
          runs[index] = { ...run, z: vertical.z, height: vertical.height };
        }
      }
      return resolveStacks({ ...wall, runs }, profile);
    }),
  };

  nextRoom = {
    ...nextRoom,
    walls: nextRoom.walls.map((wall) => {
      const endTypes = jointEndTypes(wall);
      return {
        ...wall,
        runs: wall.runs.map((run) => ({
          ...run,
          ends: Object.fromEntries(Object.entries(run.ends).map(([side, end]) => {
            const anchor = run.anchors?.[side];
            if ((isJointAnchor(anchor) || isFollowAnchor(anchor)) && end.auto === true) {
              return [side, withPartPick({ type: endTypes.get(run.id)[side], width: null, auto: true }, end)];
            }
            if (run.anchors?.[side] === true
              && wallEndPanelAt(nextRoom, wallViewForRun(wall, run), side, settings)) {
              return [side, withPartPick({ type: 'none', width: null, auto: true }, end)];
            }
            if (!isJointAnchor(anchor) && !isFollowAnchor(anchor) && end.auto === true) {
              return [side, withPartPick({ type: 'end_panel', width: null }, end)];
            }
            return [side, end];
          })),
        })),
      };
    }),
  };

  nextRoom = { ...nextRoom, walls: nextRoom.walls.map(withDieIns) };
  // SPEC-38.4: before the auto items, so splitRun knows a wall end panel's join.
  nextRoom = {
    ...nextRoom,
    walls: nextRoom.walls.map((wall) => withPanelMiters(
      nextRoom, withWallPanels(nextRoom, wall, settings), settings,
    )),
  };

  nextRoom = {
    ...nextRoom,
    walls: nextRoom.walls.map((wall) => ({
      ...wall,
      runs: wall.runs.map((run) => syncAutoItems(run, settings, {
        endMinWidths: endMinWidthsForRun(nextRoom, wall, run, settings),
      })),
    })),
  };

  // SPEC-RF1: after the auto count, so the count follows the drawn width.
  nextRoom = flexRoom(nextRoom, settings);
  return {
    ...nextRoom,
    walls: nextRoom.walls.map((wall) => ({
      ...wall,
      runs: wall.runs.map((run) => withStepEnds(
        nextRoom, wall, withInsideEnds(nextRoom, wall, run, settings), settings,
      )),
    })),
  };
}

/**
 * Combine layout, height, anchor, placement, and footprint diagnostics by run id.
 *
 * @returns {Record<string, {warnings:object[], errors:object[]} >}
 */
export function roomDiagnostics(room, settings) {
  const synced = syncRoom(room, settings);
  const diagnostics = {};
  for (const wall of synced.walls.flatMap((sourceWall) => (
    WALL_SIDES.map((side) => wallSideView(sourceWall, side))
  ))) {
    const profile = resolveProfile(settings, synced, wall);
    const length = wallLength(wall);
    const bases = floorRunsWithTops(wall, wall.runs, profile);
    const resolvedWall = { ...wall, length };
    for (const run of wall.runs) {
      const options = splitOptionsForRun(synced, wall, run, settings);
      const layout = splitRun(run, settings, options);
      const vertical = resolveVertical(
        run,
        profileUnderSoffit(profile, wall, run),
        bases,
        wall,
      );
      const horizontal = horizontalResolution(synced, wall, run, settings);
      const placement = validateRunPlacement(resolvedWall, run, settings);
      const overhang = {
        code: 'overhang',
        left: Math.max(0, -run.x),
        right: Math.max(0, run.x + run.width - length),
      };
      const blockedOpenings = (wall.openings ?? [])
        .filter((opening) => runBlocksOpening(run, opening, resolvedWall, settings))
        .map((opening) => ({
          code: 'blocks-opening',
          openingId: opening.id,
          label: opening.label,
        }));
      diagnostics[run.id] = {
        warnings: [
          ...layout.warnings,
          ...resolveTopSegments(run, runTop(wall, run, profile).kind).warnings,
          ...cellPieces(run, layout).warnings,
          ...extendPieces(wall, run, cellPieces(run, layout).pieces).warnings,
          ...frameRegions(synced, run, cellPieces(run, layout), settings).warnings,
          ...runItems(run).flatMap((item) => (
            item.pin && !Number.isFinite(options.pinTargets[item.id])
              ? [{
                  code: 'pin-unresolved',
                  pieceId: item.id,
                  message: item.pin.from === 'return'
                    ? 'The return this column follows is gone.'
                    : 'Pinned opening no longer exists.',
                }]
              : []
          )),
          ...vertical.warnings,
          ...(overhang.left > 0 || overhang.right > 0 ? [overhang] : []),
          ...blockedOpenings,
          ...casingClearanceWarnings(run, wall, length, settings),
          ...cornerLapWarnings(synced, wall, run, settings),
          ...returnFaceWarnings(synced, resolvedWall, run, settings),
          ...soffitConflicts(wall, run),
          ...recessWarnings(wall, run),
        ],
        errors: [
          ...layout.errors,
          ...vertical.errors,
          ...horizontal.errors,
          ...(placement.ok ? [] : [{ code: placement.reason }]),
        ],
      };
    }
  }
  for (const collision of findCollisions(synced, settings)) {
    diagnostics[collision.runId]?.warnings.push(collision);
  }
  return diagnostics;
}

/**
 * Resolve and validate adding a run to a room without mutating the input.
 *
 * @returns {{ok:boolean,reason:string|null,room:object}}
 */
export function tryPlaceRun(room, wallId, run, settings) {
  const temporary = cloneRoom(room);
  const wall = temporary.walls.find((candidate) => candidate.id === wallId);
  if (!wall) return { ok: false, reason: 'wall-not-found', room };
  wall.runs.push(cloneRun(run));
  const synced = syncRoom(temporary, settings);
  const resolvedWall = synced.walls.find((candidate) => candidate.id === wallId);
  const resolvedRun = resolvedWall.runs.find((candidate) => candidate.id === run.id);
  const validation = validateRunPlacement(
    { ...resolvedWall, length: wallLength(resolvedWall) },
    resolvedRun,
    settings,
  );
  return { ...validation, room: synced };
}
