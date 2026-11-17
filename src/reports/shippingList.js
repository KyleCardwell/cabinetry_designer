import { withBuildCache } from '../elevation/model/buildCache.js';
import { wallLength } from '../elevation/model/geometry.js';
import { partNumbers } from '../elevation/model/partNumbers.js';
import { wallBuiltEnds } from '../elevation/model/wallEndPanels.js';
import { doorLines } from '../elevation/model/items/doorLines.js';
import { itemReport, itemReportContext } from '../elevation/model/items/itemReport.js';
import { EPSILON } from '../elevation/model/items/shared.js';
import { formatSize } from '../elevation/model/items/format.js';
import { itemFacts } from '../elevation/model/items/itemFacts.js';

/** One planned-length reason per island/peninsula wall, shared by both faces. */
function wallLengthNotes(room, settings) {
  if (settings.runFlex === 0) return [];
  return (room.walls ?? []).flatMap((wall) => {
    if (wall.thickness !== 0) return [];
    const { start, end } = wallBuiltEnds(wall);
    if (Math.abs(start + end) <= EPSILON) return [];
    const planned = wallLength(wall);
    const attached = ['start', 'end'].some((endpoint) => wall.connections?.[endpoint] || wall.landings?.[endpoint]);
    const name = wall.name?.trim() || (attached ? 'Peninsula' : 'Island');
    return [`${name} ${formatSize(planned + start + end)} (planned ${formatSize(planned)})`];
  });
}

export function shippingList(room, settings, shop = settings) {
  return withBuildCache(() => {
    const { parts, warnings } = partNumbers(room, settings);
    const numbers = new Map(parts.map(({ key, number }) => [key, number]));
    const numberOf = (id) => numbers.get(id);
    const factsFor = itemFacts(room, settings);
    const doorItems = new Map(doorLines(room, settings).items
      .filter(({ kind }) => kind !== 'face').map((item) => [item.key, item]));
    const ctx = itemReportContext(room, settings, { shop, numberOf, doorItems });
    const rows = parts
      .sort((a, b) => a.number - b.number).map((part) => ({
        number: part.number, key: part.key, kind: part.kind,
        ...itemReport(part, factsFor(part), ctx),
      }));
    rows.push({ number: null, key: 'adjustable-shelves', kind: 'adjustable_shelves',
      description: 'Adjustable Shelves', notes: [], size: '' });
    return { rows, wallNotes: wallLengthNotes(room, settings), roomNote: room.reportNote?.trim() || null, warnings };
  }, room);
}
