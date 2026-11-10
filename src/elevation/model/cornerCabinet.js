/** Door faces in the corner's wall A / wall B frame, independent of the box outline. */
export function cornerFaceLayout({
  kind = 90, legA, legB, depthA, depthB, offsetA, offsetB, sideReveal, gap, diagonalReveal, doors,
}) {
  const a = legA - depthB;
  const b = legB - depthA;
  if (kind === 90) return {
    a: { cornerReveal: doors === 'a_long' ? null : offsetB + gap },
    b: { cornerReveal: doors === 'b_long' ? null : offsetA + gap },
    shown: { a: a - offsetB, b: b - offsetA },
  };

  const w = Math.hypot(a, b);
  const n = [b / w, a / w];
  const c = n[0] * legA + n[1] * depthA + offsetA;
  const foot = ([x, y]) => {
    const distance = c - n[0] * x - n[1] * y;
    return [x + distance * n[0], y + distance * n[1]];
  };
  const fa = foot([legA + sideReveal, depthA + offsetA]);
  const fb = foot([depthB + offsetB, legB + sideReveal]);
  const span = Math.hypot(fb[0] - fa[0], fb[1] - fa[1]);
  const ordered = Math.floor((span - 2 * diagonalReveal) * 16 + 1e-9) / 16;
  return {
    feet: { a: fa, b: fb }, span, ordered, reveal: (span - ordered) / 2,
    shown: { a: span * a / w, b: span * b / w },
  };
}

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
