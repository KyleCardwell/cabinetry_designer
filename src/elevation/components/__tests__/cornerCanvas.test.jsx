import { beforeEach, describe, expect, it, vi } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { wallRectToScreen, wallToScreen } from '../../canvas/transform.js';
import { DEFAULT_SETTINGS, ELEVATION_BG, ELEVATION_LINE } from '../../model/constants.js';
import { normalizeCornerEnd } from '../../model/cornerEnd.js';
import { cornerReturnLegs } from '../../model/cornerLegs.js';
import { runDoorDetails } from '../../model/doorDetails.js';
import { runPulls } from '../../model/pullLayouts.js';
import { runScene } from '../../model/runScene.js';
import { runSwingMarks } from '../../model/swingMarks.js';
import DoorDetails from '../DoorDetails.jsx';
import FaceOutlines from '../FaceOutlines.jsx';
import NeighborReturns from '../NeighborReturns.jsx';
import PieceRect from '../PieceRect.jsx';
import Pulls from '../Pulls.jsx';
import RunGroup from '../RunGroup.jsx';
import SwingMarks from '../SwingMarks.jsx';
import EndFields from '../properties/EndFields.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  useMemo: (callback) => callback(),
  useState: (initial) => [initial, vi.fn()],
  useRef: (current) => ({ current }),
  useId: () => 'corner',
  useEffect: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Line: 'line', Rect: 'rect', Shape: 'shape', Tag: 'tag', Text: 'text',
}));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const transform = { scale: 8, offsetX: 20, offsetY: 30, wallHeight: 96 };

describe('CC3 step c corner canvas', () => {
  let subject, ownerWall, owner;
  beforeEach(() => {
    owner = run({ autoCount: false,
      items: [{ ...fixed('cc', 36), face: { type: 'door', hinge: 'right' } }, auto('a')],
      style: { cabinetStyleId: 13 }, anchors: { left: true, right: false },
      ends: { left: normalizeCornerEnd({ corner: { kind: 45, depthB: 15 } }), right: { type: 'none' } },
    });
    ownerWall = wall({ runs: [owner],
      connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null },
    });
    subject = room({ swingMarks: true, walls: [ownerWall,
      wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
        connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } },
      }),
    ] });
  });

  const canvas = (extra = {}) => nodes(RunGroup.type({
    room: subject, wall: ownerWall, run: owner, settings: DEFAULT_SETTINGS, transform,
    ...extra,
  }));

  it('CC6.1 anchor 4: draws one full-height inner edge under each owner and return face', () => {
    owner.ends.left.corner.depthB = 24;
    const returnWall = subject.walls[1];
    for (const side of ['left', 'right']) {
      if (side === 'right') {
        owner.grid = run({ items: [auto('a'), fixed('cc', 36)] }).grid;
        owner.anchors = { left: false, right: true };
        owner.ends = { left: { type: 'none' }, right: normalizeCornerEnd({ corner: { kind: 45 } }) };
        ownerWall.connections = { start: null, end: { wallId: 'wall-2', endpoint: 'start' } };
        Object.assign(returnWall, { x1: 144, y1: 0, x2: 144, y2: 144,
          connections: { start: { wallId: 'wall-1', endpoint: 'end' }, end: null } });
      }
      const scene = runScene(subject, ownerWall, owner, DEFAULT_SETTINGS);
      const cc = scene.result.pieces.find(({ id }) => id === 'cc');
      for (const doorsOff of [false, true]) {
        const trees = [canvas({ doorsOff }), nodes(NeighborReturns({
          room: subject, wall: returnWall, settings: DEFAULT_SETTINGS, transform, doorsOff,
        }))];
        const xs = side === 'left' ? [35.25, 108.75] : [cc.x + 0.75, 35.25];
        trees.forEach((tree, index) => {
          const lines = tree.filter(({ type, key }) => type === 'line' && key?.startsWith('corner-side-edge'));
          expect(lines).toHaveLength(1);
          const from = wallToScreen({ x: xs[index], z: owner.z }, transform);
          const to = wallToScreen({ x: xs[index], z: owner.z + owner.height }, transform);
          expect(lines[0].props).toEqual({
            points: [from.x, from.y, to.x, to.y], stroke: ELEVATION_LINE, strokeWidth: 1, listening: false,
          });
          if (!doorsOff) {
            expect(tree.indexOf(lines[0])).toBeLessThan(tree.findIndex(({ type }) => type === FaceOutlines));
            expect(tree.indexOf(lines[0])).toBeLessThan(tree.findIndex(({ type }) => type === DoorDetails));
          }
        });
      }
    }
  });

  it('CC6.1 anchor 6: omits side edges and lines on framed 45s, beaded 45s and Corner 90s', () => {
    for (const [kind, frame] of [[45, { thickness: 0.75, bead: 0 }],
      [45, { thickness: 0.75, bead: 0.125 }], [90, null]]) {
      owner.ends.left.corner = { ...owner.ends.left.corner, kind, depthB: 24 };
      owner._frame = frame;
      const scene = runScene(subject, ownerWall, owner, DEFAULT_SETTINGS);
      expect(scene.faceLayouts.get('cc').corner).not.toHaveProperty('sideEdge');
      const legs = cornerReturnLegs(subject, subject.walls[1], DEFAULT_SETTINGS);
      expect(legs).toHaveLength(1);
      expect(legs[0]).not.toHaveProperty('sideEdge');
      const trees = [canvas(), nodes(NeighborReturns({
        room: subject, wall: subject.walls[1], settings: DEFAULT_SETTINGS, transform, legs,
      }))];
      for (const tree of trees) {
        expect(tree.some(({ key }) => key?.startsWith('corner-side-edge'))).toBe(false);
      }
    }
  });

  it('CC6.1 anchor 5: reads out the uneven Euro 45 ordered door and angle', () => {
    const tree = nodes(EndFields({
      room: subject, wall: ownerWall, run: owner, side: 'left', settings: DEFAULT_SETTINGS,
    }));
    expect(tree.find(({ type }) => type === 'p').props.children.join(''))
      .toContain('door face 22 13/16" (29.1°)');
  });

  it('anchor 1: feeds projected faces with their true width to FaceOutlines', () => {
    const entry = runScene(subject, ownerWall, owner, DEFAULT_SETTINGS).faceLayouts.get('cc');
    const face = entry.faces[0];
    const layer = canvas().find(({ type, key }) => type === FaceOutlines && key === 'faces:cc');
    const [drawn] = layer.props.faces;
    expect(entry.squash.k).toBeCloseTo(0.87416, 5);
    expect(drawn.x).toBeCloseTo(entry.squash.pivot + (face.x - entry.squash.pivot) * entry.squash.k, 10);
    expect(drawn.width).toBeCloseTo(face.width * entry.squash.k, 10);
    expect(drawn).toMatchObject({ trueWidth: face.width, z: face.z, height: face.height });
    expect(drawn.x).toBeGreaterThanOrEqual(15);
    expect(drawn.x + drawn.width).toBeLessThanOrEqual(entry.squash.pivot);
  });

  it('anchor 2: projects door detail rectangles and openings at the same scale', () => {
    const scene = runScene(subject, ownerWall, owner, DEFAULT_SETTINGS);
    const part = runDoorDetails(subject, ownerWall, owner, DEFAULT_SETTINGS, scene).parts
      .find(({ key }) => key === 'cc:r');
    const drawn = canvas().find(({ type }) => type === DoorDetails).props.parts
      .find(({ key }) => key === 'cc:r');
    const { k, pivot } = scene.faceLayouts.get('cc').squash;
    const projected = (rect) => ({ ...rect, x: pivot + (rect.x - pivot) * k, width: rect.width * k });
    expect(drawn.x).toBeCloseTo(pivot + (part.x - pivot) * k, 10);
    expect(drawn.width).toBeCloseTo(part.width * k, 10);
    expect(drawn).toMatchObject({ z: part.z, height: part.height });
    expect(part.openings.length).toBeGreaterThan(0);
    expect(drawn.openings).toEqual(part.openings.map(projected));
    expect(drawn.lines).toEqual(part.lines.map(projected));
    expect(drawn.miters).toEqual(part.miters.map((miter) => ({
      ...miter, x1: pivot + (miter.x1 - pivot) * k, x2: pivot + (miter.x2 - pivot) * k,
    })));
  });

  it('anchor 3: projects pull centres without resizing hardware and starts swings at the drawn hinge', () => {
    const scene = runScene(subject, ownerWall, owner, DEFAULT_SETTINGS);
    const pull = runPulls(subject, ownerWall, owner, DEFAULT_SETTINGS, scene).pulls
      .find(({ pieceId }) => pieceId === 'cc');
    const tree = canvas();
    const drawn = tree.find(({ type }) => type === Pulls).props.pulls
      .find(({ pieceId }) => pieceId === 'cc');
    const { k, pivot } = scene.faceLayouts.get('cc').squash;
    expect(pull.centers.length).toBeGreaterThan(0);
    expect(drawn).toEqual({ ...pull,
      centers: pull.centers.map((center) => ({ ...center, x: pivot + (center.x - pivot) * k })),
    });
    const [face] = tree.find(({ type, key }) => type === FaceOutlines && key === 'faces:cc').props.faces;
    const marks = tree.find(({ type }) => type === SwingMarks).props.marks
      .find(({ pieceId }) => pieceId === 'cc');
    expect(marks.lines).toHaveLength(2);
    for (const line of marks.lines) {
      expect(line.x1).toBeCloseTo(face.x + face.width, 10);
      expect(line.z1).toBe(face.z + face.height / 2);
      expect(line.x2).toBe(face.x);
    }
  });

  it('anchor 4: draws the exposed 90 return panel over the column without intercepting clicks', () => {
    owner.ends.left = normalizeCornerEnd({});
    const tree = canvas();
    const pieces = tree.filter(({ type }) => type === PieceRect);
    const panel = tree.find(({ type, key }) => type === 'rect' && key === 'corner-panel:left');
    expect(panel.props).toMatchObject({
      ...wallRectToScreen({ x: 0, width: 24, z: owner.z, height: owner.height }, transform),
      fill: ELEVATION_BG, opacity: 0.82, stroke: ELEVATION_LINE, strokeWidth: 1, listening: false,
    });
    expect(tree.indexOf(panel)).toBe(tree.indexOf(pieces.at(-1)) + 1);
    expect(pieces.find(({ props }) => props.piece.id === 'cc')).toBeDefined();
  });

  it('anchor 7: leaves ordinary canvas layers on true geometry', () => {
    owner.ends.left = { type: 'none' };
    const scene = runScene(subject, ownerWall, owner, DEFAULT_SETTINGS);
    const details = runDoorDetails(subject, ownerWall, owner, DEFAULT_SETTINGS, scene);
    const pulls = runPulls(subject, ownerWall, owner, DEFAULT_SETTINGS, scene, details);
    const tree = canvas();
    for (const [pieceId, layout] of scene.faceLayouts) {
      expect(tree.find(({ type, key }) => type === FaceOutlines && key === `faces:${pieceId}`)
        .props.faces).toEqual(layout.faces);
    }
    expect(tree.find(({ type }) => type === DoorDetails).props.parts).toEqual(details.parts);
    expect(tree.find(({ type }) => type === Pulls).props.pulls).toEqual(pulls.pulls);
    expect(tree.find(({ type }) => type === SwingMarks).props.marks).toEqual(runSwingMarks(scene.faceLayouts));
    expect(tree.some(({ key }) => key?.startsWith('corner-panel:'))).toBe(false);
  });
});
