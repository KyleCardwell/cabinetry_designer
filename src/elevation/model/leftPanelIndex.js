export const LEFT_PANEL_INDEX = [
  { id: 'left.walls', title: 'Walls', labels: ['Wall name', 'Wall number', 'Wall height', 'Wall thickness',
    'Include in elevations', 'Flip interior side', 'Lands on', 'End panels', 'Wall base override'] },
  { id: 'left.style', title: 'Style & door styles', labels: ['Cabinet style', 'Bead width',
    'Door styles', 'Draw door details', 'Show pulls', 'Show style tags', 'Show swing marks'] },
  { id: 'left.parts', title: 'Part numbers & report', labels: ['Part number start', 'Room note', 'Molding notes',
    'Part numbers'] },
];

export function matchingLeftPanel(query) {
  const search = query.trim().toLowerCase();
  if (!search) return [];
  return LEFT_PANEL_INDEX.map((block) => ({
    ...block,
    labels: block.title.toLowerCase().includes(search)
      ? block.labels : block.labels.filter((label) => label.toLowerCase().includes(search)),
  })).filter(({ labels }) => labels.length > 0);
}
