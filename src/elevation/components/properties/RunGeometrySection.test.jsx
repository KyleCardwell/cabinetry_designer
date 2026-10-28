import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { auto, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { syncRoom } from '../../model/roomSync.js';
import RunGeometrySection from './RunGeometrySection.jsx';

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
