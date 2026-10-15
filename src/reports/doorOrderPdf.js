import { COPIES } from './copies.js';
import { BORDER_LAYOUT, PAGE_MARGINS, contactText, reportFileName, reportFooter } from './pdfParts.js';

const bordered = (cell) => ({ ...cell, border: [true, true, true, true] });
const fullRow = (cell) => [{ ...cell, colSpan: 3 }, {}, {}];
const columnHeadings = () => ['Cabinet ID', 'QTY', 'Size'].map((text) => bordered({
  text, alignment: 'center', bold: true, fillColor: '#D9D9D9',
}));

function styleTable(page, header, copy) {
  const details = page.header;
  const detailRow = (label, value, right = { text: '' }, options = {}) => [
    { text: label, bold: true, ...options },
    { text: value, bold: true, ...options },
    right,
  ];
  const vendor = { text: details.vendor ?? '', bold: true, italics: true, alignment: 'center' };
  const titleRows = [
    fullRow({ text: 'Door Order Form', alignment: 'center', bold: true, fontSize: 12 }),
    fullRow({
      columns: [
        { text: header.company.name, bold: true, width: '*' },
        { text: contactText(header.company), bold: true, width: 'auto', alignment: 'right' },
      ],
      columnGap: 12,
    }),
    detailRow('Job:', header.job),
    detailRow('Room:', header.orderRoom),
    detailRow('Wood:', details.wood ?? header.wood),
    detailRow('Style:', `${details.style} - ${details.thickness} thick`, {
      text: copy.label ?? '', bold: true, color: '#DC2626', fontSize: 13, alignment: 'center',
    }, { margin: [0, 8, 0, 0] }),
  ];
  if (details.panelProfile) titleRows.push(detailRow('Panel Profile:', details.panelProfile, vendor));
  titleRows.push(detailRow('Edge Profile:', details.edgeProfile, details.panelProfile ? { text: '' } : vendor));
  if (details.insideProfile) titleRows.push(detailRow('Inside Profile:', details.insideProfile));
  if (details.appliedMoldings) titleRows.push(detailRow('Applied Molding:', details.appliedMoldings));
  if (details.notes) titleRows.push([
    { text: 'Notes:', bold: true }, { text: details.notes, bold: true, colSpan: 2 }, {},
  ]);

  const section = page.sections[0];
  const rows = [
    fullRow(bordered({
      table: { widths: ['auto', '*', 170], body: titleRows }, layout: 'noBorders', fontSize: 10,
    })),
    fullRow({
      text: section.title, bold: true, fontSize: 14, margin: [0, 4, 0, 2],
      border: [false, false, false, false],
    }),
    columnHeadings(),
    ...section.lines.map((line) => {
      const size = { text: line.size, alignment: 'center' };
      return [
        bordered({ text: String(line.number), alignment: 'right' }),
        bordered({ text: String(line.qty), alignment: 'right' }),
        bordered(line.notes ? {
          stack: [size, { text: line.notes, fontSize: 9, alignment: 'center' }],
        } : size),
      ];
    }),
  ];

  return {
    table: { headerRows: 3, widths: [70, 50, '*'], body: rows, dontBreakRows: true },
    layout: BORDER_LAYOUT,
  };
}

/** Pure pdfMake definition; each selected copy contains the complete style sequence. */
export function doorOrderDocument(order, header, copyIds) {
  const copies = COPIES.filter(({ id }) => copyIds.includes(id));
  const content = copies.flatMap((copy) => order.pages.map((page) => styleTable(page, header, copy)));
  content.forEach((table, index) => {
    if (index > 0) table.pageBreak = 'before';
  });

  return {
    pageSize: 'LETTER',
    pageOrientation: 'portrait',
    pageMargins: PAGE_MARGINS,
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    content,
    footer: reportFooter(header, copies.length),
  };
}

export function doorOrderFileName(header, roomName) {
  return reportFileName(header, roomName, 'Door Order Form');
}
