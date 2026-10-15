/** Load the PDF engine and its default Roboto fonts only when a report is downloaded. */
export async function downloadPdf(definition, fileName) {
  const [{ default: pdfMake }, fontsModule] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);
  pdfMake.vfs = fontsModule.default || fontsModule;
  await new Promise((resolve) => {
    pdfMake.createPdf(definition).download(fileName, resolve);
  });
}
