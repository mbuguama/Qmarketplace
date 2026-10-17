document.addEventListener('DOMContentLoaded', async () => {
  const { apiRequest, escapeHtml } = window.qmarketplaceApi;
  const featuredList = document.querySelector('[data-featured-list]');
  const universityList = document.querySelector('[data-university-list]');
  window.qmarketplaceSeo?.update({
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'QMarketplace',
      url: window.qmarketplaceSeo.absoluteUrl('/'),
      description: 'Find university lecture notes, exam papers, study guides, and course resources.',
      potentialAction: {
        '@type': 'SearchAction',
        target: `${window.qmarketplaceSeo.absoluteUrl('/materials.html')}?q={search_term_string}`,
        'query-input': 'required name=search_term_string'
      }
    }
  });

  const fallback = (container, text) => {
    if (container) container.innerHTML = `<div class="empty-state">${escapeHtml(text)}</div>`;
  };

  if (featuredList) {
    try {
      const materials = await apiRequest('/materials');
      const featured = materials.filter((item) => item.featured).slice(0, 3);
      if (!featured.length) {
        fallback(featuredList, 'No featured materials are available yet.');
      } else {
        featuredList.innerHTML = featured.map((item) => {
          const description = String(item.description || '');
          const needsExpansion = description.length > 260;
          const excerpt = needsExpansion ? `${description.slice(0, 260).trimEnd()}…` : description;
          const preview = item.hasPreview
            ? `<div class="material-card-preview" data-pdf-preview><img src="/api/materials/${encodeURIComponent(item.id)}/preview/pages/1.png" alt="First page preview of ${escapeHtml(item.title)}"><span class="preview-label" role="status">Loading preview…</span></div>`
            : '<div class="thumb preview-unavailable">PDF preview unavailable</div>';
          return `
          <article class="feature-card">
            ${preview}
            <span class="badge">${escapeHtml(item.type || 'Resource')}</span>
            <h3>${escapeHtml(item.title)}</h3>
            <p class="material-description">${escapeHtml(excerpt)}</p>
            ${needsExpansion ? `<details class="description-disclosure"><summary>Read full description</summary><p class="material-description">${escapeHtml(description)}</p></details>` : ''}
            <div class="material-meta">
              <span>${escapeHtml(item.course?.code || item.university?.name || 'Academic resource')}</span>
              <span>${Number(item.pages) > 0 ? `${Number(item.pages)} pages` : ''}</span>
            </div>
            <div class="material-foot">
              <span class="price">$${Number(item.price).toFixed(2)}</span>
              <a class="btn btn-primary" href="/material-details.html?id=${encodeURIComponent(item.id)}">View details</a>
            </div>
          </article>
        `;
        }).join('');
      }
    } catch (error) {
      fallback(featuredList, error.message);
    }
  }

  if (universityList) {
    try {
      const institutions = await apiRequest('/universities');
      if (!institutions.length) {
        fallback(universityList, 'No universities have been added yet.');
      } else {
        universityList.innerHTML = institutions.slice(0, 6).map((institution) => `
          <a class="logo-pill" href="/university-details.html?id=${encodeURIComponent(institution.id)}">
            ${escapeHtml(institution.name)}
          </a>
        `).join('');
      }
    } catch (error) {
      fallback(universityList, error.message);
    }
  }
});
