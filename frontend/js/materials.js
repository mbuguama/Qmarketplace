document.addEventListener('DOMContentLoaded', async () => {
  const { apiRequest, escapeHtml } = window.qmarketplaceApi;
  const list = document.querySelector('[data-material-list]');
  const searchInput = document.querySelector('[data-search-input]');
  if (!list || !searchInput) return;

  const typeFilter = document.querySelector('[data-type-filter]');
  const universityFilter = document.querySelector('[data-university-filter]');
  const sortSelect = document.querySelector('[data-sort]');
  const count = document.querySelector('[data-result-count]');
  const pagination = document.querySelector('[data-pagination]');
  const pageSize = 9;
  let page = 1;
  let debounce;

  const params = new URLSearchParams(window.location.search);
  searchInput.value = params.get('q') || '';
  if (typeFilter) typeFilter.value = params.get('type') || '';
  if (sortSelect) sortSelect.value = params.get('sort') || 'recent';

  const currentFilters = () => ({
    q: searchInput.value.trim(),
    type: typeFilter?.value || '',
    universityId: universityFilter?.value || '',
    sort: sortSelect?.value || 'recent'
  });

  const updateAddress = (filters) => {
    const addressParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value && (key !== 'sort' || value !== 'recent')) addressParams.set(key, value);
    });
    const queryString = addressParams.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${queryString ? `?${queryString}` : ''}`);
  };

  const render = (result) => {
    if (count) count.textContent = `${result.total} ${result.total === 1 ? 'material' : 'materials'}`;
    if (!result.items.length) {
      list.innerHTML = '<div class="empty-state"><h2>No materials found</h2><p>Try a different title, course, or filter.</p></div>';
    } else {
      list.innerHTML = result.items.map((material) => {
        const description = String(material.description || '');
        const needsExpansion = description.length > 260;
        const excerpt = needsExpansion ? `${description.slice(0, 260).trimEnd()}…` : description;
        const preview = material.hasPreview
          ? `<div class="material-card-preview" data-pdf-preview><img src="/api/materials/${encodeURIComponent(material.id)}/preview/pages/1.png" alt="First page preview of ${escapeHtml(material.title)}"><span class="preview-label" role="status">Loading preview…</span></div>`
          : '<div class="thumb preview-unavailable">PDF preview unavailable</div>';
        return `
        <article class="material-card">
          ${preview}
          <div class="material-meta">
            <span>${escapeHtml(material.type || 'Study material')}</span>
            <span>${Number(material.pages) > 0 ? `${Number(material.pages)} pages` : ''}</span>
          </div>
          <h3>${escapeHtml(material.title)}</h3>
          <p class="material-description">${escapeHtml(excerpt)}</p>
          ${needsExpansion ? `<details class="description-disclosure"><summary>Read full description</summary><p class="material-description">${escapeHtml(description)}</p></details>` : ''}
          <div class="material-meta material-context">
            <span>${escapeHtml(material.course?.code || material.course?.title || '')}</span>
            <span>${escapeHtml(material.university?.name || '')}</span>
          </div>
          <div class="material-foot">
            <div class="price">$${Number(material.price).toFixed(2)}</div>
            <a href="/material-details.html?id=${encodeURIComponent(material.id)}" class="btn btn-primary">View details</a>
          </div>
        </article>
      `;
      }).join('');
    }

    const pageCount = Math.ceil(result.total / pageSize);
    if (pagination) {
      if (pageCount <= 1) {
        pagination.innerHTML = '';
      } else {
        const buttons = [];
        if (page > 1) buttons.push(`<button type="button" data-page="${page - 1}" aria-label="Previous page">Previous</button>`);
        const start = Math.max(1, page - 2);
        const end = Math.min(pageCount, page + 2);
        for (let number = start; number <= end; number += 1) {
          buttons.push(`<button type="button" data-page="${number}" ${number === page ? 'aria-current="page"' : ''} aria-label="Page ${number}">${number}</button>`);
        }
        if (page < pageCount) buttons.push(`<button type="button" data-page="${page + 1}" aria-label="Next page">Next</button>`);
        pagination.innerHTML = buttons.join('');
      }
    }
  };

  const load = async () => {
    const filters = currentFilters();
    updateAddress(filters);
    list.setAttribute('aria-busy', 'true');
    list.innerHTML = '<div class="loading-state" role="status">Loading study materials...</div>';
    try {
      const query = new URLSearchParams({ ...filters, page: String(page), limit: String(pageSize) });
      const result = await apiRequest(`/materials?${query}`);
      render(result);
    } catch (error) {
      list.innerHTML = `<div class="empty-state"><h2>We could not load materials</h2><p>${escapeHtml(error.message)}</p></div>`;
    } finally {
      list.removeAttribute('aria-busy');
    }
  };

  try {
    const universities = await apiRequest('/universities');
    if (universityFilter) {
      universityFilter.innerHTML += universities.map((university) =>
        `<option value="${escapeHtml(university.id)}">${escapeHtml(university.name)}</option>`
      ).join('');
      universityFilter.value = params.get('universityId') || '';
    }
    await load();

    searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        page = 1;
        load();
      }, 180);
    });
    [typeFilter, universityFilter, sortSelect].forEach((control) => {
      control?.addEventListener('change', () => {
        page = 1;
        load();
      });
    });
    pagination?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-page]');
      if (!button) return;
      page = Number(button.dataset.page);
      load();
    });
  } catch (error) {
    list.innerHTML = `<div class="empty-state"><h2>We could not load materials</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
});
