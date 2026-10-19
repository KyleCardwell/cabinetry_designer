import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../elevation/model/constants.js';
import { resolveSettings } from '../../elevation/model/settingsResolve.js';
import { reportHeader } from '../header.js';

const project = { name: 'Cardwell', address: '4311 W 8480 S, West Jordan, UT 84088' };
const room = { name: 'Kitchen' };
const settings = {
  ...DEFAULT_SETTINGS,
  report: {
    ...DEFAULT_SETTINGS.report,
    jobNumber: '573',
    wood: 'PAINT GRADE',
    finish: 'SW6885 - KNOCKOUT ORANGE',
    boxMaterial: 'WHITE MELAMINE',
    wireBrushed: false,
    edgebandAlert: '',
  },
};
const input = { project, room, settings, revision: null, date: new Date(2026, 9, 15) };

describe('report header', () => {
  it('builds the Euro kitchen header (anchor 2)', () => {
    expect(reportHeader(input)).toEqual({
      job: 'Cardwell',
      jobNumber: '573',
      address: '4311 W 8480 S, West Jordan, UT 84088',
      room: 'KITCHEN',
      orderRoom: '573 KITCHEN',
      wood: 'PAINT GRADE',
      finish: 'SW6885 - KNOCKOUT ORANGE',
      boxes: 'WHITE MELAMINE',
      edgebandAlert: null,
      faceFrame: false,
      drawerBoxOrder: DEFAULT_SETTINGS.drawerBoxOrder,
      company: { name: '', address: '', city: '', state: '', zip: '', phone: '', fax: '' },
      date: '10/15/2026',
      revision: null,
    });
  });

  it('labels both face frame styles and wire brushed wood without a Job # (anchor 3)', () => {
    for (const cabinetStyleId of [14, 15]) {
      expect(reportHeader({
        ...input,
        settings: {
          ...settings,
          defaultStyle: { ...settings.defaultStyle, cabinetStyleId },
          report: { ...settings.report, jobNumber: '', wireBrushed: true },
        },
      })).toMatchObject({
        faceFrame: true,
        room: 'KITCHEN - FACE FRAME',
        orderRoom: 'KITCHEN - FACE FRAME',
        wood: 'PAINT GRADE - WIRE BRUSHED',
      });
    }
  });

  it('leaves job and address blank without a project (anchor 4)', () => {
    expect(reportHeader({ ...input, project: null })).toMatchObject({ job: '', address: '' });
  });

  it('trims only Job # and the alert, preserves typed text and revision, and defaults to today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 23, 30));
    try {
      const report = {
        ...settings.report,
        jobNumber: ' 573 ',
        edgebandAlert: '  Match edge  ',
        wood: 'Maple',
        finish: ' Clear ',
        boxMaterial: 'Birch ply',
        companyName: 'Forever Furniture, Inc.',
        companyPhone: ' (801) 555-0123 ',
        companyFax: '801-555-0124',
      };
      expect(reportHeader({
        ...input, settings: { ...settings, report }, date: undefined, revision: 'Issued v2',
      })).toMatchObject({
        jobNumber: '573',
        orderRoom: '573 KITCHEN',
        edgebandAlert: 'Match edge',
        wood: 'Maple',
        finish: ' Clear ',
        boxes: 'Birch ply',
        company: {
          name: 'Forever Furniture, Inc.', phone: ' (801) 555-0123 ', fax: '801-555-0124',
        },
        date: '01/05/2026',
        revision: 'Issued v2',
      });
      expect(reportHeader({
        ...input,
        settings: { ...settings, report: { ...report, jobNumber: '  ', edgebandAlert: '  ' } },
      })).toMatchObject({ jobNumber: '', orderRoom: 'KITCHEN', edgebandAlert: null });
    } finally {
      vi.useRealTimers();
    }
  });
});


it('IN11a includes face-frame, company address and ProBox defaults (anchor 2)', () => {
  expect(reportHeader({
    ...input,
    room: { name: 'Kitchen Opt 2' },
    settings: {
      ...settings,
      defaultStyle: { ...settings.defaultStyle, cabinetStyleId: 14 },
      report: { ...settings.report, companyAddress: '4311 W 8480 S',
        companyCity: 'West Jordan', companyState: 'UT', companyZip: '84088' },
    },
  })).toMatchObject({
    job: 'Cardwell', faceFrame: true, orderRoom: '573 KITCHEN OPT 2 - FACE FRAME',
    company: { address: '4311 W 8480 S', city: 'West Jordan', state: 'UT', zip: '84088' },
    drawerBoxOrder: { sideThickness: '5/8"' },
  });
});

it('IN11a carries a room box-spec override and fills missing header leaves (anchor 3)', () => {
  const effective = resolveSettings([
    { level: 'team', values: { drawerBoxOrder: { assembly: 'Shop finish' } } },
    { level: 'room', values: { drawerBoxOrder: { sideMaterial: 'Soft Maple' } } },
  ]);
  expect(reportHeader({ ...input, settings: effective }).drawerBoxOrder).toEqual({
    ...DEFAULT_SETTINGS.drawerBoxOrder, sideMaterial: 'Soft Maple', assembly: 'Shop finish',
  });
  const partial = { ...settings, drawerBoxOrder: { sideMaterial: 'Soft Maple' } };
  const header = reportHeader({ ...input, settings: partial });
  expect(header.drawerBoxOrder).toEqual({ ...DEFAULT_SETTINGS.drawerBoxOrder, sideMaterial: 'Soft Maple' });
  expect(partial.drawerBoxOrder).toEqual({ sideMaterial: 'Soft Maple' });
  const { drawerBoxOrder, ...older } = settings;
  expect(reportHeader({ ...input, settings: older }).drawerBoxOrder).toEqual(drawerBoxOrder);
});
