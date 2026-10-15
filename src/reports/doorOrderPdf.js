import { COPIES } from './copies.js';

const fullRow = (cell) => [{ ...cell, colSpan: 3 }, {}, {}];
const textRow = (text, options = {}) => fullRow({ text, ...options });
const columnsRow = (left, right) => fullRow({
  columns: [{ width: '*', ...left }, { width: '*', alignment: 'right', ...right }],
  columnGap: 12,
});
const contactText = ({ phone, fax }) => [phone && `Phone: ${phone}`, fax && `Fax: ${fax}`]
  .filter(Boolean).join('   ');
const columnHeadings = () => [
  { text: 'Cabinet ID', alignment: 'right', bold: true },
  { text: 'QTY', alignment: 'right', bold: true },
  { text: 'Size', alignment: 'center', bold: true },
];

function styleTable(page, header, copy) {
  const details = page.header;
  const rows = [
    textRow('Door Order Form', { alignment: 'center', bold: true, fontSize: 16, margin: [0, 0, 0, 6] }),
    columnsRow({ text: header.company.name, bold: true }, { text: contactText(header.company) }),
    textRow(`Job: ${header.job}`),
    columnsRow({ text: `Room: ${header.orderRoom}` }, {
      text: copy.label ?? '', bold: true, color: '#DC2626',
    }),
    textRow(`Wood: ${details.wood ?? header.wood}`),
    columnsRow({ text: `Style: ${details.style}` }, { text: details.vendor ?? '', italics: true }),
  ];
  if (details.panelProfile != null) rows.push(textRow(`Panel Profile: ${details.panelProfile}`));
  rows.push(textRow(`Edge Profile: ${details.edgeProfile}`));
  if (details.insideProfile != null) rows.push(textRow(`Inside Profile: ${details.insideProfile}`));
  if (details.appliedMoldings) rows.push(textRow(`Applied Molding: ${details.appliedMoldings}`));
  rows.push(textRow(`Thickness: ${details.thickness}`));
  if (details.notes) rows.push(textRow(`Notes: ${details.notes}`, { bold: true }));
  rows.push(columnHeadings());
  const headerRows = rows.length;

  for (const section of page.sections) {
    rows.push(textRow(section.title, { bold: true, margin: [0, 8, 0, 2] }));
    for (const line of section.lines) {
      const size = { text: line.size, alignment: 'center' };
      rows.push([
        { text: String(line.number), alignment: 'right' },
        { text: String(line.qty), alignment: 'right' },
        line.notes ? {
          stack: [size, { text: line.notes, fontSize: 8, alignment: 'center' }],
        } : size,
      ]);
    }
  }

  return {
    table: { headerRows, widths: [70, 40, '*'], body: rows, dontBreakRows: true },
    layout: 'noBorders',
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
    pageMargins: [28.8, 28.8, 28.8, 43.2],
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    content,
    footer(currentPage, pageCount) {
      const perCopy = pageCount / (copies.length || 1);
      const pageNumber = ((currentPage - 1) % perCopy) + 1;
      return {
        margin: [28.8, 8, 28.8, 0],
        fontSize: 8,
        stack: [
          {
            columns: [
              { text: [header.company.name, contactText(header.company)].filter(Boolean).join('   '), width: '*' },
              { text: `Page ${pageNumber} of ${perCopy}`, width: 'auto', alignment: 'right' },
            ],
            columnGap: 12,
          },
          {
            columns: [
              { text: header.revision ?? '', width: '*' },
              { text: header.date, width: 'auto', alignment: 'right' },
            ],
            margin: [0, 3, 0, 0],
          },
        ],
      };
    },
  };
}

export function doorOrderFileName(header, roomName) {
  // Windows' reserved filename characters also cover the path separators on macOS/Linux.
  return `${header.job || 'Room'} - ${roomName} - Door Order Form.pdf`.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-');
}
