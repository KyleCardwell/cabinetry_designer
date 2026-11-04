import { buildShape } from '../../shapeBuilders.js';

const CLEAT_SIDE = {
  units: 'in',
  points: { k1: [0, 0], k2: [0.75, 0], k3: [0.75, 1.25], k4: [0.5, 1.5], k5: [0, 1.5] },
  loops: [{ id: 'L1', closed: true, segs: ['k1', 'k2', 'k3', 'k4', 'k5'].map((from, i, a) => ({
    type: 'line', from, to: a[(i + 1) % a.length],
  })) }],
};
const BEAD = {
  units: 'in',
  points: { q1: [1, 0], q2: [1, 0.5], q3: [1, 1.5], q4: [1, 2] },
  loops: [{ id: 'L1', closed: false, segs: [
    { type: 'line', from: 'q1', to: 'q2' },
    { type: 'arc', from: 'q2', to: 'q3', center: [1, 1], ccw: true },
    { type: 'line', from: 'q3', to: 'q4' },
  ] }],
};
export const legShape = (bead = BEAD, stretch = 0, drawn = ['q1', 'q2', 'q3', 'q4']) => buildShape({
  id: 'leg', name: 'Leg', archived: false, version: 1, kind: 'leg',
  box: { x: 0, y: 0, z: 0, w: 1, h: 1, d: 1 }, stretch: {},
  views: { front: CLEAT_SIDE },
  builder: { type: 'stack', stretch, sections: [
    { type: 'square', width: 3.5, height: 8 },
    { type: 'turned', profile: bead, drawnPoints: { elevation: drawn } },
    { type: 'square', width: 2, height: 24.5 },
  ] },
});

