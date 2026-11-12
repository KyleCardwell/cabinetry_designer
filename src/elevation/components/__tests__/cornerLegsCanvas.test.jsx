import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Group, Line, Rect } from 'react-konva';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { wallRectToScreen, wallToScreen } from '../../canvas/transform.js';
import { DEFAULT_SETTINGS, ELEVATION_BG, ELEVATION_LINE } from '../../model/constants.js';
import { normalizeCornerEnd } from '../../model/cornerEnd.js';
import { cornerReturnLegs } from '../../model/cornerLegs.js';
import { syncRoom } from '../../model/room.js';
import { runSwingMarks } from '../../model/swingMarks.js';
import DoorDetails from '../DoorDetails.jsx';
import FaceOutlines from '../FaceOutlines.jsx';
import NeighborReturns from '../NeighborReturns.jsx';
import Pulls from '../Pulls.jsx';
import SwingMarks from '../SwingMarks.jsx';
import WallOverlayLayer from '../WallOverlayLayer.jsx';

vi.mock('react-konva', () => ({
  Group: 'group', Layer: 'layer', Line: 'line', Rect: 'rect', Shape: 'shape', Text: 'text',
}));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const transform = { scale: 8, offsetX: 20, offsetY: 30, wallHeight: 96 };

describe('CC4 step c return leg canvas', () => {
  let subject, returnWall, owner;
  beforeEach(() => {
    owner = run({ autoCount: false,
      items: [{ ...fixed('cc', 36), face: { type: 'door', hinge: 'right' } }, auto('a')],
      style: { cabinetStyleId: 13 }, anchors: { left: true, right: false },
      ends: { left: normalizeCornerEnd({}), right: { type: 'none' } },
    });
    returnWall = wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
      connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } },
    });
    subject = room({ swingMarks: true, walls: [
      wall({ runs: [owner], connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } }),
      returnWall,
    ] });
  });
  const props = () => ({ room: subject, wall: returnWall, settings: DEFAULT_SETTINGS, transform });
  const canvas = (extra = {}) => nodes(NeighborReturns({ ...props(), ...extra }));

  it('anchor 5: draws the leg and its faces before the owner section, including beside a return run', () => {
    returnWall.runs = [run({ id: 'return', anchors: { left: false, right: true } })];
    const leg = cornerReturnLegs(subject, returnWall, DEFAULT_SETTINGS)[0];
    const tree = canvas();
    const rect = tree.find(({ type }) => type === Rect);
    const firstReturn = tree.find(({ type }) => type === Group);
    expect(rect.props).toMatchObject({
      ...wallRectToScreen(leg.rect, transform), fill: ELEVATION_BG,
      stroke: ELEVATION_LINE, strokeWidth: 1, listening: false,
    });
    expect(firstReturn).toBeDefined();
    expect(tree.indexOf(rect)).toBeLessThan(tree.indexOf(firstReturn));
    const faces = tree.find(({ type }) => type === FaceOutlines);
    expect(faces.props.faces).toEqual(leg.faceLayout.faces);
    expect(tree.indexOf(faces)).toBeLessThan(tree.indexOf(firstReturn));
    expect(nodes(FaceOutlines(faces.props)).filter(({ type }) => type === Rect)
      .every(({ props }) => props.listening === false)).toBe(true);
    const doorsOff = canvas({ doorsOff: true });
    expect(doorsOff.find(({ type }) => type === Rect).props).toEqual(rect.props);
    expect(doorsOff.some(({ type }) => [FaceOutlines, Pulls, DoorDetails, SwingMarks].includes(type))).toBe(false);
  });

  it('anchor 6: passes overlay selection and highlights only the matching owner, run and side', () => {
    const selection = { cornerOf: { wallId: 'wall-1', runId: owner.id, side: 'left' } };
    const overlay = nodes(WallOverlayLayer({
      ...props(), selection, hovered: null, viewport: { width: 1200, height: 800 },
    }));
    const neighbor = overlay.find(({ type }) => type === NeighborReturns);
    expect(neighbor.props.selection).toBe(selection);
    const rect = nodes(NeighborReturns(neighbor.props)).find(({ type }) => type === Rect);
    expect(rect.props).toMatchObject({ stroke: '#7dd3fc', strokeWidth: 3 });
    for (const mismatch of [{ wallId: 'other' }, { runId: 'other' }, { side: 'right' }]) {
      expect(canvas({ selection: { cornerOf: { ...selection.cornerOf, ...mismatch } } })
        .find(({ type }) => type === Rect).props).toMatchObject({ stroke: ELEVATION_LINE, strokeWidth: 1 });
    }
  });

  it('feeds 90 and 45 details, pulls and swings at drawn size and honours each drawing switch', () => {
    for (const kind of [90, 45]) {
      owner.ends.left.corner.kind = kind;
      const leg = cornerReturnLegs(subject, returnWall, DEFAULT_SETTINGS)[0];
      const tree = canvas({ legs: [leg] });
      const rects = tree.filter(({ type }) => type === Rect);
      expect(rects[1].props).toMatchObject({
        ...wallRectToScreen(leg.returnPanel, transform), fill: ELEVATION_BG,
        opacity: 0.82, stroke: ELEVATION_LINE, listening: false,
      });
      expect(tree.find(({ type }) => type === DoorDetails).props).toMatchObject({
        parts: leg.doorDetails.parts, warnings: leg.doorDetails.warnings, showDetails: true, showTags: false,
      });
      expect(tree.find(({ type }) => type === Pulls).props.pulls).toEqual(leg.pulls);
      expect(tree.find(({ type }) => type === SwingMarks).props.marks)
        .toEqual(runSwingMarks(new Map([[leg.columnId, leg.faceLayout]])));
    }
    for (const [field, Component] of [['doorDetails', DoorDetails], ['showPulls', Pulls], ['swingMarks', SwingMarks]]) {
      subject[field] = false;
      expect(canvas().some(({ type }) => type === Component)).toBe(false);
      expect(canvas().some(({ type }) => type === FaceOutlines)).toBe(true);
      subject[field] = true;
    }
  });

  it('CC7 anchor 3: draws E90 leg bands and E45 turn lines even with doors off', () => {
    const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
    for (const kind of [90, 45]) {
      owner.ends.left.corner.kind = kind;
      const synced = syncRoom(subject, settings);
      const tree = nodes(NeighborReturns({ room: synced, wall: synced.walls[1], settings,
        transform, doorsOff: true }));
      for (const [bandKind, bounds, fill, stroke, opacity] of [
        ['countertop', { x: 106.4375, z: 34.5, width: 11.9375, height: 1.5 }, '#cbd5e1', '#64748b', 0.9],
        ['toe_kick', { x: 108.1875, z: 0, width: 14.8125, height: 4 }, ELEVATION_BG, ELEVATION_LINE, 1],
      ]) {
        const band = tree.find(({ key }) => key === `corner-leg:wall-1:run-1:left:${bandKind}`);
        expect(band).toBeDefined();
        expect(nodes(band).find(({ type }) => type === Rect).props).toMatchObject({
          ...wallRectToScreen(bounds, transform), fill, stroke, opacity, strokeWidth: 1, listening: false,
        });
        if (kind === 90) expect(nodes(band).some(({ type }) => type === Line)).toBe(false);
      }
      if (kind === 45) {
        const top = tree.find(({ key }) => key === 'corner-leg:wall-1:run-1:left:countertop');
        const from = wallToScreen({ x: 107.6268, z: 34.5 }, transform);
        const to = wallToScreen({ x: 107.6268, z: 36 }, transform);
        expect(nodes(top).find(({ type }) => type === Line).props).toMatchObject({
          points: [expect.closeTo(from.x, 2), from.y, expect.closeTo(to.x, 2), to.y],
          stroke: '#64748b', strokeWidth: 0.5, opacity: 0.9, listening: false,
        });
      }
    }
  });

  it('uses run band styles for wood, furniture base and moldings without making them pickable', () => {
    owner.top = 'wood';
    const leg = cornerReturnLegs(subject, returnWall, DEFAULT_SETTINGS)[0];
    const kinds = ['countertop', 'furniture_base', 'top_mold', 'crown'];
    leg.bands = kinds.map((kind) => ({ id: `band:${kind}`, kind,
      x: 108, z: 34.5, width: 12, height: 1.5,
      lines: [{ x1: 110, z1: 34.5, x2: 111, z2: 36 }],
    }));
    const tree = canvas({ legs: [leg] });
    for (const kind of kinds) {
      const band = nodes(tree.find(({ key }) => key === `band:${kind}`));
      const stroke = kind === 'countertop' ? '#64748b' : ELEVATION_LINE;
      const opacity = kind === 'crown' ? 0.82 : 0.9;
      expect(band.find(({ type }) => type === Rect).props).toMatchObject({
        fill: ELEVATION_BG, stroke, opacity, strokeWidth: 1, listening: false,
      });
      const from = wallToScreen({ x: 110, z: 34.5 }, transform);
      const to = wallToScreen({ x: 111, z: 36 }, transform);
      expect(band.find(({ type }) => type === Line).props).toMatchObject({
        points: [from.x, from.y, to.x, to.y], stroke,
        opacity: kind === 'furniture_base' ? 1 : opacity,
        strokeWidth: kind === 'furniture_base' ? 1 : 0.5, listening: false,
      });
    }
  });
});
