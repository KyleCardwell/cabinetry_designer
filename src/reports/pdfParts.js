export const contactText = ({ phone, fax }) => [phone && `Phone: ${phone}`, fax && `Fax: ${fax}`]
  .filter(Boolean).join('   ');

export const BORDER_LAYOUT = {
  hLineWidth: () => 0.75, vLineWidth: () => 0.75,
  hLineColor: () => '#000000', vLineColor: () => '#000000',
  paddingTop: () => 2, paddingBottom: () => 2,
  paddingLeft: () => 4, paddingRight: () => 4,
};

export function reportFooter(header, copyCount) {
  return function footer(currentPage, pageCount) {
    const perCopy = pageCount / (copyCount || 1);
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
  };
}

export function reportFileName(header, roomName, title) {
  // Windows' reserved filename characters also cover the path separators on macOS/Linux.
  return `${header.job || 'Room'} - ${roomName} - ${title}.pdf`.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-');
}
