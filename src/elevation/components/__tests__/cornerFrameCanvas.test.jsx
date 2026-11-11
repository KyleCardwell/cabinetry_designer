import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Rect } from 'react-konva';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { wallRectToScreen } from '../../canvas/transform.js';
import { DEFAULT_SETTINGS, ELEVATION_BG } from '../../model/constants.js';
import { normalizeCornerEnd } from '../../model/cornerEnd.js';
import { cornerReturnLegs } from '../../model/cornerLegs.js';
import { defaultPick, pickStack } from '../../model/pick.js';
import { resolveWall, syncRoom } from '../../model/room.js';
import { runScene } from '../../model/runScene.js';
import DoorDetails from '../DoorDetails.jsx';
import FaceOutlines from '../FaceOutlines.jsx';
import FrameOutline from '../FrameOutline.jsx';
import NeighborReturns from '../NeighborReturns.jsx';
import Pulls from '../Pulls.jsx';
import RunGroup from '../RunGroup.jsx';
import { PickOutline } from '../SelectionPicker.jsx';
import SwingMarks from '../SwingMarks.jsx';

vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Layer: 'layer', Line: 'line', Rect: 'rect',
  Shape: 'shape', Tag: 'tag', Text: 'text',
}));
vi.mock('react', async (original) => ({
  ...await original(),
  useMemo: (fn) => fn(),
  useState: (value) => [value, vi.fn()],
  useEffect: vi.fn(),
  useId: () => 'test',
  useRef: (current) => ({ current }),
}));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const transform = { scale: 8, offsetX: 20, offsetY: 30, wallHeight: 96 };
const S = { ...DEFAULT_SETTINGS, runFlex: 0 };

describe('CC6 step f corner frame canvas', () => {
  let subject;
  beforeEach(() => {
    subject = room({ style: { cabinetStyleId: 14 }, swingMarks: true, walls: [
      wall({ runs: [run({ autoCount: false, width: 144, items: [fixed('cc', 36), auto('a')],
        anchors: { left: true, right: false },
        ends: { left: normalizeCornerEnd({}), right: { type: 'none' } } })],
      connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } }),
      wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
        connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } } }),
    ] });
  });
  const views = () => {
    const synced = syncRoom(subject, S);
    return { synced, owner: resolveWall(synced, synced.walls[0]),
      returning: resolveWall(synced, synced.walls[1]) };
  };
  const ownerCanvas = (synced, owner, doorsOff = false) => nodes(RunGroup.type({
    room: synced, wall: owner, run: owner.runs[0], settings: S, transform, doorsOff,
    showDimensions: false, selectedRun: false, onSelectRun: vi.fn(), onSelectPiece: vi.fn(),
  }));

  it('draws owner 90 and 45 frames and openings after ordinary regions, including opaque miter stiles', () => {
    for (const kind of [90, 45]) {
      subject.walls[0].runs[0].ends.left.corner.kind = kind;
      const { synced, owner } = views();
      const scene = runScene(synced, owner, owner.runs[0], S);
      const tree = ownerCanvas(synced, owner);
      const frames = tree.filter(({ type }) => type === FrameOutline);
      expect(frames.map(({ props }) => props.region.id)).toEqual(['frame:a', 'cc:frame']);
      const projected = scene.cornerFrames[0].owner;
      expect(frames[1].props.region).toMatchObject(projected);
      const outline = nodes(FrameOutline(frames[1].props));
      expect(outline.filter(({ type, props }) => type === Rect && props.fill === ELEVATION_BG))
        .toHaveLength(projected.members.length);
      for (const member of projected.members) {
        expect(outline.some(({ type, props }) => type === Rect && props.fill === ELEVATION_BG
          && props.x === wallRectToScreen(member, transform).x
          && props.width === wallRectToScreen(member, transform).width)).toBe(true);
      }
      for (const opening of projected.openings) {
        expect(tree.filter(({ type }) => type === Rect).map(({ props }) => props))
          .toContainEqual(expect.objectContaining({
            ...wallRectToScreen(opening, transform), fillEnabled: false, listening: false,
          }));
      }
    }
  });

  it('draws return frames over the panel edge, read-only, and keeps frames when drawing switches are off', () => {
    for (const kind of [90, 45]) {
      subject.walls[0].runs[0].ends.left.corner.kind = kind;
      const { synced, returning } = views();
      const leg = cornerReturnLegs(synced, returning, S)[0];
      const props = { room: synced, wall: returning, settings: S, transform, shapes: [], legs: [leg] };
      const tree = nodes(NeighborReturns(props));
      const frame = tree.find(({ type }) => type === FrameOutline);
      expect(frame.props.region).toBe(leg.frame);
      const panel = tree.find(({ type, props }) => type === Rect && props.opacity === 0.82);
      expect(tree.indexOf(panel)).toBeLessThan(tree.indexOf(frame));
      const frameNodes = nodes(FrameOutline(frame.props));
      expect(frameNodes.filter(({ type }) => type === Rect).every(({ props }) => props.listening === false))
        .toBe(true);
      expect(tree.filter(({ type }) => type === Rect).map(({ props }) => props))
        .toContainEqual(expect.objectContaining(wallRectToScreen(leg.frame.openings[0], transform)));
      for (const doorsOff of [false, true]) {
        Object.assign(synced, { doorDetails: false, showPulls: false, swingMarks: false, doorStyleTags: false });
        const off = nodes(NeighborReturns({ ...props, doorsOff }));
        expect(off.filter(({ type }) => type === FrameOutline)).toHaveLength(1);
        expect(off.some(({ type }) => [DoorDetails, Pulls, SwingMarks].includes(type))).toBe(false);
        expect(off.some(({ type }) => type === FaceOutlines)).toBe(!doorsOff);
      }
    }
  });

  it('hovers the full frame rect and selects its owner from either wall with doors on or off', () => {
    for (const kind of [90, 45]) {
      subject.walls[0].runs[0].ends.left.corner.kind = kind;
      const { synced, owner, returning } = views();
      const frame = runScene(synced, owner, owner.runs[0], S).cornerFrames[0];
      for (const [view, projection] of [[owner, frame.owner], [returning, frame.return]]) {
        const rail = projection.members[0];
        const point = { x: rail.x + rail.width / 2, z: rail.z + rail.height / 2 };
        for (const doorsOff of [false, true]) {
          const target = defaultPick(pickStack(synced, view, S, point, { doorsOff }));
          expect(target).toMatchObject({ key: 'cc:frame', rect: projection,
            selection: { cornerOf: { wallId: 'wall-1', runId: 'run-1', side: 'left' } } });
          expect(PickOutline({ candidate: target, transform }).props)
            .toMatchObject({ ...wallRectToScreen(projection, transform), listening: false });
          expect(ownerCanvas(synced, owner, doorsOff).filter(({ type }) => type === FrameOutline))
            .toHaveLength(2);
        }
      }
    }
  });
});
