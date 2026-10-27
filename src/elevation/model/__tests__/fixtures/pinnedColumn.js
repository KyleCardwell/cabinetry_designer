// The DR3a stacked column: a six-inch manual row over an auto row.
export const stackedColumn = {
  id: 'B',
  cols: [{ id: 'B:col', size: null, sizeMode: 'auto' }],
  rows: [
    { id: 'B:top', size: 6, sizeMode: 'manual' },
    { id: 'B:bottom', size: null, sizeMode: 'auto' },
  ],
  cells: ['B-top', 'B-bottom'].map((id, row) => ({
    col: 0, row, colSpan: 1, rowSpan: 1, node: { id, kind: 'cabinet' },
  })),
};
