import { DOOR_DESIGNS } from '../../doorStyles.js';

// Keep pre-50.18 drawing cases explicit until step 528 changes construction behavior.
export const LEGACY_DOOR_DESIGNS = DOOR_DESIGNS.map((design, index) => {
  const { slabCore, panelJoint, defaults, ...legacy } = design;
  void slabCore;
  void panelJoint;
  void defaults;
  if (index === 1) return { ...legacy, description: 'Slab', slots: ['outside'] };
  if (index === 2) return {
    ...legacy, id: 'slab-applied', code: 'Slab AM',
    description: 'Slab with applied molding', construction: 'slab_applied',
  };
  return legacy;
});
