import { describe, expect, it } from 'vitest';
import { COPIES } from '../copies.js';
import { doorOrderDocument, doorOrderFileName } from '../doorOrderPdf.js';

const header = {
  job: 'Cardwell', orderRoom: '123 KITCHEN', wood: 'WHITE OAK - WIRE BRUSHED',
  company: { name: 'FOREVER FURNITURE, INC.', phone: '801-280-5005', fax: '' },
  revision: 'Revision 2', date: '10/15/2026',
};
const page = {
  styleId: 'shaker', type: 'drawer_fronts',
  header: {
    style: '110', wood: null, vendor: 'VENDOR', thickness: '13/16"',
    edgeProfile: 'SQUARE', insideProfile: 'BEAD', panelProfile: 'FLAT',
    appliedMoldings: 'COVE', notes: '3" Stiles & Rails - No Midrails Unless Noted',
  },
  sections: [{
    id: 'drawer_fronts', title: 'Drawer Fronts',
    lines: [
      { number: 1, qty: 2, size: '25 3/8 x 5 1/32', notes: 'false front' },
      { number: 2, qty: 1, size: '25 3/8 x 30 1/2', notes: '' },
    ],
  }],
};
const slabPage = {
  ...page, type: 'slab',
  header: {
    ...page.header, wood: 'MAPLE', vendor: 'STILLWATER',
    panelProfile: null, insideProfile: null, appliedMoldings: null, notes: null,
  },
  sections: [{
    id: 'slab', title: 'Slab',
    lines: [{ number: '?', qty: 1, size: '3 1/8 x 4 3/4', notes: 'do not sand edges' }],
  }],
};
const order = { pages: [page, slabPage], warnings: [] };
const allBorders = [true, true, true, true];
const titleRows = (node) => node.table.body[0][0].table.body;

function texts(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, entry]) => key === 'text' ? texts(entry)
    : typeof entry === 'object' ? texts(entry) : []);
}

describe('door order PDF definition', () => {
  it('repeats every form in canonical copy order with page breaks (anchor 5)', () => {
    expect(COPIES).toEqual([
      { id: 'master', label: 'MASTER COPY' }, { id: 'shop', label: 'SHOP COPY' },
      { id: 'install', label: 'INSTALL COPY' }, { id: 'nike', label: 'NIKE COPY' },
      { id: 'order', label: null },
    ]);
    const before = structuredClone(order);
    const definition = doorOrderDocument(order, header, ['order', 'master']);
    expect(definition.content).toHaveLength(4);
    definition.content.forEach((node, index) => {
      const text = texts(node);
      expect(node.table.body[1][0].text).toBe(index % 2 === 0 ? 'Drawer Fronts' : 'Slab');
      expect(COPIES.filter(({ label }) => label && text.includes(label)).map(({ id }) => id))
        .toEqual(index < 2 ? ['master'] : []);
      expect(node.pageBreak).toBe(index ? 'before' : undefined);
      expect(titleRows(node).find(([cell]) => cell.text === 'Style:')[2]).toEqual({
        text: index < 2 ? 'MASTER COPY' : '', bold: true, color: '#DC2626',
        fontSize: 13, alignment: 'center',
      });
    });
    expect(order).toEqual(before);
    expect(doorOrderDocument(order, header, ['nike', 'install', 'shop', 'master', 'order', 'master']).content)
      .toHaveLength(10);
    expect(doorOrderDocument(order, header, []).content).toEqual([]);
    expect(doorOrderDocument({ pages: [] }, header, ['master']).content).toEqual([]);
  });

  it('numbers overflow pages within each copy and includes revision/date', () => {
    const { footer } = doorOrderDocument(order, header, ['order', 'master']);
    expect(texts(footer(3, 4))).toContain('Page 1 of 2');
    expect(texts(footer(6, 6))).toContain('Page 3 of 3');
    expect(texts(footer(4, 4))).toEqual(expect.arrayContaining(['Page 2 of 2', 'Revision 2', '10/15/2026']));
    const noRevision = doorOrderDocument(order, { ...header, revision: null }, ['order']);
    expect(texts(noRevision.footer(1, 2))).not.toContain('Revision 2');
  });

  it('repeats the bordered title block, type title and shaded headings (anchor 1)', () => {
    const definition = doorOrderDocument(order, header, ['master']);
    expect(definition).toMatchObject({
      pageSize: 'LETTER', pageOrientation: 'portrait', pageMargins: [28.8, 28.8, 28.8, 43.2],
      defaultStyle: { font: 'Roboto', fontSize: 10 },
    });
    definition.content.forEach(({ table, layout }, index) => {
      expect(table).toMatchObject({ headerRows: 3, widths: [70, 50, '*'], dontBreakRows: true });
      expect(table.body[0][0]).toMatchObject({
        colSpan: 3, border: allBorders, fontSize: 10,
        table: { widths: ['auto', '*', 170] }, layout: 'noBorders',
      });
      expect(table.body[0][0].table.body[0][0]).toMatchObject({ text: 'Door Order Form', fontSize: 12 });
      expect(table.body[1]).toEqual([
        {
          text: order.pages[index].sections[0].title, colSpan: 3, bold: true, fontSize: 14,
          margin: [0, 4, 0, 2], border: [false, false, false, false],
        }, {}, {},
      ]);
      expect(table.body[2]).toEqual(['Cabinet ID', 'QTY', 'Size'].map((text) => ({
        text, alignment: 'center', bold: true, fillColor: '#D9D9D9', border: allBorders,
      })));
      expect(typeof layout).toBe('object');
      for (const property of ['hLineWidth', 'vLineWidth']) expect(layout[property]()).toBe(0.75);
      for (const property of ['hLineColor', 'vLineColor']) expect(layout[property]()).toBe('#000000');
      for (const property of ['paddingTop', 'paddingBottom']) expect(layout[property]()).toBe(2);
      for (const property of ['paddingLeft', 'paddingRight']) expect(layout[property]()).toBe(4);
      expect(table.body).toHaveLength(3 + order.pages[index].sections[0].lines.length);
    });
  });

  it('borders every line and centers the size with 9 pt notes below it (step c anchor 5)', () => {
    const { content } = doorOrderDocument(order, header, ['order']);
    expect(content[0].table.body[3]).toEqual([
      { text: '1', alignment: 'right', border: allBorders },
      { text: '2', alignment: 'right', border: allBorders },
      { stack: [
        { text: '25 3/8 x 5 1/32', alignment: 'center' },
        { text: 'false front', alignment: 'center', fontSize: 9 },
      ], border: allBorders },
    ]);
    expect(content[0].table.body[4][2]).toEqual({
      text: '25 3/8 x 30 1/2', alignment: 'center', border: allBorders,
    });
    for (const node of content) {
      for (const row of node.table.body.slice(3)) {
        for (const cell of row) {
          expect(cell.border).toEqual(allBorders);
          expect(cell.bold).toBeFalsy();
        }
        if (row[2].stack) expect(row[2].stack[1].fontSize).toBe(9);
      }
    }
  });

  it('aligns bold labels and values, combining style and thickness (step c anchor 2)', () => {
    const { content } = doorOrderDocument(order, header, ['master']);
    const rows = titleRows(content[0]);
    expect(rows[0]).toEqual([
      { text: 'Door Order Form', alignment: 'center', bold: true, fontSize: 12, colSpan: 3 }, {}, {},
    ]);
    expect(rows.slice(2).map(([cell]) => cell.text)).toEqual([
      'Job:', 'Room:', 'Wood:', 'Style:', 'Panel Profile:', 'Edge Profile:',
      'Inside Profile:', 'Applied Molding:', 'Notes:',
    ]);
    expect(rows.slice(2).map((row) => row[1].text)).toEqual([
      'Cardwell', '123 KITCHEN', 'WHITE OAK - WIRE BRUSHED', '110 - 13/16" thick',
      'FLAT', 'SQUARE', 'BEAD', 'COVE', page.header.notes,
    ]);
    expect(rows.find(([cell]) => cell.text === 'Style:').slice(0, 2)).toEqual([
      { text: 'Style:', bold: true, margin: [0, 8, 0, 0] },
      { text: '110 - 13/16" thick', bold: true, margin: [0, 8, 0, 0] },
    ]);
    expect(rows.find(([cell]) => cell.text === 'Panel Profile:')[2]).toEqual({
      text: 'VENDOR', bold: true, italics: true, alignment: 'center',
    });
    expect(rows.find(([cell]) => cell.text === 'Edge Profile:')[2].text).toBe('');
    expect(texts(content).some((text) => text.startsWith('Thickness'))).toBe(false);
  });

  it('keeps notes aligned with values and wrapping across the last two columns (anchor 8)', () => {
    const rows = titleRows(doorOrderDocument(order, header, ['order']).content[0]);
    expect(rows.find(([cell]) => cell.text === 'Notes:')).toEqual([
      { text: 'Notes:', bold: true },
      { text: '3" Stiles & Rails - No Midrails Unless Noted', bold: true, colSpan: 2 }, {},
    ]);
    for (const node of doorOrderDocument(order, header, ['order']).content) {
      for (const [label, value] of titleRows(node).slice(2)) {
        expect(label.bold).toBe(true);
        expect(value.bold).toBe(true);
      }
    }
  });

  it('omits null or empty optional rows and puts slab vendor beside Edge Profile (anchor 4)', () => {
    for (const blank of [null, '']) {
      const slab = {
        ...slabPage,
        header: {
          ...slabPage.header, panelProfile: blank, insideProfile: blank,
          appliedMoldings: blank, notes: blank,
        },
      };
      const node = doorOrderDocument({ pages: [slab] }, header, ['order']).content[0];
      const rows = titleRows(node);
      expect(rows.slice(2).map(([cell]) => cell.text)).toEqual([
        'Job:', 'Room:', 'Wood:', 'Style:', 'Edge Profile:',
      ]);
      expect(rows.find(([cell]) => cell.text === 'Wood:')[1].text).toBe('MAPLE');
      expect(rows.find(([cell]) => cell.text === 'Edge Profile:')[2]).toEqual({
        text: 'STILLWATER', bold: true, italics: true, alignment: 'center',
      });
    }
    const noVendor = { ...page, header: { ...page.header, vendor: null } };
    const rows = titleRows(doorOrderDocument({ pages: [noVendor] }, header, ['order']).content[0]);
    expect(rows.find(([cell]) => cell.text === 'Panel Profile:')[2].text).toBe('');
  });

  it('bolds company and contact information while omitting blank phone/fax', () => {
    const definition = doorOrderDocument(order, header, ['order']);
    const faxOnly = doorOrderDocument(order, {
      ...header, company: { name: '', phone: '', fax: '801-555-1212' },
    }, ['order']);
    for (const [doc, contact, omitted] of [
      [definition, 'Phone: 801-280-5005', 'Fax:'], [faxOnly, 'Fax: 801-555-1212', 'Phone:'],
    ]) {
      expect(titleRows(doc.content[0])[1]).toEqual([
        {
          colSpan: 3, columnGap: 12,
          columns: [
            { text: doc === definition ? header.company.name : '', bold: true, width: '*' },
            { text: contact, bold: true, width: 'auto', alignment: 'right' },
          ],
        }, {}, {},
      ]);
      expect(doc.footer(1, 2).stack[0].columns[0].bold).toBe(true);
      for (const value of [doc.content, doc.footer(1, 2)]) {
        expect(texts(value).join(' ')).toContain(contact);
        expect(texts(value).join(' ')).not.toContain(omitted);
      }
    }
    const blank = doorOrderDocument(order, {
      ...header, company: { name: '', phone: '', fax: '' },
    }, ['order']);
    expect(titleRows(blank.content[0])[1][0].columns.map(({ text }) => text)).toEqual(['', '']);
  });

  it('gives phone and fax their natural width across the company row (step c anchor 3)', () => {
    const both = doorOrderDocument(order, {
      ...header, company: { name: 'FOREVER FURNITURE, INC.', phone: '801-280-5005', fax: '801-280-5353' },
    }, ['order']);
    for (const node of both.content) {
      expect(titleRows(node)[1]).toEqual([
        {
          colSpan: 3, columnGap: 12,
          columns: [
            { text: 'FOREVER FURNITURE, INC.', bold: true, width: '*' },
            { text: 'Phone: 801-280-5005   Fax: 801-280-5353', bold: true, width: 'auto', alignment: 'right' },
          ],
        }, {}, {},
      ]);
    }
  });

  it('builds and sanitizes download filenames', () => {
    expect(doorOrderFileName({ job: 'Cardwell' }, 'Kitchen')).toBe('Cardwell - Kitchen - Door Order Form.pdf');
    expect(doorOrderFileName({ job: '' }, 'A/B')).toBe('Room - A-B - Door Order Form.pdf');
    expect(doorOrderFileName({ job: 'A<>:"' }, 'B\\|?*\n')).toBe('A---- - B----- - Door Order Form.pdf');
  });

  it('keeps all dimensions and notes in plain fractions throughout the definition (anchor 6)', () => {
    const definition = doorOrderDocument(order, header, COPIES.map(({ id }) => id));
    const serialized = JSON.stringify({ ...definition, footer: definition.footer(1, 10) });
    expect(serialized).not.toMatch(/[⅛¼⅜½⅝¾⅞]/);
    expect(texts(definition)).toEqual(expect.arrayContaining([
      '25 3/8 x 5 1/32', '25 3/8 x 30 1/2', '3 1/8 x 4 3/4', '110 - 13/16" thick',
    ]));
  });
});
