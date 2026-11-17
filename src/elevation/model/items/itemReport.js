import { bandItems } from './bandItems.js';
import { drawerItems } from './drawerItems.js';
import { endPieceItems } from './endPieceItems.js';
import { frameItems } from './frameItems.js';
import { legItems } from './legItems.js';
import { wallPanelItems } from './wallPanelItems.js';

const producers = new Map();
for (const producer of [bandItems, legItems, wallPanelItems, drawerItems, endPieceItems, frameItems]) {
  for (const kind of producer.kinds) {
    if (producers.has(kind)) throw new Error(`Duplicate item producer kind: ${kind}`);
    producers.set(kind, producer);
  }
}

export function producerFor(item) {
  return producers.get(item.source === 'corner_return' ? 'corner_return' : item.kind);
}

export function itemReportContext(room, settings, { shop, numberOf, doorItems }) {
  return { room, settings, shop, numberOf, doorNotes: (key) => doorItems.get(key)?.notes };
}

export function itemDescription(item, facts, ctx, fallback) {
  const entry = ctx.room.reportParts?.[item.key];
  const name = entry?.name?.trim();
  if (name) return name;
  const description = (producerFor(item) ?? fallback).description(item, facts, ctx);
  if (item.kind === 'molding') return description;
  return entry?.shopBuilt || facts.style?.id === 'sheet' ? `Shop-built ${description}` : description;
}

/** Keep the specified note order, with free text last (#14). */
export function orderedNotes(groups) {
  return Object.entries(groups).sort(([a], [b]) => Number(a) - Number(b))
    .flatMap(([, notes]) => notes).map((note) => note?.trim()).filter(Boolean);
}

export function itemReport(item, facts, ctx, fallback) {
  const producer = producerFor(item) ?? fallback;
  return {
    description: itemDescription(item, facts, ctx, fallback),
    size: producer.size(item, facts, ctx),
    notes: orderedNotes({ 10: ctx.doorNotes(item.key), ...producer.notes?.(item, facts, ctx),
      14: [ctx.room.reportParts?.[item.key]?.note] }),
  };
}
