import { beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DEFAULT_DOOR_STYLE } from '../../elevation/model/doorStyles.js';
import { newSectionProfile } from '../../elevation/model/sectionProfiles.js';
import { deleteSectionProfile, setSectionProfileArchived } from '../../elevation/store/elevationSlice.js';
import ProfilesPage from '../ProfilesPage.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  useState: vi.fn(),
  useCallback: (callback) => callback,
  useRef: () => ({ current: null }),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
}
const button = (tree, label) => nodes(tree).find(({ type, props }) => type === 'button' && props.children === label);
const dispatch = vi.fn();
beforeEach(() => vi.clearAllMocks());

it('DB6b a omits profile usage and confirms sandbox deletion even when a style uses it', () => {
  const profile = newSectionProfile([], 'sp-cove', null, 'door_inside');
  const style = { ...DEFAULT_DOOR_STYLE, profiles: { ...DEFAULT_DOOR_STYLE.profiles, inside: 'sp-cove' } };
  let source = 'local';
  let values = [];
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: {
    source, settings: { sectionProfiles: [profile], teamDoorStyle: style },
    rooms: [{ id: 'r1', doorStyles: [{ ...style, id: 'ds-a', label: 'A' }] }],
  } }));
  const render = () => {
    let index = 0;
    useState.mockImplementation((initial) => {
      const slot = index++;
      if (!(slot in values)) values[slot] = initial;
      return [values[slot], (value) => { values[slot] = value; }];
    });
    return ProfilesPage();
  };
  expect(JSON.stringify(render())).not.toContain('Used by');
  expect(button(render(), 'Delete').props.disabled).toBeFalsy();
  button(render(), 'Delete').props.onClick();
  expect(dispatch).not.toHaveBeenCalled();
  button(render(), 'Confirm delete').props.onClick();
  expect(dispatch.mock.calls).toEqual([[deleteSectionProfile({ profileId: 'sp-cove' })]]);
  source = 'cloud';
  values = [];
  expect(button(render(), 'Delete')).toBeUndefined();
  button(render(), 'Archive').props.onClick();
  expect(dispatch.mock.lastCall[0]).toEqual(setSectionProfileArchived({ profileId: 'sp-cove', archived: true }));
});
