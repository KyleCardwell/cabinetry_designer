import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import FaceProperties from '../properties/FaceProperties.jsx';
import { runDoorDetails } from '../../model/doorDetails.js';

vi.mock('react-redux', () => ({
  useDispatch: () => vi.fn(),
  useSelector: (selector) => selector({ elevation: { facePath: null, activeRoomId: 'room', rooms: [{ id: 'room' }] } }),
}));
vi.mock('../../model/index.js', async (importOriginal) => ({
  ...await importOriginal(), runFaceLayouts: () => new Map(),
}));
vi.mock('../../model/doorDetails.js', () => ({ runDoorDetails: vi.fn() }));

describe('Step 480 face molding warnings', () => {
  it('numbers each no-room molding once per face and excludes warnings for other pieces', () => {
    runDoorDetails.mockReturnValue({ warnings: [
      { code: 'applied-molding-no-room', index: 1, pieceId: 'cabinet', key: 'cabinet:r:left' },
      { code: 'applied-molding-no-room', index: 1, pieceId: 'cabinet', key: 'cabinet:r:right' },
      { code: 'applied-molding-no-room', index: 3, pieceId: 'cabinet' },
      { code: 'applied-molding-no-room', index: 5, pieceId: 'other' },
    ] });
    const html = renderToStaticMarkup(<FaceProperties
      wall={{ id: 'wall' }} run={{ id: 'run', cabinetTypeId: 'base' }}
      piece={{ id: 'cabinet', width: 18 }} item={{ id: 'cabinet', face: { type: 'door', size: null } }}
      layout={{ pieces: [] }} settings={{}}
    />);
    expect(html.match(/Applied molding 2 doesn&#x27;t fit on this face\./g)).toHaveLength(1);
    expect(html).toContain('Applied molding 4 doesn&#x27;t fit on this face.');
    expect(html).not.toContain('Applied molding 6');
  });
});
