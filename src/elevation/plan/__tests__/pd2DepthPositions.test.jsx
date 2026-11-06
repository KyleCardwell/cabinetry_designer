import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { Line, Text } from 'react-konva';
import { auto, room, run, wall } from '../../../test/builders.js';
import { elevationToPlan, planPointToWallX } from '../../model/geometry.js';
import { frontDepth } from '../../model/corners.js';
import { wallSideFrame } from '../../model/wallSides.js';
import { syncRoom } from '../../model/room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';
import { PlanRunDepth } from '../PlanRunFootprint.jsx';
import PlanScene from '../PlanScene.jsx';
import usePlanSceneData from '../usePlanSceneData.js';

vi.mock('react', async (original) => ({ ...await original(), useMemo: (callback) => callback() }));
vi.mock('react-konva', () => ({ Circle: 'circle', Group: 'group', Label: 'label', Line: 'line', Tag: 'tag', Text: 'text' }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const document = normalizeElevationDocument(JSON.parse(readFileSync(
  new URL('../../model/__tests__/fixtures/golden.json', import.meta.url), 'utf8',
)));
const { settings } = document;
const golden = (prefix) => syncRoom(document.rooms.find(({ name }) => name.startsWith(prefix)), settings);
const sceneProps = (room, scale = 1, factor = 1) => ({
  ...usePlanSceneData({ room, walls: room.walls, sceneRoom: room, settings }),
  walls: room.walls, room, settings, scale, text: { label: factor, dimension: 1 }, selection: {}, tool: 'select',
});
const depths = (props) => nodes(PlanScene(props)).filter(({ type }) => type === PlanRunDepth);

it('anchor G6: separates depth lines by at least 28px and clears text boxes from texts and lines', () => {
  const input = sceneProps(golden('G6'));
  const entries = depths(input).filter(({ props }) => ['ea4373', 'b1ec1b', '677ec7']
    .some((prefix) => props.run.id.startsWith(prefix))).map(({ props }) => {
    const label = nodes(PlanRunDepth(props)).find(({ type }) => type === Text).props;
    const x = planPointToWallX(props.frame, label);
    const depth = (label.x - props.frame.leftPoint.x) * props.frame.n.x
      + (label.y - props.frame.leftPoint.y) * props.frame.n.y;
    return { ...props, box: { left: x - label.fontSize / 2, right: x + label.fontSize / 2,
      bottom: depth - label.width / 2, top: depth + label.width / 2 } };
  });
  expect(entries).toHaveLength(3);
  for (let i = 0; i < entries.length; i += 1) {
    const { box, position } = entries[i];
    for (const other of entries.slice(i + 1)) {
      expect(Math.abs(position.x - other.position.x)).toBeGreaterThanOrEqual(28);
      expect(Math.min(box.right, other.box.right) > Math.max(box.left, other.box.left)
        && Math.min(box.top, other.box.top) > Math.max(box.bottom, other.box.bottom)).toBe(false);
    }
    for (const other of entries.filter((_, j) => j !== i)) {
      expect(other.position.x > box.left && other.position.x < box.right
        && Math.min(box.top, frontDepth(other.run, settings))
          > Math.max(box.bottom, other.run._plane?.offset ?? 0)).toBe(false);
    }
  }
});

it('anchor G2: draws one island chain, two texts and opposite pop-outs only from the front run', () => {
  for (const scale of [1, 4, 100]) {
    const input = sceneProps(golden('G2'), scale);
    const pair = depths(input).filter(({ props }) => props.position?.pair);
    expect(pair).toHaveLength(2);
    const front = pair.find(({ props }) => props.run.id === props.position.pair.front);
    const back = pair.find(({ props }) => props.run.id === props.position.pair.back);
    expect(PlanRunDepth(back.props)).toBeNull();
    const tree = nodes(PlanRunDepth(front.props));
    const labels = tree.filter(({ type }) => type === Text);
    expect(labels.map(({ props }) => props.text)).toEqual(['3/4', '24 13/16']);
    const lines = tree.filter(({ key }) => key?.startsWith('depth-line:'));
    expect(lines).toHaveLength(scale === 1 ? 1 : scale === 4 ? 2 : 3);
    const leaders = tree.filter(({ type, props }) => type === Line && props.stroke === '#64748b');
    expect(leaders).toHaveLength(scale === 1 ? 2 : scale === 4 ? 1 : 0);
    const { frame, position } = front.props;
    for (const { props, key } of labels) {
      const dx = planPointToWallX(frame, props) - position.x;
      const isFront = key.endsWith(position.pair.front);
      if (scale === 1 || (scale === 4 && !isFront)) expect(dx * (isFront ? 1 : -1)).toBeGreaterThan(0);
      else expect(dx).toBeCloseTo(0);
    }
    const ticks = tree.filter(({ key }) => key?.startsWith('depth-tick:'));
    expect(ticks).toHaveLength(3);
    const lineLength = lines.reduce((sum, { props: { points } }) => (
      sum + Math.hypot(points[2] - points[0], points[3] - points[1])
    ), 0);
    expect(lineLength).toBeCloseTo(25.5625 - (scale === 1 ? 0 : scale === 4 ? 17.6 : 1.018));
  }
});

it('anchor G4: preserves all depth text props captured before PD2', () => {
  for (const [scale, factor] of [[1, 1], [2, 2], [4, 1]]) {
    const labels = depths(sceneProps(golden('G4'), scale, factor))
      .flatMap(({ props }) => nodes(PlanRunDepth(props))).filter(({ type }) => type === Text);
    expect(labels.map(({ props }) => props)).toEqual([scale === 4 ? {
      x: 13.5, y: -10.09375, width: 17.6, offsetX: 8.8, offsetY: 1.625, rotation: -90,
      align: 'center', text: '24 13/16', fontSize: 3.25, fill: '#e2e8f0', listening: false,
    } : {
      x: 53, y: -10.09375, width: 70.4, offsetX: 35.2, offsetY: 6.5, rotation: -90,
      align: 'center', text: '24 13/16', fontSize: 13, fill: '#e2e8f0', listening: false,
    }]);
  }
});

it('ticks both wall faces and each run front on thick, angled and flipped island walls', () => {
  for (const flipped of [false, true]) {
    for (const thickness of [0, 4.5]) {
      const input = room({ walls: [wall({ x1: 0, y1: 0, x2: 60, y2: 80, thickness, flipped, runs: [
        run({ id: 'front', width: 100, depth: 24, items: [{ ...auto('f'), kind: 'panel' }] }),
        run({ id: 'back', wallSide: 'back', width: 100, depth: 12, items: [{ ...auto('b'), kind: 'panel' }] }),
      ] })] });
      const props = depths(sceneProps(input)).find(({ props }) => props.run.id === 'front').props;
      const tree = nodes(PlanRunDepth(props));
      const backFrame = wallSideFrame(input, input.walls[0], 'back');
      const backX = planPointToWallX(backFrame, elevationToPlan(props.frame, props.position.x, 0));
      const expected = [elevationToPlan(backFrame, backX, 12), elevationToPlan(backFrame, backX, 0),
        ...(thickness ? [elevationToPlan(props.frame, props.position.x, 0)] : []),
        elevationToPlan(props.frame, props.position.x, 24)];
      const ticks = tree.filter(({ key }) => key?.startsWith('depth-tick:'));
      expect(ticks).toHaveLength(thickness ? 4 : 3);
      ticks.forEach(({ props: { points } }, i) => {
        expect((points[0] + points[2]) / 2).toBeCloseTo(expected[i].x);
        expect((points[1] + points[3]) / 2).toBeCloseTo(expected[i].y);
      });
      const lines = tree.filter(({ key }) => key?.startsWith('depth-line:'));
      expect(lines).toHaveLength(1);
      expect(lines[0].props.points).toEqual([expected[0].x, expected[0].y, expected.at(-1).x, expected.at(-1).y]);
      const labels = tree.filter(({ type }) => type === Text);
      expect(labels).toHaveLength(2);
      for (const { props: label, key } of labels) {
        const isFront = key.endsWith('front');
        const segmentFrame = isFront ? props.frame : backFrame;
        const center = elevationToPlan(segmentFrame, isFront ? props.position.x : backX, isFront ? 12 : 6);
        const across = (label.x - center.x) * props.frame.n.x + (label.y - center.y) * props.frame.n.y;
        expect(across).toBeCloseTo(0);
        expect((planPointToWallX(props.frame, label) - props.position.x) * (isFront ? 1 : -1)).toBeGreaterThan(0);
      }
    }
  }
});
