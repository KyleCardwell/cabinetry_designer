import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DEFAULT_SETTINGS } from '../../elevation/model/constants.js';
import { selectSettings } from '../../elevation/store/selectors.js';
import ElevationToolbar from '../../elevation/components/ElevationToolbar.jsx';
import ExportDxfButton from '../../elevation/components/ExportDxfButton.jsx';
import ReportsButton from '../ReportsButton.jsx';
import ReportsDialog from '../ReportsDialog.jsx';
import { doorOrder } from '../doorOrder.js';
import { reportHeader } from '../header.js';
import { doorOrderDocument, doorOrderFileName } from '../doorOrderPdf.js';
import { downloadPdf } from '../pdf.js';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('../doorOrder.js', async (original) => ({ ...await original(), doorOrder: vi.fn() }));
vi.mock('../header.js', async (original) => ({ reportHeader: vi.fn((await original()).reportHeader) }));
vi.mock('../doorOrderPdf.js', async (original) => ({ ...await original(), doorOrderDocument: vi.fn() }));
vi.mock('../pdf.js', () => ({ downloadPdf: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children)
    : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
const component = (tree, type) => nodes(tree).find((node) => node.type === type);
const button = (tree, label) => nodes(tree).find((node) => node.type === 'button' && text(node) === label);
const checkbox = (tree, label) => component(nodes(tree).find((node) => node.type === 'label' && text(node).trim() === label), 'input');
const alert = (tree) => nodes(tree).find((node) => node.props.role === 'alert');
const submit = (dialog) => component(dialog.tree, 'form').props.onSubmit({ preventDefault: vi.fn() });
const copyNames = ['Master', 'Shop', 'Install', 'Nike', 'Order'];
let current;
let state;
let storage;

// Keep hook state while inspecting JSX, as in the other project dialog tests.
function renderComponent(Component, props = {}) {
  const owner = { slots: [], cursor: 0, tree: null };
  owner.render = () => {
    current = owner;
    owner.cursor = 0;
    owner.tree = Component(props);
    return owner.tree;
  };
  owner.render();
  return owner;
}
function openDialog(trigger = renderComponent(ReportsButton)) {
  button(trigger.tree, 'Reports…').props.onClick();
  trigger.render();
  return { trigger, dialog: renderComponent(ReportsDialog, component(trigger.tree, ReportsDialog).props) };
}
function check(dialog, label, checked) {
  checkbox(dialog.tree, label).props.onChange({ target: { checked } });
  dialog.render();
}

beforeEach(() => {
  vi.clearAllMocks();
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key) => storage.get(key) ?? null),
    setItem: vi.fn((key, value) => storage.set(key, value)),
  });
  state = { elevation: {
    rooms: [{ id: 'r1', name: 'Kitchen', walls: [], wallOrder: [], settingsOverrides: { report: { wood: 'Room oak' } } }],
    activeRoomId: 'r1', settings: DEFAULT_SETTINGS, prefs: {},
    source: 'cloud', cloud: { project: { id: 42, name: 'Cardwell', address: '123 Main' }, room: { lastVersion: null } },
  } };
  useSelector.mockImplementation((select) => select(state));
  useDispatch.mockReturnValue(vi.fn());
  useState.mockImplementation((initial) => {
    const owner = current;
    const index = owner.cursor++;
    if (!(index in owner.slots)) owner.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [owner.slots[index], (value) => {
      owner.slots[index] = typeof value === 'function' ? value(owner.slots[index]) : value;
    }];
  });
  doorOrder.mockReturnValue({ pages: [{ styleId: 'default' }], warnings: [] });
  doorOrderDocument.mockReturnValue({ content: ['Door Order Form'] });
  downloadPdf.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('RP1 step g Reports', () => {
  it('places Reports beside Export DXF, disables it without a room, and opens with the first-use defaults (anchor 1)', () => {
    for (const readOnly of [false, true]) {
      const toolbar = renderComponent(ElevationToolbar, { readOnly });
      const children = nodes(toolbar.tree);
      expect(children[children.indexOf(component(toolbar.tree, ExportDxfButton)) + 1].type).toBe(ReportsButton);
    }
    const trigger = renderComponent(ReportsButton);
    expect(button(trigger.tree, 'Reports…').props.disabled).toBe(false);
    const { dialog } = openDialog(trigger);
    const modal = nodes(dialog.tree).find((node) => node.props.role === 'dialog');
    expect(modal.props['aria-modal']).toBe('true');
    expect(component(dialog.tree, 'h2').props.id).toBe(modal.props['aria-labelledby']);
    expect(text(component(dialog.tree, 'h2'))).toBe('Reports');
    expect(checkbox(dialog.tree, 'Door Order Form').props.checked).toBe(true);
    expect(checkbox(dialog.tree, 'Main Shipping List (next round)').props).toMatchObject({ checked: false, disabled: true });
    copyNames.forEach((name) => expect(checkbox(dialog.tree, name).props.checked).toBe(true));
    button(dialog.tree, 'Cancel').props.onClick();
    expect(component(trigger.render(), ReportsDialog)).toBeUndefined();
    state.elevation.activeRoomId = 'missing';
    expect(button(trigger.render(), 'Reports…').props.disabled).toBe(true);
  });

  it('downloads Master, Nike and Order once and remembers them when reopened (anchor 2)', async () => {
    const { trigger, dialog } = openDialog();
    check(dialog, 'Shop', false);
    check(dialog, 'Install', false);
    await submit(dialog);
    expect(doorOrderDocument).toHaveBeenCalledWith(doorOrder.mock.results[0].value,
      reportHeader.mock.results[0].value, ['master', 'nike', 'order']);
    expect(downloadPdf).toHaveBeenCalledOnce();
    expect(downloadPdf).toHaveBeenCalledWith(doorOrderDocument.mock.results[0].value, 'Cardwell - Kitchen - Door Order Form.pdf');
    expect(JSON.parse(storage.get('ff.reportCopies'))).toEqual(['master', 'nike', 'order']);
    button(dialog.tree, 'Cancel').props.onClick();
    trigger.render();
    const reopened = openDialog(trigger).dialog;
    copyNames.forEach((name) => expect(checkbox(reopened.tree, name).props.checked).toBe(!['Shop', 'Install'].includes(name)));
  });

  it('blocks Download with no copies or no report selected (anchor 3)', async () => {
    const { dialog } = openDialog();
    copyNames.forEach((name) => check(dialog, name, false));
    expect(button(dialog.tree, 'Download').props.disabled).toBe(true);
    await submit(dialog);
    expect(downloadPdf).not.toHaveBeenCalled();
    expect(copyNames.every((name) => !checkbox(openDialog().dialog.tree, name).props.checked)).toBe(true);
    check(dialog, 'Master', true);
    check(dialog, 'Door Order Form', false);
    expect(button(dialog.tree, 'Download').props.disabled).toBe(true);
    await submit(dialog);
    expect(doorOrder).not.toHaveBeenCalled();
  });

  it('shows the empty-room alert and downloads nothing (anchor 4)', async () => {
    const actual = await vi.importActual('../doorOrder.js');
    doorOrder.mockImplementationOnce(actual.doorOrder);
    const { dialog } = openDialog();
    await submit(dialog);
    dialog.render();
    expect(text(alert(dialog.tree))).toBe('No doors, drawer fronts or panels in this room.');
    expect(downloadPdf).not.toHaveBeenCalled();
    expect(doorOrderDocument).not.toHaveBeenCalled();
    expect(button(dialog.tree, 'Download').props.disabled).toBe(false);
  });

  it('works with all copies when storage access throws, and tolerates blocked writes (anchor 5)', async () => {
    vi.stubGlobal('localStorage', { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); } });
    let { dialog } = openDialog();
    copyNames.forEach((name) => expect(checkbox(dialog.tree, name).props.checked).toBe(true));
    check(dialog, 'Shop', false);
    await submit(dialog);
    expect(downloadPdf).toHaveBeenCalledOnce();
    vi.stubGlobal('localStorage', { getItem() { return '{invalid'; } });
    dialog = openDialog().dialog;
    copyNames.forEach((name) => expect(checkbox(dialog.tree, name).props.checked).toBe(true));
  });

  it('downloads despite warnings and lists them in amber below the buttons', async () => {
    doorOrder.mockReturnValueOnce({ pages: [{}], warnings: [
      { code: 'report-part-unnumbered', key: 'door-1' },
      { code: 'report-profile-missing', id: 'profile-1', slot: 'outside' },
    ] });
    const { dialog } = openDialog();
    await submit(dialog);
    dialog.render();
    expect(downloadPdf).toHaveBeenCalledOnce();
    const warnings = component(dialog.tree, 'ul');
    expect(warnings.props.className).toContain('text-amber-300');
    expect(text(warnings)).toContain('Part ? : a door or panel has no part number (door-1)');
    expect(text(warnings)).toContain('Profile missing: profile-1 (outside)');
    expect(nodes(dialog.tree).indexOf(warnings)).toBeGreaterThan(nodes(dialog.tree).indexOf(button(dialog.tree, 'Download')));
  });

  it('shows build and download errors, clears errors on retry, and disables Download while building', async () => {
    const { dialog } = openDialog();
    doorOrder.mockImplementationOnce(() => { throw new Error('Build failed'); });
    await submit(dialog);
    expect(text(alert(dialog.render()))).toBe('Build failed');
    downloadPdf.mockRejectedValueOnce(new Error('Download failed'));
    await submit(dialog);
    expect(text(alert(dialog.render()))).toBe('Download failed');
    let finish;
    downloadPdf.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const downloading = submit(dialog);
    dialog.render();
    expect(alert(dialog.tree)).toBeUndefined();
    expect(button(dialog.tree, 'Building…').props.disabled).toBe(true);
    expect(nodes(dialog.tree).filter((node) => node.type === 'fieldset').every((node) => node.props.disabled)).toBe(true);
    await submit(dialog);
    expect(downloadPdf).toHaveBeenCalledTimes(2);
    finish();
    await downloading;
    expect(button(dialog.render(), 'Download').props.disabled).toBe(false);
  });

  it('builds with the active room, effective settings, project and source revision for all three screens', async () => {
    for (const [source, info, revision] of [
      ['cloud', { lastVersion: { label: 'KC 10/15/26', seq: 2 } }, 'DRAFT · last issued KC 10/15/26 (v2)'],
      ['version', { issued: { label: 'KC 10/15/26', seq: 2 } }, 'KC 10/15/26 (v2)'],
      ['local', null, null],
    ]) {
      state.elevation.source = source;
      state.elevation.cloud = { ...state.elevation.cloud, room: info, project: source === 'local' ? null : state.elevation.cloud.project };
      const { dialog } = openDialog();
      await submit(dialog);
      const settings = selectSettings(state);
      expect(doorOrder).toHaveBeenLastCalledWith(state.elevation.rooms[0], settings);
      expect(settings.report.wood).toBe('Room oak');
      expect(reportHeader).toHaveBeenLastCalledWith({ project: state.elevation.cloud.project, room: state.elevation.rooms[0], settings, revision });
      const header = reportHeader.mock.results.at(-1).value;
      expect(header.job).toBe(source === 'local' ? '' : 'Cardwell');
      expect(downloadPdf).toHaveBeenLastCalledWith(doorOrderDocument.mock.results.at(-1).value, doorOrderFileName(header, 'Kitchen'));
    }
  });
});
