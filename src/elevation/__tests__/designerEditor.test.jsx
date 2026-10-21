import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import DesignerEditor from '../DesignerEditor.jsx';
import ElevationLab from '../ElevationLab.jsx';
import ElevationCanvas from '../components/ElevationCanvas.jsx';
import PlanCanvas from '../plan/PlanCanvas.jsx';
import ElevationToolbar from '../components/ElevationToolbar.jsx';
import AddToolMenu from '../components/AddToolMenu.jsx';
import MissingAccessoriesNotice from '../components/MissingAccessoriesNotice.jsx';
import MissingSlidesNotice from '../components/MissingSlidesNotice.jsx';
import MissingDoorDesignsNotice from '../components/MissingDoorDesignsNotice.jsx';
import PropertiesPanel from '../components/PropertiesPanel.jsx';
import RoomHeightsPanel from '../components/RoomHeightsPanel.jsx';
import RoomSettingsPanel from '../components/RoomSettingsPanel.jsx';
import RoomPartNumbersPanel from '../components/RoomPartNumbersPanel.jsx';
import RoomStylePanel from '../components/RoomStylePanel.jsx';
import RoomDoorStylesPanel from '../components/RoomDoorStylesPanel.jsx';
import RoomPicker from '../components/RoomPicker.jsx';
import SampleRunsButton from '../components/SampleRunsButton.jsx';
import SettingsPanel from '../components/SettingsPanel.jsx';
import SettingGroups from '../components/SettingGroups.jsx';
import WallList from '../components/WallList.jsx';
import JsonToggle from '../components/JsonToggle.jsx';
import ExportDxfButton from '../components/ExportDxfButton.jsx';
import ReportsButton from '../../reports/ReportsButton.jsx';
import elevationReducer, { createInitialElevationState, setTool, setView } from '../store/elevationSlice.js';

vi.mock('react', async (original) => ({
  ...await original(), useState: vi.fn(), useEffect: vi.fn(), useRef: vi.fn(), useMemo: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('../components/ElevationCanvas.jsx', () => ({ default: 'elevation-canvas' }));
vi.mock('../plan/PlanCanvas.jsx', () => ({ default: 'plan-canvas' }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const component = (tree, type) => nodes(tree).find((node) => node.type === type);
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children)
    : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
const button = (tree, label) => nodes(tree).find((node) => node.type === 'button' && text(node) === label);
const field = (tree, label) => nodes(tree).find((node) => node.props['aria-label'] === label);
let state;
let dispatch;
let current;

// Render each component's JSX directly, retaining hook state and effect dependencies.
function renderComponent(Component, props = {}) {
  const renderer = { slots: [], cursor: 0, pending: [], props, tree: null };
  renderer.render = () => {
    current = renderer;
    renderer.cursor = 0;
    renderer.pending = [];
    renderer.tree = Component(renderer.props);
    renderer.pending.forEach((run) => run());
    return renderer.tree;
  };
  renderer.render();
  return renderer;
}

beforeEach(() => {
  vi.clearAllMocks();
  state = createInitialElevationState(null);
  dispatch = vi.fn((action) => { state = elevationReducer(state, action); return action; });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  useMemo.mockImplementation((calculate) => calculate());
  useRef.mockImplementation((initial) => {
    const owner = current;
    const index = owner.cursor++;
    if (!(index in owner.slots)) owner.slots[index] = { current: initial };
    return owner.slots[index];
  });
  useState.mockImplementation((initial) => {
    const owner = current;
    const index = owner.cursor++;
    if (!(index in owner.slots)) owner.slots[index] = initial;
    return [owner.slots[index], (value) => {
      owner.slots[index] = typeof value === 'function' ? value(owner.slots[index]) : value;
    }];
  });
  useEffect.mockImplementation((run, deps) => {
    const owner = current;
    const index = owner.cursor++;
    const previous = owner.slots[index];
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous[i]))) {
      owner.slots[index] = deps;
      owner.pending.push(run);
    }
  });
});

describe('DB6b b shared designer editor', () => {
  it('keeps the lab title, room picker, samples and full settings (anchor 1)', () => {
    expect(renderComponent(ElevationLab).tree.props).toEqual({ mode: 'lab' });
    for (const props of [{}, { mode: 'lab' }]) {
      const { tree } = renderComponent(DesignerEditor, props);
      expect(component(tree, RoomPicker)).toBeDefined();
      expect(component(tree, SampleRunsButton)).toBeDefined();
      expect(text(tree)).toContain('Elevation Lab');
      expect(component(tree, SettingsPanel).props.shopStandards).toBe(true);
      expect(nodes(tree).some((node) => node.type === 'fieldset')).toBe(false);
    }
    const settings = renderComponent(() => SettingsPanel());
    button(settings.tree, 'Settings+').props.onClick();
    settings.render();
    expect(component(settings.tree, SettingGroups).props.scope).toBe('team');
    expect(text(settings.tree)).toContain('Door thickness is on the team door style');
    expect(text(settings.tree)).toContain('Default height profile');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('uses the room header, view settings and banners in toolbar order (anchor 2)', () => {
    const header = <p>H</p>;
    const banners = <p>B</p>;
    const { tree } = renderComponent(DesignerEditor, { mode: 'room', header, banners });
    const notices = nodes(tree).filter(({ type }) => [MissingSlidesNotice, MissingAccessoriesNotice].includes(type));
    expect(notices.map(({ type }) => type)).toEqual([MissingSlidesNotice, MissingAccessoriesNotice]);
    expect(component(tree, RoomPicker)).toBeUndefined();
    expect(component(tree, SampleRunsButton)).toBeUndefined();
    expect(nodes(tree)).toContain(header);
    expect(text(tree)).not.toContain('Elevation Lab');
    expect(component(tree, SettingsPanel).props.shopStandards).toBe(false);
    const section = component(tree, 'section');
    expect(section.props.children.slice(0, 3)).toEqual([
      component(tree, ElevationToolbar), banners, component(tree, MissingDoorDesignsNotice),
    ]);
  });

  it('locks room panels and properties and selects the tool on becoming read-only (anchor 3)', () => {
    dispatch(setView('elevation'));
    dispatch(setTool('draw'));
    dispatch.mockClear();
    const editor = renderComponent(DesignerEditor, { mode: 'room', readOnly: false });
    expect(dispatch).not.toHaveBeenCalled();
    editor.props.readOnly = true;
    const tree = editor.render();
    const fieldsets = nodes(tree).filter((node) => node.type === 'fieldset');
    expect(fieldsets).toHaveLength(2);
    expect(fieldsets.every((node) => node.props.disabled && node.props.className === 'contents')).toBe(true);
    for (const panel of [WallList, RoomHeightsPanel, RoomSettingsPanel, RoomPartNumbersPanel, RoomStylePanel, RoomDoorStylesPanel]) {
      expect(component(fieldsets[0], panel)).toBeDefined();
    }
    expect(component(fieldsets[1], PropertiesPanel)).toBeDefined();
    for (const unlocked of [SettingsPanel, JsonToggle, ElevationCanvas]) {
      expect(component(tree, unlocked)).toBeDefined();
      expect(fieldsets.some((node) => component(node, unlocked))).toBe(false);
    }
    expect(component(tree, ElevationToolbar).props.readOnly).toBe(true);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith(setTool('select'));
    expect(state.tool).toBe('select');
    editor.render();
    expect(dispatch).toHaveBeenCalledOnce();
    dispatch(setView('plan'));
    expect(component(editor.render(), PlanCanvas)).toBeDefined();
    editor.props.readOnly = false;
    expect(nodes(editor.render()).filter((node) => node.type === 'fieldset').every((node) => !node.props.disabled)).toBe(true);
  });

  it('shows view controls and the Settings link without shop standards (anchor 4)', () => {
    const settings = renderComponent(SettingsPanel, { shopStandards: false });
    button(settings.tree, 'Settings+').props.onClick();
    const tree = settings.render();
    expect(component(tree, SettingGroups)).toBeUndefined();
    expect(field(tree, 'Drawing scale').type).toBe('select');
    expect(component(tree, Link).props.to).toBe('/settings');
    expect(text(tree)).toContain('View (not saved)');
    expect(text(tree)).toContain('Shop standards are on the Settings page.');
    expect(text(tree)).not.toContain('Door thickness');
    expect(text(tree)).not.toContain('Default height profile');
    expect(text(tree)).not.toContain('Overlap');
    expect(text(tree)).not.toContain('Gap');
    expect(nodes(tree).some((node) => node.props['aria-label']?.startsWith('Default '))).toBe(false);
    field(tree, 'Drawing scale').props.onChange({ target: { value: '24' } });
    expect(state.prefs.plotScale).toBe(24);
  });

  it('hides drawing, adding and soffit controls while keeping view and navigation controls usable', () => {
    for (const view of ['plan', 'elevation']) {
      dispatch(setView(view));
      dispatch(setTool('soffit'));
      const editable = renderComponent(ElevationToolbar).tree;
      expect(button(editable, view === 'plan' ? 'Draw wall' : 'Draw run')).toBeDefined();
      expect(component(editable, AddToolMenu)).toBeDefined();
      if (view === 'elevation') expect(field(editable, 'Default soffit molding')).toBeDefined();
      const toolbar = renderComponent(ElevationToolbar, { readOnly: true, onZoomToFit: vi.fn() });
      expect(button(toolbar.tree, 'Draw wall')).toBeUndefined();
      expect(button(toolbar.tree, 'Draw run')).toBeUndefined();
      expect(component(toolbar.tree, AddToolMenu)).toBeUndefined();
      expect(field(toolbar.tree, 'Default soffit molding')).toBeUndefined();
      expect(field(toolbar.tree, 'Reset soffit molding')).toBeUndefined();
      button(toolbar.tree, 'select').props.onClick();
      expect(state.tool).toBe('select');
      button(toolbar.tree, 'Zoom to fit').props.onClick();
      expect(toolbar.props.onZoomToFit).toHaveBeenCalledOnce();
      if (view === 'elevation') {
        for (const label of ['Previous wall', 'Next wall', 'Zoom in', 'Zoom out']) {
          expect(field(toolbar.tree, label)).toBeDefined();
        }
      }
      button(toolbar.tree, view === 'plan' ? 'elevation' : 'plan').props.onClick();
      expect(state.view).toBe(view === 'plan' ? 'elevation' : 'plan');
    }
  });
});

describe('UI4 room outputs and toolbar groups', () => {
  it('puts Export DXF then Reports in the left panel header, outside any locked fieldset (anchor 1)', () => {
    for (const props of [{ mode: 'lab' }, { mode: 'room', header: <p>H</p> }, { mode: 'room', header: <p>H</p>, readOnly: true }]) {
      const { tree } = renderComponent(DesignerEditor, props);
      const aside = component(tree, 'aside');
      const headerBlock = aside.props.children[0];
      const outputs = field(headerBlock, 'Room outputs');
      expect(outputs.props.children.map(({ type }) => type)).toEqual([ExportDxfButton, ReportsButton]);
      const fieldsets = nodes(tree).filter((node) => node.type === 'fieldset');
      fieldsets.forEach((fieldset) => expect(nodes(fieldset)).not.toContain(outputs));
      expect(component(component(tree, 'section'), ExportDxfButton)).toBeUndefined();
    }
  });

  it('splits the toolbar into tools, which wall and zoom groups that wrap, with zoom pushed right (anchor 2)', () => {
    dispatch(setView('elevation'));
    const elevation = renderComponent(ElevationToolbar, {}).tree;
    expect(elevation.props.className).toContain('flex-wrap');
    expect(elevation.props.className).toContain('min-w-0');
    expect(elevation.props.children.filter(Boolean).map((child) => child.props['aria-label']))
      .toEqual(['Canvas tools', 'Which wall', 'Zoom']);
    expect(field(elevation, 'Zoom').props.className).toContain('ml-auto');
    expect(button(field(elevation, 'Canvas tools'), 'Draw run')).toBeDefined();
    expect(field(field(elevation, 'Which wall'), 'Wall side')).toBeDefined();
    expect(field(field(elevation, 'Zoom'), 'Zoom in')).toBeDefined();
    expect(button(field(elevation, 'Zoom'), 'Zoom to fit')).toBeDefined();
    dispatch(setView('plan'));
    const plan = renderComponent(ElevationToolbar, {}).tree;
    expect(plan.props.children.filter(Boolean).map((child) => child.props['aria-label'])).toEqual(['Canvas tools', 'Zoom']);
    expect(button(field(plan, 'Canvas tools'), 'Center room')).toBeDefined();
  });
});
