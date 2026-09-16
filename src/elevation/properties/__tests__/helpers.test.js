import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import {
  lastCabinetItem,
  lastRunItem,
  prepareRunUpdate,
  resolveSelectedPiece,
} from '../helpers.js';

function run(overrides = {}) {
  return {
    id: 'run-1',
    cabinetTypeId: CABINET_TYPE_IDS.BASE,
    x: 0,
    width: 60,
    z: 4,
    height: 30.5,
    depth: 24,
    ends: {
      left: { type: 'filler', width: null },
      right: { type: 'filler', width: null },
    },
    autoCount: false,
    maxCabinetWidth: null,
    items: [],
    ...overrides,
  };
}

describe('properties helpers', () => {
  it('builds a validated run patch without mutating the stored run', () => {
    const selected = run();
    const wall = { length: 120, height: 96, runs: [selected] };
    const result = prepareRunUpdate(wall, selected, DEFAULT_SETTINGS, { x: 12, width: 72 });

    expect(result.validation).toEqual({ ok: true, reason: null });
    expect(result.patchedRun).toMatchObject({ x: 12, width: 72 });
    expect(selected).toMatchObject({ x: 0, width: 60 });
  });

  it('reports an invalid prospective run patch', () => {
    const selected = run();
    const wall = { length: 120, height: 96, runs: [selected] };
    const result = prepareRunUpdate(wall, selected, DEFAULT_SETTINGS, { width: 121 });

    expect(result.validation).toEqual({ ok: false, reason: 'out-of-bounds' });
  });

  it('resolves stored items and derived end pieces', () => {
    const selected = run({ items: [{ id: 'cab-1', kind: 'cabinet', width: null }] });
    const layout = {
      pieces: [
        { id: 'run-1:left', role: 'end-left' },
        { id: 'cab-1', role: 'item' },
      ],
    };

    expect(resolveSelectedPiece(selected, layout, 'cab-1')).toMatchObject({
      item: selected.items[0],
      side: null,
    });
    expect(resolveSelectedPiece(selected, layout, 'run-1:left')).toMatchObject({
      item: null,
      side: 'left',
    });
    expect(resolveSelectedPiece(selected, layout, 'missing')).toBeNull();
  });

  it('finds the final item and the final cabinet independently', () => {
    const selected = run({
      items: [
        { id: 'cab-1', kind: 'cabinet', width: null },
        { id: 'fill-1', kind: 'filler', width: 3 },
      ],
    });

    expect(lastRunItem(selected).id).toBe('fill-1');
    expect(lastCabinetItem(selected).id).toBe('cab-1');
    expect(lastRunItem(run())).toBeNull();
    expect(lastCabinetItem(run())).toBeNull();
  });
});
