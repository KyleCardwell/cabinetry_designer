import { wallPanelThickness } from '../panelThickness.js';
import { formatSize } from './format.js';
import { nosingNote, orderedThickness } from './shared.js';

export const wallPanelItems = {
  kinds: ['wall_end_panel'],
  description() {
    return 'Wall End Panel';
  },
  size(part, context, { room, settings }) {
    const { wall, endpoint, style } = context;
    const width = context.fit.hi === undefined ? part.width : context.fit.hi - context.fit.lo;
    return formatSize(width, part.height, context.fit.returns?.length ? context.fit.returnDepth
      : orderedThickness(wallPanelThickness(room, wall, settings)[endpoint], style));
  },
  notes(part, context, { room, settings }) {
    const { wall, endpoint, style } = context;
    const groups = {};
    const count = context.fit.returns?.length ?? 0;
    groups[8] = count === 2 ? 'C-shape' : count === 1 ? 'L-shape' : null;
    const drawn = wallPanelThickness(room, wall, settings)[endpoint];
    groups[11] = nosingNote(drawn, style);
    return groups;
  },
};
