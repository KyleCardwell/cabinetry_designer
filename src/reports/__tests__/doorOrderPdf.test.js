import { describe, expect, it } from 'vitest';
import { COPIES } from '../copies.js';
import { doorOrderDocument, doorOrderFileName } from '../doorOrderPdf.js';

const header = {
  job: 'Cardwell', orderRoom: '123 KITCHEN', wood: 'WHITE OAK - WIRE BRUSHED',
  company: { name: 'FOREVER FURNITURE, INC.', phone: '801-280-5005', fax: '' },
  revision: 'Revision 2', date: '10/15/2026',
};
const page = {
  header: {
    style: 'SHAKER - SH', wood: null, vendor: 'VENDOR', thickness: '13/16"',
    edgeProfile: 'SQUARE', insideProfile: 'BEAD', panelProfile: 'FLAT',
    appliedMoldings: 'COVE', notes: '3" Stiles & Rails - No Midrails Unless Noted',
  },
  sections: [
    { title: 'Drawer Fronts', lines: [{ number: 1, qty: 2, size: '25 3/8 x 5 1/32', notes: 'false front' }] },
    { title: 'Doors', lines: [{ number: 2, qty: 1, size: '25 3/8 x 30 1/2', notes: '' }] },
    { title: 'Slab', lines: [{ number: '?', qty: 1, size: '3 1/8 x 4 3/4', notes: 'do not sand edges' }] },
  ],
};
const slabPage = {
  ...page,
  header: {
    ...page.header, style: 'SLAB - SL', wood: 'MAPLE', vendor: null,
    panelProfile: null, insideProfile: null, appliedMoldings: null, notes: null,
  },
};
const order = { pages: [page, slabPage], warnings: [] };

function texts(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, entry]) => key === 'text' ? texts(entry)
    : typeof entry === 'object' ? texts(entry) : []);
}

describe('door order PDF definition', () => {
  it('repeats every style in canonical copy order with page breaks (anchor 1)', () => {
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
      expect(text).toContain(`Style: ${index % 2 === 0 ? 'SHAKER - SH' : 'SLAB - SL'}`);
      expect(text.includes('MASTER COPY')).toBe(index < 2);
      expect(COPIES.filter(({ label }) => label && text.includes(label)).map(({ id }) => id))
        .toEqual(index < 2 ? ['master'] : []);
      expect(node.pageBreak).toBe(index ? 'before' : undefined);
    });
    const copyCell = definition.content[0].table.body.flat().flatMap((cell) => cell.columns ?? [])
      .find(({ text }) => text === 'MASTER COPY');
    expect(copyCell).toMatchObject({ bold: true, color: '#DC2626', alignment: 'right' });
    expect(order).toEqual(before);
    expect(doorOrderDocument(order, header, ['nike', 'install', 'shop', 'master', 'order', 'master']).content)
      .toHaveLength(10);
    expect(doorOrderDocument(order, header, []).content).toEqual([]);
    expect(doorOrderDocument({ pages: [] }, header, ['master']).content).toEqual([]);
  });

  it('numbers overflow pages within each copy and includes revision/date (anchor 2)', () => {
    const { footer } = doorOrderDocument(order, header, ['order', 'master']);
    expect(texts(footer(3, 4))).toContain('Page 1 of 2');
    expect(texts(footer(6, 6))).toContain('Page 3 of 3');
    expect(texts(footer(4, 4))).toEqual(expect.arrayContaining(['Page 2 of 2', 'Revision 2', '10/15/2026']));
    const noRevision = doorOrderDocument(order, { ...header, revision: null }, ['order']);
    expect(texts(noRevision.footer(1, 2))).not.toContain('Revision 2');
  });

  it('repeats the complete title and column headings with every table (anchor 3)', () => {
    const definition = doorOrderDocument(order, header, ['master']);
    expect(definition).toMatchObject({
      pageSize: 'LETTER', pageOrientation: 'portrait', pageMargins: [28.8, 28.8, 28.8, 43.2],
      defaultStyle: { font: 'Roboto' },
    });
    for (const { table } of definition.content) {
      const titles = texts(table.body.slice(0, table.headerRows));
      expect(titles).toEqual(expect.arrayContaining([
        'Door Order Form', 'Job: Cardwell', 'Room: 123 KITCHEN', 'Edge Profile: SQUARE',
        'Thickness: 13/16"', 'Cabinet ID', 'QTY', 'Size',
      ]));
      expect(table.body[table.headerRows - 1]).toEqual([
        { text: 'Cabinet ID', alignment: 'right', bold: true },
        { text: 'QTY', alignment: 'right', bold: true },
        { text: 'Size', alignment: 'center', bold: true },
      ]);
      const body = table.body.slice(table.headerRows);
      expect(texts(body).filter((text) => ['Drawer Fronts', 'Doors', 'Slab'].includes(text)))
        .toEqual(['Drawer Fronts', 'Doors', 'Slab']);
      expect(body[0][0]).toMatchObject({ text: 'Drawer Fronts', bold: true });
      expect(body[1]).toEqual([
        { text: '1', alignment: 'right' }, { text: '2', alignment: 'right' },
        { stack: [
          { text: '25 3/8 x 5 1/32', alignment: 'center' },
          { text: 'false front', alignment: 'center', fontSize: 8 },
        ] },
      ]);
    }
    const titleRows = definition.content[0].table.body;
    expect(texts(titleRows)).toEqual(expect.arrayContaining([
      'Wood: WHITE OAK - WIRE BRUSHED', 'Panel Profile: FLAT', 'Inside Profile: BEAD',
      'Applied Molding: COVE',
    ]));
    expect(titleRows.flat().find(({ text }) => text?.startsWith('Notes:')))
      .toMatchObject({ text: `Notes: ${page.header.notes}`, colSpan: 3, bold: true });
    expect(titleRows.flat().flatMap((cell) => cell.columns ?? []).find(({ text }) => text === 'VENDOR'))
      .toMatchObject({ alignment: 'right', italics: true });
    const slabText = texts(definition.content[1]);
    expect(slabText).toContain('Wood: MAPLE');
    expect(slabText.some((text) => /^(Panel Profile|Inside Profile|Applied Molding|Notes):/.test(text))).toBe(false);
  });

  it('shows company and phone while omitting blank fax in title and footer (anchor 4)', () => {
    const definition = doorOrderDocument(order, header, ['order']);
    for (const value of [definition.content, definition.footer(1, 2)]) {
      expect(texts(value).join(' ')).toContain('FOREVER FURNITURE, INC.');
      expect(texts(value).join(' ')).toContain('Phone: 801-280-5005');
      expect(texts(value).join(' ')).not.toContain('Fax:');
    }
    const faxOnly = doorOrderDocument(order, {
      ...header, company: { name: '', phone: '', fax: '801-555-1212' },
    }, ['order']);
    for (const value of [faxOnly.content, faxOnly.footer(1, 2)]) {
      expect(texts(value).join(' ')).toContain('Fax: 801-555-1212');
      expect(texts(value).join(' ')).not.toContain('Phone:');
    }
  });

  it('builds and sanitizes download filenames (anchor 5)', () => {
    expect(doorOrderFileName({ job: 'Cardwell' }, 'Kitchen')).toBe('Cardwell - Kitchen - Door Order Form.pdf');
    expect(doorOrderFileName({ job: '' }, 'A/B')).toBe('Room - A-B - Door Order Form.pdf');
    expect(doorOrderFileName({ job: 'A<>:"' }, 'B\\|?*\n')).toBe('A---- - B----- - Door Order Form.pdf');
  });

  it('keeps all dimensions and notes in plain fractions throughout the definition (anchor 6)', () => {
    const definition = doorOrderDocument(order, header, COPIES.map(({ id }) => id));
    const serialized = JSON.stringify({ ...definition, footer: definition.footer(1, 10) });
    expect(serialized).not.toMatch(/[⅛¼⅜½⅝¾⅞]/);
    expect(texts(definition)).toEqual(expect.arrayContaining([
      '25 3/8 x 5 1/32', '25 3/8 x 30 1/2', '3 1/8 x 4 3/4', 'Thickness: 13/16"',
    ]));
  });
});
