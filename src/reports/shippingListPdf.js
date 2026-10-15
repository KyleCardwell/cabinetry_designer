import { COPIES } from './copies.js';
import { BORDER_LAYOUT, reportFileName, reportFooter } from './pdfParts.js';

const bordered = (cell) => ({ ...cell, border: [true, true, true, true] });
const fullRow = (cell) => [{ ...cell, colSpan: 6 }, {}, {}, {}, {}, {}];

function shippingTable(list, header, copy) {
  const detailRow = (label, value, right = { text: '' }) => [
    { text: label, bold: true }, { text: value, bold: true }, right,
  ];
  const titleRows = [
    [
      { text: 'Main - Shipping List', fontSize: 12, bold: true, colSpan: 2 }, {},
      { text: header.jobNumber ? `Job # ${header.jobNumber}` : '', bold: true, alignment: 'right' },
    ],
    detailRow('Job:', header.job, { text: header.address, bold: true, alignment: 'right' }),
    detailRow('Room:', header.room, {
      text: copy.label ?? '', bold: true, color: '#DC2626', fontSize: 13, alignment: 'right',
    }),
    detailRow('Wood:', header.wood),
    detailRow('Finish:', header.finish),
    detailRow('Boxes:', header.boxes),
  ];
  if (header.edgebandAlert) titleRows.push([
    { text: header.edgebandAlert, color: '#DC2626', fontSize: 11, bold: true, colSpan: 3 }, {}, {},
  ]);

  const rows = [
    fullRow(bordered({
      table: { widths: ['auto', '*', 'auto'], body: titleRows }, layout: 'noBorders', fontSize: 10,
    })),
    ['Part #', 'Built', 'Shipped', 'Description', 'Notes', 'Size'].map((text) => bordered({
      text, alignment: 'center', bold: true, fillColor: '#D9D9D9',
    })),
    ...list.rows.map((row) => [
      bordered({ text: row.number == null ? '' : String(row.number), alignment: 'center' }),
      bordered({ text: '' }),
      bordered({ text: '' }),
      bordered({ text: row.description, alignment: 'left' }),
      bordered(row.notes.length ? {
        stack: row.notes.map((text) => ({ text, fontSize: 9 })),
      } : { text: '' }),
      bordered({ text: row.size, alignment: 'center' }),
    ]),
  ];
  if (list.roomNote) rows.push(fullRow(bordered({ text: `Room notes: ${list.roomNote}`, bold: true })));

  return {
    table: { headerRows: 2, widths: [38, 34, 40, 115, '*', 105], body: rows, dontBreakRows: true },
    layout: BORDER_LAYOUT,
  };
}

/** Pure pdfMake definition; each selected copy contains one complete shipping table. */
export function shippingListDocument(list, header, copyIds) {
  const copies = COPIES.filter(({ id }) => copyIds.includes(id));
  const content = copies.map((copy) => shippingTable(list, header, copy));
  content.forEach((table, index) => {
    if (index > 0) table.pageBreak = 'before';
  });

  return {
    pageSize: 'LETTER',
    pageOrientation: 'portrait',
    pageMargins: [28.8, 28.8, 28.8, 43.2],
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    content,
    footer: reportFooter(header, copies.length),
  };
}

export function shippingListFileName(header, roomName) {
  return reportFileName(header, roomName, 'Main Shipping List');
}
