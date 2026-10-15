import { COPIES } from './copies.js';

const bordered = (cell) => ({ ...cell, border: [true, true, true, true] });
const fullRow = (cell) => [{ ...cell, colSpan: 3 }, {}, {}];
const contactText = ({ phone, fax }) => [phone && `Phone: ${phone}`, fax && `Fax: ${fax}`]
  .filter(Boolean).join('   ');
const columnHeadings = () => ['Cabinet ID', 'QTY', 'Size'].map((text) => bordered({
  text, alignment: 'center', bold: true, fillColor: '#D9D9D9',
}));

function styleTable(page, header, copy) {
  const details = page.header;
  const detailRow = (label, value, right = { text: '' }, options = {}) => [
    { text: label, bold: false, ...options },
    { text: value, bold: true, ...options },
    right,
  ];
  const vendor = { text: details.vendor ?? '', bold: true, italics: true, alignment: 'center' };
  const titleRows = [
    fullRow({ text: 'Door Order Form', alignment: 'center', bold: true }),
    [
      { text: header.company.name, bold: true, colSpan: 2 }, {},
      { text: contactText(header.company), bold: true, alignment: 'right' },
    ],
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
    { text: 'Notes:', bold: false }, { text: details.notes, bold: true, colSpan: 2 }, {},
  ]);

  const section = page.sections[0];
  const rows = [
    fullRow(bordered({
      table: { widths: [95, '*', 170], body: titleRows }, layout: 'noBorders', fontSize: 10,
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
          stack: [size, { text: line.notes, fontSize: 8, alignment: 'center' }],
        } : size),
      ];
    }),
  ];

  return {
    table: { headerRows: 3, widths: [70, 50, '*'], body: rows, dontBreakRows: true },
    layout: {
      hLineWidth: () => 0.75, vLineWidth: () => 0.75,
      hLineColor: () => '#000000', vLineColor: () => '#000000',
      paddingTop: () => 2, paddingBottom: () => 2,
      paddingLeft: () => 4, paddingRight: () => 4,
    },
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
              { text: [header.company.name, contactText(header.company)].filter(Boolean).join('   '), width: '*', bold: true },
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
