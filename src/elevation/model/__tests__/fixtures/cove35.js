export const cove35 = {
  id: 'cove35', name: 'Cove 3 1/2', kind: 'crown',
  geometry: {
    units: 'in',
    points: { a: [0, 0], b: [3, 0], c: [3, -0.5], d: [0.5, -3], e: [0.5, -3.5], f: [0, -3.5] },
    loops: [{ closed: true, segs: [
      { type: 'line', from: 'a', to: 'b' }, { type: 'line', from: 'b', to: 'c' },
      { type: 'arc', from: 'c', to: 'd', center: [3, -3], ccw: true },
      { type: 'line', from: 'd', to: 'e' }, { type: 'line', from: 'e', to: 'f' },
      { type: 'line', from: 'f', to: 'a' },
    ] }],
  },
  drawnPoints: { elevation: ['c', 'd'] },
};
