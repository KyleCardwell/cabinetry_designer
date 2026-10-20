import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import MissingDesignsDialog from '../MissingDesignsDialog.jsx';
import MissingDoorDesignsNotice, { MissingDoorDesignRow } from '../../elevation/components/MissingDoorDesignsNotice.jsx';
import MissingPullsNotice, { MissingPullRow } from '../../elevation/components/MissingPullsNotice.jsx';
import MissingSlidesNotice, { MissingSlideRow } from '../../elevation/components/MissingSlidesNotice.jsx';
import MissingAccessoriesNotice, { MissingAccessoryRow } from '../../elevation/components/MissingAccessoriesNotice.jsx';
import { newAccessory } from '../../elevation/model/accessories.js';
import { BUILT_IN_SLIDES } from '../../elevation/model/slides.js';
import { DEFAULT_DOOR_STYLE } from '../../elevation/model/doorStyles.js';
import elevationReducer, { moveMissingDoorDesign, moveMissingPull } from '../../elevation/store/elevationSlice.js';
import { auto, run, stateWithRun } from '../../elevation/store/__tests__/helpers/sliceFixtures.js';

vi.mock('react', async (original) => ({ ...await original(), useEffect: vi.fn(), useState: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const archived = '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b';
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children)
    : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
const button = (tree, label) => nodes(tree).find((node) => node.type === 'button' && text(node) === label);
const select = (tree) => nodes(tree).find((node) => node.type === 'select');
let state;
let dispatch;
let current;

// Preserve hook state while rendering JSX directly, like the other project UI tests.
function renderComponent(Component, props = {}) {
  const owner = { slots: [], effects: [], tree: null };
  owner.render = () => {
    current = owner;
    owner.cursor = 0;
    owner.pending = [];
    owner.tree = Component(props);
    owner.pending.forEach((run) => run());
    return owner.tree;
  };
  owner.render();
  return owner;
}
const rows = (tree) => nodes(tree).filter((node) => node.type === MissingDoorDesignRow)
  .map((node) => renderComponent(MissingDoorDesignRow, node.props));
const room = () => state.elevation.rooms[0];

beforeEach(() => {
  vi.clearAllMocks();
  state = { elevation: stateWithRun() };
  room().doorStyles = ['A', 'C'].map((label) => ({ ...DEFAULT_DOOR_STYLE, id: label, label, designId: archived }));
  state.elevation.cloud = { room: { id: room().id, readOnly: false } };
  dispatch = vi.fn((action) => { state.elevation = elevationReducer(state.elevation, action); });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector(state));
  useState.mockImplementation((initial) => {
    const owner = current;
    const index = owner.cursor++;
    if (!(index in owner.slots)) owner.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [owner.slots[index], (value) => {
      owner.slots[index] = typeof value === 'function' ? value(owner.slots[index]) : value;
    }];
  });
  useEffect.mockImplementation((run, deps) => {
    const owner = current;
    const index = owner.cursor++;
    const previous = owner.effects[index];
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous[i]))) {
      owner.pending.push(() => { owner.effects[index] = deps; run(); });
    }
  });
});

const pullRows = (tree) => nodes(tree).filter((node) => node.type === MissingPullRow)
  .map((node) => renderComponent(MissingPullRow, node.props));

function pullRoom() {
  state.elevation = stateWithRun(run({ autoCount: false, drawerPullId: 'gone', items: [
    { ...auto('c1'), face: { type: 'door', size: null, pullId: 'gone' } },
  ] }));
  room().settingsOverrides = { doorPullId: 'gone' };
  state.elevation.layers = { project: { id: 1, values: { doorPullId: 'old' } }, phase: null };
  state.elevation.cloud = { room: { id: room().id, readOnly: false } };
}

describe('HP3c step c missing pull notices', () => {
  it('anchor 3: renders room counts and layer-only guidance with named replacement options', () => {
    pullRoom();
    const [gone, old] = pullRows(renderComponent(MissingPullsNotice).tree);
    expect(text(gone.tree)).toContain('Pull `gone` isn\'t in the Library any more. 3 places in this room use it and draw as the 4" pull until moved.');
    expect(text(gone.tree)).toContain('Move them to');
    expect(select(gone.tree).props.value).toBe('pull-4');
    expect(nodes(gone.tree).filter(({ type }) => type === 'option').map(({ props }) => [props.value, text(props.children)]))
      .toEqual([['pull-4', '4" pull'], ['knob-1-25', '1 1/4" knob'], ['none', 'No pull']]);
    expect(text(old.tree)).toBe("Pull `old` isn't in the Library any more. Set in the project settings — change it there.");
    expect(select(old.tree)).toBeUndefined();
    expect(button(old.tree, 'Move')).toBeUndefined();
    select(gone.tree).props.onChange({ target: { value: 'knob-1-25' } });
    gone.render();
    button(gone.tree, 'Move').props.onClick();
    expect(dispatch).toHaveBeenCalledWith(moveMissingPull({ roomId: room().id, pullId: 'gone', reassignTo: 'knob-1-25' }));
    expect(pullRows(renderComponent(MissingPullsNotice).tree)).toHaveLength(1);
  });

  it('anchor 4: uses the archived name and singular count in read-only rooms without controls', () => {
    pullRoom();
    state.elevation.layers = null;
    room().settingsOverrides = { doorPullId: archived.toUpperCase() };
    room().walls = [];
    state.elevation.cloud.room.readOnly = true;
    const [row] = pullRows(renderComponent(MissingPullsNotice).tree);
    expect(text(row.tree)).toBe('An archived pull isn\'t in the Library any more. 1 place in this room uses it and draw as the 4" pull until moved. Someone who can edit the room can move them.');
    expect(select(row.tree)).toBeUndefined();
    expect(button(row.tree, 'Move')).toBeUndefined();
    expect(renderComponent(MissingDesignsDialog).tree).toBeNull();
  });

  it('anchor 5: opens for pulls alone, supports Not now, and puts pull rows after design rows under the combined title', () => {
    pullRoom();
    const dialog = renderComponent(MissingDesignsDialog);
    expect(text(dialog.tree)).toContain("This room uses pulls that aren't in the Library");
    expect(pullRows(dialog.tree)).toHaveLength(2);
    button(dialog.tree, 'Not now').props.onClick();
    expect(dialog.render()).toBeNull();
    expect(renderComponent(MissingPullsNotice).tree).not.toBeNull();
    room().doorStyles = [{ ...DEFAULT_DOOR_STYLE, id: 'a', label: 'A', designId: 'missing' }];
    const combined = renderComponent(MissingDesignsDialog);
    expect(text(combined.tree)).toContain("This room uses door designs and pulls that aren't in the Library");
    expect(nodes(combined.tree).filter(({ type }) => [MissingDoorDesignRow, MissingPullRow].includes(type)).map(({ type }) => type))
      .toEqual([MissingDoorDesignRow, MissingPullRow, MissingPullRow]);
  });

  it('defaults to the first listed pull, permits No pull, keeps layer guidance after Move, and closes when all missing ids are resolved', () => {
    pullRoom();
    state.elevation.settings = { ...state.elevation.settings, doorPullId: 'gone', drawerPullId: 'gone' };
    state.elevation.layers = { project: null, phase: { values: { doorPullId: 'gone' } } };
    const dialog = renderComponent(MissingDesignsDialog);
    const [row] = pullRows(dialog.tree);
    expect(text(row.tree)).toContain('Set in the shop standard — change it there.');
    expect(text(row.tree)).toContain('Set in the phase settings — change it there.');
    select(row.tree).props.onChange({ target: { value: 'none' } });
    row.render();
    button(row.tree, 'Move').props.onClick();
    expect(room().settingsOverrides.doorPullId).toBe('none');
    expect(select(pullRows(dialog.render())[0].tree)).toBeUndefined();
    state.elevation = structuredClone(state.elevation);
    state.elevation.settings.doorPullId = 'pull-4';
    state.elevation.settings.drawerPullId = 'none';
    state.elevation.layers = null;
    expect(dialog.render()).toBeNull();
    expect(renderComponent(MissingPullsNotice).tree).toBeNull();
    room().settingsOverrides.doorPullId = 'later';
    expect(dialog.render()).toBeNull();
    expect(renderComponent(MissingPullsNotice).tree).not.toBeNull();
  });
});

describe('DB6b e missing door designs on open', () => {
  it('asks for one replacement for archived styles A and C (anchor 1)', () => {
    const dialog = renderComponent(MissingDesignsDialog);
    expect(text(dialog.tree)).toContain("This room uses door designs that aren't in the Library");
    expect(nodes(dialog.tree).find((node) => node.props.role === 'dialog').props['aria-modal']).toBe('true');
    const [row] = rows(dialog.tree);
    expect(rows(dialog.tree)).toHaveLength(1);
    expect(text(row.tree)).toContain("An archived door design isn't in the Library any more. Styles A, C use it");
    expect(text(row.tree)).not.toContain(archived);
    expect(select(row.tree)).toBeDefined();
    expect(button(row.tree, 'Move')).toBeDefined();
  });

  it('moves the styles to slab and closes when nothing is missing (anchor 2)', () => {
    const dialog = renderComponent(MissingDesignsDialog);
    const [row] = rows(dialog.tree);
    select(row.tree).props.onChange({ target: { value: 'slab' } });
    row.render();
    button(row.tree, 'Move').props.onClick();
    expect(dispatch).toHaveBeenCalledWith(moveMissingDoorDesign({ roomId: 'room-1', designId: archived, reassignTo: 'slab' }));
    expect(room().doorStyles.map((style) => style.designId)).toEqual(['slab', 'slab']);
    expect(dialog.render()).toBeNull();
  });

  it('keeps the notice after Not now and does not prompt again on room edits (anchor 3)', () => {
    const dialog = renderComponent(MissingDesignsDialog);
    button(dialog.tree, 'Not now').props.onClick();
    expect(dialog.render()).toBeNull();
    room().name = 'Renamed';
    expect(dialog.render()).toBeNull();
    const notice = renderComponent(MissingDoorDesignsNotice);
    expect(rows(notice.tree)).toHaveLength(1);
    expect(button(rows(notice.tree)[0].tree, 'Move')).toBeDefined();
  });

  it('shows only notice text when the cloud room is read-only (anchor 4)', () => {
    state.elevation.cloud.room.readOnly = true;
    expect(renderComponent(MissingDesignsDialog).tree).toBeNull();
    const [row] = rows(renderComponent(MissingDoorDesignsNotice).tree);
    expect(text(row.tree)).toContain('An archived door design');
    expect(text(row.tree)).toMatch(/Someone who can edit the room can move them\.$/);
    expect(select(row.tree)).toBeUndefined();
    expect(button(row.tree, 'Move')).toBeUndefined();
  });

  it('keeps the sandbox notice editable with the legacy design name (anchor 5)', () => {
    delete state.elevation.cloud;
    room().doorStyles.forEach((style) => { style.designId = 'old'; });
    const [row] = rows(renderComponent(MissingDoorDesignsNotice).tree);
    expect(text(row.tree)).toContain('Door design `old`');
    expect(select(row.tree)).toBeDefined();
    expect(button(row.tree, 'Move')).toBeDefined();
  });

  it('shows neither the dialog nor the notice when nothing is missing (anchor 6)', () => {
    room().doorStyles.forEach((style) => { style.designId = 'slab'; });
    expect(renderComponent(MissingDesignsDialog).tree).toBeNull();
    expect(renderComponent(MissingDoorDesignsNotice).tree).toBeNull();
  });

  it('lists each missing design and stays closed after all replacements are complete', () => {
    room().doorStyles[1].designId = 'old';
    const dialog = renderComponent(MissingDesignsDialog);
    const missingRows = rows(dialog.tree);
    expect(missingRows).toHaveLength(2);
    button(missingRows[0].tree, 'Move').props.onClick();
    expect(rows(dialog.render())).toHaveLength(1);
    button(rows(dialog.tree)[0].tree, 'Move').props.onClick();
    expect(dialog.render()).toBeNull();
    // A later library edit in the same open room leaves just the reminder.
    state.elevation = structuredClone(state.elevation);
    room().doorStyles[0].designId = 'later';
    expect(dialog.render()).toBeNull();
    expect(renderComponent(MissingDoorDesignsNotice).tree).not.toBeNull();
  });
});


describe('IN5 e missing slide notices', () => {
  const slideRows = (tree) => nodes(tree).filter((node) => node.type === MissingSlideRow)
    .map((node) => renderComponent(MissingSlideRow, node.props));

  it('shows named options and layer guidance, moves both uses and clears a room override', () => {
    state.elevation = stateWithRun(run({ autoCount: false, items: [
      { ...auto('c1'), drawerSlideId: archived, face: { type: 'drawer_front', size: null, drawerBox: { slideId: archived } } },
    ] }));
    state.elevation.cloud = { room: { id: room().id, readOnly: false } };
    state.elevation.layers = { project: { values: { drawerSlideId: 'x' } } };
    const dialog = renderComponent(MissingDesignsDialog);
    expect(text(dialog.tree)).toContain("This room uses slides that aren't in the Library");
    const [row, project] = slideRows(dialog.tree);
    expect(text(row.tree)).toContain("An archived slide isn't in the Library any more. 2 places in this room use it and size from the next slide up until moved.");
    expect(nodes(row.tree).filter(({ type }) => type === 'option').map(({ props }) => [props.value, text(props.children)]))
      .toEqual([...BUILT_IN_SLIDES.map(({ id, name }) => [id, name]), ['', 'Clear the pick']]);
    expect(text(project.tree)).toBe("Slide `x` isn't in the Library any more. Set in the project settings — change it there.");
    expect(select(project.tree)).toBeUndefined();
    select(row.tree).props.onChange({ target: { value: 'accuride-3832' } });
    row.render();
    button(row.tree, 'Move').props.onClick();
    expect(slideRows(dialog.render())).toHaveLength(1);
    // Clearing a pick removes the room override and leaves the higher layers intact.
    state.elevation = structuredClone(state.elevation);
    room().settingsOverrides = { drawerSlideId: 'gone' };
    state.elevation.settings.drawerSlideId = 'gone';
    state.elevation.layers.phase = { values: { drawerSlideId: 'gone' } };
    const clear = slideRows(renderComponent(MissingSlidesNotice).tree).find((row) => select(row.tree));
    expect(text(clear.tree)).toContain('Set in the shop standard — change it there.');
    expect(text(clear.tree)).toContain('Set in the phase settings — change it there.');
    select(clear.tree).props.onChange({ target: { value: '' } });
    clear.render();
    button(clear.tree, 'Move').props.onClick();
    expect(room().settingsOverrides).not.toHaveProperty('drawerSlideId');
    expect(state.elevation.settings.drawerSlideId).toBe('gone');
    expect(state.elevation.layers.phase.values.drawerSlideId).toBe('gone');
  });

  it('combines slide rows with existing rows and keeps read-only or version notices without controls', () => {
    room().settingsOverrides = { drawerSlideId: archived };
    const dialog = renderComponent(MissingDesignsDialog);
    expect(text(dialog.tree)).toContain("This room uses door designs and slides that aren't in the Library");
    expect(slideRows(dialog.tree)).toHaveLength(1);
    button(dialog.tree, 'Not now').props.onClick();
    expect(dialog.render()).toBeNull();
    expect(slideRows(renderComponent(MissingSlidesNotice).tree)).toHaveLength(1);
    for (const source of ['cloud', 'version']) {
      state.elevation.source = source;
      state.elevation.cloud.room.readOnly = source === 'cloud';
      const [row] = slideRows(renderComponent(MissingSlidesNotice).tree);
      expect(text(row.tree)).toContain('1 place in this room uses it and size from the next slide up until moved.');
      expect(text(row.tree)).toContain('Someone who can edit the room can move them.');
      expect(select(row.tree)).toBeUndefined();
      expect(button(row.tree, 'Move')).toBeUndefined();
    }
    state.elevation = structuredClone(state.elevation);
    delete room().settingsOverrides.drawerSlideId;
    expect(renderComponent(MissingSlidesNotice).tree).toBeNull();
    state.elevation.activeRoomId = 'absent';
    expect(renderComponent(MissingSlidesNotice).tree).toBeNull();
  });
});


const accessoryRows = (tree) => nodes(tree).filter((node) => node.type === MissingAccessoryRow)
  .map((node) => renderComponent(MissingAccessoryRow, node.props));
function accessoryRoom() {
  state.elevation = stateWithRun(run({ autoCount: false, items: [
    { ...auto('c1'), interior: { accessories: [{ accessoryId: 'gone' }] } },
    { ...auto('c2'), interior: { accessories: [{ accessoryId: 'gone' }] } },
  ] }));
  state.elevation.settings.accessories = [
    { ...newAccessory([], 'tray'), name: 'Tray' }, { ...newAccessory([], 'susan'), name: 'Susan' },
    { ...newAccessory([], 'drawer'), name: 'Drawer insert', attachesTo: 'drawer_box' },
  ];
  state.elevation.cloud = { room: { id: room().id, readOnly: false } };
}

it('IN12b f anchors 1 and 6: combines missing slides and accessories and moves all accessory uses from the notice', () => {
  accessoryRoom();
  room().settingsOverrides = { drawerSlideId: 'old-slide' };
  const dialog = renderComponent(MissingDesignsDialog);
  expect(text(dialog.tree)).toContain("This room uses slides and accessories that aren't in the Library");
  expect(nodes(dialog.tree).filter(({ type }) => [MissingSlideRow, MissingAccessoryRow].includes(type)).map(({ type }) => type))
    .toEqual([MissingSlideRow, MissingAccessoryRow]);
  const [row] = accessoryRows(renderComponent(MissingAccessoriesNotice).tree);
  expect(text(row.tree)).toContain("Accessory `gone` isn't in the Library any more. 2 places in this room use it.");
  expect(nodes(row.tree).filter(({ type }) => type === 'option').map(({ props }) => [props.value, text(props.children)]))
    .toEqual([['susan', 'Susan'], ['tray', 'Tray'], ['', 'Remove them']]);
  expect(select(row.tree).props.value).toBe('susan');
  select(row.tree).props.onChange({ target: { value: 'tray' } });
  row.render();
  button(row.tree, 'Move').props.onClick();
  expect(dispatch).toHaveBeenCalledWith({ type: 'elevation/moveMissingAccessory', payload: {
    roomId: room().id, accessoryId: 'gone', reassignTo: 'tray',
  } });
  expect(renderComponent(MissingAccessoriesNotice).tree).toBeNull();
  expect(nodes(dialog.render()).filter(({ type }) => type === MissingSlideRow)).toHaveLength(1);
  expect(accessoryRows(dialog.tree)).toHaveLength(0);
});

it('IN12b f: removes items with an empty library and keeps archived notices without controls in locked rooms', () => {
  accessoryRoom();
  state.elevation.settings.accessories = [];
  const dialog = renderComponent(MissingDesignsDialog);
  expect(text(dialog.tree)).toContain("This room uses accessories that aren't in the Library");
  button(dialog.tree, 'Not now').props.onClick();
  expect(dialog.render()).toBeNull();
  const [row] = accessoryRows(renderComponent(MissingAccessoriesNotice).tree);
  expect(select(row.tree).props.value).toBe('');
  button(row.tree, 'Move').props.onClick();
  expect(renderComponent(MissingAccessoriesNotice).tree).toBeNull();
  for (const source of ['cloud', 'version']) {
    accessoryRoom();
    state.elevation.source = source;
    state.elevation.cloud.room.readOnly = source === 'cloud';
    room().walls[0].runs[0].grid.cells[0].node.interior.accessories[0].accessoryId = archived;
    const notice = accessoryRows(renderComponent(MissingAccessoriesNotice).tree).find((row) => text(row.tree).startsWith('An archived'));
    expect(text(notice.tree)).toBe("An archived accessory isn't in the Library any more. 1 place in this room uses it. Someone who can edit the room can move them.");
    expect(select(notice.tree)).toBeUndefined();
    expect(button(notice.tree, 'Move')).toBeUndefined();
  }
  state.elevation.activeRoomId = 'absent';
  expect(renderComponent(MissingAccessoriesNotice).tree).toBeNull();
});
