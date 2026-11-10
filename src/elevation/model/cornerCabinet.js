/** Corner cabinet geometry in the frame along wall A and out into the room. */
export function cornerCabinetShape({ kind = 90, legA, legB, depthA, depthB }) {
  const a = legA - depthB;
  const b = legB - depthA;
  if (a <= 0 || b <= 0) return { errors: [{ code: 'legs-too-short' }] };

  if (kind === 90) {
    return {
      kind,
      outline: [[0, 0], [legA, 0], [legA, depthA], [depthB, depthA], [depthB, legB], [0, legB]],
      faces: [
        { id: 'A', from: [depthB, depthA], to: [legA, depthA], width: a, normal: [0, 1] },
        { id: 'B', from: [depthB, legB], to: [depthB, depthA], width: b, normal: [1, 0] },
      ],
      shown: { a, b },
      trueWidth: null,
      angle: null,
      miters: null,
    };
  }

  const trueWidth = Math.hypot(a, b);
  const angle = Math.atan2(b, a) * 180 / Math.PI;
  return {
    kind,
    outline: [[0, 0], [legA, 0], [legA, depthA], [depthB, legB], [0, legB]],
    faces: [{
      id: 'front', from: [legA, depthA], to: [depthB, legB],
      width: trueWidth, normal: [b / trueWidth, a / trueWidth],
    }],
    shown: { a, b },
    trueWidth,
    angle,
    miters: { a: angle / 2, b: (90 - angle) / 2 },
  };
}
