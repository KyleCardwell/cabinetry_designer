import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import FaceProperties from '../properties/FaceProperties.jsx';
import { runDoorDetails } from '../../model/doorDetails.js';

vi.mock('react-redux', () => ({
  useDispatch: () => vi.fn(),
  useSelector: (selector) => selector({ elevation: { facePath: null, activeRoomId: 'room', rooms: [{ id: 'room' }] } }),
}));
vi.mock('../../model/index.js', async (importOriginal) => ({
  ...await importOriginal(), runFaceLayouts: () => new Map(), cabinetInterior: () => null,
}));
vi.mock('../../model/doorDetails.js', () => ({ runDoorDetails: vi.fn() }));
vi.mock('../../model/pullLayouts.js', async (importOriginal) => ({
  ...await importOriginal(), runPulls: () => ({ pulls: [], warnings: [] }),
}));

describe('Step 480 face molding warnings', () => {
  it('numbers edge-overlap moldings once per face without the frame-fit message', () => {
    runDoorDetails.mockReturnValue({ warnings: [
      { code: 'door-profile-too-wide', side: 'molding', index: 0, pieceId: 'cabinet' },
      { code: 'door-profile-too-wide', side: 'molding', index: 0, pieceId: 'cabinet' },
      { code: 'door-profile-too-wide', side: 'molding', index: 2, pieceId: 'cabinet' },
      { code: 'door-profile-too-wide', side: 'molding', index: 4, pieceId: 'other' },
    ] });
    const html = renderToStaticMarkup(<FaceProperties part="style"
      wall={{ id: 'wall' }} run={{ id: 'run', cabinetTypeId: 'base' }}
      piece={{ id: 'cabinet', width: 18 }} item={{ id: 'cabinet', face: { type: 'door', size: null } }}
      layout={{ pieces: [] }} settings={{}}
    />);
    expect(html.match(/Applied molding 1 sits on the edge profile\./g)).toHaveLength(1);
    expect(html).toContain('Applied molding 3 sits on the edge profile.');
    expect(html).not.toContain('Applied molding 5');
    expect(html).not.toContain('wider than a stile or rail');
  });

  it('retains the frame-fit warning alongside molding overlap warnings', () => {
    runDoorDetails.mockReturnValue({ warnings: [
      { code: 'door-profile-too-wide', side: 'molding', index: 1, pieceId: 'cabinet' },
      { code: 'door-profile-too-wide', side: 'left', pieceId: 'cabinet' },
    ] });
    const html = renderToStaticMarkup(<FaceProperties part="style"
      wall={{ id: 'wall' }} run={{ id: 'run', cabinetTypeId: 'base' }}
      piece={{ id: 'cabinet', width: 18 }} item={{ id: 'cabinet', face: { type: 'door', size: null } }}
      layout={{ pieces: [] }} settings={{}}
    />);
    expect(html).toContain('Applied molding 2 sits on the edge profile.');
    expect(html).toContain('wider than a stile or rail');
  });

  it('numbers each no-room molding once per face and excludes warnings for other pieces', () => {
    runDoorDetails.mockReturnValue({ warnings: [
      { code: 'applied-molding-no-room', index: 1, pieceId: 'cabinet', key: 'cabinet:r:left' },
      { code: 'applied-molding-no-room', index: 1, pieceId: 'cabinet', key: 'cabinet:r:right' },
      { code: 'applied-molding-no-room', index: 3, pieceId: 'cabinet' },
      { code: 'applied-molding-no-room', index: 5, pieceId: 'other' },
    ] });
    const html = renderToStaticMarkup(<FaceProperties part="style"
      wall={{ id: 'wall' }} run={{ id: 'run', cabinetTypeId: 'base' }}
      piece={{ id: 'cabinet', width: 18 }} item={{ id: 'cabinet', face: { type: 'door', size: null } }}
      layout={{ pieces: [] }} settings={{}}
    />);
    expect(html.match(/Applied molding 2 doesn&#x27;t fit on this face\./g)).toHaveLength(1);
    expect(html).toContain('Applied molding 4 doesn&#x27;t fit on this face.');
    expect(html).not.toContain('Applied molding 6');
  });
});
