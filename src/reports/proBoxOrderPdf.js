import { COPIES } from './copies.js';
import { formatSize } from './format.js';
import { BORDER_LAYOUT, PAGE_MARGINS, reportFileName, reportFooter } from './pdfParts.js';

const underline = (text = '') => ({ text: text || ' ', border: [false, false, false, true] });
const fieldLayout = { ...BORDER_LAYOUT, defaultBorder: false };

function field(label, value = '') {
  return {
    table: { widths: ['auto', '*'], body: [[{ text: label }, underline(value)]] },
    layout: fieldLayout, margin: [0, 0, 0, 4],
  };
}

function checkbox(label, checked = false) {
  const canvas = [{ type: 'rect', x: 0, y: 0, w: 9, h: 9, lineWidth: 0.75, lineColor: '#000000' }];
  if (checked) canvas.push(
    { type: 'line', x1: 0, y1: 0, x2: 9, y2: 9, lineWidth: 0.75, lineColor: '#000000' },
    { type: 'line', x1: 0, y1: 9, x2: 9, y2: 0, lineWidth: 0.75, lineColor: '#000000' },
  );
  return { columns: [{ canvas, width: 9 }, { text: label, width: '*' }], columnGap: 4, margin: [0, 2, 0, 3] };
}

function specColumn(label, spec) {
  return { stack: [
    { text: label, bold: true, margin: [0, 0, 0, 4] },
    ...spec.options.map(({ label: option, checked }) => checkbox(option, checked)),
    { columns: [
      checkbox('', Boolean(spec.writeIn)).columns[0],
      { table: { widths: ['*'], body: [[underline(spec.writeIn)]] }, layout: fieldLayout, width: '*' },
    ], columnGap: 4 },
  ] };
}

function form(order, header, copy) {
  const company = header.company;
  const spec = order.spec;
  return { stack: [
    { text: copy.label ?? ' ', color: '#DC2626', bold: true, fontSize: 13, alignment: 'right', margin: [0, 0, 0, 6] },
    { columns: [
      { width: '*', stack: [
        { text: 'ProBox Drawers, Inc.', bold: true, fontSize: 13 },
        { text: '537 W. Pickett Cir., #1400' }, { text: 'Salt Lake City, UT 84115' },
      ] },
      { width: '*', text: 'Dovetail Drawer Box\nOrder Form', alignment: 'center', bold: true, fontSize: 15 },
      { width: '*', text: 'Phone: 801-908-5718\nFax: 801-974-7606\nEmail: info@proboxdrawers.com', alignment: 'right' },
    ], columnGap: 10, margin: [0, 0, 0, 14] },
    { columns: [
      { width: '*', stack: [
        field('Company Name', company.name), field('Address', company.address), field('Address'),
        { columns: [field('City', company.city), { ...field('State', company.state), width: 66 },
          { ...field('Zip', company.zip), width: 78 }], columnGap: 5 },
        { columns: [field('Phone', company.phone), field('Fax', company.fax)], columnGap: 8 },
        { text: 'Ship To Name & Address', bold: true, margin: [0, 2, 0, 3] },
        { table: { widths: ['*'], heights: [32], body: [[{ text: 'Same' }]] }, layout: BORDER_LAYOUT },
      ] },
      { width: 210, stack: [
        { columns: [checkbox('ORDER'), checkbox('QUOTE')], margin: [0, 0, 0, 5] },
        field('Date'), field('Requested Ship Date'),
        { columns: [checkbox('Will Call'), checkbox('Delivery'), checkbox('Ship')], margin: [0, 2, 0, 5] },
        field('Contact Person'),
      ] },
    ], columnGap: 14, margin: [0, 0, 0, 10] },
    { ...field('Job Name / PO#', order.jobName), margin: [0, 0, 0, 10] },
    { table: { widths: [114, 51, 139, 108, '*'], body: [[
      specColumn('Side Material', spec.sideMaterial), specColumn('Thickness', spec.sideThickness),
      specColumn('Bottom Material', spec.bottomMaterial), specColumn('Top Edge Detail', spec.topEdge),
      specColumn('Bottom Placement', spec.bottomPlacement),
    ]], dontBreakRows: true }, layout: BORDER_LAYOUT, fontSize: 8 },
    { table: { widths: [183, 160, '*'], body: [[
      specColumn('Assembly & Finish', spec.assembly),
      { stack: [
        { text: 'Box Options', bold: true, margin: [0, 0, 0, 4] },
        checkbox('Notch & hole', order.options.notch), checkbox('Attach clips', order.options.clips),
        field('Brand', order.options.brand),
      ] },
      { stack: [
        { text: 'Comments / Special Instructions', bold: true, alignment: 'center', margin: [0, 0, 0, 4] },
        ...order.comments.map((text) => ({ text, alignment: 'center', margin: [0, 2, 0, 3] })),
      ] },
    ]], dontBreakRows: true }, layout: BORDER_LAYOUT, fontSize: 8, margin: [0, 0, 0, 10] },
    { table: {
      headerRows: 1, dontBreakRows: true, widths: [44, 30, 64, 64, 64, '*'],
      body: [
        ['Cab. #', 'Qty', 'Height', 'Width', 'Depth', 'Special Line Instructions'].map((text) => ({
          text, alignment: 'center', bold: true, fillColor: '#D9D9D9',
        })),
        ...order.lines.map((line, index) => [line.cab == null ? '?' : String(line.cab), String(line.qty),
          formatSize(line.height), formatSize(line.width), formatSize(line.depth), line.instructions]
          .map((text) => ({ text, alignment: 'center', fillColor: index % 2 ? '#F2F2F2' : undefined }))),
      ],
    }, layout: { ...BORDER_LAYOUT, hLineColor: () => '#999999', vLineColor: () => '#999999' } },
  ] };
}

/** Pure pdfMake definition; each selected copy contains one complete ProBox form. */
export function proBoxOrderDocument(order, header, copyIds) {
  const copies = COPIES.filter(({ id }) => copyIds.includes(id));
  const content = copies.map((copy, index) => ({ ...form(order, header, copy), ...(index ? { pageBreak: 'before' } : {}) }));
  return {
    pageSize: 'LETTER', pageOrientation: 'portrait', pageMargins: PAGE_MARGINS,
    defaultStyle: { font: 'Roboto', fontSize: 9 }, content, footer: reportFooter(header, copies.length),
  };
}

export function proBoxOrderFileName(header, roomName) {
  return reportFileName(header, roomName, 'ProBox Drawer Box Order');
}
