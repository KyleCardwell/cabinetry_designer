import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { attach, line, opening } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { attachOpeningToNewLine } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import { ReadOnlyValue } from './Field.jsx';
import LineProperties from './LineProperties.jsx';
import OpeningProperties from './OpeningProperties.jsx';
import StretchInput from './StretchInput.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));

const dispatch = vi.fn();
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const texts = (tree) => nodes(tree).flatMap(({ props }) => {
  const children = props?.children;
  return typeof children === 'string' ? [children]
    : Array.isArray(children) && children.every((child) => typeof child !== 'object' || child === null)
      ? [children.join('')] : [];
});
const settings = DEFAULT_SETTINGS;

function frontWall({ length = 240, lines, openings }) {
  return { id: 'H', length, height: 96, lines, openings, runs: [] };
}
const windowW = (overrides = {}) => opening({ id: 'W', kind: 'window', label: 'W1', sillZ: 36, height: 40, ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  useDispatch.mockReturnValue(dispatch);
  useState.mockImplementation((initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()]);
});

describe('LL3 line properties', () => {
  it('1. shows distance, end and what is attached', () => {
    const l1 = line('L1', 99, { from: 'right' });
    const wall = frontWall({ length: 235, lines: [l1], openings: [windowW({ offset: 118, attach: attach('L1') })] });
    const tree = LineProperties({ wall, line: l1, settings });
    const distance = nodes(tree).find(({ type, props }) => type === InchInput && props['aria-label'] === 'Layout line distance');
    expect(distance.props.value).toBe(99);
    const ends = nodes(tree).filter(({ type, props }) => type === 'button' && 'aria-pressed' in props);
    expect(ends.map(({ props }) => props['aria-pressed'])).toEqual([false, true]);
    expect(texts(tree)).toContain('W1 · centre · 0"');
    expect(texts(tree)).toContain('No warnings or errors.');
  });

  it('2. warns about a line past the wall end and a window pushed off it', () => {
    const past = line('L1', 250);
    const pastTree = LineProperties({ wall: frontWall({ lines: [past], openings: [] }), line: past, settings });
    expect(texts(pastTree)).toContain('L1 is past the wall end');
    const near = line('L1', 10);
    const wall = frontWall({ lines: [near], openings: [windowW({ offset: -8, attach: attach('L1') })] });
    expect(texts(LineProperties({ wall, line: near, settings })))
      .toContain('W1: Opening casing must stay inside the wall.');
  });
});

describe('LL3 opening layout line section', () => {
  it('3. an attached window shows its line, point and offset, and read-only position', () => {
    const wall = frontWall({ lines: [line('L1', 100)], openings: [windowW({ offset: 82, attach: attach('L1') })] });
    const tree = OpeningProperties({ wall, opening: wall.openings[0], settings });
    const select = nodes(tree).find(({ type, props }) => type === 'select' && props['aria-label'] === 'Opening layout line');
    expect(select.props.value).toBe('L1');
    const centre = nodes(tree).find(({ type, props }) => type === 'button' && props.children === 'Centre');
    expect(centre.props['aria-pressed']).toBe(true);
    const offset = nodes(tree).find(({ type, props }) => type === InchInput && props['aria-label'] === 'Opening line offset');
    expect(offset.props.value).toBe(0);
    const positions = nodes(tree).filter(({ props }) => /^Opening (left|right) (edge|center) position$/.test(
      props?.['aria-label'] ?? props?.ariaLabel ?? '',
    ));
    expect(positions).toHaveLength(4);
    expect(positions.every(({ type }) => type === ReadOnlyValue)).toBe(true);
    expect(nodes(tree).some(({ type }) => type === StretchInput)).toBe(false);
    expect(nodes(tree).some(({ props }) => props?.tag === 'Grows from L1')).toBe(true);
  });

  it('4. New line here makes a line through the window', () => {
    const wall = frontWall({ lines: [], openings: [windowW()] });
    const tree = OpeningProperties({ wall, opening: wall.openings[0], settings });
    const select = nodes(tree).find(({ type, props }) => type === 'select' && props['aria-label'] === 'Opening layout line');
    select.props.onChange({ target: { value: '__new' } });
    const sent = dispatch.mock.calls.at(-1)[0];
    expect(sent.type).toBe(attachOpeningToNewLine.type);
    expect(sent.payload).toMatchObject({ wallId: 'H', openingId: 'W', at: 'center' });
  });

  it('5. a window not attached keeps editable positions', () => {
    const wall = frontWall({ lines: [line('L1', 100)], openings: [windowW()] });
    const tree = OpeningProperties({ wall, opening: wall.openings[0], settings });
    const select = nodes(tree).find(({ type, props }) => type === 'select' && props['aria-label'] === 'Opening layout line');
    expect(select.props.value).toBe('');
    const positions = nodes(tree).filter(({ type, props }) => type === InchInput
      && /^Opening (left|right) (edge|center) position$/.test(props['aria-label']));
    expect(positions).toHaveLength(4);
    expect(nodes(tree).some(({ type }) => type === StretchInput)).toBe(true);
  });
});
