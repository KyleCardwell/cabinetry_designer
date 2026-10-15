import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { partNumbers } from '../../model/partNumbers.js';
import { runScene } from '../../model/runScene.js';
import elevationReducer, { setReportPartField, setRoomReportNote } from '../../store/elevationSlice.js';
import { fixed, run as fixtureRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import RoomPartNumbersPanel from '../RoomPartNumbersPanel.jsx';
import FrameSection from '../properties/FrameSection.jsx';
import PartNumberField from '../properties/PartNumberField.jsx';
import PartReportFields, { ReportTextField } from '../properties/PartReportFields.jsx';
import PieceProperties from '../properties/PieceProperties.jsx';
import { RunFurnitureBaseSection } from '../properties/RunProperties.jsx';
import TeeProperties from '../properties/TeeProperties.jsx';
import WallEndPanelProperties from '../properties/WallEndPanelProperties.jsx';

vi.mock('react', async (original) => ({
  ...await original(), useState: vi.fn(), useEffect: vi.fn(), useMemo: (callback) => callback(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('../../model/partNumbers.js', async (original) => {
  const actual = await original();
  return { ...actual, partNumbers: vi.fn(actual.partNumbers) };
});

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const controls = (tree) => nodes(tree).filter(({ type }) => type === 'input' || type === 'textarea');
const field = (tree, label) => controls(tree).find(({ props }) => props['aria-label'] === label);
const labels = (tree) => controls(tree).map(({ props }) => props['aria-label']);
let state;
let dispatch;
let hooks;
let slots;
let index;
let effects;
let dirty;
const room = () => state.rooms[0];
const settings = () => state.settings;
const reportProps = (partKey = 'c1', kind = 'cabinet') => ({ room: room(), partKey, kind, settings: settings(), autoName: '' });
const props = () => {
  const wall = room().walls[0];
  return { room: room(), wall, run: wall.runs[0], settings: settings() };
};
const pieceTree = (kind = 'cabinet', side) => {
  const p = props();
  const scene = runScene(p.room, p.wall, p.run, p.settings);
  const piece = side ? scene.result.pieces.find((piece) => piece.id === `${p.run.id}:${side}`)
    : { ...scene.cells.pieces.find(({ id }) => id === 'c1'), kind };
  return PieceProperties({ ...p, layout: scene.result, cells: scene.cells,
    selectionContext: { piece, item: { id: piece.id, kind, width: piece.width }, side } });
};

// Mount only the small report controls, keeping keyed draft state and prop effects.
function render(Component = PartReportFields, componentProps = reportProps()) {
  let result;
  do {
    dirty = false;
    effects = [];
    const mounted = new Set();
    const walk = (element, path) => {
      if (Array.isArray(element)) return element.map((child, i) => walk(child, `${path}/${child?.key ?? i}`));
      if (!element || typeof element !== 'object') return element;
      if (typeof element.type === 'function') {
        const id = `${path}/${element.type.name}`;
        mounted.add(id);
        if (!hooks.has(id)) hooks.set(id, []);
        slots = hooks.get(id);
        index = 0;
        return walk(element.type(element.props), id);
      }
      return { ...element, props: { ...element.props, children: walk(element.props.children, `${path}/children`) } };
    };
    result = walk({ type: Component, props: componentProps }, 'root');
    for (const id of hooks.keys()) if (!mounted.has(id)) hooks.delete(id);
    effects.forEach((effect) => effect());
  } while (dirty);
  return result;
}
const change = (label, value, Component, p) => field(render(Component, p), label).props.onChange({ target: { value } });
const blur = (label, Component, p) => field(render(Component, p), label).props.onBlur();
const adjacentReport = (tree, partKey) => {
  const children = nodes(tree).filter(({ type }) => type === PartNumberField || type === PartReportFields);
  expect(children.map(({ type }) => type)).toEqual([PartNumberField, PartReportFields]);
  expect(children[1].props.partKey).toBe(partKey);
  expect(children[1].props.room).toBe(room());
  return render(PartReportFields, children[1].props);
};

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun(fixtureRun({ items: [fixed('c1', 60)], autoCount: false }));
  dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  hooks = new Map();
  useState.mockImplementation((initial) => {
    const current = slots;
    const i = index++;
    if (!current[i]) current[i] = { value: typeof initial === 'function' ? initial() : initial };
    return [current[i].value, (next) => {
      if (!Object.is(next, current[i].value)) dirty = true;
      current[i].value = next;
    }];
  });
  useEffect.mockImplementation((effect, deps) => {
    const i = index++;
    if (!slots[i] || deps.some((value, j) => !Object.is(value, slots[i].deps[j]))) {
      slots[i] = { deps };
      effects.push(effect);
    }
  });
});

describe('RP2 step b report fields', () => {
  it('anchor 1: puts cabinet Name, Boxes, Shop-built and Note immediately after Part number', () => {
    const tree = pieceTree();
    const report = adjacentReport(tree, 'c1');
    const number = nodes(tree).find(({ type }) => type === PartNumberField);
    expect(labels(render(PartNumberField, number.props))).toEqual(['Part number']);
    expect(labels(report)).toEqual(['Name', 'Boxes', 'Shop-built', 'Note']);
    expect(field(report, 'Name').props).toMatchObject({ placeholder: '', maxLength: 60 });
    expect(field(report, 'Boxes').props.maxLength).toBe(120);
    expect(field(report, 'Note').props.maxLength).toBe(200);
    for (const kind of ['void', 'shelves']) {
      expect(nodes(pieceTree(kind)).some(({ type }) => type === PartReportFields)).toBe(false);
    }
  });

  it('anchor 2: fillers, panels, frames and furniture bases show only Shop-built and Note', () => {
    const expected = ['Shop-built', 'Note'];
    expect(labels(adjacentReport(pieceTree('filler'), 'c1'))).toEqual(expected);
    room().walls[0].runs[0].ends.left.type = 'end_panel';
    const endTree = pieceTree('end_panel', 'left');
    const endKey = nodes(endTree).find(({ type }) => type === PartNumberField).props.partKey;
    expect(labels(adjacentReport(endTree, endKey))).toEqual(expected);
    const number = <PartNumberField roomId={room().id} partKey="tee-1" />;
    expect(labels(adjacentReport(TeeProperties({ room: room(), tee: { id: 'tee-1' },
      notes: [], partNumberField: number, settings: settings() }), 'tee-1'))).toEqual(expected);
    const p = props();
    expect(labels(adjacentReport(WallEndPanelProperties({ ...p,
      panel: { endpoint: 'start', width: 0.75, top: 34.5,
        front: { side: 'left', depth: 24, runIds: [] }, back: { runIds: [] } } }), 'wall-1:endPanel:start'))).toEqual(expected);
    expect(labels(adjacentReport(FrameSection({ ...p, layout: runScene(p.room, p.wall, p.run, p.settings).result,
      region: { id: 'frame-1', cabinetIds: [], width: 60, height: 30.5, x: 0, z: 4 },
      numbers: partNumbers(room(), settings()) }), 'frame-1'))).toEqual(expected);
    room().profile.baseKind = 'furniture_base';
    expect(labels(adjacentReport(RunFurnitureBaseSection(props()), 'furniture_base:run-1'))).toEqual(expected);
  });

  it('anchor 3: preserves spaces while typing and saves Microwave Cabinet on blur with an override border', () => {
    change('Name', 'Microwave ');
    expect(field(render(), 'Name').props.value).toBe('Microwave ');
    expect(dispatch).not.toHaveBeenCalled();
    change('Name', 'Microwave Cabinet');
    blur('Name');
    expect(dispatch).toHaveBeenLastCalledWith(setReportPartField({
      roomId: room().id, key: 'c1', field: 'name', value: 'Microwave Cabinet',
    }));
    expect(field(render(), 'Name').props.className).toContain('border-teal-500');
    change('Name', '  ');
    blur('Name');
    expect(field(render(), 'Name').props.className).toContain('border-gray-600');
    expect(room().reportParts?.c1).toBeUndefined();
  });

  it('anchor 4: ticks and clears Shop-built immediately for every part kind', () => {
    for (const kind of ['cabinet', 'filler', 'end_panel', 'wall_end_panel', 'frame', 'furniture_base']) {
      const p = reportProps(kind, kind);
      for (const checked of [true, false]) {
        field(render(PartReportFields, p), 'Shop-built').props.onChange({ target: { checked } });
        expect(dispatch).toHaveBeenLastCalledWith(setReportPartField({
          roomId: room().id, key: kind, field: 'shopBuilt', value: checked,
        }));
        expect(field(render(PartReportFields, reportProps(kind, kind)), 'Shop-built').props.checked).toBe(checked);
      }
    }
  });

  it('anchor 5: shows only present toe kick and crown notes below Room note and saves their part keys', () => {
    partNumbers.mockReturnValueOnce({ parts: [
      { key: 'c1', kind: 'cabinet', number: 13 },
      { key: 'molding:toeKick', kind: 'molding', molding: 'toeKick', number: 14 },
      { key: 'molding:crown', kind: 'molding', molding: 'crown', number: 16 },
    ], warnings: [] });
    const panel = RoomPartNumbersPanel();
    const tree = render(() => panel, {});
    expect(labels(tree)).toEqual(['Part number start', 'Room note', 'TK #14 note', 'CR #16 note']);
    expect(field(tree, 'Room note').type).toBe('textarea');
    expect(field(tree, 'Room note').props.maxLength).toBe(400);
    const noteProps = nodes(panel).find(({ type }) => type === ReportTextField).props;
    render(ReportTextField, noteProps);
    change('Room note', '  Ship Friday\nKeep dry  ', ReportTextField, noteProps);
    blur('Room note', ReportTextField, noteProps);
    expect(dispatch).toHaveBeenLastCalledWith(setRoomReportNote({ roomId: room().id, value: 'Ship Friday\nKeep dry' }));
    // The anchor's molding fields retain their own keys and 200-character limits.
    const moldingProps = nodes(panel).find(({ props }) => props.label === 'CR #16 note').props;
    expect(moldingProps.maxLength).toBe(200);
    render(ReportTextField, moldingProps);
    change('CR #16 note', '  Match existing  ', ReportTextField, moldingProps);
    blur('CR #16 note', ReportTextField, moldingProps);
    expect(dispatch).toHaveBeenLastCalledWith(setReportPartField({
      roomId: room().id, key: 'molding:crown', field: 'note', value: 'Match existing',
    }));
  });

  it('anchor 6: uses WHITE MELAMINE as the empty Boxes placeholder and Room boxes as the fallback', () => {
    state.settings.report = { ...state.settings.report, boxMaterial: 'WHITE MELAMINE' };
    expect(field(render(), 'Boxes').props).toMatchObject({ value: '', placeholder: 'WHITE MELAMINE' });
    change('Boxes', 'Plywood');
    blur('Boxes');
    expect(field(render(), 'Boxes').props.className).toContain('border-teal-500');
    change('Boxes', '');
    blur('Boxes');
    state = structuredClone(state);
    state.settings.report.boxMaterial = '';
    expect(field(render(), 'Boxes').props).toMatchObject({ value: '', placeholder: 'Room boxes' });
    expect(field(render(), 'Boxes').props.className).toContain('border-gray-600');
  });

  it('commits Enter through blur, permits long notes, and resets drafts when the selected part changes', () => {
    change('Note', 'x'.repeat(200));
    const blurTarget = vi.fn(() => blur('Note'));
    field(render(), 'Note').props.onKeyDown({ key: 'Enter', currentTarget: { blur: blurTarget } });
    expect(blurTarget).toHaveBeenCalledOnce();
    expect(room().reportParts.c1.note).toHaveLength(200);
    change('Name', 'Unsaved draft');
    const other = reportProps('c2');
    expect(field(render(PartReportFields, other), 'Name').props.value).toBe('');
    expect(field(render(), 'Name').props.value).toBe('');
    state = elevationReducer(state, setReportPartField({ key: 'c1', field: 'note', value: 'Synced note' }));
    expect(field(render(), 'Note').props.value).toBe('Synced note');
    const p = { label: 'Room note', value: '', maxLength: 400, multiline: true, onCommit: vi.fn() };
    const target = { blur: vi.fn() };
    field(render(ReportTextField, p), 'Room note').props.onKeyDown({ key: 'Enter', currentTarget: target });
    expect(target.blur).not.toHaveBeenCalled();
  });
});
