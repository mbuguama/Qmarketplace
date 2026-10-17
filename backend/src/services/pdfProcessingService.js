const { randomUUID } = require('crypto');
const path = require('path');
const { degrees, PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const prisma = require('../config/prisma');
const {
  deletePrivateObjects,
  getPrivateObjectBuffer,
  putPrivateObject
} = require('./storageService');

const PREVIEW_PAGE_LIMIT = 3;
const MAX_PDF_PAGES = 1000;
const PREVIEW_IMAGE_MAX_WIDTH = 1200;
const PREVIEW_IMAGE_MAX_HEIGHT = 1600;
let pdfJs;

function isMaterialVariantKey(key, variant) {
  return typeof key === 'string' &&
    new RegExp(`^materials/${variant}/[0-9a-f-]{36}\\.pdf$`, 'i').test(key);
}

function watermarkText() {
  const configured = process.env.PDF_WATERMARK_TEXT;
  if (!configured) return 'QMarketplace';
  const value = configured.trim();
  if (!/^[\x20-\x7e]{1,48}$/.test(value)) {
    const error = new Error('PDF_WATERMARK_TEXT must contain 1 to 48 printable ASCII characters.');
    error.statusCode = 503;
    throw error;
  }
  return value;
}

async function buildWatermarkedPdfs(source) {
  if (source.length < 8 || !source.subarray(0, 1024).includes(Buffer.from('%PDF-'))) {
    const error = new Error('The selected file is not a valid PDF document.');
    error.statusCode = 422;
    throw error;
  }

  let document;
  try {
    document = await PDFDocument.load(source, { throwOnInvalidObject: true });
  } catch {
    const error = new Error('The PDF could not be opened or is damaged. Upload a readable, unencrypted PDF and try again.');
    error.statusCode = 422;
    throw error;
  }

  const pages = document.getPages();
  if (!pages.length || pages.length > MAX_PDF_PAGES) {
    const error = new Error(`The PDF must contain between 1 and ${MAX_PDF_PAGES} pages.`);
    error.statusCode = 422;
    throw error;
  }

  const font = await document.embedFont(StandardFonts.HelveticaBold);
  const text = watermarkText();
  for (const page of pages) {
    const { width, height } = page.getSize();
    const rotation = page.getRotation().angle;
    const size = Math.max(16, Math.min(30, Math.min(width, height) * 0.045));
    const textWidth = font.widthOfTextAtSize(text, size);
    const horizontalSpacing = Math.max(210, textWidth + 180);
    const verticalSpacing = Math.max(150, size * 7);
    const rows = Math.ceil(height / verticalSpacing) + 2;
    const columns = Math.ceil(width / horizontalSpacing) + 2;
    for (let row = -1; row < rows; row += 1) {
      for (let column = -1; column < columns; column += 1) {
        page.drawText(text, {
          x: column * horizontalSpacing - textWidth / 2 + (row % 2) * horizontalSpacing / 2,
          y: row * verticalSpacing,
          size,
          font,
          color: rgb(0.42, 0.44, 0.47),
          opacity: 0.14,
          rotate: degrees(45 - rotation)
        });
      }
    }
  }

  const downloadPdf = Buffer.from(await document.save({ useObjectStreams: true }));
  const previewDocument = await PDFDocument.create();
  const previewPages = await previewDocument.copyPages(
    document,
    Array.from({ length: Math.min(pages.length, PREVIEW_PAGE_LIMIT) }, (_, index) => index)
  );
  previewPages.forEach((page) => previewDocument.addPage(page));
  const previewPdf = Buffer.from(await previewDocument.save({ useObjectStreams: true }));

  return { downloadPdf, previewPdf, pageCount: pages.length };
}

async function renderPreviewPage(source, pageNumber) {
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > PREVIEW_PAGE_LIMIT) {
    const error = new Error(`Preview page must be a whole number between 1 and ${PREVIEW_PAGE_LIMIT}.`);
    error.statusCode = 400;
    throw error;
  }

  const [{ createCanvas, DOMMatrix, ImageData, Path2D }, pdfjsLib] = await Promise.all([
    Promise.resolve(require('@napi-rs/canvas')),
    pdfJs || (pdfJs = import('pdfjs-dist/legacy/build/pdf.mjs'))
  ]);
  globalThis.DOMMatrix = DOMMatrix;
  globalThis.ImageData = ImageData;
  globalThis.Path2D = Path2D;

  const pdfJsDirectory = path.dirname(require.resolve('pdfjs-dist/legacy/build/pdf.mjs'));
  const standardFontDataUrl = `${path.resolve(pdfJsDirectory, '../../standard_fonts')}${path.sep}`;
  const document = await pdfjsLib.getDocument({
    data: new Uint8Array(source),
    standardFontDataUrl,
    useSystemFonts: false,
    isEvalSupported: false
  }).promise;

  try {
    if (pageNumber > document.numPages) {
      const error = new Error('That page is not included in the preview.');
      error.statusCode = 404;
      throw error;
    }

    const page = await document.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(
      1.5,
      PREVIEW_IMAGE_MAX_WIDTH / baseViewport.width,
      PREVIEW_IMAGE_MAX_HEIGHT / baseViewport.height
    );
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return canvas.toBuffer('image/png');
  } finally {
    await document.destroy();
  }
}

async function createMaterialVariants(sourceKey, materialId, deleteSource) {
  const id = randomUUID();
  const keys = {
    originalFileKey: `materials/original/${id}.pdf`,
    downloadUrl: `materials/watermarked/${id}.pdf`,
    previewUrl: `materials/previews/${id}.pdf`
  };
  const outputKeysCreated = [];
  try {
    const source = await getPrivateObjectBuffer(sourceKey);
    const { downloadPdf, previewPdf, pageCount } = await buildWatermarkedPdfs(source);
    await putPrivateObject(keys.originalFileKey, source);
    outputKeysCreated.push(keys.originalFileKey);
    await putPrivateObject(keys.downloadUrl, downloadPdf);
    outputKeysCreated.push(keys.downloadUrl);
    await putPrivateObject(keys.previewUrl, previewPdf);
    outputKeysCreated.push(keys.previewUrl);
    if (deleteSource) await deletePrivateObjects([sourceKey]);
    return { ...keys, pageCount, fileSize: source.length };
  } catch (error) {
    try {
      await deletePrivateObjects([...outputKeysCreated, ...(deleteSource ? [sourceKey] : [])]);
    } catch (cleanupError) {
      console.error(`PDF processing cleanup failed for material ${materialId}:`, cleanupError);
    }
    if (!Number.isInteger(error.statusCode)) {
      const storageError = new Error('PDF watermark processing could not finish. Verify private R2 access and try again; the material remains unpublished.');
      storageError.statusCode = 503;
      throw storageError;
    }
    throw error;
  }
}

async function processUploadedPdf(uploadKey, materialId) {
  if (!/^materials\/uploads\/[0-9a-f-]{36}\.pdf$/i.test(uploadKey)) {
    const error = new Error('The uploaded file reference is invalid. Please restart the upload.');
    error.statusCode = 400;
    throw error;
  }
  return createMaterialVariants(uploadKey, materialId, true);
}

async function ensureMaterialVariants(material) {
  if (material.processingStatus === 'complete' && material.originalFileKey &&
      isMaterialVariantKey(material.originalFileKey, 'original') &&
      isMaterialVariantKey(material.downloadUrl, 'watermarked') &&
      isMaterialVariantKey(material.previewUrl, 'previews')) return material;
  const sourceKey = material.originalFileKey || material.downloadUrl;
  if (!sourceKey) {
    const error = new Error('This document has no stored source PDF and cannot be watermarked.');
    error.statusCode = 409;
    throw error;
  }
  if (material.processingStatus === 'processing') {
    const error = new Error('This document is being processed. Please retry the preview or download shortly.');
    error.statusCode = 409;
    throw error;
  }
  const claim = await prisma.material.updateMany({
    where: {
      id: material.id,
      processingStatus: material.processingStatus,
      originalFileKey: material.originalFileKey,
      downloadUrl: material.downloadUrl
    },
    data: { status: 'draft', processingStatus: 'processing' }
  });
  if (claim.count !== 1) {
    const latest = await prisma.material.findUnique({ where: { id: material.id } });
    if (latest?.processingStatus === 'complete' &&
        isMaterialVariantKey(latest.originalFileKey, 'original') &&
        isMaterialVariantKey(latest.downloadUrl, 'watermarked') &&
        isMaterialVariantKey(latest.previewUrl, 'previews')) return latest;
    const error = new Error('This document is being processed. Please retry the preview or download shortly.');
    error.statusCode = 409;
    throw error;
  }

  let variants;
  try {
    variants = await createMaterialVariants(sourceKey, material.id, false);
    const { pageCount, ...fileVariants } = variants;
    return await prisma.material.update({
      where: { id: material.id },
      data: {
        ...fileVariants,
        pages: pageCount,
        status: material.status === 'active' ? 'active' : material.status,
        processingStatus: 'complete'
      }
    });
  } catch (error) {
    try {
      await prisma.material.update({
        where: { id: material.id },
        data: { status: 'draft', processingStatus: 'failed' }
      });
    } catch (stateError) {
      console.error(`Could not mark legacy PDF processing failed for material ${material.id}:`, stateError);
    }
    if (variants) {
      try {
        await deletePrivateObjects([variants.originalFileKey, variants.downloadUrl, variants.previewUrl]);
      } catch (cleanupError) {
        console.error(`Could not remove legacy PDF variants for material ${material.id}:`, cleanupError);
      }
    }
    throw error;
  }
}

module.exports = {
  PREVIEW_PAGE_LIMIT,
  buildWatermarkedPdfs,
  ensureMaterialVariants,
  isMaterialVariantKey,
  processUploadedPdf,
  renderPreviewPage
};
