import { cornerEnd } from '../elevation/model/cornerEnd.js';
import { formatInch } from './format.js';

/** Corner dimensions and exterior faces, ordered as you face the cabinet. */
export function cornerReportNotes(room, wall, run, entry, settings) {
  const { side, kind } = entry.corner;
  const { depthA, depthB, construction } = cornerEnd(room, wall, run, side, settings);
  const legB = entry.cornerReturn?.legB;
  const leftFirst = (a, b) => side === 'right' ? [a, b] : [b, a];
  const [left, right] = leftFirst(depthA, depthB);
  const sides = construction === 'frame' && kind === 45 ? null
    : Math.abs(left - right) < 1e-6 ? `${formatInch(left)} L & R sides`
      : `${formatInch(left)} left side, ${formatInch(right)} right side`;
  const frontFaces = (faces = []) => faces.filter(({ type }) => type === 'door' || type === 'panel')
    .sort((a, b) => a.x - b.x);
  const fronts = leftFirst(frontFaces(entry.faces), frontFaces(legB?.faces)).flat();
  const doors = fronts.length === 2 && fronts.every(({ type }) => type === 'door')
    && Math.abs(fronts[0].width - fronts[1].width) <= 1 / 32 + 1e-6
    ? `2 doors x ${formatInch(fronts[0].width)} wide`
    : fronts.map(({ type, width }) => `${type} x ${formatInch(width)} wide`).join(', ') || null;
  return {
    revealValues: kind === 90 && legB ? {
      [side]: legB.reveals.values[entry.cornerReturn.dir === 1 ? 'right' : 'left'],
    } : {},
    sides,
    doors,
    hinge: kind === 90 && entry.faces.some(({ type }) => type === 'door')
      && legB?.faces.some(({ type }) => type === 'door') ? 'bi-fold doors' : null,
  };
}
