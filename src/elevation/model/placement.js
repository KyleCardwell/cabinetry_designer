import { wallLength } from './geometry.js';
import { runItems } from './grid.js';
import { followLeaders } from './joints.js';
import { findLine } from './layoutLines.js';
import { returnExtents } from './returnExtents.js';
import { endCornerAnglesForRun, endMinWidthsForRun, horizontalResolution } from './runAnchors.js';
import { pinTargetsForRun, resolvePinnedSpan } from './runPins.js';
import { resolveSoffitSpan } from './soffits.js';
import { wallSideOf, wallSideView } from './wallSides.js';

// Return pins → soffits → run edges → pin growth; edit actions still do their own ripple until LL5. See plans/LAYOUT-PLAN.md.

/** The shared room-aware options for splitting a run on either wall face. */
export function splitOptionsForRun(room, wall, run, settings) {
  return {
    endMinWidths: endMinWidthsForRun(room, wall, run, settings),
    endCornerAngles: endCornerAnglesForRun(room, wall, run),
    pinTargets: pinTargetsForRun(run, wall, wallLength(wall), settings),
    lineLabels: Object.fromEntries(runItems(run).flatMap((item) => {
      const line = item.attach && findLine(wall, item.attach.lineId);
      return line ? [[item.id, line.label]] : [];
    })),
  };
}

/** Recompute return pins from the resolved landing and front planes before solving any runs. */
function withReturnPins(room, wall, settings) {
  const extentsBySide = new Map();
  return {
    ...wall,
    runs: wall.runs.map((run) => {
      const { _returnPins, ...base } = run;
      void _returnPins;
      const pins = runItems(run).filter((item) => item.pin?.from === 'return');
      if (!pins.length) return base;
      const side = wallSideOf(run);
      if (!extentsBySide.has(side)) {
        extentsBySide.set(side, returnExtents(room, wallSideView(wall, side), settings));
      }
      const entries = pins.flatMap(({ id, pin }) => {
        const ext = extentsBySide.get(side).find((candidate) => (
          candidate.wallId === pin.wallId && candidate.runId === pin.runId
        ));
        if (!ext) return [];
        const target = pin.edge === 'right' ? ext.right + pin.value
          : pin.edge === 'center' ? (ext.left + ext.right) / 2 + pin.value
            : ext.left - pin.value;
        return [[id, {
          target,
          ...(pin.edge === 'both' ? { width: ext.right + pin.valueRight - target } : {}),
        }]];
      });
      return { ...base, _returnPins: Object.fromEntries(entries) };
    }),
  };
}

/** Resolve every run's span, leaders before the runs that follow them. */
function resolveWallSpans(room, wall, settings) {
  const resolved = new Map();
  let pending = wall.runs;
  while (pending.length > 0) {
    const waiting = new Set(pending.map((run) => run.id));
    const ready = pending.filter((run) => (
      followLeaders(run).every((leaderId) => !waiting.has(leaderId))
    ));
    if (ready.length === 0) break;
    const view = { ...wall, runs: wall.runs.map((run) => resolved.get(run.id) ?? run) };
    for (const run of ready) {
      const horizontal = horizontalResolution(room, view, run, settings);
      const { _cornerLapWidth, ...base } = run;
      void _cornerLapWidth;
      resolved.set(run.id, {
        ...base, x: horizontal.x, width: horizontal.width,
        ...(horizontal.lapWidth ? { _cornerLapWidth: horizontal.lapWidth } : {}),
      });
    }
    pending = pending.filter((run) => !resolved.has(run.id));
  }
  return wall.runs.map((run) => resolved.get(run.id) ?? run);
}

export function returnPinTargets(room, settings) {
  return { ...room, walls: room.walls.map((wall) => withReturnPins(room, wall, settings)) };
}

export function soffitSpans(room) {
  return {
    ...room,
    walls: room.walls.map((wall) => ({
      ...wall,
      soffits: (wall.soffits ?? []).map((soffit) => ({
        ...soffit,
        ...resolveSoffitSpan(
          room,
          wallSideView(wall, wallSideOf(soffit)),
          soffit,
        ),
      })),
    })),
  };
}

export function runEdges(room, settings) {
  return {
    ...room,
    walls: room.walls.map((wall) => ({
      ...wall,
      runs: resolveWallSpans(room, wall, settings),
    })),
  };
}

export function pinGrowth(room, settings) {
  return {
    ...room,
    walls: room.walls.map((wall) => {
      const length = wallLength(wall);
      return {
        ...wall,
        runs: wall.runs.map((run) => resolvePinnedSpan(
          run,
          wall,
          length,
          settings,
          pinTargetsForRun(run, wall, length, settings),
        )),
      };
    }),
  };
}

export const PLACEMENT_STAGES = Object.freeze([
  { name: 'return-pins', run: returnPinTargets },
  { name: 'soffits', run: soffitSpans },
  { name: 'run-edges', run: runEdges },
  { name: 'pin-growth', run: pinGrowth },
]);

export function placeRoom(room, settings) {
  return PLACEMENT_STAGES.reduce((nextRoom, stage) => stage.run(nextRoom, settings), room);
}
