/** Panel return bands and along-face extents, shared by run and wall end panels. */
export function panelReturns({ side, u0, width, back, front, returns: requested, returnDepth }) {
  const shortReturn = Boolean(requested) && returnDepth <= width + 1e-6;
  const returns = !requested || shortReturn ? [] : ['front', 'back']
    .filter((edge) => requested === 'both' || requested === edge)
    .map((edge) => {
      const band = edge === 'front' ? { back: front - width, front } : { back, front: back + width };
      return { edge,
        start: side === 'left' ? u0 + width : u0 + width - returnDepth,
        end: side === 'left' ? u0 + returnDepth : u0,
        ...band };
    });
  return { returns, shortReturn };
}
