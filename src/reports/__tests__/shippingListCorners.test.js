import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../elevation/model/constants.js';
import { cornerEnd } from '../../elevation/model/cornerEnd.js';
import { cornerReturnLegs } from '../../elevation/model/cornerLegs.js';
import { panelLevels, resolveDoorStyle } from '../../elevation/model/doorStyleResolve.js';
import { effectiveSettings } from '../../elevation/model/effectiveSettings.js';
import { partNumbers, wallBadgeGroups } from '../../elevation/model/partNumbers.js';
import { syncRoom } from '../../elevation/model/room.js';
import { runScene } from '../../elevation/model/runScene.js';
import { doorOrder, doorOrderItems } from '../doorOrder.js';
import { formatRevealParts } from '../faceReveals.js';
import { formatInch, formatSize } from '../format.js';
import { shippingList } from '../shippingList.js';

const BASE = 'b0505231-35e6-4630-8a1e-e9b2181d443c';
const UPPER = 'a72f41f6-a4ab-4c0e-a91f-8b9d98590429';

describe('corner return-side parts', () => {
  it.each([
    { name: 'an exposed end panel', emptyReturn: true, kind: 'end_panel', description: 'Base End Panel', width: 24 },
    { name: 'a covered return', emptyReturn: false },
    { name: 'a flat filler', emptyReturn: true, kind: 'filler', description: 'Base Filler', width: 3 },
  ])('numbers and orders $name (CC9)', (anchor) => {
    const source = JSON.parse(readFileSync(new URL('../../elevation/model/__tests__/fixtures/room8cc.json', import.meta.url), 'utf8'));
    const storedWall = source.walls.find(({ name }) => name === 'Wall 3');
    const storedRun = storedWall.runs.find((run) => run.grid.cells.some(({ node }) => node.id === BASE));
    if (anchor.emptyReturn) source.walls.find(({ name }) => name === 'Wall 4').runs = [];
    if (anchor.kind === 'filler') Object.assign(storedRun.ends.right.corner, { returnPiece: 'filler', returnWidth: 3 });
    const settings = effectiveSettings({ settings: { ...DEFAULT_SETTINGS } }, source);
    const room = syncRoom(source, settings);
    const wall = room.walls.find(({ name }) => name === 'Wall 3');
    const returnWall = room.walls.find(({ name }) => name === 'Wall 4');
    const run = wall.runs.find(({ id }) => id === storedRun.id);
    const key = `${BASE}:return`;
    const { parts, byKey } = partNumbers(room, settings);
    const part = parts.find((part) => part.key === key);
    const row = shippingList(room, settings).rows.find((row) => row.key === key);
    const order = doorOrder(room, settings);
    const { items } = doorOrderItems(room, settings);
    if (!anchor.kind) {
      expect(parts.filter(({ source }) => source === 'corner_return')).toEqual([]);
      expect(row).toBeUndefined();
      expect(items.filter(({ key }) => key.endsWith(':return'))).toEqual([]);
      return;
    }
    expect(part).toMatchObject({
      kind: anchor.kind, source: 'corner_return', columnId: BASE, wallId: wall.id, side: 'front',
      runId: run.id, pieceId: null, molding: null, z: 4, height: 30.5,
      number: byKey.get(BASE) + 1,
    });
    expect(parts[parts.findIndex(({ key }) => key === BASE) + 1].key).toBe(key);
    const scene = runScene(room, wall, run, settings);
    const ownerBadges = wallBadgeGroups(room, wall, settings).flatMap(({ pieces }) => pieces)
      .filter(({ id }) => id === key);
    const returnBadges = wallBadgeGroups(room, returnWall, settings).flatMap(({ pieces }) => pieces)
      .filter(({ id }) => id === key);
    let thickness;
    if (anchor.kind === 'end_panel') {
      const corner = cornerEnd(room, wall, run, 'right', settings, scene.result);
      const { style } = resolveDoorStyle(room, settings, 'panel', panelLevels(room, wall, run, run.ends.right));
      thickness = style.id === 'sheet' ? corner.returnSide.width : Math.min(corner.returnSide.width, style.thickness);
      const strip = scene.cornerPanels.find(({ columnId }) => columnId === BASE);
      expect(part).toMatchObject({ x: strip.x, width: strip.width });
      expect(ownerBadges).toEqual([expect.objectContaining({ id: key, x: strip.x, width: strip.width })]);
      expect(returnBadges).toEqual([]);
      expect(items.filter((item) => item.key === key)).toEqual([
        expect.objectContaining({ kind: 'endPanel', pieceId: key, width: 24, height: 30.5, style }),
      ]);
      const lines = order.pages.flatMap(({ sections }) => sections.flatMap(({ lines }) => lines))
        .filter(({ number }) => number === part.number);
      expect(lines).toEqual([expect.objectContaining({ number: part.number, qty: 1, width: 24, height: 30.5 })]);
    } else {
      thickness = settings.fillerThickness;
      const strip = cornerReturnLegs(room, returnWall, settings).find(({ columnId }) => columnId === BASE).returnPanel;
      expect(part).toMatchObject({ x: strip.x, width: 3 });
      expect(ownerBadges).toEqual([]);
      expect(returnBadges).toEqual([expect.objectContaining({ id: key, x: strip.x, width: 3 })]);
      expect(items.filter((item) => item.key === key)).toEqual([]);
    }
    const badgeWall = anchor.kind === 'end_panel' ? wall : returnWall;
    expect(wallBadgeGroups(room, badgeWall, settings).find((group) => group.key === key).lift).toBe(3);
    expect(row).toMatchObject({ number: part.number, description: anchor.description,
      size: formatSize(anchor.width, 30.5, thickness) });
    expect(row.notes.join(', ')).not.toMatch(/[TLU]-shape/);
    expect(order.warnings.filter(({ code }) => code === 'report-part-unnumbered')).toEqual([]);
  });
});

describe('corner face frame shipping rows', () => {
  it.each([
    { name: 'equal bevelled sides', key: BASE, kind: 45,
      note: '25 5/16" L & R sides, fronts bevelled 45° for face frame (long point)' },
    { name: 'uneven bevelled sides', key: BASE, kind: 45, depthB: 15,
      note: '24 7/8" left side, 16 3/4" right side, fronts bevelled 29.7° / 60.3° for face frame (long points)' },
    { name: 'a true-size diagonal frame', key: `${BASE}:frame`, kind: 45,
      description: 'Corner 45 Face Frame', size: '16 5/16 x 30 1/2 x 13/16',
      note: '1 1/2" stiles mitered 22.5° (1 27/32" at back)' },
    { name: 'both L-shaped frame legs', key: `${BASE}:frame`, kind: 90,
      description: 'Corner 90 Face Frame', size: '',
      note: 'rails only, L-shape: left leg T & B rails 1 1/2 x 11 1/4, right leg T & B rails 1 1/2 x 10 7/16' },
    { name: 'an end stile on the right leg', key: `${BASE}:frame`, kind: 90, emptyReturn: true,
      description: 'Corner 90 Face Frame', size: '' },
  ])('prints $name (CC9)', (anchor) => {
    const source = JSON.parse(readFileSync(new URL('../../elevation/model/__tests__/fixtures/room8cc.json', import.meta.url), 'utf8'));
    source.style = { cabinetStyleId: 14 };
    const storedWall = source.walls.find(({ name }) => name === 'Wall 3');
    for (const run of storedWall.runs) {
      for (const end of Object.values(run.ends ?? {})) {
        if (end?.type === 'corner') end.corner.kind = anchor.kind;
      }
    }
    const storedRun = storedWall.runs.find((run) => run.grid.cells.some(({ node }) => node.id === BASE));
    if (anchor.depthB) storedRun.ends.right.corner.depthB = anchor.depthB;
    if (anchor.emptyReturn) source.walls.find(({ name }) => name === 'Wall 4').runs = [];
    const settings = effectiveSettings({ settings: { ...DEFAULT_SETTINGS } }, source);
    const room = syncRoom(source, settings);
    const row = shippingList(room, settings).rows.find(({ key }) => key === anchor.key);
    if (anchor.description) expect(row.description).toBe(anchor.description);
    if (anchor.size !== undefined) expect(row.size).toBe(anchor.size);
    if (anchor.note) expect(row.notes).toContain(anchor.note);
    if (anchor.emptyReturn) {
      const wall = room.walls.find(({ name }) => name === 'Wall 3');
      const run = wall.runs.find(({ id }) => id === storedRun.id);
      const frame = runScene(room, wall, run, settings).cornerFrames.find(({ columnId }) => columnId === BASE);
      expect(frame.legs[1].stileAtEnd).toBeTruthy();
      const railSizes = ['A', 'B'].map((side) => {
        const rails = frame.members.filter((member) => member.kind === 'rail' && member.side === side);
        expect(rails).toHaveLength(2);
        expect(rails[0].length).toBe(rails[1].length);
        expect(rails[0].height).toBe(rails[1].height);
        return formatSize(rails[0].height, rails[0].length);
      });
      expect(row.notes).toContain(`rails only, L-shape: left leg T & B rails ${railSizes[0]}, right leg T & B rails ${railSizes[1]}, stile 1 9/16 x 30 1/2 (mitered to 13/16" end panel)`);
    }
  });
});

describe('corner cabinet shipping rows', () => {
  it.each([
    { name: 'base diagonal', key: BASE, kind: 45, description: 'Base Corner 45', size: '36 x 30 1/2 x 36',
      include: ['full top', '24" L & R sides', 'door x 15 9/16" wide'], diagonalReveals: true },
    { name: 'upper diagonal', key: UPPER, kind: 45, description: 'Upper Corner 45', size: '24 x 48 x 24',
      include: ['12" L & R sides', 'door x 15 9/16" wide'], exclude: ['full top'] },
    { name: 'equal bi-fold doors', key: BASE, kind: 90, description: 'Base Corner 90', size: '36 x 30 1/2 x 36',
      include: ['24" L & R sides', '2 doors x 10 15/16" wide', 'bi-fold doors'],
      exclude: ['hl', 'hr'], noReveals: true },
    { name: 'uneven diagonal sides', key: BASE, kind: 45, depthB: 15,
      description: 'Base Corner 45', size: '36 x 30 1/2 x 36',
      include: ['24" left side, 15" right side'], faceWidth: true },
    { name: 'both exterior reveals', key: BASE, kind: 90, reveals: { left: 0.25 },
      include: ['RV\'s (1/4" L & R)'] },
    { name: 'top reveal', key: BASE, kind: 90, reveals: { top: 0.375 },
      include: ['RV\'s (3/8" T)'], topOnly: true },
  ])('prints $name (CC9)', (anchor) => {
    const source = JSON.parse(readFileSync(new URL('../../elevation/model/__tests__/fixtures/room8cc.json', import.meta.url), 'utf8'));
    const storedWall = source.walls.find(({ name }) => name === 'Wall 3');
    for (const run of storedWall.runs) {
      for (const end of Object.values(run.ends ?? {})) {
        if (end?.type === 'corner') end.corner.kind = anchor.kind;
      }
    }
    const storedRun = storedWall.runs.find((run) => run.grid.cells.some(({ node }) => node.id === anchor.key));
    if (anchor.depthB) storedRun.ends.right.corner.depthB = anchor.depthB;
    if (anchor.reveals) storedRun.grid.cells.find(({ node }) => node.id === anchor.key).node.reveals = anchor.reveals;
    const settings = effectiveSettings({ settings: { ...DEFAULT_SETTINGS } }, source);
    const room = syncRoom(source, settings);
    const wall = room.walls.find(({ name }) => name === 'Wall 3');
    const run = wall.runs.find(({ id }) => id === storedRun.id);
    const entry = runScene(room, wall, run, settings).faceLayouts.get(anchor.key);
    const row = shippingList(room, settings).rows.find(({ key }) => key === anchor.key);
    if (anchor.description) expect(row.description).toBe(anchor.description);
    if (anchor.size) expect(row.size).toBe(anchor.size);
    for (const note of anchor.include ?? []) expect(row.notes).toContain(note);
    for (const note of anchor.exclude ?? []) expect(row.notes).not.toContain(note);
    const reveals = row.notes.filter((note) => note.startsWith("RV's"));
    if (anchor.noReveals) expect(reveals).toEqual([]);
    if (anchor.topOnly) {
      expect(reveals).toContainEqual(expect.stringMatching(/ T\)/));
      expect(reveals.join()).not.toMatch(/ L| R/);
    }
    if (anchor.diagonalReveals) {
      const reveal = entry.reveals.values.left;
      expect(row.notes).toContain(`RV's (${formatRevealParts({ left: [reveal], right: [reveal] }).join(', ')})`);
    }
    if (anchor.faceWidth) expect(row.notes).toContain(`door x ${formatInch(entry.faces[0].width)} wide`);
  });

  it('orders profiled exterior reveals and a return panel from the left (CC9)', () => {
    const source = JSON.parse(readFileSync(new URL('../../elevation/model/__tests__/fixtures/room8cc.json', import.meta.url), 'utf8'));
    source.style = { cabinetStyleId: 14 };
    const profiled = JSON.parse(readFileSync(new URL('./fixtures/room10ff.json', import.meta.url), 'utf8'));
    source.doorStyles[0].profiles = profiled.doorStyles[0].profiles;
    const storedWall = source.walls.find(({ name }) => name === 'Wall 3');
    const storedRun = storedWall.runs.find((run) => run.grid.cells.some(({ node }) => node.id === UPPER));
    Object.assign(storedRun.ends.left.corner, { kind: 90, depthB: 9, legBFace: 'panel' });
    const settings = effectiveSettings({ settings: { ...DEFAULT_SETTINGS } }, source);
    const room = syncRoom(source, settings);
    const wall = room.walls.find(({ name }) => name === 'Wall 3');
    const run = wall.runs.find(({ id }) => id === storedRun.id);
    const entry = runScene(room, wall, run, settings).faceLayouts.get(UPPER);
    const { legB } = entry.cornerReturn;
    const row = shippingList(room, settings).rows.find(({ key }) => key === UPPER);
    expect(row.notes).toContain('9" left side, 12" right side');
    expect(row.notes).toContain(`panel x ${formatInch(legB.faces[0].width)} wide, door x ${formatInch(entry.faces[0].width)} wide`);
    expect(row.notes).toContain('RV\'s (1 19/32" T, 27/32" B, 27/32" L & R)');
    expect(row.notes).toContain('hr');
    expect(row.notes).not.toContain('bi-fold doors');
  });
});

describe('corner cabinet door orders', () => {
  it.each([
    { name: 'equal doors on both legs', kind: 90, keys: [BASE, UPPER], qty: 2, width: 10.9375 },
    { name: 'a door and a return panel', kind: 90, keys: [UPPER], qty: 1, width: 10.9375, panel: true },
    { name: 'a diagonal door', kind: 45, keys: [BASE], qty: 1, width: 15.5625 },
  ])('orders $name under the corner number (CC9)', (anchor) => {
    const source = JSON.parse(readFileSync(new URL('../../elevation/model/__tests__/fixtures/room8cc.json', import.meta.url), 'utf8'));
    const storedWall = source.walls.find(({ name }) => name === 'Wall 3');
    for (const run of storedWall.runs) {
      for (const end of Object.values(run.ends ?? {})) {
        if (end?.type === 'corner') end.corner.kind = anchor.kind;
      }
    }
    if (anchor.panel) {
      const run = storedWall.runs.find((run) => run.grid.cells.some(({ node }) => node.id === UPPER));
      run.ends.left.corner.legBFace = 'panel';
    }
    const settings = effectiveSettings({ settings: { ...DEFAULT_SETTINGS } }, source);
    const room = syncRoom(source, settings);
    const wall = room.walls.find(({ name }) => name === 'Wall 3');
    const rows = shippingList(room, settings).rows;
    const { items } = doorOrderItems(room, settings);
    const order = doorOrder(room, settings);
    for (const key of anchor.keys) {
      const run = wall.runs.find((run) => run.grid.cells.some(({ node }) => node.id === key));
      const entry = runScene(room, wall, run, settings).faceLayouts.get(key);
      const height = entry.faces[0].height;
      const number = rows.find((row) => row.key === key).number;
      const doors = items.filter((item) => item.pieceId === key && item.faceType === 'door');
      expect(doors).toHaveLength(anchor.qty);
      for (const door of doors) expect(door).toMatchObject({ kind: 'face', width: anchor.width, height });
      const lines = order.pages.filter((page) => page.type === 'doors')
        .flatMap((page) => page.sections.flatMap((section) => section.lines))
        .filter((line) => line.number === number);
      expect(lines).toContainEqual(expect.objectContaining({
        number, qty: anchor.qty + (anchor.panel ? 1 : 0), width: anchor.width, height,
        size: formatSize(anchor.width, height),
      }));
      expect(lines).toHaveLength(1);
      if (anchor.panel) {
        expect(items.filter((item) => item.pieceId === key && item.faceType === 'panel')).toEqual([
          expect.objectContaining({ kind: 'face', pieceId: key,
            width: entry.cornerReturn.legB.faces[0].width, height }),
        ]);
      }
    }
    expect(order.warnings.filter(({ code }) => code === 'report-part-unnumbered')).toEqual([]);
  });
});
