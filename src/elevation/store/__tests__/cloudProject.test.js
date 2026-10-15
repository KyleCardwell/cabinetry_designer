import { afterEach, describe, expect, it } from 'vitest';
import { newRoomDocument } from '../../model/designProjects.js';
import {
  issueRoomVersion,
  leaveCloudRoom,
  loadProjectLayers,
  openCloudRoom,
  openCloudWorkspace,
  openLocalWorkspace,
  openRoomVersion,
} from '../cloudThunks.js';
import { resetPresenceForTests } from '../presenceThunks.js';
import { cloudStore, fakeDesignApi } from './helpers/fakeDesignApi.js';

afterEach(() => resetPresenceForTests());

const expectedProject = {
  id: 42,
  name: 'Cardwell',
  client: 'Kyle Cardwell',
  address: '4311 W 8480 S, West Jordan, UT 84088',
};
const open = (store) => store.dispatch(openCloudRoom({ estProjectId: 42, roomId: 'rm-1' }));
const elevationOf = (store) => store.getState().elevation;

function setup() {
  const { document, schemaVersion } = newRoomDocument('Kitchen');
  const api = fakeDesignApi({ project: {
    project: {
      est_project_id: 42, est_project_name: 'Cardwell', est_client_name: 'Kyle Cardwell',
      street: '4311 W 8480 S', city: 'West Jordan', state: 'UT', zip: '84088',
    },
    design: { overrides: {}, version: 1 },
    phases: [{ phase_id: 'ph-1', overrides: {}, version: 1, rooms: [{
      room_id: 'rm-1', phase_id: 'ph-1', name: 'Kitchen', document,
      schema_version: schemaVersion, status: 'drafting', version: 1,
    }] }],
  } });
  return { api, store: cloudStore(api) };
}

describe('RP1 c project info', () => {
  it('keeps the nested project row when opening a room and replaces it on reopen', async () => {
    const { api, store } = setup();
    expect((await open(store)).ok).toBe(true);
    expect(elevationOf(store).cloud.project).toEqual(expectedProject);

    api.db.project.project.est_project_name = 'Updated job';
    expect((await open(store)).ok).toBe(true);
    expect(elevationOf(store).cloud.project).toEqual({ ...expectedProject, name: 'Updated job' });
  });

  it('keeps the same project info when opening an issued version directly from the lab', async () => {
    const { store } = setup();
    await open(store);
    const issued = await store.dispatch(issueRoomVersion({ label: 'Project info' }));
    expect(issued.ok).toBe(true);
    store.dispatch(openLocalWorkspace());
    expect((await store.dispatch(openRoomVersion({
      estProjectId: 42, roomId: 'rm-1', versionId: issued.versionId,
    }))).ok).toBe(true);
    expect(elevationOf(store).source).toBe('version');
    expect(elevationOf(store).cloud.project).toEqual(expectedProject);

    await store.dispatch(openCloudWorkspace());
    expect(elevationOf(store).cloud.project).toBeNull();
  });

  it('clears project info with cloud room resets and when returning to Elevation Lab', async () => {
    const { store } = setup();
    await store.dispatch(openCloudWorkspace());
    expect(elevationOf(store).cloud.project).toBeNull();
    await open(store);
    expect(elevationOf(store).cloud.project).toEqual(expectedProject);
    await store.dispatch(leaveCloudRoom());
    await store.dispatch(loadProjectLayers({ estProjectId: 42 }));
    expect(elevationOf(store).cloud.room).toBeNull();
    expect(elevationOf(store).cloud.project).toBeNull();

    await open(store);
    await store.dispatch(openCloudWorkspace());
    expect(elevationOf(store).cloud.room).toBeNull();
    expect(elevationOf(store).cloud.project).toBeNull();

    await open(store);
    store.dispatch(openLocalWorkspace());
    expect(elevationOf(store).source).toBe('local');
    expect(elevationOf(store).cloud).toBeNull();
    expect(elevationOf(store).cloud?.project ?? null).toBeNull();
  });
});
