const initialized = new WeakSet();

function renderCardPreview(container) {
  const image = container.querySelector('img');
  const label = container.querySelector('.preview-label');
  if (!image) return;
  const markLoaded = () => {
    container.dataset.previewState = 'ready';
    if (label) label.textContent = 'First page preview';
  };
  const markFailed = () => {
    container.dataset.previewState = 'failed';
    if (label) label.textContent = 'Preview unavailable';
  };
  image.addEventListener('load', markLoaded, { once: true });
  image.addEventListener('error', markFailed, { once: true });
  if (image.complete) {
    if (image.naturalWidth > 0) markLoaded();
    else markFailed();
  }
}

function renderDetailPreview(container) {
  const image = container.querySelector('[data-pdf-image]');
  const label = container.querySelector('[data-pdf-page-label]');
  const previous = container.querySelector('[data-pdf-previous]');
  const next = container.querySelector('[data-pdf-next]');
  const zoomIn = container.querySelector('[data-pdf-zoom-in]');
  const zoomOut = container.querySelector('[data-pdf-zoom-out]');
  const resetZoom = container.querySelector('[data-pdf-fit-width]');
  const zoomLabel = container.querySelector('[data-pdf-zoom-level]');
  if (!image || !label || !previous || !next) return;
  const pageCount = Math.max(1, Math.min(Number(container.dataset.pageCount) || 3, 3));
  let currentPage = 1;
  let loadingPage;
  let currentZoom = 100;

  const preloadAll = () => {
    for (let p = 1; p <= pageCount; p++) {
      const preloadImg = new Image();
      preloadImg.src = `${container.dataset.pdfDocument}/${p}.png`;
    }
  };

  const applyZoom = (zoom) => {
    currentZoom = Math.max(60, Math.min(200, zoom));
    image.style.maxWidth = currentZoom > 100 ? `${currentZoom}%` : '100%';
    image.style.width = currentZoom > 100 ? `${currentZoom}%` : '100%';
    if (zoomLabel) zoomLabel.textContent = `${currentZoom}%`;
  };

  if (zoomIn) zoomIn.addEventListener('click', () => applyZoom(currentZoom + 20));
  if (zoomOut) zoomOut.addEventListener('click', () => applyZoom(currentZoom - 20));
  if (resetZoom) resetZoom.addEventListener('click', () => applyZoom(100));

  const showPage = (pageNumber) => {
    currentPage = pageNumber;
    loadingPage = pageNumber;
    image.style.opacity = '0.6';
    image.src = `${container.dataset.pdfDocument}/${pageNumber}.png`;
    image.alt = `Watermarked preview page ${pageNumber} of ${pageCount}`;
    label.textContent = `Loading page ${pageNumber}…`;
    previous.disabled = true;
    next.disabled = true;
  };

  image.addEventListener('load', () => {
    if (loadingPage !== currentPage) return;
    image.style.opacity = '1';
    label.textContent = `Page ${currentPage} of ${pageCount}`;
    previous.disabled = currentPage <= 1;
    next.disabled = currentPage >= pageCount;
    container.dataset.previewState = 'ready';
    preloadAll();
  });
  image.addEventListener('error', () => {
    if (loadingPage !== currentPage) return;
    image.style.opacity = '1';
    label.textContent = 'This preview page could not be loaded.';
    previous.disabled = currentPage <= 1;
    next.disabled = currentPage >= pageCount;
    container.dataset.previewState = 'failed';
  });
  previous.addEventListener('click', () => {
    if (currentPage > 1) showPage(currentPage - 1);
  });
  next.addEventListener('click', () => {
    if (currentPage < pageCount) showPage(currentPage + 1);
  });
  container.dataset.previewState = 'waiting';
  showPage(currentPage);
}

function initializePreviews() {
  document.querySelectorAll('[data-pdf-preview]').forEach((container) => {
    if (initialized.has(container)) return;
    const bounds = container.getBoundingClientRect();
    if (bounds.bottom < -240 || bounds.top > window.innerHeight + 240) return;
    initialized.add(container);
    container.dataset.previewState = 'waiting';
    renderCardPreview(container);
  });

  document.querySelectorAll('[data-pdf-document]').forEach((container) => {
    if (initialized.has(container)) return;
    initialized.add(container);
    renderDetailPreview(container);
  });
}

const contentObserver = new MutationObserver(initializePreviews);
contentObserver.observe(document.body, { childList: true, subtree: true });
window.addEventListener('scroll', initializePreviews, { passive: true });
document.addEventListener('DOMContentLoaded', initializePreviews, { once: true });
initializePreviews();
