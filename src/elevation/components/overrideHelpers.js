export const LEVEL_LABELS = {
  default: 'Built-in default',
  team: 'Shop standard',
  project: 'Project',
  phase: 'Phase',
  room: 'Room',
};

export function sourceLabel(source) {
  return LEVEL_LABELS[source?.level ?? 'team'];
}

export function controlBorder(overridden) {
  return overridden ? 'border-teal-500' : 'border-gray-600';
}

export function overrideTitle({ level = 'room', overridden, source, inheritedText }) {
  const inherited = `${sourceLabel(source)}: ${inheritedText}`;
  return overridden ? `${LEVEL_LABELS[level]} override · ${inherited}` : inherited;
}
