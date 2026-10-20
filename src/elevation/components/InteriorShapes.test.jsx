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

function shoeCabinet(height = 30.5) {
  const state = stateWithRun(run({
    x: 40, z: 12, width: 24, height, autoCount: false,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: [{ id: 'cabinet', kind: 'cabinet', width: 24, face: { type: 'door', size: null },
      interior: { shelves: { shoe: 2 } } }],
  }));
  const room = state.rooms[0];
  const data = wallInteriorData(room, room.walls[0], 'front', state.settings);
  const entry = data.interiors.get('cabinet');
  return { entry, shelf: data.shelves.get('cabinet').get('r'), render: (extra = {}) => nodes(InteriorShapes({
    entries: [entry], shelves: data.shelves, drawnPieces: [], transform, selectedPieceId: 'cabinet', ...extra,
  })) };
}
const shoeShapes = (shapes) => nodes(shapes.filter(({ key }) => String(key).startsWith('shoe-shelf:')));

describe('IN13b step d doors-off shoe shelves', () => {
  it('anchor 7: draws two centered shoe fronts at the anchored heights with centered labels', () => {
    const { entry, render } = shoeCabinet();
    const shapes = shoeShapes(render());
    const rects = shapes.filter(({ type }) => type === Rect);
    const labels = shapes.filter(({ type }) => type === Text);
    expect(rects).toHaveLength(2);
    expect(labels).toHaveLength(2);
    rects.forEach(({ props }, index) => {
      const section = entry.sections[0];
      expect(props.x).toBeCloseTo((section.x + (section.width - 22.375) / 2) * transform.scale + transform.offsetX);
      expect(props.width / transform.scale).toBe(22.375);
      expect(props.height / transform.scale).toBeCloseTo(1.467221, 6);
      const z = transform.wallHeight - (props.y - transform.offsetY + props.height) / transform.scale;
      expect(z - entry.box.z).toBeCloseTo([0.75, 8.283511][index], 6);
      expect(props).toMatchObject({ stroke: '#94a3b8', strokeWidth: 0.75, fillEnabled: false, listening: false });
      expect(labels[index].props).toMatchObject({ x: props.x, y: props.y, width: props.width, height: props.height,
        text: 'shoe', fontSize: 10, fill: '#94a3b8', align: 'center', verticalAlign: 'middle', listening: false });
    });
    expect(shoeShapes(render({ selectedPieceId: null })).filter(({ type }) => type === Rect)).toHaveLength(2);
  });

  it('hides labels that cannot fit and starts flat gap labels above the shoe stack', () => {
    const { render, shelf, entry } = shoeCabinet(84);
    for (const scale of [0.1, 1]) {
      const shapes = shoeShapes(render({ transform: { ...transform, scale } }));
      expect(shapes.filter(({ type }) => type === Rect)).toHaveLength(2);
      expect(shapes.filter(({ type }) => type === Text)).toHaveLength(0);
    }
    const shapes = render();
    const labels = shapes.filter(({ type, key }) => type === Text && String(key).startsWith('shelf-gap:'));
    expect(labels).toHaveLength(shelf.count + 1);
    expect(labels[0].props).toMatchObject(wallRectToScreen({
      x: entry.sections[0].x, z: shelf.shoe.top, width: entry.sections[0].width, height: shelf.gap,
    }, transform));
    const tiny = render({ transform: { ...transform, scale: 0.1 } });
    expect(tiny.some(({ key }) => String(key).startsWith('shelf-gap:'))).toBe(false);
    expect(render({ selectedPieceId: null }).some(({ key }) => String(key).startsWith('shelf-gap:'))).toBe(false);
    const narrow = { ...entry, sections: entry.sections.map((section) => ({ ...section, width: 2 })) };
    const narrowShelves = new Map([['cabinet', new Map([['r', { ...shelf, shoe: { ...shelf.shoe, width: 2 } }]])]]);
    expect(shoeShapes(render({ entries: [narrow], shelves: narrowShelves })).some(({ type }) => type === Text)).toBe(false);
  });
});

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
