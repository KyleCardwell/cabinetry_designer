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
  wallHeight: 96,
  toeKickHeight: 4,
  baseBoxHeight: 30.5,
  countertopThickness: 1.5,
  upperClearance: 18,
  crownTop: 96,
  topMoldHeight: 3,
  crownHeight: 4.5,
  crownStackHeight: 6,
};

/** Default persisted settings for Elevation Lab schema v3. */
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
  maxRunOverhang: 36,
  snapHeightsToDefaults: true,
  defaultEnds: { left: 'filler', right: 'filler' },
  bumperThickness: 0.0625,
  doorThickness: 0.8125,
  fillerReturnDepth: 2.5,
  fillerReturnThickness: 0.75,
  blindFillerWidth: 6,
  cornerFillerMinWidth: 1.5,
  cornerSnapDistance: 3,
  defaultSoffitDepth: 14,
  defaultSoffitMolding: 'crown',
  autoEndPanelOnFreeEnd: true,
  adjacentRunGap: 1,
  orthoWalls: true,
  showPartNumbers: true,
  planGrid: 0.5,
  casingWidth: 3,
  casingThickness: 0.75,
  casingClearance: 0,
  openingsHaveCasing: true,
  defaultOpeningMeasureMode: 'jamb',
  defaultDoorWidth: 36,
  defaultDoorHeight: 80,
  defaultWindowWidth: 36,
  defaultWindowHeight: 48,
  defaultWindowSillZ: 36,
  minOpeningWidth: 6,
  openingSnap: 0.5,
  pairDoorAboveWidth: 24,
  faceReveals: {
    [CABINET_TYPE_IDS.BASE]: {
      top: 0.25, bottom: 0.125, left: 0.0625, right: 0.0625, horizontal: 0.125, vertical: 0.125,
    },
    [CABINET_TYPE_IDS.UPPER]: {
      top: 0.125, bottom: -0.125, left: 0.0625, right: 0.0625, horizontal: 0.125, vertical: 0.125,
    },
    [CABINET_TYPE_IDS.TALL]: {
      top: 0.125, bottom: 0.125, left: 0.0625, right: 0.0625, horizontal: 0.125, vertical: 0.125,
    },
  },
  defaultStyle: { cabinetStyleId: 13, beadWidth: 0.25, profiledEdge: false },
  insetFrame: { stile: 0.75, rail: 1.5, midRail: 1.5, mullion: 1.5, upperDrop: 0.75 },
  profiledFit: { edge: 0.09375, pairEdge: 0.0625, pairGap: 0.125 },
  woodTopReveal: 0.125,
  capturedSingleReveal: 0.09375,
  stackedUpperBottom: 0,
  stackedLowerTop: 0.125,
  floatingShelfThickness: 1.5,
  standardDrawerHeights: { european: 5.875, faceFrame: 5 },
  standardDrawerBelow: 6,
};

/** Display labels for derived piece kinds. */
export const KIND_LABELS = {
  cabinet: 'Cabinet',
  filler: 'Filler',
  end_panel: 'End panel',
  panel: 'Panel',
  void: 'Open',
  shelves: 'Shelves',
  shelf: 'Shelf',
};

/** Display colors for derived piece kinds. */
export const KIND_COLORS = {
  cabinet: '#3b82f6',
  filler: '#f59e0b',
  end_panel: '#8b5cf6',
  panel: '#8b5cf6',
  void: '#475569',
  shelves: '#0ea5e9',
  shelf: '#0ea5e9',
};

/** Display colors for cabinet run types. */
export const CABINET_TYPE_COLORS = {
  [CABINET_TYPE_IDS.BASE]: '#3b82f6',
  [CABINET_TYPE_IDS.UPPER]: '#14b8a6',
  [CABINET_TYPE_IDS.TALL]: '#8b5cf6',
};
