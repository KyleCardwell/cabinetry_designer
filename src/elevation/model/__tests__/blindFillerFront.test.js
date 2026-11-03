import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auto, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { planRunPieces } from '../planPieces.js';
import { resolveWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';

function planOf(source, settings = DEFAULT_SETTINGS, wallIndex = 0) {
  const current = syncRoom(source, settings);
  const view = resolveWall(current, current.walls[wallIndex], 'front');
  const subject = view.runs[0];
  const scene = runScene(current, view, subject, settings);
  return {
    subject,
    plan: planRunPieces(current, view, subject, settings, scene.result, scene.faceLayouts),
  };
}

describe('FX9 c: blind filler in front of the blind box', () => {
  it.each([
    [1, true, false, 'right', 24, 24.8125],
    [2, false, false, 'right', 24, 24.8125],
    [3, true, true, 'right', 24, 24.8125],
    [4, false, true, 'right', 24.0625, 24.875],
    [5, false, false, 'left', 23.1875, 24],
  ])('anchor %i: checks Room 10 BT filler depth', (_anchor, tees, doors, side, back, front) => {
    const source = JSON.parse(readFileSync(new URL('./fixtures/room10bt.json', import.meta.url), 'utf8'));
    const host = source.walls[1].runs[0];
    if (!tees) delete host.tFiller;
    if (doors) {
      for (const { node: column } of host.grid.cells) {
        for (const { node } of column.cells) node.face = { type: 'door', size: null };
      }
    }
    // Keep the complete stored room for its corner coverage and select Wall 2's run.
    const { plan } = planOf(source, DEFAULT_SETTINGS, 1);
    expect(plan.faces.find(({ key }) => key === `${host.id}:${side}`))
      .toMatchObject({ kind: 'filler', back, front });
    expect(plan.returns.some(({ key }) => key.startsWith(`${host.id}:right:`))).toBe(false);
  });

  it.each(['left', 'right'])('clamps a thicker %s blind filler without changing its thickness', (side) => {
    const settings = { ...DEFAULT_SETTINGS, fillerThickness: 1 };
    const source = room({ walls: [wall({ runs: [run({
      width: 36, autoCount: false, items: [{ ...auto('cab'), face: { type: 'open', size: null } }],
      blind: { [side]: 42 },
      ends: { left: { type: 'filler' }, right: { type: 'filler' }, [side]: { type: 'blind' } },
    })] })] });
    const { subject, plan } = planOf(source, settings);
    expect(plan.faces.find(({ key }) => key === `${subject.id}:${side}`))
      .toMatchObject({ kind: 'filler', back: 24, front: 25 });
    expect(plan.returns.some(({ key }) => key.startsWith(`${subject.id}:${side}:`))).toBe(false);
  });

  it('keeps an uncovered blind panel at the face plane even beside open cells', () => {
    const source = room({ walls: [
      wall({ id: 'host', x2: 120,
        connections: { start: { wallId: 'neighbor', endpoint: 'start' }, end: null },
        runs: [run({ x: 25, width: 24, height: 86, autoCount: false,
          items: [{ ...auto('cab'), face: { type: 'open', size: null } }],
          blind: { left: 42 },
          ends: { left: { type: 'blind', width: 3 }, right: { type: 'none' } },
        })],
      }),
      wall({ id: 'neighbor', x2: 0, y2: 96,
        connections: { start: { wallId: 'host', endpoint: 'start' }, end: null },
        runs: [run({ id: 'neighbor-run', depth: 12, z: 54, height: 36,
          anchors: { left: false, right: true },
        })],
      }),
    ] });
    const { subject, plan } = planOf(source);
    expect(plan.faces.find(({ key }) => key === `${subject.id}:left`))
      .toMatchObject({ kind: 'panel', back: 24.0625, front: 24.875 });
    expect(plan.returns.some(({ key }) => key.startsWith(`${subject.id}:left:`))).toBe(false);
  });
});
