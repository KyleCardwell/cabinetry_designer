import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { auto, pin, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { layoutRun } from '../../model/faceLayouts.js';
import { runItems } from '../../model/grid.js';
import { syncRoom } from '../../model/room.js';
import PinSection from '../properties/PinSection.jsx';

vi.mock('react-redux', () => ({ useDispatch: () => vi.fn() }));

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const none = { left: { type: 'none', width: null }, right: { type: 'none', width: null } };
const render = (voidPin) => {
  const source = run({ autoCount: false, ends: none,
    items: [auto('A'), { id: 'V', kind: 'void', width: 30, pin: voidPin }, auto('C')] });
  const synced = syncRoom(room({ walls: [wall({ length: 120, x2: 120, runs: [source] })] }), settings);
  const currentWall = { ...synced.walls[0], length: 120 };
  const currentRun = currentWall.runs[0];
  const item = runItems(currentRun).find(({ id }) => id === 'V');
  const piece = layoutRun(synced, currentWall, currentRun, settings).pieces.find(({ id }) => id === 'V');
  return renderToStaticMarkup(<PinSection room={synced} wall={currentWall} run={currentRun}
    item={item} piece={piece} settings={settings} />);
};

describe('open cells in the Pin section', () => {
  it('offers "Pin open" for an open cell', () => {
    const html = render(null);
    expect(html).toContain('Pin open');
    expect(html).not.toContain('Pin cabinet');
  });

  it('shows the open anchor once pinned', () => {
    const html = render(pin(45));
    expect(html).toContain('Open anchor');
    expect(html).toMatch(/aria-label="Pinned cabinet anchor"/);
  });
});
