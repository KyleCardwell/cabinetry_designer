/** The stored choice, or the default for this end's type. Blind and None stay full height. */
export function endHeightMode(end) {
  if (end?.type !== 'filler' && end?.type !== 'end_panel') return 'full';
  return end.height ?? (end.type === 'filler' ? 'cabinets' : 'full');
}
