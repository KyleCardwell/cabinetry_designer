import { beforeEach, describe, expect, it, vi } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { wallRectToScreen } from '../../canvas/transform.js';
import { DEFAULT_SETTINGS, ELEVATION_BG, ELEVATION_LINE } from '../../model/constants.js';
import { normalizeCornerEnd } from '../../model/cornerEnd.js';
import { runDoorDetails } from '../../model/doorDetails.js';
import { runPulls } from '../../model/pullLayouts.js';
import { runScene } from '../../model/runScene.js';
import { runSwingMarks } from '../../model/swingMarks.js';
import DoorDetails from '../DoorDetails.jsx';
import FaceOutlines from '../FaceOutlines.jsx';
import PieceRect from '../PieceRect.jsx';
import Pulls from '../Pulls.jsx';
import RunGroup from '../RunGroup.jsx';
import SwingMarks from '../SwingMarks.jsx';

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

  const canvas = () => nodes(RunGroup.type({
    room: subject, wall: ownerWall, run: owner, settings: DEFAULT_SETTINGS, transform,
  }));

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
