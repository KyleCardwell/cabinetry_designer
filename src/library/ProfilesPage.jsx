import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  filterSectionProfiles, profileTagLabel, profileTagOptions, sectionProfileUses,
} from '../elevation/model/sectionProfiles.js';
import {
  addSectionProfile, deleteSectionProfile, setSectionProfileArchived,
} from '../elevation/store/elevationSlice.js';
import ProfileThumbnail from './ProfileThumbnail.jsx';

const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';
const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

export default function ProfilesPage() {
  const dispatch = useDispatch();
  const { settings, rooms } = useSelector((state) => state.elevation);
  const profiles = settings.sectionProfiles;
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const filteredProfiles = filterSectionProfiles(profiles, { search, tag, showArchived });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Profiles</h1>
          <p className="mt-1 text-sm text-gray-400">Section shapes for door edges, panels and moldings. Door styles and runs will pick them once profile slots are added.</p>
        </div>
        <button
          type="button"
          className={`${BUTTON_CLASS} shrink-0`}
          onClick={() => {
            setConfirmingId(null);
            dispatch(addSectionProfile());
          }}
        >
          New profile
        </button>
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
          {[null, ...profileTagOptions(profiles)].map((option) => (
            <button
              key={option === null ? 'all' : `tag-${option}`}
              type="button"
              aria-pressed={tag === option}
              className={`rounded-full px-2.5 py-1 text-xs ${tag === option
                ? 'bg-blue-600 text-white'
                : 'border border-gray-600 text-gray-300 hover:bg-gray-700'}`}
              onClick={() => {
                setTag(tag === option ? null : option);
                setConfirmingId(null);
              }}
            >
              {option === null ? 'All' : profileTagLabel(option)}
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
      {filteredProfiles.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProfiles.map((profile) => {
            const uses = sectionProfileUses(settings, rooms, profile.id);
            const usedBy = uses.map((use) => use.level === 'team'
              ? `Team default ${use.slot}`
              : `${rooms.find((room) => room.id === use.roomId)?.name ?? use.roomId} ${use.label} ${use.slot}`).join(', ');
            const attachPoints = Object.keys(profile.attach);

            return (
              <div key={profile.id} className={`rounded border border-gray-700 bg-gray-800/60 p-3 space-y-2${profile.archived ? ' opacity-60' : ''}`}>
                <div className="h-32 rounded bg-gray-900 p-2 text-gray-200">
                  <ProfileThumbnail profile={profile} className="h-full w-full" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-100">{profile.name}</span>
                  {profile.archived && <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-400">archived</span>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {profile.tags.length > 0 ? profile.tags.map((profileTag) => (
                    <span key={profileTag} className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-300">{profileTagLabel(profileTag)}</span>
                  )) : <span className="text-xs text-gray-500">No tags</span>}
                </div>
                <p className="text-xs text-gray-500">v{profile.version} · {attachPoints.length > 0 ? `attach: ${attachPoints.join(', ')}` : 'no attach points'}</p>
                {uses.length > 0 && <p className="text-xs text-gray-400">Used by: {usedBy}</p>}
                <div className="flex flex-wrap gap-2">
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
                  <button
                    type="button"
                    className={`${BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
                    disabled={uses.length > 0}
                    title={uses.length > 0 ? 'Used by a door style — archive it instead' : undefined}
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
      <p className="text-xs text-gray-500">Shapes are drawn in the profile editor (next round). Profiles are saved in this browser with the Elevation Lab drawings until the library moves to the team&apos;s account.</p>
    </div>
  );
}
