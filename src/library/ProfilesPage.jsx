import { useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
  filterSectionProfiles,
  profileKindLabel, profileKindOptions,
} from '../elevation/model/sectionProfiles.js';
import {
  addSectionProfile, deleteSectionProfile, setSectionProfileArchived,
} from '../elevation/store/elevationSlice.js';
import ProfileDetailsDialog from './ProfileDetailsDialog.jsx';
import ProfileThumbnail from './ProfileThumbnail.jsx';
import LibraryTransfer from './LibraryTransfer.jsx';
import { LibrarySelectAll, LibrarySelectRow, useLibrarySelection } from './LibrarySelection.jsx';

const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';
const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

export default function ProfilesPage() {
  const dispatch = useDispatch();
  const { settings, source } = useSelector((state) => state.elevation);
  // Shop data: library items are archived, never deleted (DB8).
  const shopData = source === 'cloud';
  const profiles = settings.sectionProfiles;
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const closeDialog = useCallback(() => setEditingId(null), []);
  const editingProfile = profiles.find((profile) => profile.id === editingId);
  const filteredProfiles = filterSectionProfiles(profiles, { search, kind, showArchived });

  const selection = useLibrarySelection(filteredProfiles, JSON.stringify([search, kind, showArchived]));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Profiles</h1>
          <p className="mt-1 text-sm text-gray-400">Section shapes for door edges, panels and moldings. Door styles and runs will pick them once profile slots are added.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            className={BUTTON_CLASS}
            onClick={() => {
              setConfirmingId(null);
              const action = addSectionProfile();
              dispatch(action);
              setEditingId(action.payload.id);
            }}
          >
            New profile
          </button>
          <LibraryTransfer listKey="sectionProfiles" selectedIds={selection.selectedIds} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="Search profiles"
          placeholder="Search names"
          className={`${INPUT_CLASS} max-w-xs`}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setConfirmingId(null);
          }}
        />
        <div className="flex flex-wrap gap-2">
          {[null, ...profileKindOptions(profiles)].map((option) => (
            <button
              key={`kind-${option}`}
              type="button"
              aria-pressed={kind === option}
              className={`rounded-full px-2.5 py-1 text-xs ${kind === option
                ? 'bg-blue-600 text-white'
                : 'border border-gray-600 text-gray-300 hover:bg-gray-700'}`}
              onClick={() => {
                setKind(kind === option ? null : option);
                setConfirmingId(null);
              }}
            >
              {option === null ? 'All' : profileKindLabel(option)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => {
              setShowArchived(event.target.checked);
              setConfirmingId(null);
            }}
          />
          Show archived
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-300"><LibrarySelectAll selection={selection} /> Select all visible rows</label>
      {filteredProfiles.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProfiles.map((profile) => {
            return (
              <div key={profile.id} className={`rounded border border-gray-700 bg-gray-800/60 p-3 space-y-2${profile.archived ? ' opacity-60' : ''}`}>
                <div className="h-32 rounded bg-gray-900 p-2 text-gray-200">
                  <ProfileThumbnail profile={profile} className="h-full w-full" />
                </div>
                <div className="flex items-center gap-2">
                  <LibrarySelectRow row={profile} selection={selection} />
                  <span className="font-medium text-gray-100">{profile.name}</span>
                  {profile.archived && <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-400">archived</span>}
                </div>
                <div className="flex flex-wrap gap-1">
                  <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-300">{profileKindLabel(profile.kind)}</span>
                </div>
                <p className="text-xs text-gray-500">v{profile.version}{profile.kind === 'other' ? ' · not used by doors or runs yet' : ''}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={BUTTON_CLASS}
                    onClick={() => {
                      setConfirmingId(null);
                      setEditingId(profile.id);
                    }}
                  >
                    Details
                  </button>
                  <Link to={`/library/profiles/${profile.id}`} className={BUTTON_CLASS}>Edit shape</Link>
                  <button
                    type="button"
                    className={BUTTON_CLASS}
                    onClick={() => {
                      setConfirmingId(null);
                      dispatch(addSectionProfile({ baseId: profile.id }));
                    }}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    className={BUTTON_CLASS}
                    onClick={() => {
                      setConfirmingId(null);
                      dispatch(setSectionProfileArchived({ profileId: profile.id, archived: !profile.archived }));
                    }}
                  >
                    {profile.archived ? 'Restore' : 'Archive'}
                  </button>
                  {!shopData && (
                  <button
                    type="button"
                    className={`${BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
                    onClick={() => {
                      if (confirmingId === profile.id) {
                        dispatch(deleteSectionProfile({ profileId: profile.id }));
                        setConfirmingId(null);
                      } else {
                        setConfirmingId(profile.id);
                      }
                    }}
                  >
                    {confirmingId === profile.id ? 'Confirm delete' : 'Delete'}
                  </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-400">{profiles.length === 0
          ? 'No profiles yet. New profile starts a 3/4" square to work from.'
          : 'No profiles match.'}</p>
      )}
      <p className="text-xs text-gray-500">Edit shape opens the profile editor. Export saves selected profiles, or every profile when none are selected. Import previews items before adding new ones or replacing matching ids in the current library.</p>
      {editingProfile && <ProfileDetailsDialog key={editingProfile.id} profile={editingProfile} onClose={closeDialog} />}
    </div>
  );
}
