import { panelReturns } from './panelReturns.js';
import { frontDepth, runBackOffset } from './corners.js';
import { legWarningSubject, runLegList } from './endLegs.js';
import { teamDoorStyle } from './doorStyles.js';
import { legShapeOf } from './legs.js';

/** Depth and along-run fill plans, independent of leg height and support. */
export function legFillPlans(run, settings) {
  const runLegs = runLegList(run).filter((leg) => !leg.wall);
  if (!runLegs.some(({ fill }) => fill)) return [];
  const F = frontDepth(run, settings);
  const B = runBackOffset(run);
  const legs = runLegs.flatMap((leg) => {
    const shape = legShapeOf(leg, settings);
    if (!shape) return [];
    const t0 = leg.yFrom === 'front' ? -leg.y : F - B + leg.y - shape.box.d;
    const front = F - t0;
    return [{ leg, legId: leg.id, ...legWarningSubject(run, leg), width: shape.box.w, front, back: front - shape.box.d }];
  });
  return legs.filter(({ leg }) => leg.fill).map((entry) => {
    const { leg, legId, index, name } = entry;
    const identity = { leg, legId, ...(name ? { name } : { index }) };
    const { fill } = leg;
    if (fill.type === 'filler') {
      const width = entry.width;
      const u0 = leg.from === 'left' ? run.x - leg.x : run.x + run.width + leg.x - width;
      const thickness = settings.fillerThickness;
      const face = { back: entry.back - thickness, front: entry.back };
      const rt = settings.fillerReturnThickness;
      const join = face.back + settings.fillerReturnTongue;
      const ret = {
        start: leg.from === 'left' ? u0 + width - rt : u0,
        end: leg.from === 'left' ? u0 + width : u0 + rt,
        back: join - settings.fillerReturnDepth,
        front: join,
      };
      const hasReturn = settings.fillerReturnDepth > 0;
      const back = hasReturn ? Math.min(face.back, ret.back) : face.back;
      const front = hasReturn ? Math.max(face.front, ret.front) : face.front;
      return { ...identity, type: 'filler', side: leg.from, u0, width, face, ret,
        back, front, thickness,
        orderedDepth: hasReturn ? thickness + settings.fillerReturnDepth - settings.fillerReturnTongue : thickness,
        takesRoom: leg.takesRoom !== false && !run._pinSplit?.[leg.from]
          && Math.min(front, F) - Math.max(back, B) > 1e-6 };
    }
    const backLeg = legs.find(({ leg: other }) => other.end?.side === leg.end?.side
      && other.end?.edge === 'back');
    const warn = (code) => ({ ...identity, warning: { code, type: fill.type } });
    const back = fill.past ? B : backLeg?.front ?? B;
    const front = fill.past ? F : entry.back;
    const depth = front - back;
    if (depth <= 1e-6) return warn('leg-fill-no-depth');
    const width = run._endThickness?.[leg.from] ?? teamDoorStyle(settings).thickness;
    const inset = fill.inset ?? settings.legPanelReveal;
    const u0 = leg.from === 'left' ? run.x - leg.x + inset : run.x + run.width + leg.x - inset - width;
    const takesRoom = (back, front) => leg.takesRoom !== false && !run._pinSplit?.[leg.from]
      && Math.min(front, F) - Math.max(back, B) > 1e-6;
    const returnDepth = fill.returnDepth ?? settings.legPanelReturnDepth;
    const { returns: bands, shortReturn } = panelReturns({ side: leg.from, u0, width, back, front,
      returns: fill.returns, returnDepth });
    const returns = bands.map((band) => ({ ...band, takesRoom: takesRoom(band.back, band.front) }));
    return { ...identity, type: fill.type, side: leg.from,
      u0, width, back, front, depth, returns,
      ...(returns.length ? { returnDepth } : {}),
      ...(shortReturn ? { warnings: [{ code: 'leg-fill-return-short' }] } : {}),
      takesRoom: takesRoom(back, front) };
  });
}

/** Room reserved inside each run end by legs whose depth overlaps the run. */
export function legRoom(run, settings) {
  const room = { left: 0, right: 0 };
  const F = frontDepth(run, settings);
  const B = runBackOffset(run);
  for (const leg of runLegList(run)) {
    if (leg.wall || run._pinSplit?.[leg.from] || leg.takesRoom === false) continue;
    const shape = legShapeOf(leg, settings);
    if (!shape) continue;
    const b = shape.box;
    const t0 = leg.yFrom === 'front' ? -leg.y : F - B + leg.y - b.d;
    const f = F - t0;
    const k = f - b.d;
    if (Math.min(f, F) - Math.max(k, B) <= 1e-6) continue;
    room[leg.from] = Math.max(room[leg.from], b.w - leg.x);
  }
  for (const plan of legFillPlans(run, settings)) {
    if (plan.warning) continue;
    if (plan.takesRoom) {
      const inside = plan.side === 'left' ? plan.u0 + plan.width - run.x : run.x + run.width - plan.u0;
      room[plan.side] = Math.max(room[plan.side], inside);
    }
    for (const ret of plan.returns ?? []) {
      if (!ret.takesRoom) continue;
      const inside = plan.side === 'left' ? ret.end - run.x : run.x + run.width - ret.start;
      room[plan.side] = Math.max(room[plan.side], inside);
    }
  }
  return room;
}
