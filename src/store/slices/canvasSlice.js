import { createSlice } from '@reduxjs/toolkit';

/**
 * Canvas transient state — never persisted to DB.
 * Tracks viewport, active tool, selection, and snap guides.
 */
const canvasSlice = createSlice({
  name: 'canvas',
  initialState: {
    tool: 'select',          // 'select' | 'wall' | 'measure'
    selectedIds: [],          // object_ids or wall_ids currently selected
    selectionType: null,      // 'wall' | 'object' | null
    zoom: 1,
    panX: 0,
    panY: 0,
    snapEnabled: true,
    gridSize: 1,              // inches
    wallDrawStart: null,      // { x, y } when wall tool has first click
  },
  reducers: {
    setTool(state, action) {
      state.tool = action.payload;
      state.selectedIds = [];
      state.selectionType = null;
      state.wallDrawStart = null;
    },
    select(state, action) {
      const { ids, type } = action.payload;
      state.selectedIds = ids;
      state.selectionType = type;
    },
    clearSelection(state) {
      state.selectedIds = [];
      state.selectionType = null;
    },
    setViewport(state, action) {
      const { zoom, panX, panY } = action.payload;
      if (zoom !== undefined) state.zoom = zoom;
      if (panX !== undefined) state.panX = panX;
      if (panY !== undefined) state.panY = panY;
    },
    setWallDrawStart(state, action) {
      state.wallDrawStart = action.payload; // { x, y } or null
    },
    toggleSnap(state) {
      state.snapEnabled = !state.snapEnabled;
    },
    setGridSize(state, action) {
      state.gridSize = action.payload;
    },
  },
});

export const {
  setTool, select, clearSelection, setViewport,
  setWallDrawStart, toggleSnap, setGridSize,
} = canvasSlice.actions;
export default canvasSlice.reducer;
