import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { attach, auto, line, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { layoutRun } from '../../model/faceLayouts.js';
import { runItems } from '../../model/grid.js';
import { syncRoom } from '../../model/room.js';
import ColumnLineSection from '../properties/ColumnLineSection.jsx';

vi.mock('react-redux', () => ({ useDispatch: () => vi.fn() }));

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const none = { left: { type: 'none', width: null }, right: { type: 'none', width: null } };
const render = (voidAttach) => {
  const source = run({ autoCount: false, ends: none,
    items: [auto('A'), { id: 'V', kind: 'void', width: 30 }, auto('C')] });
  if (voidAttach) source.grid.cols[1].attach = voidAttach;
  const synced = syncRoom(room({ walls: [wall({ length: 120, x2: 120, lines: [line('L1', 45)], runs: [source] })] }), settings);
  const currentWall = { ...synced.walls[0], length: 120 };
  const currentRun = currentWall.runs[0];
  const item = runItems(currentRun).find(({ id }) => id === 'V');
  const piece = layoutRun(synced, currentWall, currentRun, settings).pieces.find(({ id }) => id === 'V');
  return renderToStaticMarkup(<ColumnLineSection wall={currentWall} run={currentRun} item={item} piece={piece} />);
};

describe('open cells on layout lines (LL4 b)', () => {
  it('offers a layout line for an open cell', () => {
    const html = render(null);
    expect(html).toContain('Layout line');
    expect(html).toMatch(/aria-label="Column layout line"/);
    expect(html).not.toContain('Moves with');
  });

  it('shows the point and the open note once attached', () => {
    const html = render(attach('L1'));
    expect(html).toMatch(/aria-label="Column line offset"/);
    expect(html).toContain('Moves with L1. To move this open, change L1 or detach.');
  });
});
