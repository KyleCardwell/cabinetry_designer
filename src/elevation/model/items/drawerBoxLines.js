import { activeBuildCache, withBuildCache } from '../buildCache.js';
import { wallInteriorData } from '../shelves.js';
import { WALL_SIDES } from '../wallSides.js';

/** Ungrouped drawer box order lines keyed to their owning shipping part. */
export function drawerBoxLines(room, settings) {
  return withBuildCache(() => activeBuildCache.byRoom('drawerBoxLines', room, settings, () => {
    const items = [];
    const add = (box, itemId, rollout = false) => {
      const key = box.kind === 'rot' ? `${itemId}:rot:${box.path}` : itemId;
      items.push({ key, box, rollout });
    };
    for (const wall of room?.walls ?? []) {
      for (const side of WALL_SIDES) {
        const data = wallInteriorData(room, wall, side, settings);
        for (const [itemId, { boxes }] of data.boxes) {
          for (const box of boxes) add(box, itemId);
        }
        for (const [itemId, sections] of data.rollouts) {
          for (const { rollouts } of sections.values()) {
            for (const rollout of rollouts) add(rollout, itemId, true);
          }
        }
      }
    }
    return items;
  }), room);
}
