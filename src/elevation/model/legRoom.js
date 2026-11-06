import { frontDepth, runBackOffset } from './corners.js';
import { teamDoorStyle } from './doorStyles.js';

/** Depth and along-run fill plans, independent of leg height and support. */
export function legFillPlans(run, settings) {
  if (!run.legs?.some(({ fill }) => fill)) return [];
  const F = frontDepth(run, settings);
  const B = runBackOffset(run);
  const legs = (run.legs ?? []).flatMap((leg, offset) => {
    const shape = (settings.shapes ?? []).find(({ id }) => id === leg.shapeId);
    if (!shape) return [];
    const t0 = leg.yFrom === 'front' ? -leg.y : F - B + leg.y - shape.box.d;
    const front = F - t0;
    return [{ leg, index: offset + 1, front, back: front - shape.box.d }];
  });
  const partnerOf = (entry) => legs.filter((other) => other !== entry && other.leg.from === entry.leg.from
    && (entry.leg.yFrom === 'front' ? other.front < entry.front : other.back > entry.back))
    .sort((a, b) => entry.leg.yFrom === 'front' ? b.front - a.front : a.back - b.back)[0];
  const partners = new Map(legs.map((entry) => [entry, partnerOf(entry)]));
  return legs.filter(({ leg }) => leg.fill).map((entry) => {
    const { leg, index } = entry;
    const { fill } = leg;
    const partner = partners.get(entry);
    const warn = (code, extra = {}) => ({ leg, index, warning: { code, type: fill.type, ...extra } });
    if (leg.yFrom === 'back' && partner?.leg.fill && partner.leg.yFrom === 'front'
      && partners.get(partner) === entry) return warn('leg-fill-shared', { other: partner.index });
    const back = fill.past ? B : leg.yFrom === 'front' ? partner?.front ?? B : entry.front;
    const front = fill.past ? F : leg.yFrom === 'front' ? entry.back : partner?.back ?? F;
    const depth = front - back;
    if (depth <= 1e-6) return warn('leg-fill-no-depth');
    const width = fill.type === 'panel'
      ? run._endThickness?.[leg.from] ?? teamDoorStyle(settings).thickness
      : fill.thickness ?? settings.fillerThickness;
    const inset = fill.inset ?? settings.legPanelReveal;
    return { leg, index, type: fill.type, side: leg.from,
      u0: leg.from === 'left' ? run.x - leg.x + inset : run.x + run.width + leg.x - inset - width,
      width, back, front, depth,
      takesRoom: leg.takesRoom !== false && !run._pinSplit?.[leg.from]
        && Math.min(front, F) - Math.max(back, B) > 1e-6 };
  });
}

/** Room reserved inside each run end by legs whose depth overlaps the run. */
export function legRoom(run, settings) {
  const room = { left: 0, right: 0 };
  const F = frontDepth(run, settings);
  const B = runBackOffset(run);
  for (const leg of run.legs ?? []) {
    if (run._pinSplit?.[leg.from] || leg.takesRoom === false) continue;
    const shape = (settings.shapes ?? []).find(({ id }) => id === leg.shapeId);
    if (!shape) continue;
    const b = shape.box;
    const t0 = leg.yFrom === 'front' ? -leg.y : F - B + leg.y - b.d;
    const f = F - t0;
    const k = f - b.d;
    if (Math.min(f, F) - Math.max(k, B) <= 1e-6) continue;
    room[leg.from] = Math.max(room[leg.from], b.w - leg.x);
  }
  for (const plan of legFillPlans(run, settings)) {
    if (plan.warning || !plan.takesRoom) continue;
    const inside = plan.side === 'left' ? plan.u0 + plan.width - run.x : run.x + run.width - plan.u0;
    room[plan.side] = Math.max(room[plan.side], inside);
  }
  return room;
}
