import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DEFAULT_SETTINGS } from '../../elevation/model/constants.js';
import ReportsButton from '../ReportsButton.jsx';
import ReportsDialog from '../ReportsDialog.jsx';
import { doorOrder } from '../doorOrder.js';
import { reportHeader } from '../header.js';
import { doorOrderDocument } from '../doorOrderPdf.js';
import { shippingList } from '../shippingList.js';
import { shippingListDocument } from '../shippingListPdf.js';
import { proBoxOrder } from '../proBoxOrder.js';
import { proBoxOrderDocument } from '../proBoxOrderPdf.js';
import { downloadPdf } from '../pdf.js';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('../doorOrder.js', async (original) => ({ ...await original(), doorOrder: vi.fn() }));
vi.mock('../header.js', async (original) => ({ reportHeader: vi.fn((await original()).reportHeader) }));
vi.mock('../doorOrderPdf.js', async (original) => ({ ...await original(), doorOrderDocument: vi.fn() }));
vi.mock('../shippingList.js', async (original) => ({ ...await original(), shippingList: vi.fn() }));
vi.mock('../shippingListPdf.js', async (original) => ({ ...await original(), shippingListDocument: vi.fn() }));
vi.mock('../proBoxOrder.js', async (original) => ({ ...await original(), proBoxOrder: vi.fn() }));
vi.mock('../proBoxOrderPdf.js', async (original) => ({ ...await original(), proBoxOrderDocument: vi.fn() }));
vi.mock('../pdf.js', () => ({ downloadPdf: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children)
    : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
const component = (tree, type) => nodes(tree).find((node) => node.type === type);
const button = (tree, label) => nodes(tree).find((node) => node.type === 'button' && text(node) === label);
const checkbox = (tree, label) => component(nodes(tree).find((node) => node.type === 'label' && text(node).trim() === label), 'input');
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
  // Exercise saved selections from before ProBox existed throughout the older report tests.
  storage = new Map([['ff.reports', '["door_order","shipping_list"]']]);
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
  shippingList.mockReturnValue({ rows: [{ number: 1, kind: 'cabinet' }], warnings: [] });
  shippingListDocument.mockReturnValue({ content: ['Main Shipping List'] });
  proBoxOrder.mockReturnValue({ lines: [{ cab: 1 }], warnings: [] });
  proBoxOrderDocument.mockReturnValue({ content: ['ProBox Drawer Box Order'] });
  downloadPdf.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('RP2 step h Reports', () => {
  it('falls back to all three reports for invalid stored selections and normalizes valid report ids', () => {
    for (const saved of ['{invalid', 'null', '{}', '["unknown"]', '["door_order", "unknown"]']) {
      storage.set('ff.reports', saved);
      const { dialog } = openDialog();
      expect(checkbox(dialog.tree, 'Door Order Form').props.checked).toBe(true);
      expect(checkbox(dialog.tree, 'Main Shipping List').props.checked).toBe(true);
      expect(checkbox(dialog.tree, 'ProBox Drawer Box Order').props.checked).toBe(true);
    }
    storage.set('ff.reports', '["shipping_list", "door_order", "shipping_list"]');
    const { dialog } = openDialog();
    check(dialog, 'Main Shipping List', false);
    expect(JSON.parse(storage.get('ff.reports'))).toEqual(['door_order']);
    expect(checkbox(openDialog().dialog.tree, 'Main Shipping List').props.checked).toBe(false);
    expect(checkbox(openDialog().dialog.tree, 'ProBox Drawer Box Order').props.checked).toBe(false);
  });

});
