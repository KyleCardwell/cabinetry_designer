import { describe, expect, it } from 'vitest';
import { isFaceNode, setFaceAction, setFaceMatch } from '../index.js';
import {
  equalizeGroup,
  faceOutline,
  getFaceNode,
  makeDrawerStack,
  parentFacePath,
  removeFace,
  setFaceHinge,
  setFaceSize,
  setFaceType,
  setGroupCount,
  splitFace,
} from '../faceTree.js';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const DOOR = deepFreeze({ type: 'door', size: null });
const TWO = deepFreeze({
  direction: 'vertical',
  size: null,
  children: [
    { type: 'drawer_front', size: 6 },
    { type: 'door', size: null },
  ],
});
const BASE3 = deepFreeze({
  direction: 'vertical',
  size: null,
  children: [
    { type: 'drawer_front', size: 6 },
    { type: 'drawer_front', size: null },
    { type: 'drawer_front', size: null },
  ],
});
const NESTED = deepFreeze({
  direction: 'vertical',
  size: null,
  children: [
    {
      direction: 'horizontal',
      size: 6,
      children: [
        { type: 'drawer_front', size: null },
        { type: 'drawer_front', size: null },
      ],
    },
    { type: 'door', size: null },
  ],
});

describe('IN7.3 face group matches', () => {
  const face = deepFreeze({ direction: 'vertical', size: null, children: [
    DOOR,
    { direction: 'vertical', size: null, match: 'base', children: [
      { type: 'drawer_front', size: 5.875 }, { type: 'drawer_front', size: 5.875 },
      { type: 'drawer_front', size: null }, { type: 'drawer_front', size: null },
    ] },
  ] });

  it('anchors 5–6: typing a height removes match; clearing match returns to auto', () => {
    const typed = setFaceSize(face, 'r.1', 30);
    expect(typed.children[1]).toEqual({ direction: 'vertical', size: 30, children: face.children[1].children });
    const cleared = setFaceMatch(face, 'r.1', null);
    expect(cleared.children[1]).toEqual({ direction: 'vertical', size: null, children: face.children[1].children });
    expect(setFaceMatch(typed, 'r.1', 'base')).toEqual(face);
    expect(face.children[1]).toMatchObject({ match: 'base', size: null });
  });

  it('rejects match edits on leaves, roots, width-sized groups and unknown values', () => {
    for (const path of ['r', 'r.0', 'r.1.0', 'r.9']) {
      expect(setFaceMatch(face, path, 'base')).toBe(face);
    }
    const row = { ...face, direction: 'horizontal' };
    expect(setFaceMatch(row, 'r.1', 'base')).toBe(row);
    expect(setFaceMatch(face, 'r.1', 'tall')).toBe(face);
  });

  it('anchor 7: the drawer stack option matches an eligible group and clears the old size', () => {
    const source = deepFreeze({ direction: 'vertical', size: null, children: [DOOR, { ...DOOR, size: 30 }] });
    const stacked = makeDrawerStack(source, 'r.1', 4, { match: true });
    expect(stacked.children[1]).toEqual({
      direction: 'vertical', size: null, match: 'base',
      children: Array.from({ length: 4 }, (_, index) => ({
        type: 'drawer_front', size: null, ...(index < 2 ? { match: 'standard' } : {}),
      })),
    });
    expect(isFaceNode(stacked)).toBe(true);
    expect(source.children[1]).toEqual({ ...DOOR, size: 30 });
  });

  it('anchor 8: the root, horizontal children and stacks without the option keep their sizes', () => {
    const source = { direction: 'vertical', size: null, children: [DOOR, { ...DOOR, size: 30 }] };
    for (const options of [undefined, { match: false }]) {
      const stacked = makeDrawerStack(source, 'r.1', 4, options);
      expect(stacked.children[1].size).toBe(30);
      expect(stacked.children[1]).not.toHaveProperty('match');
    }
    const root = makeDrawerStack(DOOR, 'r', 4, { match: true });
    expect(root).not.toHaveProperty('match');
    expect(root.size).toBeNull();
    const row = makeDrawerStack({ ...source, direction: 'horizontal' }, 'r.1', 4, { match: true });
    expect(row.children[1]).not.toHaveProperty('match');
    expect(row.children[1].size).toBe(30);
    expect(isFaceNode(row)).toBe(true);
  });

  it('keeps the group match when its children are split, stacked or counted', () => {
    for (const next of [
      splitFace(face, 'r.1.0', 'vertical', 2),
      splitFace(face, 'r.1.0', 'horizontal', 2),
      makeDrawerStack(face, 'r.1.0', 3, { match: true }),
      setGroupCount(face, 'r.1', 5),
      setGroupCount(face, 'r.1', 2),
    ]) {
      expect(next.children[1]).toMatchObject({ match: 'base', size: null });
      expect(isFaceNode(next)).toBe(true);
    }
    const collapsed = setGroupCount(face, 'r.1', 1);
    expect(collapsed.children[1]).not.toHaveProperty('match');
    expect(isFaceNode(collapsed)).toBe(true);
  });
});

describe('faceTree', () => {
  it('9: splits a leaf root into a group', () => {
    expect(splitFace(DOOR, 'r', 'vertical', 3)).toEqual({
      direction: 'vertical',
      size: null,
      children: [DOOR, DOOR, DOOR],
    });
  });

  it('10: same direction flattens into the parent', () => {
    expect(splitFace(TWO, 'r.1', 'vertical', 2).children).toEqual([
      { type: 'drawer_front', size: 6 },
      { type: 'door', size: null },
      { type: 'door', size: null },
    ]);
  });

  it('11: other direction nests and keeps the size', () => {
    expect(splitFace(TWO, 'r.0', 'horizontal', 2)).toEqual(NESTED);
  });

  it('12: count clamps, non-leaf is unchanged', () => {
    expect(splitFace(DOOR, 'r', 'vertical', 1).children).toHaveLength(2);
    expect(splitFace(DOOR, 'r', 'vertical', 20).children).toHaveLength(8);
    expect(splitFace(TWO, 'r', 'vertical', 2)).toBe(TWO);
  });

  it('13: setGroupCount grows, shrinks and collapses', () => {
    const four = setGroupCount(BASE3, 'r', 4);
    expect(four.children.map((c) => c.size)).toEqual([6, null, null, null]);
    expect(four.children.every((c) => c.type === 'drawer_front')).toBe(true);
    expect(setGroupCount(BASE3, 'r', 2).children.map((c) => c.size)).toEqual([6, null]);
    expect(setGroupCount(BASE3, 'r', 1)).toEqual({ type: 'drawer_front', size: null });
  });

  it('14: removeFace', () => {
    expect(removeFace(TWO, 'r.1')).toEqual({ type: 'drawer_front', size: null });
    expect(removeFace(NESTED, 'r.0.1')).toEqual(TWO);
    expect(removeFace(TWO, 'r')).toBe(TWO);
  });

  it('15: setFaceType and setFaceSize', () => {
    expect(setFaceType(TWO, 'r.1', 'pair_door').children[1].type).toBe('pair_door');
    expect(setFaceType(TWO, 'r', 'door')).toBe(TWO);
    expect(setFaceType(TWO, 'r.1', 'shelf')).toBe(TWO);
    expect(setFaceSize(TWO, 'r.1', 24).children[1].size).toBe(24);
    expect(setFaceSize(TWO, 'r.0', null).children[0].size).toBeNull();
    expect(setFaceSize(TWO, 'r', 4)).toBe(TWO);
    expect(setFaceSize(TWO, 'r.0', 0)).toBe(TWO);
  });

  it('16: equalizeGroup makes every child auto', () => {
    expect(equalizeGroup(BASE3, 'r').children.map((c) => c.size)).toEqual([null, null, null]);
  });

  it('17: outline and lookups', () => {
    const rows = faceOutline(NESTED);
    expect(rows.map((row) => row.path)).toEqual(['r', 'r.0', 'r.0.0', 'r.0.1', 'r.1']);
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 2, 2, 1]);
    expect(getFaceNode(NESTED, 'r.0.1')).toEqual({ type: 'drawer_front', size: null });
    expect(getFaceNode(TWO, 'r.5')).toBeNull();
    expect(parentFacePath('r.0.1')).toBe('r.0');
    expect(parentFacePath('r')).toBeNull();
  });

  it('179. makes nested drawer stacks from leaves', () => {
    const face = {
      direction: 'vertical',
      size: null,
      children: [
        { type: 'door', size: null },
        { type: 'door', size: 30.25 },
      ],
    };

    expect(makeDrawerStack(face, 'r.1', 3)).toEqual({
      direction: 'vertical',
      size: null,
      children: [
        { type: 'door', size: null },
        {
          direction: 'vertical',
          size: 30.25,
          children: [
            { type: 'drawer_front', size: null, match: 'standard' },
            { type: 'drawer_front', size: null },
            { type: 'drawer_front', size: null },
          ],
        },
      ],
    });
    expect(makeDrawerStack({ type: 'door', size: null }, 'r', 1)).toEqual({
      direction: 'vertical',
      size: null,
      children: [
        { type: 'drawer_front', size: null },
        { type: 'drawer_front', size: null },
      ],
    });
    expect(makeDrawerStack(face, 'r', 3)).toBe(face);
  });

  it('sets and clears a door\'s hinge; a new type drops it', () => {
    const face = { direction: 'vertical', size: null, children: [
      { type: 'drawer_front', size: 6 }, { type: 'door', size: null },
    ] };
    const hinged = setFaceHinge(face, 'r.1', 'right');
    expect(hinged.children[1]).toEqual({ type: 'door', size: null, hinge: 'right' });
    expect(setFaceHinge(hinged, 'r.1', 'right')).toBe(hinged);
    expect(setFaceHinge(hinged, 'r.1', null).children[1]).toEqual({ type: 'door', size: null });
    expect(setFaceHinge(face, 'r.0', 'left')).toBe(face);
    expect(setFaceHinge(face, 'r.1', 'up')).toBe(face);
    expect(setFaceType(hinged, 'r.1', 'drawer_front').children[1]).toEqual({ type: 'drawer_front', size: null });
  });

  it('HP1 anchor 1: accepts top and bottom hinges and rejects unknown edges', () => {
    for (const hinge of ['top', 'bottom']) {
      const hinged = setFaceHinge(DOOR, 'r', hinge);
      expect(hinged).toEqual({ ...DOOR, hinge });
      expect(setFaceHinge(hinged, 'r', hinge)).toBe(hinged);
      expect(setFaceHinge(hinged, 'r', null)).toEqual(DOOR);
    }
    expect(setFaceHinge(DOOR, 'r', 'up')).toBe(DOOR);
  });

  it('HP1 anchor 2: pullout and sliding clear hinges and reject hinge edits', () => {
    const door = deepFreeze({ ...DOOR, hinge: 'left' });
    for (const action of ['pullout', 'sliding']) {
      const next = setFaceAction(door, 'r', action);
      expect(next).toEqual({ ...DOOR, action });
      for (const hinge of ['left', 'right', 'top', 'bottom']) {
        expect(setFaceHinge(next, 'r', hinge)).toBe(next);
      }
      expect(setFaceAction(next, 'r', action)).toBe(next);
      expect(setFaceAction(next, 'r', 'swing')).toEqual(DOOR);
      expect(setFaceAction(next, 'r', null)).toEqual(DOOR);
    }
    expect(door).toEqual({ ...DOOR, hinge: 'left' });
  });

  it('HP1 anchor 3: flipper and pocket keep only side hinges', () => {
    for (const action of ['flipper', 'pocket']) {
      for (const hinge of ['top', 'bottom']) {
        expect(setFaceAction({ ...DOOR, hinge }, 'r', action)).toEqual({ ...DOOR, action });
      }
      const flipper = setFaceAction({ ...DOOR, hinge: 'top' }, 'r', action);
      const hinged = setFaceHinge(flipper, 'r', 'right');
      expect(hinged).toEqual({ ...DOOR, action, hinge: 'right' });
      expect(setFaceAction({ ...DOOR, hinge: 'left' }, 'r', action)).toEqual({ ...DOOR, hinge: 'left', action });
      expect(setFaceAction(hinged, 'r', null)).toEqual({ ...DOOR, hinge: 'right' });
      expect(setFaceHinge(hinged, 'r', 'top')).toBe(hinged);
      expect(setFaceHinge(hinged, 'r', 'bottom')).toBe(hinged);
    }
  });

  it('HP1 anchor 4: pair actions exclude pullout and swing is never stored', () => {
    const pair = deepFreeze({ type: 'pair_door', size: null });
    expect(setFaceAction(pair, 'r', 'pullout')).toBe(pair);
    for (const action of ['flipper', 'pocket', 'sliding']) {
      const next = setFaceAction(pair, 'r', action);
      expect(next).toEqual({ ...pair, action });
      expect(setFaceAction(next, 'r', 'swing')).toEqual(pair);
      expect(setFaceAction(next, 'r', null)).toEqual(pair);
      expect(setFaceHinge(next, 'r', 'left')).toBe(next);
    }
    expect(setFaceAction(DOOR, 'r', 'swing')).toBe(DOOR);
    expect(setFaceAction(DOOR, 'r', null)).toBe(DOOR);
    expect(setFaceAction(DOOR, 'r', 'unknown')).toBe(DOOR);
    expect(setFaceAction(TWO, 'r', 'flipper')).toBe(TWO);
    expect(setFaceAction(TWO, 'r.0', 'flipper')).toBe(TWO);
    expect(setFaceAction(TWO, 'r.9', 'flipper')).toBe(TWO);
    const nested = setFaceAction(TWO, 'r.1', 'pocket');
    expect(nested.children).toEqual([TWO.children[0], { ...DOOR, action: 'pocket' }]);
    expect(TWO.children[1]).toEqual(DOOR);
  });

  it('HP1 anchor 6: changing a leaf type drops hinge and action', () => {
    const door = deepFreeze({ ...DOOR, hinge: 'left', action: 'pocket' });
    for (const type of ['drawer_front', 'pair_door']) {
      expect(setFaceType(door, 'r', type)).toEqual({ type, size: null });
    }
    expect(setFaceType(door, 'r', 'door')).toEqual(door);
    const pair = { type: 'pair_door', size: null, action: 'flipper' };
    expect(setFaceType(pair, 'r', 'door')).toEqual(DOOR);
    expect(door).toEqual({ ...DOOR, hinge: 'left', action: 'pocket' });
  });
});

describe('IN7.4 standard face editing', () => {
  const front = { type: 'drawer_front', size: null, match: 'standard' };
  const tree = (node = front) => deepFreeze({ direction: 'vertical', size: null, children: [node, DOOR] });

  it.each([2, 3, 4, 5])('anchor 8: %i drawers make all but the bottom two standard', (count) => {
    const next = makeDrawerStack(DOOR, 'r', count);
    expect(next.children.map(({ match }) => match ?? null))
      .toEqual(Array.from({ length: count }, (_, index) => index < count - 2 ? 'standard' : null));
    expect(isFaceNode(next)).toBe(true);
  });

  it('sets standard on drawer / false fronts and rows; typing wins; clearing returns to auto', () => {
    for (const node of [{ type: 'drawer_front', size: 5 }, { type: 'false_front', size: 4 }, {
      direction: 'horizontal', size: 6, children: [{ type: 'drawer_front', size: null }, { type: 'false_front', size: null }],
    }]) {
      const source = tree(node);
      const matched = setFaceMatch(source, 'r.0', 'standard');
      expect(matched.children[0]).toMatchObject({ size: null, match: 'standard' });
      const typed = setFaceSize(matched, 'r.0', 5.875);
      expect(typed.children[0].size).toBe(5.875);
      expect(typed.children[0]).not.toHaveProperty('match');
      const auto = setFaceMatch(matched, 'r.0', null);
      expect(auto.children[0].size).toBeNull();
      expect(auto.children[0]).not.toHaveProperty('match');
      expect(source.children[0]).toEqual(node);
    }
  });

  it('rejects standard matches on roots, doors, vertical groups and width-sized fronts', () => {
    const source = tree();
    for (const path of ['r', 'r.1', 'r.9']) expect(setFaceMatch(source, path, 'standard')).toBe(source);
    const vertical = tree({ direction: 'vertical', size: null, children: [front, DOOR] });
    expect(setFaceMatch(vertical, 'r.0', 'standard')).toBe(vertical);
    const horizontal = { ...source, direction: 'horizontal' };
    expect(setFaceMatch(horizontal, 'r.0', 'standard')).toBe(horizontal);
  });

  it('type changes clear ineligible standard matches on the leaf and enclosing row', () => {
    const source = tree();
    expect(setFaceType(source, 'r.0', 'door').children[0]).not.toHaveProperty('match');
    expect(setFaceType(source, 'r.0', 'false_front').children[0].match).toBe('standard');
    const split = splitFace(source, 'r.0', 'horizontal', 2);
    const changed = setFaceType(split, 'r.0.0', 'door');
    expect(changed.children[0]).not.toHaveProperty('match');
    expect(isFaceNode(changed)).toBe(true);
  });

  it('collapsing a standard row keeps its match, while collapsing to a root clears child matches', () => {
    const split = splitFace(tree(), 'r.0', 'horizontal', 2);
    for (const next of [setGroupCount(split, 'r.0', 1), removeFace(split, 'r.0.1')]) {
      expect(next.children[0]).toEqual(front);
      expect(isFaceNode(next)).toBe(true);
    }
    for (const next of [setGroupCount(tree(), 'r', 1), removeFace(tree(), 'r.1')]) {
      expect(next).toEqual({ type: 'drawer_front', size: null });
      expect(isFaceNode(next)).toBe(true);
    }
    expect(equalizeGroup(tree(), 'r').children[0]).not.toHaveProperty('match');
  });

  it('splitting a standard front sideways preserves the row match through count and drawer stack edits', () => {
    const split = splitFace(tree(), 'r.0', 'horizontal', 2);
    for (const next of [split, setGroupCount(split, 'r.0', 3), makeDrawerStack(split, 'r.0.0', 3)]) {
      expect(next.children[0]).toMatchObject({ size: null, match: 'standard' });
      expect(isFaceNode(next)).toBe(true);
    }
  });
});
