import { bandItems } from './bandItems.js';
import { cabinetItems } from './cabinetItems.js';
import { drawerItems } from './drawerItems.js';
import { endPieceItems } from './endPieceItems.js';
import { frameItems } from './frameItems.js';
import { formatSize } from './format.js';
import { legItems } from './legItems.js';
import { wallPanelItems } from './wallPanelItems.js';

const producers = new Map();
for (const producer of [bandItems, legItems, wallPanelItems, drawerItems, endPieceItems, frameItems, cabinetItems]) {
  for (const kind of producer.kinds) {
    if (producers.has(kind)) throw new Error(`Duplicate item producer kind: ${kind}`);
    producers.set(kind, producer);
  }
}

const GENERIC = {
  description(item) {
    return item.kind.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  },
  size(item, facts) {
    if (!Number.isFinite(item.width) || !Number.isFinite(item.height)) return '';
    const rect = facts.rectangle?.();
    const depth = rect ? rect.front - rect.back : undefined;
    return formatSize(...[item.width, item.height, depth].filter(Number.isFinite));
  },
};

export function producerFor(item) {
  return producers.get(item.source === 'corner_return' ? 'corner_return' : item.kind);
}

export function itemReportContext(room, settings, { shop, numberOf, doorItems }) {
  return { room, settings, shop, numberOf, doorNotes: (key) => doorItems.get(key)?.notes };
}

export function itemDescription(item, facts, ctx) {
  const entry = ctx.room.reportParts?.[item.key];
  const name = entry?.name?.trim();
  if (name) return name;
  const description = (producerFor(item) ?? GENERIC).description(item, facts, ctx);
  if (item.kind === 'molding') return description;
  return entry?.shopBuilt || facts.style?.id === 'sheet' ? `Shop-built ${description}` : description;
}

/** Keep the specified note order, with free text last (#14). */
export function orderedNotes(groups) {
  return Object.entries(groups).sort(([a], [b]) => Number(a) - Number(b))
    .flatMap(([, notes]) => notes).map((note) => note?.trim()).filter(Boolean);
}

export function itemReport(item, facts, ctx) {
  const producer = producerFor(item) ?? GENERIC;
  return {
    description: itemDescription(item, facts, ctx),
    size: producer.size(item, facts, ctx),
    notes: orderedNotes({ 10: ctx.doorNotes(item.key), ...producer.notes?.(item, facts, ctx),
      14: [ctx.room.reportParts?.[item.key]?.note] }),
  };
}
