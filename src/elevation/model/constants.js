/** Cabinet type identifiers shared with ff-job-schedule. */
export const CABINET_TYPE_IDS = {
  BASE: 1,
  UPPER: 2,
  TALL: 3,
  FILLER: 5,
  END_PANEL: 10,
};

/** Default room height profile used by new rooms. */
export const DEFAULT_PROFILE = {
  toeKickHeight: 4,
  baseBoxHeight: 30.5,
  countertopThickness: 1.5,
  upperClearance: 18,
  crownTop: 96,
  topMoldHeight: 3,
  crownHeight: 4.5,
  crownOverlap: 1.5,
};

/** Default persisted settings for Elevation Lab schema v2. */
export const DEFAULT_SETTINGS = {
  defaultProfile: { ...DEFAULT_PROFILE },
  baseDepth: 24,
  upperDepth: 12,
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
  bumperThickness: 0.0625,
  doorThickness: 0.8125,
  cornerFillerMinWidth: 1.5,
  cornerSnapDistance: 30,
  orthoWalls: true,
  planGrid: 0.5,
};

/** Display labels for derived piece kinds. */
export const KIND_LABELS = {
  cabinet: 'Cabinet',
  filler: 'Filler',
  end_panel: 'End panel',
};

/** Display colors for derived piece kinds. */
export const KIND_COLORS = {
  cabinet: '#3b82f6',
  filler: '#f59e0b',
  end_panel: '#8b5cf6',
};
