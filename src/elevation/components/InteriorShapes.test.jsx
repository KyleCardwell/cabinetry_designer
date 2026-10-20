import { describe, expect, it, vi } from 'vitest';
import { Group, Line, Rect, Text } from 'react-konva';
import InteriorShapes from './InteriorShapes.jsx';
import { CABINET_TYPE_IDS } from '../model/constants.js';
import { newAccessory } from '../model/accessories.js';
import { wallInteriorData } from '../model/shelves.js';
import { wallRectToScreen } from '../canvas/transform.js';
import { run, stateWithRun } from '../store/__tests__/helpers/sliceFixtures.js';

vi.mock('react', async (original) => ({ ...await original(), useRef: (current) => ({ current }) }));
vi.mock('react-konva', () => ({ Group: 'group', Line: 'line', Rect: 'rect', Text: 'text' }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const transform = { scale: 8, offsetX: 20, offsetY: 30, wallHeight: 120 };
const rod = { ...newAccessory([], 'FR'), name: 'Fixed rod',
  size: { width: 'section', height: 1.25, depth: 1.25 }, lengthDeduction: 0.25 };
const tray = { ...newAccessory([], 'TR'), name: 'Tray' };
const hook = { ...newAccessory([], 'HK'), name: 'Hook', size: { width: 3, height: 2, depth: 3 } };

function closet(items, library = [rod, tray, hook]) {
  const state = stateWithRun(run({
    cabinetTypeId: CABINET_TYPE_IDS.TALL, x: 10, z: 12, width: 24, height: 84, autoCount: false,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: [{ id: 'cabinet', kind: 'cabinet', width: 24, face: { type: 'door', hinge: 'left' },
      interior: { accessories: items } }],
  }));
  state.settings.accessories = library;
  const room = state.rooms[0];
  const data = wallInteriorData(room, room.walls[0], 'front', state.settings);
  const entry = data.interiors.get('cabinet');
  const accessory = data.accessories.get('cabinet').get('r');
  const render = (extra = {}) => nodes(InteriorShapes({
    entries: [entry], accessories: data.accessories, drawnPieces: [], transform, selectedPieceId: 'cabinet', ...extra,
  }));
  return { render, entry, accessory, section: entry.sections[0] };
}
const placed = (shapes) => shapes.filter(({ type, key }) => type === Group && String(key).startsWith('placed-accessory:'));

describe('IN13a step d doors-off placed accessories', () => {
  it('anchor 4: draws one section-width rod at 40, labels it once, and keeps the unplaced tray in the list', () => {
    const { render, accessory, section } = closet([{ accessoryId: 'FR', fromBottom: 40 }, { accessoryId: 'TR' }]);
    expect(accessory.items[0].rect).toEqual({ x: section.x, z: section.z + 39.375, width: 22.5, height: 1.25 });
    const shapes = render();
    expect(placed(shapes)).toHaveLength(1);
    const box = nodes(placed(shapes)).find(({ type }) => type === Rect);
    expect(box.props).toMatchObject({ ...wallRectToScreen(accessory.items[0].rect, transform),
      stroke: '#7dd3fc', strokeWidth: 1, fillEnabled: false, listening: false });
    const label = nodes(placed(shapes)).find(({ type }) => type === Text);
    expect(label.props).toMatchObject({ ...wallRectToScreen(accessory.items[0].rect, transform),
      text: 'Fixed rod', fontSize: 10, align: 'center', verticalAlign: 'middle', listening: false });
    expect(shapes.filter(({ type, key }) => type === Text && String(key).startsWith('accessory:'))
      .map(({ props }) => props.text)).toEqual(['Tray']);
    expect(shapes.filter(({ type, props }) => type === Text && props.text === 'Fixed rod')).toHaveLength(1);
  });

  it('anchor 5: draws an unsized tray at 30 as a section-wide line with its quantity label above', () => {
    const { render, section } = closet([{ accessoryId: 'TR', fromBottom: 30, qty: 3 }]);
    const shapes = nodes(placed(render()));
    const line = wallRectToScreen({ ...section, z: section.z + 30, height: 0 }, transform);
    expect(shapes.find(({ type }) => type === Line).props).toMatchObject({
      points: [line.x, line.y, line.x + line.width, line.y], stroke: '#7dd3fc', strokeWidth: 1, listening: false,
    });
    expect(shapes.find(({ type }) => type === Text).props).toMatchObject({
      x: line.x + 3, y: line.y - 13, text: '3 × Tray', fontSize: 10, listening: false,
    });
    expect(render().filter(({ type, key }) => type === Text && String(key).startsWith('accessory:'))).toHaveLength(0);
  });

  it('fits labels inside, then beside boxes, hides cramped labels and preserves warning and selection colors', () => {
    const { render, section } = closet([{ accessoryId: 'HK', fromBottom: 40 }]);
    const shapes = nodes(placed(render()));
    const box = shapes.find(({ type }) => type === Rect).props;
    const label = shapes.find(({ type }) => type === Text).props;
    expect(label.x).toBe(box.x + box.width + 3);
    expect(label.y).toBe(box.y + (box.height - 10) / 2);
    expect(label.x + label.text.length * 6).toBeLessThan(wallRectToScreen(section, transform).x + section.width * transform.scale);
    expect(nodes(placed(render({ selectedPieceId: null }))).filter(({ type }) => [Rect, Text].includes(type))
      .map(({ props }) => props.stroke ?? props.fill)).toEqual(['#64748b', '#64748b']);
    const outside = closet([{ accessoryId: 'HK', fromBottom: section.height - 0.5 }]);
    expect(nodes(placed(outside.render())).filter(({ type }) => [Rect, Text].includes(type))
      .every(({ props }) => (props.stroke ?? props.fill) === '#f59e0b')).toBe(true);
    const whole = closet([{ accessoryId: 'FR', fromBottom: 40 }, { accessoryId: 'TR', fromBottom: 30 }],
      [{ ...rod, wholeSection: true }, tray]);
    expect(nodes(placed(whole.render())).filter(({ type }) => [Rect, Line, Text].includes(type))
      .every(({ props }) => (props.stroke ?? props.fill) === '#f59e0b')).toBe(true);
    const tiny = nodes(placed(render({ transform: { ...transform, scale: 0.1 } })));
    expect(tiny.some(({ type }) => type === Rect)).toBe(true);
    expect(tiny.some(({ type }) => type === Text)).toBe(false);
    const ignored = closet([{ accessoryId: 'gone', fromBottom: 30 }, { accessoryId: 'CU', fromBottom: 30 }],
      [{ ...hook, id: 'CU', attachesTo: 'drawer_box' }]);
    expect(placed(ignored.render())).toHaveLength(0);
    expect(placed(render()).every(({ props }) => props.listening === false)).toBe(true);
  });
});
