import { expect, it } from 'vitest';
import { auto, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { frameLegButts } from '../frameLegButts.js';
import { frameMembers, regionOpenings } from '../frames.js';
import { roomParts } from '../parts.js';
import { resolveWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const LEG = { square: { w: 3, d: 3 }, height: 'full', x: 0, y: 3 };

it.each([
  ['sets the opening, stile and box beside covered run end panels', [
    { inside: 3, opening: 4.5, panelInside: 0.8125, stile: 3.6875, box: 3.75 },
    { x: 1, inside: 2, opening: 3.5, panelInside: 0.8125, stile: 2.6875, box: 2.75 },
    { frame: 'butt', inside: 3, opening: 4.5, panelInside: 0.8125, stile: 3.6875, box: 3.75 },
    { side: 'right', inside: 33, opening: 31.5, panelInside: 35.1875, stile: 3.6875, box: 32.25 },
  ]],
  ['butts wall end panels under wall legs and honors their miter choice', [
    { wallPanel: true, inside: 3, opening: 4.5, panelInside: 0.8125, stile: 3.6875, box: 3.75 },
    { wallPanel: true, frame: 'miter', miter: true },
  ]],
  ['uses miters when a leg misses the joint and omits frames in Euro rooms', [
    { x: -1, miter: true }, { y: 0, miter: true }, { height: 'feet', miter: true },
    { frame: 'miter', miter: true }, { euro: true },
  ]],
])('%s (SH7.7)', (_, cases) => {
  for (const anchor of cases) {
    const side = anchor.side ?? 'left';
    const spec = { ...LEG, ...Object.fromEntries(['x', 'y', 'height']
      .filter((key) => key in anchor).map((key) => [key, anchor[key]])) };
    const end = { type: 'end_panel', ...(anchor.frame ? { frame: anchor.frame } : {}) };
    const R = run({ id: 'R', width: 36, autoCount: false, items: [auto('cabinet')],
      anchors: { left: Boolean(anchor.wallPanel), right: false },
      ends: { left: { type: 'none' }, right: { type: 'none' },
        ...(!anchor.wallPanel ? { [side]: end } : {}) },
      ...(!anchor.wallPanel ? { endLegs: { [side]: { legs: 'front', front: spec } } } : {}),
    });
    const W = wall({ id: 'w', x2: 96, thickness: 4.5, runs: [R],
      ...(anchor.wallPanel ? {
        endPanels: { start: { width: null, ...(anchor.frame ? { frame: anchor.frame } : {}) }, end: null },
        endLegs: { start: { faces: { front: { legs: 'front', front: spec } } } },
      } : {}),
    });
    const input = room({ style: { cabinetStyleId: anchor.euro ? 13 : 14 }, walls: [W] });
    const synced = syncRoom(input, settings);
    const view = resolveWall(synced, synced.walls[0]);
    const owner = view.runs[0];
    const scene = runScene(synced, view, owner, settings);
    const referenceInput = structuredClone(input);
    if (anchor.wallPanel) referenceInput.walls[0].endPanels.start.frame = 'miter';
    else referenceInput.walls[0].runs[0].ends[side].frame = 'miter';
    const reference = syncRoom(referenceInput, settings);
    const referenceWall = resolveWall(reference, reference.walls[0]);
    const miter = runScene(reference, referenceWall, referenceWall.runs[0], settings);

    if (anchor.euro) {
      expect(scene.frames.regions).toEqual([]);
      expect(scene.faceLayouts).toEqual(miter.faceLayouts);
      continue;
    }
    if (anchor.miter) {
      expect(scene.frames).toEqual(miter.frames);
      expect(scene.faceLayouts).toEqual(miter.faceLayouts);
      expect(scene.ghostIds).toEqual(miter.ghostIds);
      continue;
    }
    const region = scene.frames.regions[0];
    const face = scene.faceLayouts.get('cabinet');
    const butt = region.legButts[0];
    expect(region.legButts).toHaveLength(1);
    expect(butt).toMatchObject({ side, opening: anchor.opening, panelInside: anchor.panelInside });
    expect(frameLegButts(synced, view, owner, settings, { [side]: {
      x: side === 'left' ? 0 : 35.1875, width: 0.8125, z: region.z, height: region.height,
    } })).toEqual({ [side]: { legId: butt.legId, legInside: anchor.inside,
      opening: anchor.opening, panelInside: anchor.panelInside } });
    expect(side === 'left' ? region.x : region.x + region.width).toBe(anchor.panelInside);
    expect(side === 'left' ? face.box.x : face.box.x + face.box.width).toBe(anchor.box);
    expect(side === 'left' ? face.openings[0].x : face.openings[0].x + face.openings[0].width)
      .toBe(anchor.opening);
    const stiles = frameMembers(region, regionOpenings(region, scene.faceLayouts))
      .filter((member) => member.kind === 'stile').sort((a, b) => a.x - b.x);
    expect(side === 'left' ? stiles[0] : stiles.at(-1))
      .toMatchObject({ x: side === 'left' ? anchor.panelInside : anchor.opening, width: anchor.stile });
    if (anchor.wallPanel) {
      expect(butt.wall).toBe(true);
      expect(region.wallPanels).not.toContainEqual(expect.objectContaining({ side }));
      expect(owner._frame.wallPanels.left.join).toBe('miter');
    } else {
      expect(butt.panelId).toBe(`R:${side}`);
      expect(region.panelIds).not.toContain(`R:${side}`);
      expect(scene.ghostIds.has(`R:${side}`)).toBe(true);
      const panel = (subject) => roomParts(subject, settings).find((part) => part.key === `R:${side}`);
      expect(panel(synced)).toEqual(panel(reference));
    }
  }
});
