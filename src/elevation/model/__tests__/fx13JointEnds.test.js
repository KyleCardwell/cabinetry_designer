import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { resolveProfile } from '../profile.js';
import { resolveWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import { runTop } from '../tops.js';

const S = { ...DEFAULT_SETTINGS, defaultProfile: { ...DEFAULT_SETTINGS.defaultProfile, crownTop: 120 } };
const WALL = 5;
const UPPER = '4d5eff2e-5373-49ce-9909-88313fe48fb6';

function load(edit = () => {}) {
  const source = JSON.parse(readFileSync(new URL('./fixtures/room10w8.json', import.meta.url), 'utf8'));
  edit(source.walls[WALL].runs.find(({ id }) => id === UPPER));
  return syncRoom(source, S);
}

function upperOf(current) {
  return current.walls[WALL].runs.find(({ id }) => id === UPPER);
}

function sceneOf(current) {
  const view = resolveWall(current, current.walls[WALL], 'front');
  const subject = view.runs.find(({ id }) => id === UPPER);
  return runScene(current, view, subject, S);
}

function topKind(current) {
  const wall = current.walls[WALL];
  return runTop(wall, upperOf(current), resolveProfile(S, current, wall)).kind;
}

function endPiece(current, side) {
  return sceneOf(current).drawnPieces.find(({ id }) => id === `${UPPER}:${side}`);
}

describe('FX13: joined run ends keep their extend', () => {
  it('anchor 1: the automatic joint end keeps Extend down to the floor', () => {
    const current = load((run) => { run.ends.left.extend = { down: { to: 'floor' } }; });
    expect(upperOf(current).ends.left).toMatchObject({ auto: true, extend: { down: { to: 'floor' } } });
    const again = syncRoom(current, S);
    expect(upperOf(again).ends.left.extend).toEqual({ down: { to: 'floor' } });
    expect(endPiece(current, 'left')).toMatchObject({ kind: 'end_panel', z: 0, height: 114, extended: ['down'] });
  });

  it('anchor 2: the right end extends as before', () => {
    const current = load((run) => { run.ends.right.extend = { down: { to: 'floor' } }; });
    expect(endPiece(current, 'right')).toMatchObject({ kind: 'filler', z: 0, height: 114, extended: ['down'] });
  });

  it('anchor 3: the automatic joint end keeps its height pick', () => {
    const current = load((run) => { run.ends.left.height = 'full'; });
    expect(upperOf(syncRoom(current, S)).ends.left.height).toBe('full');
  });
});

describe('FX13: a manual run at the box top keeps its crown', () => {
  it('anchor 4: manual upper topping out at 114 gets the auto molding', () => {
    const current = load();
    const auto = load((run) => { run.heightMode = 'auto'; });
    expect(topKind(current)).not.toBe('none');
    expect(topKind(current)).toBe(topKind(auto));
  });

  it('anchor 5: manual upper 2" short has no top', () => {
    expect(topKind(load((run) => { run.height = 58; }))).toBe('none');
  });

  it('anchor 6: a picked none still wins', () => {
    expect(topKind(load((run) => { run.top = 'none'; }))).toBe('none');
  });
});
