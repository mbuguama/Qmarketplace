const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { degrees, PDFDocument } = require('pdf-lib');
const {
  PREVIEW_PAGE_LIMIT,
  buildWatermarkedPdfs,
  isMaterialVariantKey,
  renderPreviewPage
} = require('../src/services/pdfProcessingService');

function pageContainsWatermark(document, page) {
  const contents = page.node.Contents();
  const references = contents?.asArray ? contents.asArray() : [contents];
  return references.some((reference) => {
    const stream = document.context.lookup(reference);
    if (!stream?.getContents) return false;
    const bytes = Buffer.from(stream.getContents());
    let decoded;
    try {
      decoded = zlib.inflateSync(bytes);
    } catch {
      decoded = bytes;
    }
    return decoded.includes(Buffer.from('53747564795661756C74', 'ascii'));
  });
}

test('watermarks every page and creates a readable, limited preview', async () => {
  const originalBrand = process.env.PDF_WATERMARK_TEXT;
  process.env.PDF_WATERMARK_TEXT = 'StudyVault';
  try {
    const sourceDocument = await PDFDocument.create();
    const sourceRotations = [0, 90, 180, 270];
    const pageSizes = [[612, 792], [792, 612], [320, 900], [900, 320]];
    pageSizes.forEach(([width, height], index) => {
      const page = sourceDocument.addPage([width, height]);
      page.setRotation(degrees(sourceRotations[index]));
    });
    const source = Buffer.from(await sourceDocument.save());
    const result = await buildWatermarkedPdfs(source);
    const fullDocument = await PDFDocument.load(result.downloadPdf);
    const previewDocument = await PDFDocument.load(result.previewPdf);

    assert.equal(result.pageCount, 4);
    assert.equal(fullDocument.getPageCount(), 4);
    assert.equal(previewDocument.getPageCount(), PREVIEW_PAGE_LIMIT);
    assert.deepEqual(
      fullDocument.getPages().map((page) => page.getRotation().angle),
      sourceRotations
    );
    assert.ok(fullDocument.getPages().every((page) => pageContainsWatermark(fullDocument, page)));
    assert.ok(previewDocument.getPages().every((page) => pageContainsWatermark(previewDocument, page)));
    assert.notDeepEqual(result.downloadPdf, source);
  } finally {
    if (originalBrand === undefined) delete process.env.PDF_WATERMARK_TEXT;
    else process.env.PDF_WATERMARK_TEXT = originalBrand;
  }
});

test('rejects input that is not a PDF', async () => {
  await assert.rejects(
    buildWatermarkedPdfs(Buffer.from('not a pdf')),
    (error) => error.statusCode === 422 && /not a valid PDF/i.test(error.message)
  );
});

test('accepts only keys from the expected private PDF variant prefix', () => {
  const id = 'a6cd742a-706e-437f-ac5b-e8ef116df0eb';
  assert.equal(isMaterialVariantKey(`materials/previews/${id}.pdf`, 'previews'), true);
  assert.equal(isMaterialVariantKey(`materials/original/${id}.pdf`, 'previews'), false);
  assert.equal(isMaterialVariantKey(`materials/previews/${id}.pdf`, 'watermarked'), false);
  assert.equal(isMaterialVariantKey('https://example.com/private.pdf', 'previews'), false);
});

test('renders a watermarked PDF preview page as a PNG image', async () => {
  const sourceDocument = await PDFDocument.create();
  const page = sourceDocument.addPage([612, 792]);
  page.drawText('Preview page content', { x: 48, y: 720, size: 18 });
  const watermarked = await buildWatermarkedPdfs(Buffer.from(await sourceDocument.save()));
  const image = await renderPreviewPage(watermarked.previewPdf, 1);

  assert.deepEqual(image.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.ok(image.length > 100);
  const decoded = await loadImage(image);
  const canvas = createCanvas(decoded.width, decoded.height);
  const context = canvas.getContext('2d');
  context.drawImage(decoded, 0, 0);
  const pixels = context.getImageData(0, 0, decoded.width, decoded.height).data;
  let nonWhitePixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] < 245 || pixels[index + 1] < 245 || pixels[index + 2] < 245) nonWhitePixels += 1;
  }
  assert.ok(nonWhitePixels > 100, 'the rendered preview should include visible page content and watermark');
});

test('rejects preview page numbers outside the preview limit', async () => {
  await assert.rejects(
    renderPreviewPage(Buffer.from('not read for an invalid page number'), 4),
    (error) => error.statusCode === 400 && /between 1 and 3/.test(error.message)
  );
});
