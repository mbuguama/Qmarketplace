document.addEventListener('DOMContentLoaded', async () => {
  const { apiRequest, escapeHtml } = window.qmarketplaceApi;
  const universityGrid = document.querySelector('[data-universities]');
  const courseGrid = document.querySelector('[data-courses]');
  const universityDetail = document.querySelector('[data-university-detail]');
  const courseDetail = document.querySelector('[data-course-detail]');

  const errorView = (element, error) => {
    element.className = 'empty-state';
    element.innerHTML = `<h2>Unable to load this page</h2><p>${escapeHtml(error.message)}</p><a class="btn btn-primary" href="/">Return home</a>`;
  };

  if (universityGrid) {
    try {
      const universities = await apiRequest('/universities');
      universityGrid.innerHTML = universities.length ? universities.map((university) => `
        <article class="university-card">
          <span class="badge">${escapeHtml(university.location || 'Institution')}</span>
          <h2>${escapeHtml(university.name)}</h2>
          <p>${escapeHtml(university.description || '')}</p>
          <a class="text-link" href="/university-details.html?id=${encodeURIComponent(university.id)}">View university resources</a>
        </article>
      `).join('') : '<div class="empty-state"><h2>No universities listed</h2><p>Institutions will appear here when added to the catalog.</p></div>';
    } catch (error) {
      errorView(universityGrid, error);
    }
  }

  if (courseGrid) {
    try {
      const courses = await apiRequest('/courses');
      courseGrid.innerHTML = courses.length ? courses.map((course) => `
        <article class="catalog-card">
          <span class="badge">${escapeHtml(course.code || 'Course')}</span>
          <h2>${escapeHtml(course.title)}</h2>
          <p>${escapeHtml(course.university?.name || 'University not specified')}</p>
          <a class="text-link" href="/course-details.html?id=${encodeURIComponent(course.id)}">View course materials</a>
        </article>
      `).join('') : '<div class="empty-state"><h2>No courses listed</h2><p>Courses will appear here when added to the catalog.</p></div>';
    } catch (error) {
      errorView(courseGrid, error);
    }
  }

  if (universityDetail) {
    const id = new URLSearchParams(location.search).get('id');
    if (!id) {
      errorView(universityDetail, new Error('A university ID is required.'));
    } else {
      try {
        const [universities, materials] = await Promise.all([apiRequest('/universities'), apiRequest('/materials')]);
        const university = universities.find((item) => item.id === id);
        if (!university) throw new Error('University not found.');
        const description = String(university.description || `Browse university courses and study materials for ${university.name} on QMarketplace.`).replace(/\s+/g, ' ').trim().slice(0, 300);
        const canonicalPath = `/university-details.html?id=${encodeURIComponent(university.id)}`;
        window.qmarketplaceSeo?.update({
          title: `${university.name} Study Materials | QMarketplace`,
          description,
          canonicalPath,
          structuredData: {
            '@context': 'https://schema.org',
            '@type': 'EducationalOrganization',
            name: university.name,
            description,
            url: window.qmarketplaceSeo.absoluteUrl(canonicalPath),
            address: university.location ? { '@type': 'PostalAddress', addressLocality: university.location } : undefined
          }
        });
        const resources = materials.filter((item) => item.universityId === id);
        universityDetail.className = '';
        universityDetail.innerHTML = `
          <header class="catalog-detail-header"><span class="badge">${escapeHtml(university.location || 'Institution')}</span><h1>${escapeHtml(university.name)}</h1><p>${escapeHtml(university.description || '')}</p></header>
          <section class="section-inner"><h2>Available materials</h2>${renderMaterialCards(resources, escapeHtml)}</section>
        `;
      } catch (error) {
        errorView(universityDetail, error);
      }
    }
  }

  if (courseDetail) {
    const id = new URLSearchParams(location.search).get('id');
    if (!id) {
      errorView(courseDetail, new Error('A course ID is required.'));
    } else {
      try {
        const [courses, materials] = await Promise.all([apiRequest('/courses'), apiRequest('/materials')]);
        const course = courses.find((item) => item.id === id);
        if (!course) throw new Error('Course not found.');
        const description = String(course.description || `Browse study materials and course resources for ${course.code ? `${course.code} - ` : ''}${course.title} on QMarketplace.`).replace(/\s+/g, ' ').trim().slice(0, 300);
        const canonicalPath = `/course-details.html?id=${encodeURIComponent(course.id)}`;
        window.qmarketplaceSeo?.update({
          title: `${course.code ? `${course.code} - ` : ''}${course.title} Study Materials | QMarketplace`,
          description,
          canonicalPath,
          structuredData: {
            '@context': 'https://schema.org',
            '@type': 'Course',
            name: course.title,
            courseCode: course.code || undefined,
            description,
            url: window.qmarketplaceSeo.absoluteUrl(canonicalPath),
            provider: course.university?.name ? { '@type': 'EducationalOrganization', name: course.university.name } : undefined
          }
        });
        const resources = materials.filter((item) => item.courseId === id);
        courseDetail.className = '';
        courseDetail.innerHTML = `
          <header class="catalog-detail-header"><span class="badge">${escapeHtml(course.code || 'Course')}</span><h1>${escapeHtml(course.title)}</h1><p>${escapeHtml(course.university?.name || '')}</p><p>${escapeHtml(course.description || '')}</p></header>
          <section class="section-inner"><h2>Available materials</h2>${renderMaterialCards(resources, escapeHtml)}</section>
        `;
      } catch (error) {
        errorView(courseDetail, error);
      }
    }
  }
});

function renderMaterialCards(materials, escapeHtml) {
  if (!materials.length) return '<div class="empty-state"><p>No materials are listed here yet.</p><a class="text-link" href="/materials.html">Browse all materials</a></div>';
  return `<div class="grid grid-3">${materials.map((material) => {
    const description = String(material.description || '');
    const needsExpansion = description.length > 260;
    const excerpt = needsExpansion ? `${description.slice(0, 260).trimEnd()}…` : description;
    const preview = material.hasPreview
      ? `<div class="material-card-preview" data-pdf-preview><img src="/api/materials/${encodeURIComponent(material.id)}/preview/pages/1.png" alt="First page preview of ${escapeHtml(material.title)}"><span class="preview-label" role="status">Loading preview…</span></div>`
      : '<div class="thumb preview-unavailable">PDF preview unavailable</div>';
    return `
    <article class="material-card">
      ${preview}
      <span class="badge">${escapeHtml(material.type || 'Study material')}</span>
      <h3>${escapeHtml(material.title)}</h3>
      <p class="material-description">${escapeHtml(excerpt)}</p>
      ${needsExpansion ? `<details class="description-disclosure"><summary>Read full description</summary><p class="material-description">${escapeHtml(description)}</p></details>` : ''}
      <div class="material-foot"><span class="price">$${Number(material.price).toFixed(2)}</span><a class="btn btn-primary" href="/material-details.html?id=${encodeURIComponent(material.id)}">View details</a></div>
    </article>
  `;
  }).join('')}</div>`;
}
