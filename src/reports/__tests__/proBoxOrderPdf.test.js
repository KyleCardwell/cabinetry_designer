import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../elevation/model/constants.js';
import { BUILT_IN_SLIDES } from '../../elevation/model/slides.js';
import { reportHeader } from '../header.js';
import { proBoxOrder } from '../proBoxOrder.js';
import { proBoxOrderDocument, proBoxOrderFileName } from '../proBoxOrderPdf.js';

const settings = { ...DEFAULT_SETTINGS, slides: BUILT_IN_SLIDES, drawerSlideId: 'blum-562h',
  report: { ...DEFAULT_SETTINGS.report, jobNumber: '573', companyName: 'FOREVER FURNITURE, INC.',
    companyAddress: '4311 W 8480 S', companyCity: 'West Jordan', companyState: 'UT',
    companyZip: '84088', companyPhone: '801-280-5005', companyFax: '801-280-5353' } };
const room = { name: 'Kitchen', walls: [], wallOrder: [] };
const header = reportHeader({ project: { name: 'Cardwell' }, room, settings, revision: 'Revision 2', date: new Date(2026, 9, 19) });
// The five grouped lines from step b's Euro sample, supplied to the pure renderer.
const order = { ...proBoxOrder(room, settings, header), lines: [
  [2, 1, 4.25, 16, 21, ''], [5, 1, 4.25, 16, 21, ''],
  [2, 2, 10.25, 16, 21, ''], [5, 2, 10.25, 16, 21, ''], [11, 2, 4.25, 20.75, 21, 'Scoop'],
].map(([cab, qty, height, width, depth, instructions]) => ({ cab, qty, height, width, depth, instructions })) };

function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object') return [];
  return [value, ...Object.values(value).filter((entry) => typeof entry === 'object').flatMap(nodes)];
}
const texts = (value) => nodes(value).flatMap((node) => typeof node.text === 'string' ? [node.text] : []);
const linesTable = (value) => nodes(value).find((node) => node.table?.headerRows === 1);
const checkboxes = (value) => nodes(value).filter((node) => node.columns?.[0]?.canvas);

describe('ProBox order PDF', () => {
  it('renders the two Euro sample forms and centred, alternating line rows (anchor 1)', () => {
    const before = structuredClone(order);
    const doc = proBoxOrderDocument(order, header, ['order', 'master', 'master']);
    expect(doc).toMatchObject({ pageSize: 'LETTER', pageOrientation: 'portrait', pageMargins: [18, 18, 18, 36] });
    expect(doc.content).toHaveLength(2);
    const [master, copy] = doc.content;
    expect(master.pageBreak).toBeUndefined();
    expect(master.stack[0]).toMatchObject({ text: 'MASTER COPY', color: '#DC2626', alignment: 'right' });
    expect(copy.pageBreak).toBe('before');
    expect(texts(copy)).not.toContain('MASTER COPY');
    expect(texts(master)).toEqual(expect.arrayContaining(['Cardwell - 573 KITCHEN', 'Same',
      'ProBox Drawers, Inc.', '537 W. Pickett Cir., #1400', 'Salt Lake City, UT 84115']));
    const { table, layout } = linesTable(master);
    expect(table).toMatchObject({ headerRows: 1, dontBreakRows: true });
    expect(table.body).toHaveLength(6);
    expect(table.body[0].map(({ text }) => text)).toEqual(['Cab. #', 'Qty', 'Height', 'Width', 'Depth', 'Special Line Instructions']);
    expect(table.body.slice(1).map((row) => row.map(({ text }) => text))).toEqual([
      ['2', '1', '4 1/4', '16', '21', ''], ['5', '1', '4 1/4', '16', '21', ''],
      ['2', '2', '10 1/4', '16', '21', ''], ['5', '2', '10 1/4', '16', '21', ''],
      ['11', '2', '4 1/4', '20 3/4', '21', 'Scoop'],
    ]);
    table.body.flat().forEach((cell) => expect(cell.alignment).toBe('center'));
    table.body.slice(1).forEach((row, index) => row.forEach((cell) =>
      expect(cell.fillColor).toBe(index % 2 ? '#F2F2F2' : undefined)));
    expect(layout.hLineColor()).toBe('#999999');
    expect(order).toEqual(before);
  });

  it('draws every fixed option as a black 9pt square, adding two X lines only when checked (anchor 2)', () => {
    const form = proBoxOrderDocument(order, header, ['master']).content[0];
    const boxes = checkboxes(form).filter((node) => node.columns[1].text);
    expect(boxes.filter((node) => node.columns[0].canvas.length === 3).map((node) => node.columns[1].text)).toEqual([
      'Baltic Birch Ply', '5/8"', '1/4" Baltic Birch Ply', 'Flat Flush (w/ eased edges)', 'Standard',
      'Pre-finished & assembled', 'Notch & hole', 'Attach clips',
    ]);
    expect(boxes.filter((node) => node.columns[0].canvas.length === 1).map((node) => node.columns[1].text)).toEqual([
      'ORDER', 'QUOTE', 'Will Call', 'Delivery', 'Ship', 'Soft Maple', '1/2"', '1/4" Maple Veneer', 'Assembled w/ clear coat',
    ]);
    for (const node of boxes) {
      const [square, ...cross] = node.columns[0].canvas;
      expect(square).toMatchObject({ type: 'rect', x: 0, y: 0, w: 9, h: 9, lineColor: '#000000' });
      if (cross.length) expect(cross).toEqual([
        expect.objectContaining({ type: 'line', x1: 0, y1: 0, x2: 9, y2: 9, lineColor: '#000000' }),
        expect.objectContaining({ type: 'line', x1: 0, y1: 9, x2: 9, y2: 0, lineColor: '#000000' }),
      ]);
    }
    expect(texts(form)).toContain('STANDARD BLUM');
    expect(nodes(form).find((node) => node.text === 'Cross Grain Bottoms').alignment).toBe('center');
  });

  it('underlines company and shop fields and provides checked custom write-ins or blank unchecked lines', () => {
    const custom = { ...settings, drawerBoxOrder: { ...settings.drawerBoxOrder, sideMaterial: 'Walnut', assembly: '' } };
    const customHeader = reportHeader({ room, settings: custom });
    const form = proBoxOrderDocument(proBoxOrder(room, custom, customHeader), customHeader, ['order']).content[0];
    const underlined = nodes(form).filter((node) => node.border?.join() === 'false,false,false,true');
    expect(underlined.map(({ text }) => text)).toEqual(expect.arrayContaining([
      'FOREVER FURNITURE, INC.', '4311 W 8480 S', 'West Jordan', 'UT', '84088', '801-280-5005', '801-280-5353', 'Walnut',
    ]));
    const writeIns = checkboxes(form).filter((node) => node.columns[1].table);
    expect(writeIns).toHaveLength(6);
    expect(writeIns[0].columns[0].canvas).toHaveLength(3);
    writeIns.slice(1).forEach((node) => expect(node.columns[0].canvas).toHaveLength(1));
    const assembly = checkboxes(form).filter((node) => ['Pre-finished & assembled', 'Assembled w/ clear coat'].includes(node.columns[1].text));
    assembly.forEach((node) => expect(node.columns[0].canvas).toHaveLength(1));
    expect(proBoxOrderDocument(order, header, []).content).toEqual([]);
  });

  it('uses the shared filename and per-copy footer on overflow pages (anchor 3)', () => {
    expect(proBoxOrderFileName(header, 'Kitchen')).toBe('Cardwell - Kitchen - ProBox Drawer Box Order.pdf');
    expect(proBoxOrderFileName({ job: '' }, 'A/B')).toBe('Room - A-B - ProBox Drawer Box Order.pdf');
    const { footer } = proBoxOrderDocument(order, header, ['master', 'order']);
    expect(texts(footer(3, 4))).toEqual(expect.arrayContaining(['Page 1 of 2', 'Revision 2', '10/19/2026']));
    expect(texts(footer(4, 4))).toContain('Page 2 of 2');
  });
});
