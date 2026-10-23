import { current } from '@reduxjs/toolkit';
import { isShapeList } from '../../model/libraryShapes.js';

export const shapeReducers = {
  addShape(state, action) {
    const { shape } = action.payload;
    const list = current(state.settings).shapes;
    const next = [...list, structuredClone(shape)];
    if (isShapeList(next)) state.settings.shapes = next;
  },
  updateShape(state, action) {
    const { shape } = action.payload;
    const list = current(state.settings).shapes;
    const index = list.findIndex((entry) => entry.id === shape?.id);
    if (index === -1) return;
    const existing = list[index];
    const changed = JSON.stringify([shape.box, shape.views, shape.stretch])
      !== JSON.stringify([existing.box, existing.views, existing.stretch]);
    const updated = { ...structuredClone(shape), version: existing.version + (changed ? 1 : 0) };
    const next = list.map((entry, i) => (i === index ? updated : entry));
    if (isShapeList(next)) state.settings.shapes = next;
  },
  setShapeArchived(state, action) {
    const { shapeId, archived } = action.payload;
    if (typeof archived !== 'boolean') return;
    const list = current(state.settings).shapes;
    const next = list.map((shape) => (shape.id === shapeId ? { ...shape, archived } : shape));
    if (isShapeList(next)) state.settings.shapes = next;
  },
  deleteShape(state, action) {
    const { shapeId } = action.payload;
    state.settings.shapes = state.settings.shapes.filter((shape) => shape.id !== shapeId);
  },
};
