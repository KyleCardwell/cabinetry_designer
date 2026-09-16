export const CABINET_TYPE_IDS = {
  BASE: 1,
  UPPER: 2,
  TALL: 3,
  FILLER: 5,
  END_PANEL: 10,
};

export const DEFAULT_SETTINGS = {
  toeKickHeight: 4,
  baseBoxHeight: 30.5,
  baseDepth: 24,
  countertopThickness: 1.5,
  upperBottomZ: 54,
  upperBoxHeight: 30,
  upperDepth: 12,
  tallBoxHeight: 84,
  tallDepth: 24,
  roundTo: 0.5,
  maxCabinetWidth: 36,
  minCabinetWidth: 9,
  fillerMinWidth: 1.5,
  fillerWarnWidth: 6,
  endPanelThickness: 0.75,
  defaultInteriorFillerWidth: 3,
  minRunWidth: 9,
  snapHeightsToDefaults: true,
  defaultEnds: { left: 'filler', right: 'filler' },
};

export const KIND_LABELS = {
  cabinet: 'Cabinet',
  filler: 'Filler',
  end_panel: 'End panel',
};

export const KIND_COLORS = {
  cabinet: '#3b82f6',
  filler: '#f59e0b',
  end_panel: '#8b5cf6',
};
