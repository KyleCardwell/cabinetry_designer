import { describe, expect, it, vi } from 'vitest';
import { fixed, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import RunEndsSection from '../properties/RunEndsSection.jsx';

vi.mock('react', async (original) => ({ ...await original(), useMemo: (compute) => compute() }));
vi.mock('react-redux', () => ({ useDispatch: () => vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];

describe('BT1 b run end warning', () => {
  it('shows the specified message at the end whose blind box passes the wall', () => {
    for (const side of ['left', 'right']) {
      const host = run({
        x: side === 'left' ? 10 : 90,
        width: 20,
        autoCount: false,
        items: [fixed('cab', 20)],
        blind: { [side]: 42 },
        ends: { left: { type: 'none' }, right: { type: 'none' }, [side]: { type: 'blind' } },
      });
      const currentWall = wall({ x2: 120, runs: [host] });
      const currentRoom = room({ walls: [currentWall] });
      const tree = RunEndsSection({
        room: currentRoom, wall: currentWall, run: host, settings: DEFAULT_SETTINGS,
        actionBase: { roomId: currentRoom.id, wallId: currentWall.id, runId: host.id },
      });
      const ends = tree.props.children.props.children;
      const message = 'The blind box runs past the wall. Shorten the blind width or move the run.';
      expect(nodes(ends[side === 'left' ? 0 : 1]).filter(({ type, props }) => (
        type === 'p' && props.children === message
      ))).toHaveLength(1);
      expect(nodes(ends[side === 'left' ? 1 : 0]).some(({ props }) => props.children === message)).toBe(false);
    }
  });
});
