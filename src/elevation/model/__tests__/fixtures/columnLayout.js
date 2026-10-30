import { attach, auto, fixed, run } from '../../../../test/builders.js';

export function columnRun(overrides = {}) {
  const stack = run({ id: 'B', items: [auto('B1'), auto('B2')] }).grid;
  // A vertical stack with one manual height and one auto height.
  stack.id = 'B';
  stack.rows = [
    { id: 'B:top', size: 25.25, sizeMode: 'manual' },
    { id: 'B:bottom', size: null, sizeMode: 'auto' },
  ];
  stack.cols = [{ id: 'B:width', size: null, sizeMode: 'auto' }];
  stack.cells[1].col = 0;
  stack.cells[1].row = 1;
  stack.cells[0].node.face = { type: 'open' };
  return run({
    autoCount: false,
    items: [
      { ...auto('A'), face: { type: 'open' } },
      { ...fixed('B', 36), grid: stack, top: { value: 2, source: 'manual' } },
      // LL4: on layout line `P` (the wall needs `lines: [line('P', 60)]`; wall-end pins became lines).
      { ...fixed('C', 30), attach: attach('P'), absorb: true, gap: 0.125 },
    ],
    ...overrides,
  });
}
