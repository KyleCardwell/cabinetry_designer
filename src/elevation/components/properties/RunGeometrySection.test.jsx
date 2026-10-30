import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useDispatch } from 'react-redux';
import { attach, auto, line, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { syncRoom } from '../../model/roomSync.js';
import { centerOverTargets } from '../../model/centerOver.js';
import elevationReducer, {
  attachRunToNewLine, centerRunOnLine, createInitialElevationState, resizeRun, setAttachment,
} from '../../store/elevationSlice.js';
import RunGeometrySection from './RunGeometrySection.jsx';
import LineAttachSection from './LineAttachSection.jsx';

const canCenterOver = (room, wall, run) => centerOverTargets(room, wall.id, run.id, DEFAULT_SETTINGS).length > 0;

vi.mock('react-redux', () => ({ useDispatch: vi.fn(() => vi.fn()) }));
vi.mock('./LineAttachSection.jsx', async (load) => {
  const actual = await load();
  return { ...actual, default: vi.fn(actual.default) };
});

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

describe('LL4 f run layout line properties', () => {
  it('anchor 5: shows the attached Room 8 hood’s line and centre, locks all four positions and leaves width editable', () => {
    const stored = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/room8.json', import.meta.url), 'utf8'));
    const wallId = '14154ec7-5eeb-4511-8d78-5d3da7b09418';
    const runId = 'c1cb2dd4-6ec7-4d67-a1ef-1b5072bcc757';
    const initial = { ...createInitialElevationState(null), rooms: [stored], activeRoomId: stored.id };
    const state = elevationReducer(initial, centerRunOnLine({ wallId, runId,
      targetKey: '8837d4ef-0f27-4ae9-aec6-2d563cadc4b3:e77c1c0c-b386-4716-bc71-0f23ec1e585c', lineId: 'N' }));
    const wall = { ...state.rooms[0].walls.find(({ id }) => id === wallId), length: 235 };
    const hood = wall.runs.find(({ id }) => id === runId);
    const html = render(wall, hood);
    expect(html).toContain('<option value="N" selected="">L1</option>');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Centre<\/button>/);
    expect(html).toContain('Moves with L1. To move this run, change L1 or detach.');
    for (const side of ['left', 'right']) {
      for (const point of ['edge', 'center']) {
        expect(html).toContain(`<div aria-label="Run ${side} ${point} position"`);
        expect(html).not.toMatch(new RegExp(`<input[^>]*aria-label="Run ${side} ${point} position"`));
      }
    }
    expect(html).toMatch(/<input[^>]*aria-label="Run width"/);
    const resized = elevationReducer(state, resizeRun({ wallId, runId, width: 90, grow: 'right' }));
    expect(resized.rooms[0].walls.find(({ id }) => id === wallId).runs.find(({ id }) => id === runId))
      .toMatchObject({ x: 91.5, width: 90, attach: attach('N') });
  });

  it('offers only this face’s lines and dispatches line selection, point, offset, detach and new-line actions', () => {
    const subject = run({ x: 10, width: 30, wallSide: 'back', attach: attach('B') });
    const face = wall({ length: 144, lines: [line('F', 25), line('B', 25, { wallSide: 'back' })], runs: [subject] });
    let state = { ...createInitialElevationState(null), rooms: [room({ walls: [face] })], activeRoomId: 'room-1' };
    const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
    useDispatch.mockReturnValue(dispatch);
    const html = renderToStaticMarkup(<RunGeometrySection wall={face} run={subject}
      settings={DEFAULT_SETTINGS} actionBase={{ wallId: face.id, runId: subject.id }} validateAndDispatch={vi.fn()} />);
    expect(html).toContain('<option value="B" selected="">B</option>');
    expect(html).not.toContain('<option value="F"');
    expect(html).toContain('New line here');
    const props = LineAttachSection.mock.calls.at(-1)[0];
    props.onAttach(attach('B', 'right', -2));
    expect(dispatch.mock.calls.at(-1)[0]).toEqual(setAttachment({ wallId: face.id, runId: subject.id, target: { kind: 'run', runId: subject.id }, attach: attach('B', 'right', -2) }));
    props.onAttach(null);
    expect(state.rooms[0].walls[0].runs[0].attach).toBeUndefined();
    props.onNewLine();
    expect(dispatch.mock.calls.at(-1)[0].type).toBe(attachRunToNewLine.type);
    expect(dispatch.mock.calls.at(-1)[0].payload).toMatchObject({ at: 'center' });
    expect(state.rooms[0].walls[0].runs[0].attach.at).toBe('center');
  });
});
