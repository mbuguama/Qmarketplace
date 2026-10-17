document.addEventListener('DOMContentLoaded', async () => {
  const container = document.querySelector('[data-material-detail]');
  const materialId = new URLSearchParams(window.location.search).get('id');
  const { apiRequest, escapeHtml, getCurrentUser } = window.qmarketplaceApi;
  if (!container) return;
  if (!materialId) {
    container.className = 'empty-state detail-state';
    container.innerHTML = '<h1>Material not found</h1><p>Choose a material from the catalog to see its details.</p><a class="btn btn-primary" href="/materials.html">Browse materials</a>';
    return;
  }

  try {
    const material = await apiRequest(`/materials/${encodeURIComponent(materialId)}`);
    const description = String(material.description || `Preview and purchase ${material.title}, a ${material.type || 'university study'} resource on QMarketplace.`)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);
    const canonicalPath = `/material-details.html?id=${encodeURIComponent(material.id)}`;
    const image = material.hasPreview
      ? `/api/materials/${encodeURIComponent(material.id)}/preview/pages/1.png`
      : undefined;
    window.qmarketplaceSeo?.update({
      title: `${material.title} | ${material.course?.code || material.type || 'Study Material'} | QMarketplace`,
      description,
      canonicalPath,
      image,
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: material.title,
        description,
        category: material.type || 'University study material',
        sku: material.id,
        url: window.qmarketplaceSeo.absoluteUrl(canonicalPath),
        image: image ? window.qmarketplaceSeo.absoluteUrl(image) : undefined,
        brand: { '@type': 'Brand', name: 'QMarketplace' },
        offers: material.hasPreview ? {
          '@type': 'Offer',
          price: Number(material.price).toFixed(2),
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          url: window.qmarketplaceSeo.absoluteUrl(canonicalPath)
        } : undefined
      }
    });
    container.className = 'detail-layout';
    container.innerHTML = `
      <section class="detail-preview">
        ${material.hasPreview
          ? `<div class="pdf-preview" data-pdf-document="/api/materials/${encodeURIComponent(material.id)}/preview/pages" data-page-count="${Math.min(Number(material.pages) || 3, 3)}">
              <div class="pdf-preview-heading">
                <span class="badge">Watermarked preview</span>
                <span class="small">First ${Math.min(Number(material.pages) || 3, 3)} pages · Full document available upon purchase</span>
              </div>
              <div class="pdf-page-container">
                <img data-pdf-image alt="Watermarked page of ${escapeHtml(material.title)}">
              </div>
              <div class="pdf-preview-controls">
                <div class="pdf-controls-nav">
                  <button class="btn btn-secondary" type="button" data-pdf-previous disabled>Previous</button>
                  <span data-pdf-page-label role="status">Loading preview…</span>
                  <button class="btn btn-secondary" type="button" data-pdf-next disabled>Next</button>
                </div>
                <div class="pdf-controls-zoom">
                  <button class="btn btn-secondary btn-icon" type="button" data-pdf-zoom-out title="Zoom out" aria-label="Zoom out">−</button>
                  <span data-pdf-zoom-level class="zoom-label">100%</span>
                  <button class="btn btn-secondary btn-icon" type="button" data-pdf-zoom-in title="Zoom in" aria-label="Zoom in">+</button>
                  <button class="btn btn-secondary btn-sm" type="button" data-pdf-fit-width title="Reset zoom">Reset</button>
                </div>
              </div>
            </div>`
          : `<div class="detail-preview-paper"><span class="badge">${escapeHtml(material.fileFormat || 'Digital material')}</span><h2>${escapeHtml(material.title)}</h2><p>The processed PDF preview is not available yet. An administrator must upload or process the source PDF before it can be previewed or purchased.</p></div>`}
      </section>
      <section class="detail-info">
        <div class="badge">${escapeHtml(material.type || 'Study material')}</div>
        <h1>${escapeHtml(material.title)}</h1>
        <p class="material-description">${escapeHtml(material.description || 'No description has been provided.')}</p>
        <dl class="detail-meta">
          <div><dt>University</dt><dd>${escapeHtml(material.university?.name || 'Not specified')}</dd></div>
          <div><dt>Course</dt><dd>${escapeHtml([material.course?.code, material.course?.title].filter(Boolean).join(' - ') || 'Not specified')}</dd></div>
          <div><dt>Academic year</dt><dd>${escapeHtml(material.academicYear || 'Not specified')}</dd></div>
          <div><dt>Format</dt><dd>${escapeHtml(material.fileFormat || 'Not specified')}</dd></div>
          <div><dt>Pages</dt><dd>${Number(material.pages) > 0 ? Number(material.pages) : 'Not specified'}</dd></div>
        </dl>
        <aside class="purchase-panel">
          <div><span class="small">Price</span><div class="detail-price">$${Number(material.price).toFixed(2)} <span>USD</span></div></div>
          ${material.hasPreview
            ? `<p>Payment must be confirmed before the watermarked full document becomes available.</p><a class="btn btn-primary" href="/checkout.html?materialId=${encodeURIComponent(material.id)}">Continue to checkout</a>${getCurrentUser() ? '' : '<p class="small">You will be asked to sign in before checkout.</p>'}`
            : '<p>This document is not available for purchase until its watermarked preview has been processed by an administrator.</p>'}
        </aside>
      </section>
    `;
  } catch (error) {
    container.className = 'empty-state detail-state';
    container.innerHTML = `<h1>Unable to load this material</h1><p>${escapeHtml(error.message)}</p><a class="btn btn-primary" href="/materials.html">Browse materials</a>`;
  }
});
