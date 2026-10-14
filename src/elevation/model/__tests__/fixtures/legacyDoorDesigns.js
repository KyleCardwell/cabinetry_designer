import { DOOR_DESIGNS } from '../../doorStyles.js';

// Pre-50.18 designs retained for migration coverage.
export const LEGACY_DOOR_DESIGNS = DOOR_DESIGNS.slice(0, 3).map((design, index) => {
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
