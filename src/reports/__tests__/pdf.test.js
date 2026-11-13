import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  download: vi.fn(), engine: { createPdf: vi.fn(), vfs: null }, fonts: { 'Roboto-Regular.ttf': 'font-data' },
  loads: vi.fn(),
}));
vi.mock('pdfmake/build/pdfmake', () => {
  mocks.loads();
  return { default: mocks.engine };
});
vi.mock('pdfmake/build/vfs_fonts', () => ({ default: mocks.fonts }));

describe('PDF download', () => {
  it('lazily loads pdfMake/Roboto and resolves after the download callback', async () => {
    const { downloadPdf } = await import('../pdf.js');
    expect(mocks.loads).not.toHaveBeenCalled();
    let complete;
    mocks.download.mockImplementationOnce((_name, callback) => { complete = callback; });
    mocks.engine.createPdf.mockReturnValue({ download: mocks.download });
    const definition = { content: ['Door Order Form'] };
    const pending = downloadPdf(definition, 'doors.pdf');
    await vi.waitFor(() => expect(mocks.download).toHaveBeenCalledWith('doors.pdf', expect.any(Function)));
    expect(mocks.engine.createPdf).toHaveBeenCalledWith(definition);
    expect(mocks.engine.vfs).toBe(mocks.fonts);
    const resolved = vi.fn();
    pending.then(resolved);
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
    complete();
    await expect(pending).resolves.toBeUndefined();
  });

  it('rejects when PDF creation or download throws', async () => {
    const { downloadPdf } = await import('../pdf.js');
    mocks.engine.createPdf.mockImplementationOnce(() => { throw new Error('Cannot build PDF'); });
    await expect(downloadPdf({}, 'doors.pdf')).rejects.toThrow('Cannot build PDF');
    mocks.download.mockImplementationOnce(() => { throw new Error('Cannot download PDF'); });
    await expect(downloadPdf({}, 'doors.pdf')).rejects.toThrow('Cannot download PDF');
  });
});
