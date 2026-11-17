import { formatSize } from './format.js';
import { TYPE_LABELS } from './shared.js';

export const legItems = {
  kinds: ['leg', 'leg_panel', 'leg_filler'],
  description(part, context) {
    const type = TYPE_LABELS[context.run?.cabinetTypeId];
    switch (part.kind) {
      case 'leg': return context.leg.leg.height === 'feet' ? 'Foot' : 'Leg';
      case 'leg_panel': return `${type} End Panel`;
      case 'leg_filler': return `${type} Filler`;
    }
  },
  size(part, context) {
    if (part.kind === 'leg_panel' || part.kind === 'leg_filler') {
      const { depth, bounds, thickness, orderedDepth, returns, returnDepth } = context.fill;
      return part.kind === 'leg_filler' ? formatSize(bounds.width, bounds.height, orderedDepth)
        : formatSize(depth, bounds.height, returns?.length ? returnDepth : thickness);
    }
    const { w, h, d } = context.leg.size;
    return formatSize(w, h, d);
  },
  notes(part, context) {
    const groups = {};
    if (part.kind === 'leg_panel') {
      const count = context.fill.returns?.length ?? 0;
      groups[8] = count === 2 ? 'C-shape' : count === 1 ? 'L-shape' : null;
    } else if (part.kind === 'leg_filler') {
      const { orderedDepth, thickness } = context.fill;
      groups[8] = orderedDepth > thickness ? 'L-shape' : null;
    }
    return groups;
  },
};
