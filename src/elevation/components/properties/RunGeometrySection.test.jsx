import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { auto, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { syncRoom } from '../../model/roomSync.js';
import { centerOverTargets } from '../../model/centerOver.js';
import RunGeometrySection from './RunGeometrySection.jsx';

const canCenterOver = (room, wall, run) => centerOverTargets(room, wall.id, run.id, DEFAULT_SETTINGS).length > 0;

vi.mock('react-redux', () => ({ useDispatch: () => vi.fn() }));

const render = (wall, run) => renderToStaticMarkup(<RunGeometrySection
  wall={wall} run={run} settings={DEFAULT_SETTINGS} actionBase={{}} validateAndDispatch={vi.fn()}
/>);

describe('FX5 run depth properties', () => {
  it('anchor 8: shows the Room 9b back run depth read-only with the auto tag and note', () => {
    const stored = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/room9b.json', import.meta.url), 'utf8'));
    const synced = syncRoom(stored, { ...DEFAULT_SETTINGS, ...stored.settingsOverrides });
    const wall = synced.walls.find(({ runs }) => runs.some(({ id }) => id.startsWith('c3e90115')));
    const back = wall.runs.find(({ id }) => id.startsWith('c3e90115'));
    const html = render({ ...wall, length: 61 }, back);
    expect(html).toMatch(/Depth<\/span><span[^>]*>auto<\/span>/);
    expect(html).toMatch(/<div aria-label="Run depth"[^>]*>13\/16&quot;<\/div>/);
    expect(html).toContain('Follows its panels');
    expect(html).not.toMatch(/<input[^>]*aria-label="Run depth"/);
  });

  it('keeps cabinet and side-panel run depths editable', () => {
    for (const items of [[auto('cabinet')], [{ ...auto('side'), kind: 'panel' }]]) {
      const html = render(wall({ length: 144 }), run({ items }));
      expect(html).toMatch(/<input[^>]*aria-label="Run depth"/);
      expect(html).not.toContain('Follows its panels');
    }
  });
});

describe('CV1 step b: Center over… button', () => {
  const stored = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/room8.json', import.meta.url), 'utf8'));
  const settings = { ...DEFAULT_SETTINGS, ...stored.settingsOverrides };
  const synced = syncRoom(stored, settings);
  const wall4 = synced.walls.find(({ name }) => name === 'Wall 4');
  const hood = wall4.runs.find(({ id }) => id.startsWith('c1cb2dd4'));
  const html = (room, wall, run) => renderToStaticMarkup(<RunGeometrySection
    room={room} canCenter={canCenterOver(room, wall, run)} wall={wall} run={run} settings={settings} actionBase={{}} validateAndDispatch={vi.fn()}
  />);

  it('shows the button for the Room 8 hood', () => {
    expect(html(synced, { ...wall4, length: 235 }, hood)).toContain('aria-label="Center run over a cell"');
  });

  it('anchor 7: hides it for the only run on a wall', () => {
    const lone = run({ id: 'lone', items: [auto('a')] });
    const only = wall({ length: 144, runs: [lone] });
    expect(html({ ...synced, walls: [only] }, only, lone)).not.toContain('Center run over a cell');
  });
});
