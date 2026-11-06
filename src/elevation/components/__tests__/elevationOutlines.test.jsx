import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Rect, Shape, Text } from 'react-konva';
import { auto, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS, ELEVATION_BG, ELEVATION_LINE, KIND_COLORS } from '../../model/constants.js';
import FrameOutline, { FRAME_STROKE } from '../FrameOutline.jsx';
import LegShapes from '../LegShapes.jsx';
import PieceRect from '../PieceRect.jsx';
import RunGroup from '../RunGroup.jsx';
import WallEndPanelShapes from '../WallEndPanelShapes.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  useMemo: (callback) => callback(),
  useRef: (current) => ({ current }),
  useState: (initial) => [initial, vi.fn()],
}));
vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Line: 'line', Rect: 'rect',
  Shape: 'shape', Tag: 'tag', Text: 'text',
}));
vi.mock('../../canvas/cursor.js', async (original) => ({
  ...await original(), useCursorKeys: () => ({ request: vi.fn(), release: vi.fn() }),
}));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const transform = { scale: 4, offsetX: 20, offsetY: 30, wallHeight: 96 };
const piece = { id: 'piece', kind: 'cabinet', x: 0, z: 4, width: 24, height: 30.5, auto: true };

describe('EC1 elevation outlines', () => {
  it('anchor 1: fills cabinetry with the canvas background at its existing opacity and frame line color', () => {
    expect(ELEVATION_BG).toBe('#111827');
    expect(ELEVATION_LINE).toBe('#e7e5e4');
    expect(FRAME_STROKE).toBe(ELEVATION_LINE);
    expect(FrameOutline({ region: piece, transform }).props.stroke).toBe(ELEVATION_LINE);
    for (const kind of ['cabinet', 'filler', 'end_panel', 'panel']) {
      const rect = nodes(PieceRect({ piece: { ...piece, kind }, transform })).find(({ type }) => type === Rect);
      expect(rect.props).toMatchObject({ fill: ELEVATION_BG, opacity: 0.82, stroke: ELEVATION_LINE, strokeWidth: 1 });
    }
    const fixed = nodes(PieceRect({ piece: { ...piece, auto: false }, transform }));
    expect(fixed.find(({ type }) => type === Text).props).toMatchObject({ text: '*', fill: '#f8fafc' });
  });

  it('anchor 2: fills corner fillers with the same background', () => {
    const rect = nodes(PieceRect({ piece: { ...piece, kind: 'filler' }, cornerFiller: true, transform }))
      .find(({ type }) => type === Rect);
    expect(rect.props).toMatchObject({ fill: ELEVATION_BG, opacity: 0.82, stroke: ELEVATION_LINE });
  });

  it('anchor 3: preserves selected, warning and error outlines', () => {
    for (const [state, stroke, strokeWidth] of [
      [{ selected: true }, '#7dd3fc', 3],
      [{ warning: true }, '#f59e0b', 2],
      [{ error: true }, '#ef4444', 2],
    ]) {
      const rect = nodes(PieceRect({ piece, transform, ...state })).find(({ type }) => type === Rect);
      expect(rect.props).toMatchObject({ fill: ELEVATION_BG, opacity: 0.82, stroke, strokeWidth });
    }
  });

  it('anchor 4: preserves framed and ghost hit fills and suppressed default outlines', () => {
    for (const state of [{ framed: true }, { ghost: true }]) {
      const rect = nodes(PieceRect({ piece, transform, ...state })).find(({ type }) => type === Rect);
      expect(rect.props).toMatchObject({ fill: 'rgba(0, 0, 0, 0.001)', stroke: undefined, opacity: 0.82 });
    }
    const selectedGhost = nodes(PieceRect({ piece, transform, ghost: true, selected: true }))
      .find(({ type }) => type === Rect);
    expect(selectedGhost.props).toMatchObject({ fill: ELEVATION_BG, stroke: '#7dd3fc' });
  });

  it('anchor 5: keeps voids and shelf cells hollow and preserves the void stroke', () => {
    for (const kind of ['void', 'shelves']) {
      const rect = nodes(PieceRect({ piece: { ...piece, kind }, transform })).find(({ type }) => type === Rect);
      expect(rect.props).toMatchObject({ fill: 'transparent', stroke: kind === 'void' ? KIND_COLORS.void : ELEVATION_LINE });
    }
  });

  it('anchor 6: fills a leg silhouette with the background and a light outline', () => {
    const shapes = nodes(LegShapes({ legs: [{ leg: { id: 'leg' }, outlines: [
      { closed: true, outline: [[0, 0], [3, 0], [3, 30], [0, 30]] },
    ] }], transform }));
    expect(shapes.find(({ type }) => type === Shape).props)
      .toMatchObject({ fill: ELEVATION_BG, fillEnabled: true, stroke: ELEVATION_LINE, strokeWidth: 1 });
  });

  it('anchor 7: keeps wall end panel selection outlines and fill opacity', () => {
    const r = run({ anchors: { left: true, right: false }, items: [auto('cabinet')] });
    const w = wall({ runs: [r], endPanels: { start: { width: 0.75 }, end: null } });
    for (const selectedEndpoint of [null, 'start']) {
      const [panel] = WallEndPanelShapes({ room: room({ walls: [w] }), wall: w,
        settings: DEFAULT_SETTINGS, transform, selectedEndpoint });
      const rect = nodes(panel.type(panel.props)).find(({ type, props }) => type === Rect && props.opacity === 0.55);
      expect(rect.props).toMatchObject({ fill: ELEVATION_BG, opacity: 0.55,
        stroke: selectedEndpoint ? '#7dd3fc' : ELEVATION_LINE, strokeWidth: selectedEndpoint ? 3 : 1 });
    }
  });

  it('anchor 8: keeps stone tops gray while wood tops and toe kicks use background fills', () => {
    for (const top of ['wood', 'stone']) {
      const r = run({ top, autoCount: false, items: [auto('cabinet')] });
      const w = wall({ runs: [r] });
      for (const preview of [false, true]) {
        for (const doorsOff of [false, true]) {
          const tree = nodes(RunGroup.type({ room: room({ walls: [w] }), wall: w, run: r,
            settings: DEFAULT_SETTINGS, transform, preview, doorsOff }));
          expect(tree[0].props.opacity).toBe(preview ? 0.72 : 1);
          expect(tree.find(({ key }) => key === 'toeKick:0').props)
            .toMatchObject({ fill: ELEVATION_BG, stroke: ELEVATION_LINE, strokeWidth: 1 });
          const band = tree.find(({ type, props }) => type === Rect && props.stroke === '#64748b');
          expect(band.props).toMatchObject({ fill: top === 'stone' ? '#cbd5e1' : ELEVATION_BG,
            opacity: 0.9, stroke: '#64748b' });
        }
      }
    }
  });

  it('anchor 9: no elevation canvas component imports kind colors from model constants', () => {
    const directory = new URL('../', import.meta.url);
    for (const name of readdirSync(directory, { recursive: true }).filter((name) => name.endsWith('.jsx')
      && !name.endsWith('.test.jsx') && !name.split('/').includes('__tests__'))) {
      const source = readFileSync(new URL(name, directory), 'utf8');
      expect(source, name).not.toMatch(/import\s+[^;]*\bKIND_COLORS\b[^;]*from\s+['"][^'"]*constants\.js['"]/);
    }
  });
});
