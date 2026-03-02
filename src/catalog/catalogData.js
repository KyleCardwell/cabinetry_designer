/**
 * Static catalog of parametric objects available for placement.
 * Each entry defines the object_type, default dimensions, and default params.
 * Users override these via the PropertyPanel after placement.
 */

export const CATALOG_ITEMS = [
  {
    catalog_id: 'base_cabinet_std',
    object_type: 'base_cabinet',
    label: 'Base Cabinet',
    defaultWidth: 24,
    defaultHeight: 34.5,
    defaultDepth: 24,
    defaultParams: {
      material_thickness: 0.75,
      toe_kick_height: 4,
      toe_kick_depth: 3,
      door_count: 2,
      drawer_count: 0,
      door_overlay: 0.5,
      reveal_gap: 0.125,
      shelf_count: 1,
    },
  },
  {
    catalog_id: 'wall_cabinet_std',
    object_type: 'wall_cabinet',
    label: 'Wall Cabinet',
    defaultWidth: 24,
    defaultHeight: 30,
    defaultDepth: 12,
    defaultParams: {
      material_thickness: 0.75,
      door_count: 2,
      door_overlay: 0.5,
      reveal_gap: 0.125,
      shelf_count: 2,
    },
  },
  {
    catalog_id: 'tall_cabinet_std',
    object_type: 'tall_cabinet',
    label: 'Tall Cabinet',
    defaultWidth: 24,
    defaultHeight: 84,
    defaultDepth: 24,
    defaultParams: {
      material_thickness: 0.75,
      toe_kick_height: 4,
      toe_kick_depth: 3,
      door_count: 2,
      drawer_count: 0,
      door_overlay: 0.5,
      reveal_gap: 0.125,
      shelf_count: 4,
    },
  },
  {
    catalog_id: 'appliance_generic',
    object_type: 'appliance',
    label: 'Appliance',
    defaultWidth: 30,
    defaultHeight: 36,
    defaultDepth: 24,
    defaultParams: {},
  },
  {
    catalog_id: 'filler_strip',
    object_type: 'filler',
    label: 'Filler',
    defaultWidth: 3,
    defaultHeight: 34.5,
    defaultDepth: 24,
    defaultParams: {},
  },
];
