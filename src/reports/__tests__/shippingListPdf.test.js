import { describe, expect, it } from 'vitest';
import { COPIES } from '../copies.js';
import { doorOrderDocument } from '../doorOrderPdf.js';
import { BORDER_LAYOUT, PAGE_MARGINS } from '../pdfParts.js';
import { shippingListDocument, shippingListFileName } from '../shippingListPdf.js';

const header = {
  job: 'Cardwell', jobNumber: '573', address: '4311 W 8480 S', room: 'KITCHEN',
  wood: 'WHITE OAK - WIRE BRUSHED', finish: 'CLEAR', boxes: 'WHITE MELAMINE',
  edgebandAlert: null, company: { name: 'FOREVER FURNITURE, INC.', phone: '801-280-5005', fax: '' },
  revision: 'Revision 2', date: '10/15/2026',
};
const list = {
  rows: [
    { number: 1, description: 'Base', notes: ['MAPLE PLY BOX', 'hl'], size: '24 x 30 1/2 x 23 3/4' },
    { number: 2, description: 'Filler', notes: [], size: '3 1/8 x 30 1/2 x 3/4' },
    { number: 3, description: 'Crown', notes: ['3 sticks'], size: "24'" },
    { number: null, description: 'Adjustable Shelves', notes: [], size: '' },
  ],
  roomNote: null, warnings: [],
};
const allBorders = [true, true, true, true];
const document = (overrides = {}, copyIds = ['master']) => shippingListDocument(list, { ...header, ...overrides }, copyIds);
const titleRows = (node) => node.table.body[0][0].table.body;

describe('RP2 step g shipping list PDF definition', () => {
  it('builds one complete table per copy in canonical order (anchor 1)', () => {
    const before = structuredClone({ list, header });
    const definition = document({}, ['order', 'master']);
    expect(definition).toMatchObject({
      pageSize: 'LETTER', pageOrientation: 'portrait', pageMargins: [18, 18, 18, 36],
      defaultStyle: { font: 'Roboto', fontSize: 10 },
    });
    expect(definition.content).toHaveLength(2);
    definition.content.forEach((node, index) => {
      expect(node.table).toMatchObject({
        headerRows: 2, widths: [38, 34, 40, 115, '*', 105], dontBreakRows: true,
      });
      expect(node.table.body).toHaveLength(6);
      expect(node.pageBreak).toBe(index ? 'before' : undefined);
      expect(titleRows(node)[2][2].text).toBe(index ? '' : 'MASTER COPY');
    });
    expect({ list, header }).toEqual(before);
    expect(document({}, []).content).toEqual([]);
    expect(document({}, ['order', 'order', 'unknown']).content).toHaveLength(1);
  });

  it('centers and shades all six bold bordered headings (anchor 2)', () => {
    expect(document().content[0].table.body[1]).toEqual(
      ['Part #', 'Built', 'Shipped', 'Description', 'Notes', 'Size'].map((text) => ({
        text, alignment: 'center', bold: true, fillColor: '#D9D9D9', border: allBorders,
      })),
    );
  });

  it('borders every body cell, stacks notes and leaves checkboxes and shelf numbers blank (anchors 3, 4)', () => {
    const rows = document().content[0].table.body.slice(2);
    expect(rows[0]).toEqual([
      { text: '1', alignment: 'center', border: allBorders },
      { text: '', border: allBorders }, { text: '', border: allBorders },
      { text: 'Base', alignment: 'left', border: allBorders },
      { stack: [{ text: 'MAPLE PLY BOX', fontSize: 9 }, { text: 'hl', fontSize: 9 }], border: allBorders },
      { text: '24 x 30 1/2 x 23 3/4', alignment: 'center', border: allBorders },
    ]);
    expect(rows[1][4]).toEqual({ text: '', border: allBorders });
    expect(rows.at(-1).map(({ text }) => text)).toEqual(['', '', '', 'Adjustable Shelves', '', '']);
    for (const row of rows) for (const cell of row) expect(cell.border).toEqual(allBorders);
  });

  it('builds the bold nested title with job, room, materials and right-aligned copy labels (anchor 7)', () => {
    const definition = document({}, [...COPIES.map(({ id }) => id)].reverse());
    definition.content.forEach((node, index) => {
      expect(node.table.body[0]).toEqual([
        expect.objectContaining({ colSpan: 6, border: [false, false, false, false],
          margin: [-4, -2, -4, 4], fontSize: 10,
          table: { widths: ['auto', '*', 'auto'], body: expect.any(Array) }, layout: 'noBorders' }),
        {}, {}, {}, {}, {},
      ]);
      expect(titleRows(node)).toEqual([
        [{ text: 'Main - Shipping List', fontSize: 12, bold: true, colSpan: 2 }, {},
          { text: 'Job # 573', bold: true, alignment: 'right' }],
        [{ text: 'Job:', bold: true }, { text: header.job, bold: true },
          { text: header.address, bold: true, alignment: 'right' }],
        [{ text: 'Room:', bold: true }, { text: header.room, bold: true },
          { text: COPIES[index].label ?? '', bold: true, color: '#DC2626', fontSize: 13, alignment: 'right' }],
        [{ text: 'Wood:', bold: true }, { text: header.wood, bold: true }, { text: '' }],
        [{ text: 'Finish:', bold: true }, { text: header.finish, bold: true }, { text: '' }],
        [{ text: 'Boxes:', bold: true }, { text: header.boxes, bold: true }, { text: '' }],
      ]);
    });
    expect(titleRows(document({ jobNumber: '' }).content[0])[0][2].text).toBe('');
  });

  it('adds the full-width red edgeband alert only when set (anchor 5)', () => {
    const rows = titleRows(document({ edgebandAlert: 'EDGEBAND ALL SHELVES' }).content[0]);
    expect(rows).toHaveLength(7);
    expect(rows.at(-1)).toEqual([
      { text: 'EDGEBAND ALL SHELVES', color: '#DC2626', fontSize: 11, bold: true, colSpan: 3 }, {}, {},
    ]);
    for (const edgebandAlert of [null, '']) {
      expect(titleRows(document({ edgebandAlert }).content[0])).toHaveLength(6);
    }
  });

  it('ends each copy with a bold bordered room note only when set (anchor 6)', () => {
    const definition = shippingListDocument({ ...list, roomNote: 'Ship Fri' }, header, ['master', 'order']);
    for (const node of definition.content) {
      expect(node.table.body).toHaveLength(7);
      expect(node.table.body.at(-1)).toEqual([
        { text: 'Room notes: Ship Fri', bold: true, border: allBorders, colSpan: 6 }, {}, {}, {}, {}, {},
      ]);
    }
    for (const roomNote of [null, '']) {
      const node = shippingListDocument({ ...list, roomNote }, header, ['order']).content[0];
      expect(node.table.body).toHaveLength(6);
      expect(node.table.body.at(-1)[3].text).toBe('Adjustable Shelves');
    }
  });

  it('uses the door form footer and border layout with page numbers restarting per copy (anchor 9)', () => {
    const shipping = document({}, ['order', 'master']);
    const door = doorOrderDocument({ pages: [] }, header, ['order', 'master']);
    expect(shipping.footer(3, 4)).toEqual(door.footer(3, 4));
    expect(shipping.footer(1, 2).margin).toEqual([18, 6, 18, 0]);
    expect(shipping.footer(3, 4).stack[0].columns).toEqual([
      { text: 'FOREVER FURNITURE, INC.   Phone: 801-280-5005', width: '*', bold: true },
      { text: 'Page 1 of 2', width: 'auto', alignment: 'right' },
    ]);
    expect(shipping.footer(4, 4).stack[1].columns).toEqual([
      { text: 'Revision 2', width: '*' }, { text: header.date, width: 'auto', alignment: 'right' },
    ]);
    expect(shipping.footer(6, 6).stack[0].columns[1].text).toBe('Page 3 of 3');
    const { layout } = shipping.content[0];
    for (const property of ['hLineWidth', 'vLineWidth']) expect(layout[property]()).toBe(0.75);
    for (const property of ['hLineColor', 'vLineColor']) expect(layout[property]()).toBe('#000000');
    for (const property of ['paddingTop', 'paddingBottom']) expect(layout[property]()).toBe(2);
    for (const property of ['paddingLeft', 'paddingRight']) expect(layout[property]()).toBe(4);
  });

  it('shares the quarter-inch page margins with the door form (RP2.1 anchor 1)', () => {
    expect(PAGE_MARGINS).toEqual([18, 18, 18, 36]);
    expect(document().pageMargins).toBe(PAGE_MARGINS);
    expect(doorOrderDocument({ pages: [] }, header, ['order']).pageMargins).toBe(PAGE_MARGINS);
  });

  it('disables inherited shipping borders while preserving the door form layout (RP2.2 anchors 1, 5)', () => {
    expect(document().content[0].layout).toEqual({ ...BORDER_LAYOUT, defaultBorder: false });
    const door = doorOrderDocument({ pages: [{
      header: { style: 'Slab', thickness: '3/4' },
      sections: [{ title: 'Doors', lines: [] }],
    }] }, header, ['master']);
    expect(door.content[0].layout).toBe(BORDER_LAYOUT);
    expect(door.content[0].layout).not.toHaveProperty('defaultBorder');
  });

  it('builds and sanitizes shipping list filenames (anchor 8)', () => {
    expect(shippingListFileName({ job: 'Cardwell' }, 'Kitchen')).toBe('Cardwell - Kitchen - Main Shipping List.pdf');
    expect(shippingListFileName({ job: '' }, 'A/B')).toBe('Room - A-B - Main Shipping List.pdf');
    expect(shippingListFileName({ job: 'A<>:"' }, 'B\\|?*\n')).toBe('A---- - B----- - Main Shipping List.pdf');
  });

  it('preserves plain fractions throughout all copies, headers, notes and footer (anchor 10)', () => {
    const definition = shippingListDocument({ ...list, roomNote: 'Scribe 3/4' }, {
      ...header, wood: '1 1/8 OAK', finish: '1/2 sheen', boxes: '3/4 MAPLE', edgebandAlert: '1/8 EDGEBAND',
    }, COPIES.map(({ id }) => id));
    const serialized = JSON.stringify({ ...definition, footer: definition.footer(1, 10) });
    expect(serialized).not.toMatch(/[\u00bc-\u00be\u2150-\u215e]/);
    for (const text of ['24 x 30 1/2 x 23 3/4', '3 1/8 x 30 1/2 x 3/4', 'Scribe 3/4',
      '1 1/8 OAK', '1/2 sheen', '3/4 MAPLE', '1/8 EDGEBAND']) expect(serialized).toContain(text);
  });
});
