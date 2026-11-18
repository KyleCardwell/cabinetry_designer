import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { doorOrder } from '../../../reports/doorOrder.js';
import { reportHeader } from '../../../reports/header.js';
import { proBoxOrder } from '../../../reports/proBoxOrder.js';
import { shippingList } from '../../../reports/shippingList.js';
import { toDrawingPayload } from '../drawingPayload.js';
import { partNumbers } from '../partNumbers.js';
import { roomDiagnostics, syncRoom } from '../roomSync.js';
import { goldenRooms } from './helpers/goldenRooms.js';

const ids = vi.hoisted(() => ({ count: 0 }));
vi.mock('uuid', () => ({ v4: () => `outputs-golden-${(ids.count += 1)}` }));
beforeEach(() => {
  ids.count = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
});
afterEach(() => { vi.useRealTimers(); });

// Fixed report inputs; reportHeader still derives construction and drawer specs per room,
// just as ReportsDialog does. Local date components avoid timezone-dependent date labels.
const HEADER = {
  project: { name: 'Golden Job', address: '100 Golden Street' },
  roomName: 'Golden Room',
  jobNumber: 'GC0-001',
  revision: 'GC0',
  date: new Date(2026, 0, 1, 12),
};

function sorted(value) {
  if (value instanceof Map) return sorted(Object.fromEntries(value));
  if (value instanceof Set) return [...value].map(sorted);
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
  }
  return value;
}
const stable = (value) => `${JSON.stringify(sorted(value), null, 2)}\n`;
const kinds = (parts) => parts.reduce((counts, { kind }) => {
  counts[kind] = (counts[kind] ?? 0) + 1;
  return counts;
}, {});

function coverage({ payload, parts, shipping, doorOrder, proBox, diagnostics }) {
  const messages = [parts, shipping, doorOrder, proBox, ...Object.values(diagnostics)];
  return {
    elevations: payload.elevations.map(({ wallId, side, parts }) => ({ wallId, side, partKinds: kinds(parts) })),
    planPartKinds: kinds(payload.plan.parts),
    counts: {
      parts: parts.parts.length,
      shippingRows: shipping.rows.length,
      doorOrderLines: doorOrder.pages.reduce((count, page) =>
        count + page.sections.reduce((sum, section) => sum + section.lines.length, 0), 0),
      proBoxLines: proBox.lines.length,
      warnings: messages.reduce((sum, output) => sum + (output.warnings?.length ?? 0), 0),
      errors: messages.reduce((sum, output) => sum + (output.errors?.length ?? 0), 0),
    },
  };
}

const goldenPayloads = [];
let outputFailure;
describe.sequential('GC0 golden outputs', () => {
  for (const { key, name, load } of goldenRooms()) {
    it(`${key} ${name} outputs`, async (context) => {
      if (outputFailure) context.skip();
      let outputs;
      try {
        const { room, settings, shop } = load();
        const synced = syncRoom(room, settings);
        const header = reportHeader({
          ...HEADER,
          room: { ...synced, name: HEADER.roomName },
          settings: { ...settings, report: { ...settings.report, jobNumber: HEADER.jobNumber } },
        });
        outputs = {
          payload: toDrawingPayload(synced, settings),
          parts: partNumbers(synced, settings),
          shipping: shippingList(synced, settings, shop),
          doorOrder: doorOrder(synced, settings),
          proBox: proBoxOrder(synced, settings, header),
          diagnostics: roomDiagnostics(room, settings),
        };
        outputs.coverage = coverage(outputs);
      } catch (error) {
        outputFailure = error;
        error.message = `${key} ${name}: ${error.message}`;
        throw error;
      }
      goldenPayloads.push({ key, payload: outputs.payload });
      // Compute every output before writing any snapshot for this room.
      for (const [file, value] of Object.entries(outputs)) {
        const path = fileURLToPath(new URL(`./__golden__/${key}/${file}.json`, import.meta.url));
        await expect(stable(value)).toMatchFileSnapshot(path);
      }
    });
  }
});

it('places every golden elevation badge without overlapping another box (GC5)', () => {
  expect(goldenPayloads).toHaveLength(goldenRooms().length);
  for (const { key, payload } of goldenPayloads) {
    for (const elevation of payload.elevations) {
      const badges = elevation.partNumbers;
      for (let i = 0; i < badges.length; i += 1) {
        for (let j = i + 1; j < badges.length; j += 1) {
          const a = badges[i];
          const b = badges[j];
          const overlap = Math.abs(a.x - b.x) < (a.width + b.width) / 2 - 1e-6
            && Math.abs(a.z - b.z) < (a.height + b.height) / 2 - 1e-6;
          expect(overlap, `${key} ${elevation.letter}: ${a.key} / ${b.key}`).toBe(false);
        }
      }
    }
  }
});
