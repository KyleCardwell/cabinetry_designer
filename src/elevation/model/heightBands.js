import { CABINET_TYPE_IDS } from './constants.js';

const SHOP_ROOM = ['shop', 'room'];
const PROFILE_LEVELS = [...SHOP_ROOM, 'wall'];
const field = (key, label, type = 'number', options = {}) => ({
  key, label, type, levels: PROFILE_LEVELS, ...options,
});
const setting = (key, label, furnitureBaseOnly = false) => field(key, label, 'setting', {
  levels: SHOP_ROOM, furnitureBaseOnly,
});
const pick = (key, label, pickKind, furnitureBaseOnly = false) => field(key, label, 'pick', {
  pickKind, furnitureBaseOnly,
});

export const HEIGHT_BANDS = [
  { id: 'wall', label: 'Wall', rows: [
    [field('wallHeight', 'Wall height', 'number', { levels: SHOP_ROOM })],
  ] },
  { id: 'crown', label: 'Crown', rows: [
    [field('crownTop', 'Top of crown'), field('crownStackHeight', 'Crown total')],
    [field('crownHeight', 'Crown'), pick('crownProfileId', 'Crown profile', 'crown')],
    [field('topMoldHeight', 'Top mold'), pick('topMoldProfileId', 'Top mold profile', 'top_mold')],
    [field('topMoldOverhang', 'Top mold overhang')],
    [setting('bandDepths.crownProjection', 'Band depth crown projection')],
    [field('boxTop', 'Box top', 'number', { levels: ['run'], cabinetTypes: [CABINET_TYPE_IDS.TALL, CABINET_TYPE_IDS.UPPER] })],
  ] },
  { id: 'uppers', label: 'Uppers', rows: [
    [field('upperClearance', 'Upper clearance', 'number', { levels: SHOP_ROOM })],
    [field('upperClearance', 'Clearance above counter', 'number', { levels: ['run'], cabinetTypes: [CABINET_TYPE_IDS.UPPER] })],
  ] },
  { id: 'countertop', label: 'Countertop', rows: [
    [field('countertopThickness', 'Countertop thickness'), pick('nosingProfileId', 'Nosing profile', 'nosing')],
    [setting('bandDepths.countertopOverhang', 'Band depth countertop overhang')],
    [field('countertopThickness', 'Countertop', 'number', { levels: ['run'], cabinetTypes: [CABINET_TYPE_IDS.BASE] })],
  ] },
  { id: 'base', label: 'Base', rows: [
    [field('baseKind', 'Base', 'baseKind'), field('toeKickHeight', 'Toe kick / base height')],
    [field('baseBoxHeight', 'Base box height')],
    [pick('furnitureBaseProfileId', 'Furniture base profile', 'furniture_base', true),
      field('furnitureBaseProud', 'Base proud', 'number', { furnitureBaseOnly: true })],
    [pick('baseCutoutProfileId', 'Cutout profile', 'base_cutout', true), setting('baseCutoutFoot', 'Cutout foot', true)],
    [setting('baseCutoutHeight', 'Square cutout height', true)],
    [setting('furnitureBaseScribe', 'Furniture base scribe', true)],
    [setting('bandDepths.toeKickSetback', 'Band depth toe kick setback')],
    [setting('bandDepths.toeKickEndPanelSetback', 'Band depth toe kick end panel setback')],
    [setting('bandDepths.toeKickSideSetback', 'Band depth toe kick side setback')],
    [field('baseKind', 'Base override', 'baseKind', { levels: ['run'], cabinetTypes: [CABINET_TYPE_IDS.BASE, CABINET_TYPE_IDS.TALL] }),
      field('toeKickHeight', 'Toe kick / base height', 'number', { levels: ['run'], cabinetTypes: [CABINET_TYPE_IDS.BASE, CABINET_TYPE_IDS.TALL] })],
    [field('baseBoxHeight', 'Box height', 'number', { levels: ['run'], cabinetTypes: [CABINET_TYPE_IDS.BASE] })],
    [field('furnitureBaseProfileId', 'Furniture base profile', 'pick', { pickKind: 'furniture_base', furnitureBaseOnly: true,
      levels: ['run'], cabinetTypes: [CABINET_TYPE_IDS.BASE, CABINET_TYPE_IDS.TALL] }),
      field('furnitureBaseProud', 'Base proud', 'number', { furnitureBaseOnly: true,
        levels: ['run'], cabinetTypes: [CABINET_TYPE_IDS.BASE, CABINET_TYPE_IDS.TALL] })],
  ] },
];

export const BAND_SETTING_KEYS = HEIGHT_BANDS.flatMap(({ rows }) => rows.flat())
  .filter(({ type }) => type === 'setting').map(({ key }) => key);

export function bandFieldsFor(level, { cabinetTypeId, furnitureBase = false } = {}) {
  return HEIGHT_BANDS.map((band) => ({
    ...band,
    rows: band.rows.map((row) => row.filter((entry) => entry.levels.includes(level)
      && (!entry.furnitureBaseOnly || furnitureBase)
      && (!entry.cabinetTypes || entry.cabinetTypes.includes(cabinetTypeId))))
      .filter((row) => row.length > 0),
  })).filter(({ rows }) => rows.length > 0);
}

export const MOLDING_NOTES = {
  'furniture-base-too-short': "The furniture base is shorter than its profile's stretch line; drawn at its own size.",
  'furniture-base-height-mismatch': 'The furniture base profile height differs from the base height; drawn at its own size.',
  'furniture-base-cut-bad': 'The furniture base cut goes outside the board; plain board used.',
  'furniture-base-extra-cuts': 'The furniture base profile has extra open lines; only the first cut is used.',
  'top-mold-above-crown': 'The top mold is taller than the crown total.',
  'top-mold-too-short': "The top mold is shorter than its profile's stretch line; drawn at its own size.",
  'molding-profile-missing': 'The picked profile is missing; plain molding used.',
  'molding-profile-open': 'The picked profile has no closed shape; plain molding used.',
};

export function warningBandId({ code, slot }) {
  if (code.startsWith('furniture-base-') || ['furniture_base', 'base_cutout'].includes(slot)) return 'base';
  if (slot === 'nosing') return 'countertop';
  return 'crown';
}
