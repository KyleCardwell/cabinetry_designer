import { Link } from 'react-router-dom';
import SettingGroups from './SettingGroups.jsx';
import ViewPrefsFields from './ViewPrefsFields.jsx';
import { BAND_SETTING_KEYS } from '../model/heightBands.js';
import ShopHeightsPanel from './ShopHeightsPanel.jsx';

export default function SettingsPanel() {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-gray-300">Shop standards</h2>
      <SettingGroups scope="team" exclude={BAND_SETTING_KEYS} />
      <p className="text-xs text-gray-500">
        Door thickness is on the team door style —{' '}
        <Link to="/library/door-style" className="text-blue-400 hover:underline">Library</Link>
      </p>
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-gray-300">View (not saved)</h3>
        <ViewPrefsFields />
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-gray-300">Default height profile</p>
        <ShopHeightsPanel />
      </div>
    </section>
  );
}
