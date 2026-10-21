import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { BAND_SETTING_KEYS } from '../model/heightBands.js';
import SettingGroups, { matchingSettingGroups } from './SettingGroups.jsx';
import ViewPrefsFields, { hasMatchingViewPrefs } from './ViewPrefsFields.jsx';
import PanelSection from './panel/PanelSection.jsx';
import usePanelState from './panel/usePanelState.js';

const GROUP_GRID = 'grid grid-cols-1 gap-4 [@container(min-width:600px)]:grid-cols-2';

export default function SettingsDrawer({ shopStandards = true, readOnly = false }) {
  const [open, setOpen] = usePanelState('settingsDrawer', false);
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);
  const room = useSelector(({ elevation }) => elevation.rooms.find(({ id }) => id === elevation.activeRoomId));
  const roomMatch = Boolean(room) && matchingSettingGroups('room', BAND_SETTING_KEYS, query).length > 0;
  const shopMatch = shopStandards && matchingSettingGroups('team', BAND_SETTING_KEYS, query).length > 0;
  const viewMatch = hasMatchingViewPrefs(query);
  const searching = query.trim().length > 0;

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <aside
      role="dialog"
      aria-label="Settings"
      className="absolute inset-y-0 left-0 z-20 w-[640px] max-w-full overflow-y-auto bg-gray-800 text-gray-100 shadow-xl"
      style={{ containerType: 'inline-size' }}
    >
      <div className="flex items-center justify-between p-4">
        <h2 className="text-sm font-semibold">Settings</h2>
        <button type="button" aria-label="Close settings" onClick={() => setOpen(false)} className="px-2 text-xl text-gray-400">×</button>
      </div>
      <div className="space-y-4 px-4 pb-4">
        <input
          ref={searchRef}
          type="search"
          aria-label="Search settings"
          placeholder="Search settings"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        {room && (
          <div hidden={!roomMatch}>
            <PanelSection id="drawer.room" title="Room settings" forceOpen={searching}>
              <fieldset disabled={readOnly} className="contents">
                <SettingGroups scope="room" exclude={BAND_SETTING_KEYS} query={query} className={GROUP_GRID} />
              </fieldset>
            </PanelSection>
          </div>
        )}
        {shopStandards && (
          <div hidden={!shopMatch}>
            <PanelSection id="drawer.shop" title="Shop standards" forceOpen={searching}>
              <SettingGroups scope="team" exclude={BAND_SETTING_KEYS} query={query} className={GROUP_GRID} />
            </PanelSection>
          </div>
        )}
        <div hidden={!viewMatch}>
          <PanelSection id="drawer.view" title="View" forceOpen={searching}>
            <ViewPrefsFields query={query} />
          </PanelSection>
        </div>
        {!roomMatch && !shopMatch && !viewMatch && <p className="text-sm text-gray-400">No settings match "{query}".</p>}
      </div>
    </aside>
  );
}
