import { DEFAULT_SETTINGS } from '../../constants.js';
import { roomWith } from '../helpers/showThroughRoom.js';

export const notchedFrameSettings = { ...DEFAULT_SETTINGS, runFlex: 0 };

// ST2 base anchor: three equal boxes, no seam gap, B's top dropped two inches.
export function notchedFrameRoom(offsets = { top: { value: 2, source: 'manual' } }) {
  const room = roomWith(['A', 'B', 'C'].map((id) => ({
    id, face: { type: 'door' }, ...(id === 'B' ? offsets : {}),
  })), { width: 90 });
  Object.assign(room.walls[0].runs[0], {
    x: 0, style: { cabinetStyleId: 14 }, seamGap: 0,
    _frame: { thickness: 0.8125, drop: 0, bead: 0 },
  });
  return room;
}
