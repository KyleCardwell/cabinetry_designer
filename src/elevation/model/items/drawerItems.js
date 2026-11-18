import { sheetThickness } from '../doorStyles.js';
import { resolveSlide } from '../slides.js';
import { formatSize } from './format.js';

export const drawerItems = {
  kinds: ['rot', 'trash_lid'],
  description(part) {
    switch (part.kind) {
      case 'rot': return 'ROT Drawer Box';
      case 'trash_lid': return 'Trash Lid';
    }
  },
  size(part, context, { settings }) {
    const box = context.drawerBox?.();
    if (!box || ![box.width, box.height, box.depth].every(Number.isFinite)) return '';
    return part.kind === 'rot' ? formatSize(box.width, box.height, box.depth)
      : formatSize(box.width, box.depth, sheetThickness(settings));
  },
  notes(part, context, { settings }) {
    const groups = {};
    if (part.kind === 'rot') {
      const box = context.drawerBox?.();
      if (box) groups[4.5] = [...box.notes,
        box.slideId !== resolveSlide(settings).id ? box.slide.name : null];
    }
    return groups;
  },
};
