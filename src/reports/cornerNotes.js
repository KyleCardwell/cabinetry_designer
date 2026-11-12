import { cornerEnd } from '../elevation/model/cornerEnd.js';
import { cornerBifold } from '../elevation/model/cornerBifold.js';
import { formatInch, formatSize } from './format.js';

const EPSILON = 1e-6;
const facingOrder = (side, a, b) => side === 'right' ? [a, b] : [b, a];
const degrees = (angle) => `${Number(angle.toFixed(1))}°`;

/** Corner frames use true-size miters or the individual L-shaped legs' members. */
export function cornerFrameNotes(corner, returnSide) {
  const { side, diagonal, frame, members } = corner;
  if (diagonal) {
    const [left, right] = facingOrder(side, ...diagonal.stiles);
    const stile = ({ width, cut, backWidth }) =>
      `${formatInch(width)} mitered ${degrees(cut)} (${formatInch(backWidth)} at back)`;
    const equal = ['width', 'cut', 'backWidth'].every((key) => Math.abs(left[key] - right[key]) < EPSILON);
    return equal ? `${formatInch(left.width)} stiles mitered ${degrees(left.cut)} (${formatInch(left.backWidth)} at back)`
      : `left stile ${stile(left)}, right stile ${stile(right)}`;
  }
  const legs = facingOrder(side, 'A', 'B').map((id, index) => {
    const rails = members.filter((member) => member.kind === 'rail' && member.side === id)
      .sort((a, b) => a.z - b.z);
    const bottom = rails[0];
    const top = rails.at(-1);
    const size = (rail) => formatSize(rail.height, rail.length);
    const equal = Math.abs(top.height - bottom.height) < EPSILON
      && Math.abs(top.length - bottom.length) < EPSILON;
    const notes = equal ? [`T & B rails ${size(top)}`] : [`TR ${size(top)}`, `BR ${size(bottom)}`];
    notes.push(...rails.slice(1, -1).map((rail) => `MR ${size(rail)}`));
    const stile = members.find((member) => member.kind === 'stile' && member.side === id);
    if (stile) {
      const reason = id === 'B' && returnSide.type === 'end_panel'
        ? ` (mitered to ${formatInch(returnSide.width)} end panel)` : '';
      notes.push(`stile ${formatSize(stile.width, frame.height)}${reason}`);
    }
    return `${index === 0 ? 'left' : 'right'} leg ${notes.join(', ')}`;
  });
  return `rails only, L-shape: ${legs.join(', ')}`;
}

/** Corner dimensions and exterior faces, ordered as you face the cabinet. */
export function cornerReportNotes(room, wall, run, entry, settings, cornerFrame) {
  const { side, kind } = entry.corner;
  const { depthA, depthB, shape } = cornerEnd(room, wall, run, side, settings);
  const legB = entry.cornerReturn?.legB;
  const bifold = cornerBifold(run, side, entry.layoutFace);
  const diagonal = cornerFrame?.diagonal;
  const roundUp = (value) => Math.ceil(value * 16 - 1e-9) / 16;
  const [left, right] = facingOrder(side,
    diagonal ? roundUp(diagonal.box.sideLongPoints.a[1]) : depthA,
    diagonal ? roundUp(diagonal.box.sideLongPoints.b[0]) : depthB);
  const equal = Math.abs(left - right) < EPSILON;
  let sides = equal ? `${formatInch(left)} L & R sides`
    : `${formatInch(left)} left side, ${formatInch(right)} right side`;
  if (diagonal) {
    const [leftAngle, rightAngle] = facingOrder(side, shape.angle, 90 - shape.angle);
    const bevel = Math.abs(leftAngle - rightAngle) < EPSILON ? degrees(leftAngle)
      : `${degrees(leftAngle)} / ${degrees(rightAngle)}`;
    sides += `, fronts bevelled ${bevel} for face frame (long point${equal ? '' : 's'})`;
  }
  const frontFaces = (faces = []) => faces.filter(({ type }) => type === 'door' || type === 'panel')
    .sort((a, b) => a.x - b.x);
  const fronts = facingOrder(side, frontFaces(entry.faces), frontFaces(legB?.faces)).flat();
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
    hinge: bifold ? `bi-fold doors ${bifold.hinge === 'left' ? 'hl' : bifold.hinge === 'right' ? 'hr' : 'hinge?'}` : null,
  };
}
