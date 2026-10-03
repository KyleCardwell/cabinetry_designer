import { runBottomHeight } from './bottoms.js';
import { runShortLabel } from './joints.js';
import { runTop } from './tops.js';
import { formatInches } from './units.js';
import { wallSideOf } from './wallSides.js';

/** `below`: the run this one sits on. `above`: the run this one is held under. */
export const STACK_EDGES = ['below', 'above'];

/** The stack link on one edge of a run — { runId, offset } — or null. */
export function stackLink(run, edge) {
  const link = run.stack?.[edge];
  return link && typeof link.runId === 'string' ? link : null;
}

/** Ids of the runs a run is stacked on or under. */
export function stackLeaders(run) {
  return STACK_EDGES.map((edge) => stackLink(run, edge)?.runId).filter(Boolean);
}

/** Ids of every run stacked on or under any of runIds, directly or through another stacked run. */
export function stackFollowersOf(wall, runIds) {
  const found = [];
  const queue = [...runIds];
  while (queue.length > 0) {
    const leaderId = queue.shift();
    for (const run of wall.runs ?? []) {
      if (found.includes(run.id) || runIds.includes(run.id)) continue;
      if (stackLeaders(run).includes(leaderId)) {
        found.push(run.id);
        queue.push(run.id);
      }
    }
  }
  return found;
}

/** Whether stacking sourceRunId on or under leaderRunId would close a loop. */
export function stackCreatesCycle(wall, sourceRunId, leaderRunId) {
  return leaderRunId === sourceRunId || stackFollowersOf(wall, [sourceRunId]).includes(leaderRunId);
}

/** Every run linked to runId above or below, directly or through others, bottom to top. */
export function stackOf(wall, runId) {
  const runs = wall.runs ?? [];
  const found = new Set([runId]);
  const queue = [runId];
  while (queue.length > 0) {
    const id = queue.shift();
    for (const run of runs) {
      const linked = run.id === id
        ? stackLeaders(run)
        : stackLeaders(run).includes(id) ? [run.id] : [];
      for (const otherId of linked) {
        if (found.has(otherId) || !runs.some((candidate) => candidate.id === otherId)) continue;
        found.add(otherId);
        queue.push(otherId);
      }
    }
  }
  return runs.filter((run) => found.has(run.id)).sort((a, b) => a.z - b.z);
}

/** The top of a run's top part (countertop, crown, …), or of its box. */
export function outerTop(wall, run, profile) {
  return run.z + run.height + runTop(wall, run, profile).height;
}

/** The bottom of a run's lowest part below it (light rail, cap, …), or of its box. */
export function outerBottom(run) {
  return run.z - runBottomHeight(run);
}

/** A run's z and height from its links; leaders are already resolved. */
function stackedSpan(wall, run, resolved, profile) {
  const below = stackLink(run, 'below');
  const above = stackLink(run, 'above');
  const belowLeader = below ? resolved.get(below.runId) : null;
  const aboveLeader = above ? resolved.get(above.runId) : null;
  let z = run.z;
  let top = run.z + run.height;
  if (belowLeader) {
    z = outerTop(wall, belowLeader, profile) + (below.offset ?? 0) + runBottomHeight(run);
  }
  if (aboveLeader) {
    top = outerBottom(aboveLeader) - (above.offset ?? 0) - runTop(wall, run, profile).height;
  }
  // One link only: a manual run keeps its height; an auto run keeps its other, auto edge.
  if (belowLeader && !aboveLeader && run.heightMode !== 'auto') top = z + run.height;
  if (aboveLeader && !belowLeader && run.heightMode !== 'auto') z = top - run.height;
  return { z, height: top - z };
}

/** Resolve stacked runs' heights, leaders first. A loop keeps its stored heights. */
export function resolveStacks(wall, profile) {
  const runs = wall.runs ?? [];
  if (!runs.some((run) => stackLeaders(run).length > 0)) return wall;
  const resolved = new Map();
  let pending = runs;
  while (pending.length > 0) {
    const waiting = new Set(pending.map((run) => run.id));
    const ready = pending.filter((run) => stackLeaders(run).every((id) => !waiting.has(id)));
    if (ready.length === 0) break;
    for (const run of ready) {
      resolved.set(run.id, stackLeaders(run).length > 0
        ? { ...run, ...stackedSpan(wall, run, resolved, profile) }
        : run);
    }
    pending = pending.filter((run) => !resolved.has(run.id));
  }
  return { ...wall, runs: runs.map((run) => resolved.get(run.id) ?? run) };
}

/** Clear every link whose leader is missing, the run itself, or on the other wall side. */
export function pruneStacks(wall) {
  const runs = wall.runs ?? [];
  const sides = new Map(runs.map((run) => [run.id, wallSideOf(run)]));
  let changed = false;
  const next = runs.map((run) => {
    const dropped = STACK_EDGES.filter((edge) => {
      const link = stackLink(run, edge);
      return link && (link.runId === run.id || sides.get(link.runId) !== wallSideOf(run));
    });
    if (dropped.length === 0) return run;
    changed = true;
    return {
      ...run,
      stack: { ...run.stack, ...Object.fromEntries(dropped.map((edge) => [edge, null])) },
    };
  });
  return changed ? { ...wall, runs: next } : wall;
}

/** "Sits on Base 0"–60" · flush" / "Held under Upper 0"–60" · 1" gap". */
export function describeStack(wall, run, edge) {
  const link = stackLink(run, edge);
  if (!link) return null;
  const leader = (wall.runs ?? []).find((candidate) => candidate.id === link.runId);
  const offset = link.offset ?? 0;
  const relation = offset > 0
    ? `${formatInches(offset)} gap`
    : offset < 0 ? `${formatInches(Math.abs(offset))} overlap` : 'flush';
  return `${edge === 'below' ? 'Sits on' : 'Held under'} ${leader ? runShortLabel(leader) : 'a missing run'} · ${relation}`;
}
