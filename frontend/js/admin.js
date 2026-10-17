document.addEventListener('DOMContentLoaded', async () => {
  const root = document.querySelector('[data-admin-root]');
  if (!root) return;
  const { apiRequest, escapeHtml, getCurrentUser } = window.qmarketplaceApi;
  const nav = document.querySelector('[data-admin-nav]');
  const views = [
    ['dashboard', 'Overview', '/admin/dashboard.html'],
    ['materials', 'Materials', '/admin/materials.html'],
    ['upload', 'Add material', '/admin/upload.html'],
    ['orders', 'Orders', '/admin/orders.html'],
    ['users', 'Users', '/admin/users.html'],
    ['universities', 'Universities', '/admin/universities.html'],
    ['courses', 'Courses', '/admin/courses.html'],
    ['settings', 'Settings', '/admin/settings.html'],
    ['contact', 'Contact queries', '/admin/contact.html']
  ];
  const view = root.dataset.adminView;

  if (nav) {
    nav.innerHTML = views.map(([key, label, href]) =>
      `<a href="${href}" ${key === view ? 'aria-current="page"' : ''}>${label}</a>`
    ).join('');
  }

  const user = getCurrentUser();
  if (!user || user.role !== 'admin') {
    root.innerHTML = `
      <section class="empty-state">
        <span class="badge">Restricted area</span>
        <h1>Administrator access required</h1>
        <p>This area is available only to an administrator account. Server-side routes enforce the same role check.</p>
        <a class="btn btn-primary" href="/login.html?next=${encodeURIComponent(location.pathname)}">Sign in</a>
      </section>
    `;
    return;
  }

  const showError = (error) => {
    let notice = root.querySelector('[data-admin-error]');
    if (!notice) {
      notice = document.createElement('p');
      notice.className = 'admin-error';
      notice.dataset.adminError = '';
      notice.setAttribute('role', 'alert');
      root.prepend(notice);
    }
    notice.textContent = error.message;
  };

  try {
    if (view === 'dashboard') await renderDashboard(root, apiRequest, escapeHtml, showError);
    else if (view === 'materials') await renderMaterials(root, apiRequest, escapeHtml, showError);
    else if (view === 'upload') await initializeUpload(root, apiRequest, escapeHtml, showError);
    else if (view === 'orders') await renderOrders(root, apiRequest, escapeHtml, showError);
    else if (view === 'users') await renderUsers(root, apiRequest, escapeHtml, showError);
    else if (view === 'universities') await renderUniversities(root, apiRequest, escapeHtml, showError);
    else if (view === 'courses') await renderCourses(root, apiRequest, escapeHtml, showError);
    else if (view === 'settings') await renderSettings(root, apiRequest, escapeHtml);
    else if (view === 'contact') await renderContactQueries(root, apiRequest, escapeHtml, showError);
  } catch (error) {
    root.innerHTML = '<div class="empty-state"><h1>Could not load admin data</h1></div>';
    showError(error);
  }
});

async function renderDashboard(root, apiRequest, escapeHtml) {
  const overview = await apiRequest('/admin/overview');
  const metrics = overview.metrics;
  root.innerHTML = `
    <header class="admin-page-head"><div><span class="badge">Overview</span><h1>Marketplace dashboard</h1><p>Live figures from the configured database. Revenue includes confirmed paid orders only.</p></div><a class="btn btn-primary" href="/admin/upload.html">Add material</a></header>
    <section class="admin-grid" aria-label="Marketplace metrics">
      ${metricBox('Published materials', metrics.totalMaterials)}
      ${metricBox('Draft materials', metrics.draftMaterials)}
      ${metricBox('Archived materials', metrics.archivedMaterials)}
      ${metricBox('Registered users', metrics.totalUsers)}
      ${metricBox('Total orders', metrics.totalOrders)}
      ${metricBox('Completed payments', metrics.totalSales)}
      ${metricBox('Confirmed revenue', `$${Number(metrics.totalRevenue).toFixed(2)}`)}
    </section>
    <section class="admin-panel"><h2>Recent orders</h2>
      ${overview.recentOrders.length ? table(['Order', 'Customer', 'Material', 'Amount', 'Status', 'Date'], overview.recentOrders.map((order) => [
        escapeHtml(order.id),
        escapeHtml(order.user ? `${order.user.firstName} ${order.user.lastName}` : order.userId),
        escapeHtml(order.material?.title || '—'),
        `$${Number(order.amount).toFixed(2)}`, status(order.status, escapeHtml),
        order.createdAt ? escapeHtml(new Date(order.createdAt).toLocaleDateString()) : '—'
      ])) : '<p>No orders recorded.</p>'}
    </section>
    <section class="admin-panel"><h2>Recently uploaded materials</h2>
      ${overview.recentMaterials.length ? table(['Material', 'Status', 'Uploaded'], overview.recentMaterials.map((item) => [
        escapeHtml(item.title), status(item.status, escapeHtml),
        item.createdAt ? escapeHtml(new Date(item.createdAt).toLocaleDateString()) : '—'
      ])) : '<p>No materials have been uploaded yet.</p>'}
    </section>
  `;
}

function metricBox(label, value) {
  return `<article class="metric-box"><span>${label}</span><strong>${value}</strong></article>`;
}

async function renderMaterials(root, apiRequest, escapeHtml, showError) {
  root.innerHTML = `
    <header class="admin-page-head"><div><span class="badge">Catalog</span><h1>Materials</h1><p>Search and filter listings. Archiving preserves associated orders and payment history.</p></div><a class="btn btn-primary" href="/admin/upload.html">Add material</a></header>
    <section class="admin-panel" aria-label="Material filters">
      <div class="admin-form-grid">
        <label class="field">Search<input class="input" data-filter="q" type="search" placeholder="Title, university, or course" /></label>
        <label class="field">Type<select class="select" data-filter="type"><option value="">All types</option></select></label>
        <label class="field">Status<select class="select" data-filter="status"><option value="">All statuses</option><option value="active">Published</option><option value="inactive">Archived</option><option value="draft">Draft</option></select></label>
        <label class="field">University<select class="select" data-filter="universityId"><option value="">All universities</option></select></label>
        <label class="field">Course<select class="select" data-filter="courseId"><option value="">All courses</option></select></label>
        <label class="field">Minimum price<input class="input" data-filter="minPrice" type="number" min="0" step="0.01" /></label>
        <label class="field">Maximum price<input class="input" data-filter="maxPrice" type="number" min="0" step="0.01" /></label>
        <label class="field">Uploaded from<input class="input" data-filter="from" type="date" /></label>
        <label class="field">Uploaded to<input class="input" data-filter="to" type="date" /></label>
        <label class="field">Sort by<select class="select" data-filter="sort"><option value="recent">Recently added</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="title">Title: A to Z</option></select></label>
      </div>
    </section>
    <div data-material-table></div>
    <nav class="pagination" aria-label="Material results pages" data-material-pagination></nav>
    <dialog class="admin-dialog" data-edit-dialog aria-labelledby="edit-material-title">
      <form data-edit-form>
        <h2 id="edit-material-title">Edit material</h2>
        <input type="hidden" name="id" />
        <label class="field">Title<input class="input" name="title" maxlength="160" required /></label>
        <label class="field">Type<input class="input" name="type" maxlength="80" required /></label>
        <label class="field">Description<textarea class="input" name="description" maxlength="5000" rows="4" required></textarea></label>
        <div class="admin-form-grid">
          <label class="field">Price (USD)<input class="input" name="price" type="number" min="0" max="10000" step="0.01" required /></label>
          <p class="small">Page count is read from the uploaded PDF.</p>
          <label class="field">Academic year<input class="input" name="academicYear" maxlength="32" /></label>
          <label class="field">Status<select class="select" name="status"><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        </div>
        <label class="checkbox-row"><input name="featured" type="checkbox" /> Featured</label>
        <p class="form-message" data-edit-message role="alert"></p>
        <div class="dialog-actions"><button class="btn btn-secondary" type="button" data-close-dialog>Cancel</button><button class="btn btn-primary" type="submit">Save changes</button></div>
      </form>
    </dialog>
  `;

  const tableContainer = root.querySelector('[data-material-table]');
  const pagination = root.querySelector('[data-material-pagination]');
  const filters = [...root.querySelectorAll('[data-filter]')];
  const universityFilter = root.querySelector('[data-filter="universityId"]');
  const courseFilter = root.querySelector('[data-filter="courseId"]');
  const typeFilter = root.querySelector('[data-filter="type"]');
  const [universities, courses, materials] = await Promise.all([
    apiRequest('/universities'),
    apiRequest('/courses'),
    apiRequest('/admin/materials')
  ]);
  universityFilter.insertAdjacentHTML('beforeend', universities.map((item) =>
    `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`
  ).join(''));
  courseFilter.insertAdjacentHTML('beforeend', courses.map((item) =>
    `<option value="${escapeHtml(item.id)}">${escapeHtml(item.code)} — ${escapeHtml(item.title)}</option>`
  ).join(''));
  function refreshCourses() {
    const selectedCourseId = courseFilter.value;
    const availableCourses = universityFilter.value
      ? courses.filter((course) => course.universityId === universityFilter.value)
      : courses;
    courseFilter.innerHTML = '<option value="">All courses</option>' + availableCourses.map((item) =>
      `<option value="${escapeHtml(item.id)}">${escapeHtml(item.code)} — ${escapeHtml(item.title)}</option>`
    ).join('');
    if (availableCourses.some((course) => course.id === selectedCourseId)) courseFilter.value = selectedCourseId;
  }
  refreshCourses();
  const types = [...new Set(materials.items.map((item) => item.type).filter(Boolean))].sort();
  typeFilter.insertAdjacentHTML('beforeend', types.map((type) =>
    `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`
  ).join(''));

  let page = 1;
  let items = [];
  let requestSequence = 0;
  async function loadPage() {
    const currentRequest = ++requestSequence;
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    for (const filter of filters) {
      const value = filter.value.trim();
      if (value) params.set(filter.dataset.filter, value);
    }
    if (params.has('from')) params.set('from', new Date(`${params.get('from')}T00:00:00.000Z`).toISOString());
    if (params.has('to')) params.set('to', new Date(`${params.get('to')}T23:59:59.999Z`).toISOString());
    tableContainer.innerHTML = '<div class="loading-state">Loading materials...</div>';
    try {
      const result = await apiRequest(`/admin/materials?${params}`);
      if (currentRequest !== requestSequence) return;
      items = result.items;
      tableContainer.innerHTML = result.items.length ? table(
        ['Material', 'University', 'Course', 'Type', 'Price', 'Uploaded', 'Status', 'Watermark', 'File', 'Actions'],
        result.items.map((item) => [
          escapeHtml(item.title),
          escapeHtml(item.university?.name || '—'),
          escapeHtml(item.course?.code || '—'),
          escapeHtml(item.type),
          `$${Number(item.price).toFixed(2)}`,
          item.createdAt ? escapeHtml(new Date(item.createdAt).toLocaleDateString()) : '—',
          status(item.status, escapeHtml),
          status(item.hasWatermarkedFiles ? 'complete' : item.processingStatus === 'failed' ? 'failed' : item.processingStatus === 'processing' ? 'processing' : 'legacy', escapeHtml),
          item.hasDownload ? 'Uploaded' : 'Missing',
          `<div class="admin-actions">${item.hasDownload && !item.hasWatermarkedFiles ? `<button class="btn btn-secondary" type="button" data-process-material="${escapeHtml(item.id)}">Process PDF</button>` : ''}<button class="btn btn-secondary" type="button" data-edit="${escapeHtml(item.id)}">Edit</button>${item.status === 'active' ? `<button class="btn btn-outline" type="button" data-deactivate="${escapeHtml(item.id)}">Archive</button>` : `<button class="btn btn-outline" type="button" data-reactivate="${escapeHtml(item.id)}">Publish</button>`}</div>`
        ])
      )
      : '<div class="empty-state"><p>No materials match these filters.</p></div>';
      const pageCount = result.pageCount;
      pagination.innerHTML = `<span>${result.total} material${result.total === 1 ? '' : 's'} · Page ${result.page} of ${Math.max(pageCount, 1)}</span>
        <div class="admin-actions"><button class="btn btn-secondary" type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Previous</button>
        <button class="btn btn-secondary" type="button" data-page="${page + 1}" ${page >= pageCount ? 'disabled' : ''}>Next</button></div>`;
    } catch (error) {
      if (currentRequest !== requestSequence) return;
      tableContainer.innerHTML = '<div class="empty-state"><p>Could not load materials.</p></div>';
      showError(error);
    }
  }
  let searchTimer;
  filters.forEach((filter) => filter.addEventListener(filter.type === 'search' ? 'input' : 'change', () => {
    page = 1;
    if (filter.dataset.filter === 'universityId') refreshCourses();
    if (filter.type === 'search') {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(loadPage, 250);
    } else {
      loadPage();
    }
  }));
  root.querySelector('[data-material-pagination]').addEventListener('click', (event) => {
    const button = event.target.closest('[data-page]');
    if (!button || button.disabled) return;
    page = Number(button.dataset.page);
    loadPage();
  });
  await loadPage();

  const dialog = root.querySelector('[data-edit-dialog]');
  const form = root.querySelector('[data-edit-form]');
  root.querySelector('[data-close-dialog]').addEventListener('click', () => dialog.close());
  root.addEventListener('click', async (event) => {
    const editButton = event.target.closest('[data-edit]');
    const deactivateButton = event.target.closest('[data-deactivate]');
    const reactivateButton = event.target.closest('[data-reactivate]');
    const processButton = event.target.closest('[data-process-material]');
    if (processButton) {
      processButton.disabled = true;
      processButton.textContent = 'Processing...';
      try {
        await apiRequest(`/admin/materials/${encodeURIComponent(processButton.dataset.processMaterial)}/process`, { method: 'POST' });
        await loadPage();
      } catch (error) {
        showError(error);
        processButton.disabled = false;
        processButton.textContent = 'Process PDF';
      }
    }
    if (editButton) {
      const item = items.find((entry) => entry.id === editButton.dataset.edit);
      if (!item) return;
      for (const [key, value] of Object.entries({
        id: item.id, title: item.title, type: item.type, description: item.description,
        price: item.price, academicYear: item.academicYear || '',
        status: item.status, featured: item.featured
      })) {
        const field = form.elements.namedItem(key);
        if (field.type === 'checkbox') field.checked = Boolean(value);
        else field.value = value;
      }
      dialog.showModal();
    }
    if (deactivateButton && window.confirm('Archive this material? It will be hidden from the public catalog, and existing orders and files will be preserved.')) {
      deactivateButton.disabled = true;
      try {
        await apiRequest(`/admin/materials/${encodeURIComponent(deactivateButton.dataset.deactivate)}`, { method: 'DELETE' });
        await loadPage();
      } catch (error) {
        showError(error);
        deactivateButton.disabled = false;
      }
    }
    if (reactivateButton) {
      reactivateButton.disabled = true;
      try {
        await apiRequest(`/admin/materials/${encodeURIComponent(reactivateButton.dataset.reactivate)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'active' })
        });
        await loadPage();
      } catch (error) {
        showError(error);
        reactivateButton.disabled = false;
      }
    }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = form.querySelector('[data-edit-message]');
    const submit = form.querySelector('[type="submit"]');
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.featured = form.elements.featured.checked;
    const id = payload.id;
    delete payload.id;
    submit.disabled = true;
    message.textContent = '';
    try {
      await apiRequest(`/admin/materials/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
      dialog.close();
      await loadPage();
    } catch (error) {
      message.textContent = error.message;
      submit.disabled = false;
    }
  });
}

async function initializeUpload(root, apiRequest, escapeHtml, showError) {
  const form = root.querySelector('[data-material-form]');
  if (!form) return;
  const message = form.querySelector('[data-admin-message]');
  const universitySelect = form.elements.universityId;
  const courseSelect = form.elements.courseId;
  const [universities, courses] = await Promise.all([apiRequest('/universities'), apiRequest('/courses')]);
  universitySelect.innerHTML = '<option value="">Choose university</option>' + universities.map((item) =>
    `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`
  ).join('');
  const fillCourses = () => {
    const matched = courses.filter((course) => course.universityId === universitySelect.value);
    courseSelect.innerHTML = '<option value="">No course selected</option>' + matched.map((course) =>
      `<option value="${escapeHtml(course.id)}">${escapeHtml(course.code)} — ${escapeHtml(course.title)}</option>`
    ).join('');
  };
  universitySelect.addEventListener('change', fillCourses);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = form.elements.file.files[0];
    if (!file || !file.name.toLowerCase().endsWith('.pdf') || (file.type && file.type !== 'application/pdf') || file.size > 20 * 1024 * 1024) {
      message.textContent = 'Choose a PDF file no larger than 20 MB.';
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Uploading...';
    message.textContent = 'Requesting private upload access...';
    try {
      const upload = await apiRequest('/admin/materials/upload-url', {
        method: 'POST',
        body: JSON.stringify({ contentType: 'application/pdf', size: file.size })
      });
      const uploaded = await fetch(upload.url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: file
      });
      if (!uploaded.ok) throw new Error('The file upload failed. Check the R2 bucket CORS settings and retry.');
      message.textContent = 'Applying the watermark and generating a limited preview...';
      const payload = {
        title: form.elements.title.value,
        type: form.elements.type.value,
        description: form.elements.description.value,
        price: Number(form.elements.price.value),
        academicYear: form.elements.academicYear.value,
        universityId: universitySelect.value,
        courseId: courseSelect.value,
        featured: form.elements.featured.checked,
        uploadKey: upload.key
      };
      await apiRequest('/admin/materials', { method: 'POST', body: JSON.stringify(payload) });
      window.location.href = '/admin/materials.html';
    } catch (error) {
      message.textContent = error.message;
      submit.disabled = false;
      submit.textContent = 'Upload and publish';
    }
  });
}

async function renderOrders(root, apiRequest, escapeHtml, showError) {
  root.innerHTML = `<header class="admin-page-head"><div><span class="badge">Sales</span><h1>Orders</h1><p>Search and review payment records. Only pending, unpaid orders may be cancelled; paid orders remain intact.</p></div></header>
    <section class="admin-panel" aria-label="Order filters"><div class="admin-form-grid">
      <label class="field">Search<input class="input" type="search" data-order-search placeholder="Order ID, customer, or material" /></label>
      <label class="field">Status<select class="select" data-order-status><option value="">All statuses</option><option value="pending">Pending</option><option value="processing">Processing</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option><option value="failed">Failed</option></select></label>
    </div></section>
    <div data-order-table></div>
    <nav class="pagination" aria-label="Order result pages" data-order-pagination></nav>`;
  const tableContainer = root.querySelector('[data-order-table]');
  const pagination = root.querySelector('[data-order-pagination]');
  let page = 1;
  let pageCount = 1;
  let sequence = 0;
  const loadOrders = async () => {
    const current = ++sequence;
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    const query = root.querySelector('[data-order-search]').value.trim();
    const statusFilter = root.querySelector('[data-order-status]').value;
    if (query) params.set('q', query);
    if (statusFilter) params.set('status', statusFilter);
    try {
      const result = await apiRequest(`/admin/orders?${params}`);
      if (current !== sequence) return;
      pageCount = result.pageCount;
      tableContainer.innerHTML = result.items.length ? table(
        ['Order', 'Customer', 'Material', 'Amount', 'Status', 'Created', 'Actions'],
        result.items.map((order) => [
          escapeHtml(order.id),
          escapeHtml(`${order.user.firstName} ${order.user.lastName}`),
          escapeHtml(order.material.title),
          `$${Number(order.amount).toFixed(2)} ${escapeHtml(order.currency)}`,
          status(order.status, escapeHtml),
          escapeHtml(new Date(order.createdAt).toLocaleString()),
          order.status === 'pending'
            ? `<button class="btn btn-outline" type="button" data-cancel-order="${escapeHtml(order.id)}">Cancel pending</button>`
            : '—'
        ])
      ) : '<div class="empty-state"><p>No orders match these filters.</p></div>';
      pagination.innerHTML = `<button class="btn btn-secondary" type="button" data-order-page="prev" ${page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${page} of ${pageCount} · ${result.total} orders</span><button class="btn btn-secondary" type="button" data-order-page="next" ${page >= pageCount ? 'disabled' : ''}>Next</button>`;
    } catch (error) {
      showError(error);
    }
  };
  let searchTimer;
  root.querySelector('[data-order-search]').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { page = 1; loadOrders(); }, 250);
  });
  root.querySelector('[data-order-status]').addEventListener('change', () => {
    page = 1;
    loadOrders();
  });
  pagination.addEventListener('click', (event) => {
    const button = event.target.closest('[data-order-page]');
    if (!button || button.disabled) return;
    page += button.dataset.orderPage === 'next' ? 1 : -1;
    loadOrders();
  });
  tableContainer.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-cancel-order]');
    if (!button) return;
    const reason = window.prompt('Enter a reason for cancelling this pending order:');
    if (reason === null) return;
    if (!reason.trim() || reason.trim().length > 500) {
      window.qmarketplaceApi.showToast('Enter a cancellation reason of up to 500 characters.');
      return;
    }
    button.disabled = true;
    try {
      await apiRequest(`/admin/orders/${encodeURIComponent(button.dataset.cancelOrder)}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() })
      });
      await loadOrders();
    } catch (error) {
      showError(error);
      button.disabled = false;
    }
  });
  await loadOrders();
}

async function renderUsers(root, apiRequest, escapeHtml, showError) {
  root.innerHTML = `<header class="admin-page-head"><div><span class="badge">Accounts</span><h1>Users</h1><p>Search accounts, change roles, or suspend access. Password hashes are never included.</p></div></header>
    <section class="admin-panel" aria-label="User filters"><div class="admin-form-grid">
      <label class="field">Search<input class="input" type="search" data-user-search placeholder="Name or email" /></label>
      <label class="field">Role<select class="select" data-user-role-filter><option value="">All roles</option><option value="student">Student</option><option value="admin">Admin</option></select></label>
      <label class="field">Status<select class="select" data-user-status-filter><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
    </div></section>
    <div data-user-table></div>
    <nav class="pagination" aria-label="User result pages" data-user-pagination></nav>`;
  const tableContainer = root.querySelector('[data-user-table]');
  const pagination = root.querySelector('[data-user-pagination]');
  let page = 1;
  let pageCount = 1;
  let sequence = 0;
  const loadUsers = async () => {
    const current = ++sequence;
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    const query = root.querySelector('[data-user-search]').value.trim();
    const role = root.querySelector('[data-user-role-filter]').value;
    const userStatus = root.querySelector('[data-user-status-filter]').value;
    if (query) params.set('q', query);
    if (role) params.set('role', role);
    if (userStatus) params.set('status', userStatus);
    try {
      const result = await apiRequest(`/admin/users?${params}`);
      if (current !== sequence) return;
      pageCount = result.pageCount;
      tableContainer.innerHTML = result.items.length ? table(
        ['Name', 'Email', 'Role', 'Status', 'Orders', 'Created', 'Actions'],
        result.items.map((user) => [
          escapeHtml(`${user.firstName} ${user.lastName}`),
          escapeHtml(user.email),
          `<select class="select" aria-label="Role for ${escapeHtml(user.email)}" data-user-role="${escapeHtml(user.id)}"><option value="student" ${user.role === 'student' ? 'selected' : ''}>Student</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option></select>`,
          `<select class="select" aria-label="Status for ${escapeHtml(user.email)}" data-user-status="${escapeHtml(user.id)}"><option value="active" ${user.status === 'active' ? 'selected' : ''}>Active</option><option value="suspended" ${user.status === 'suspended' ? 'selected' : ''}>Suspended</option></select>`,
          String(user._count.orders),
          escapeHtml(new Date(user.createdAt).toLocaleDateString()),
          `<button class="btn btn-secondary" type="button" data-save-user="${escapeHtml(user.id)}">Save</button>`
        ])
      ) : '<div class="empty-state"><p>No accounts match these filters.</p></div>';
      pagination.innerHTML = `<button class="btn btn-secondary" type="button" data-user-page="prev" ${page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${page} of ${pageCount} · ${result.total} users</span><button class="btn btn-secondary" type="button" data-user-page="next" ${page >= pageCount ? 'disabled' : ''}>Next</button>`;
    } catch (error) {
      showError(error);
    }
  };
  let searchTimer;
  root.querySelector('[data-user-search]').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { page = 1; loadUsers(); }, 250);
  });
  root.querySelector('[data-user-role-filter]').addEventListener('change', () => { page = 1; loadUsers(); });
  root.querySelector('[data-user-status-filter]').addEventListener('change', () => { page = 1; loadUsers(); });
  pagination.addEventListener('click', (event) => {
    const button = event.target.closest('[data-user-page]');
    if (!button || button.disabled) return;
    page += button.dataset.userPage === 'next' ? 1 : -1;
    loadUsers();
  });
  tableContainer.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-save-user]');
    if (!button) return;
    const userId = button.dataset.saveUser;
    const row = button.closest('tr');
    const role = row.querySelector('[data-user-role]').value;
    const userStatus = row.querySelector('[data-user-status]').value;
    const change = userStatus === 'suspended'
      ? 'Suspend this account? The user will lose access immediately.'
      : role === 'admin'
        ? 'Grant administrator access to this account?'
        : 'Save these account role and status changes?';
    if (!window.confirm(change)) return;
    button.disabled = true;
    try {
      await apiRequest(`/admin/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ role, status: userStatus })
      });
      window.qmarketplaceApi.showToast('Account updated.');
      await loadUsers();
    } catch (error) {
      showError(error);
      button.disabled = false;
    }
  });
  await loadUsers();
}

async function renderUniversities(root, apiRequest, escapeHtml) {
  const universities = await apiRequest('/admin/universities');
  root.innerHTML = `<header class="admin-page-head"><div><span class="badge">Catalog</span><h1>Universities</h1><p>Create and update institutions. Deletion is blocked while courses or materials reference a university.</p></div></header>
    <form class="admin-panel admin-form" data-create-university>
      <h2>Add university</h2><div class="admin-form-grid">
        <label class="field">Name<input class="input" name="name" maxlength="160" required /></label>
        <label class="field">Location<input class="input" name="location" maxlength="160" placeholder="City, state, country" required /></label>
      </div>
      <label class="field">Description<textarea class="input" name="description" maxlength="3000" rows="3" required></textarea></label>
      <p class="form-message" data-create-message role="alert"></p>
      <button class="btn btn-primary" type="submit">Add university</button>
    </form>
    <label class="field">Search universities<input class="input" type="search" data-university-search /></label>
    <div data-university-table></div>
    <dialog class="admin-dialog" data-university-dialog aria-labelledby="edit-university-title">
      <form data-university-edit><h2 id="edit-university-title">Edit university</h2><input type="hidden" name="id" />
        <label class="field">Name<input class="input" name="name" maxlength="160" required /></label>
        <label class="field">URL slug<input class="input" name="slug" maxlength="120" required /></label>
        <label class="field">Location<input class="input" name="location" maxlength="160" required /></label>
        <label class="field">Description<textarea class="input" name="description" maxlength="3000" rows="4" required></textarea></label>
        <p class="form-message" data-edit-message role="alert"></p>
        <div class="dialog-actions"><button class="btn btn-secondary" type="button" data-close-university>Cancel</button><button class="btn btn-primary" type="submit">Save changes</button></div>
      </form>
    </dialog>`;
  const tableContainer = root.querySelector('[data-university-table]');
  const renderRows = (query = '') => {
    const filtered = universities.filter((item) => `${item.name} ${item.location} ${item.slug}`.toLowerCase().includes(query.toLowerCase()));
    tableContainer.innerHTML = filtered.length ? table(
      ['Name', 'Location', 'Slug', 'Courses', 'Materials', 'Actions'],
      filtered.map((item) => [
        escapeHtml(item.name), escapeHtml(item.location || '—'), escapeHtml(item.slug),
        String(item._count.courses), String(item._count.materials),
        `<div class="admin-actions"><button class="btn btn-secondary" type="button" data-edit-university="${escapeHtml(item.id)}">Edit</button><button class="btn btn-outline" type="button" data-delete-university="${escapeHtml(item.id)}">Delete</button></div>`
      ])
    ) : '<div class="empty-state"><p>No universities match this search.</p></div>';
  };
  renderRows();
  root.querySelector('[data-university-search]').addEventListener('input', (event) => renderRows(event.target.value));
  root.querySelector('[data-close-university]').addEventListener('click', () => root.querySelector('[data-university-dialog]').close());
  root.querySelector('[data-create-university]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const message = form.querySelector('[data-create-message]');
    submit.disabled = true;
    try {
      await apiRequest('/admin/universities', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      window.location.reload();
    } catch (error) {
      message.textContent = error.message;
      submit.disabled = false;
    }
  });
  const editForm = root.querySelector('[data-university-edit]');
  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(editForm));
    const id = payload.id;
    delete payload.id;
    const submit = editForm.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await apiRequest(`/admin/universities/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
      window.location.reload();
    } catch (error) {
      editForm.querySelector('[data-edit-message]').textContent = error.message;
      submit.disabled = false;
    }
  });
  root.addEventListener('click', async (event) => {
    const editButton = event.target.closest('[data-edit-university]');
    const deleteButton = event.target.closest('[data-delete-university]');
    if (editButton) {
      const university = universities.find((item) => item.id === editButton.dataset.editUniversity);
      if (!university) return;
      for (const [key, value] of Object.entries({ id: university.id, name: university.name, slug: university.slug, location: university.location, description: university.description })) {
        editForm.elements.namedItem(key).value = value || '';
      }
      editForm.querySelector('[data-edit-message]').textContent = '';
      root.querySelector('[data-university-dialog]').showModal();
    }
    if (deleteButton && window.confirm('Delete this university? This is allowed only when it has no courses or materials.')) {
      deleteButton.disabled = true;
      try {
        await apiRequest(`/admin/universities/${encodeURIComponent(deleteButton.dataset.deleteUniversity)}`, { method: 'DELETE' });
        window.location.reload();
      } catch (error) {
        window.qmarketplaceApi.showToast(error.message);
        deleteButton.disabled = false;
      }
    }
  });
}

async function renderCourses(root, apiRequest, escapeHtml) {
  const [courses, universities] = await Promise.all([apiRequest('/admin/courses'), apiRequest('/admin/universities')]);
  root.innerHTML = `<header class="admin-page-head"><div><span class="badge">Catalog</span><h1>Courses</h1><p>Create and edit courses. Courses with associated materials cannot be deleted.</p></div></header>
    <form class="admin-panel admin-form" data-create-course>
      <h2>Add course</h2><div class="admin-form-grid">
        <label class="field">Title<input class="input" name="title" maxlength="160" required /></label>
        <label class="field">Code<input class="input" name="code" maxlength="40" required /></label>
        <label class="field">University<select class="select" name="universityId" required><option value="">Choose university</option>${universities.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}</select></label>
        <label class="field">Level<input class="input" name="level" maxlength="80" required /></label>
        <label class="field">Semester (optional)<input class="input" name="semester" maxlength="80" /></label>
      </div>
      <label class="field">Description<textarea class="input" name="description" maxlength="3000" rows="3" required></textarea></label>
      <p class="form-message" data-create-message role="alert"></p><button class="btn btn-primary" type="submit">Add course</button>
    </form>
    <div class="admin-form-grid">
      <label class="field">Search courses<input class="input" type="search" data-course-search /></label>
      <label class="field">University<select class="select" data-course-university><option value="">All universities</option>${universities.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}</select></label>
    </div>
    <div data-course-table></div>
    <dialog class="admin-dialog" data-course-dialog aria-labelledby="edit-course-title"><form data-course-edit>
      <h2 id="edit-course-title">Edit course</h2><input type="hidden" name="id" />
      <label class="field">Title<input class="input" name="title" maxlength="160" required /></label>
      <label class="field">Code<input class="input" name="code" maxlength="40" required /></label>
      <label class="field">University<select class="select" name="universityId" required><option value="">Choose university</option>${universities.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}</select></label>
      <label class="field">Level<input class="input" name="level" maxlength="80" required /></label>
      <label class="field">Semester<input class="input" name="semester" maxlength="80" /></label>
      <label class="field">Description<textarea class="input" name="description" maxlength="3000" rows="4" required></textarea></label>
      <p class="form-message" data-edit-message role="alert"></p>
      <div class="dialog-actions"><button class="btn btn-secondary" type="button" data-close-course>Cancel</button><button class="btn btn-primary" type="submit">Save changes</button></div>
    </form></dialog>`;
  const tableContainer = root.querySelector('[data-course-table]');
  let filteredCourses = courses;
  const renderRows = () => {
    tableContainer.innerHTML = filteredCourses.length ? table(
      ['Course', 'Code', 'University', 'Level', 'Materials', 'Actions'],
      filteredCourses.map((course) => [
        escapeHtml(course.title), escapeHtml(course.code), escapeHtml(course.university?.name || '—'),
        escapeHtml(course.level || '—'), String(course._count.materials),
        `<div class="admin-actions"><button class="btn btn-secondary" type="button" data-edit-course="${escapeHtml(course.id)}">Edit</button><button class="btn btn-outline" type="button" data-delete-course="${escapeHtml(course.id)}">Delete</button></div>`
      ])
    ) : '<div class="empty-state"><p>No courses match these filters.</p></div>';
  };
  const loadCourses = async () => {
    const params = new URLSearchParams();
    const query = root.querySelector('[data-course-search]').value.trim();
    const universityId = root.querySelector('[data-course-university]').value;
    if (query) params.set('q', query);
    if (universityId) params.set('universityId', universityId);
    try {
      filteredCourses = await apiRequest(`/admin/courses?${params}`);
      renderRows();
    } catch (error) {
      window.qmarketplaceApi.showToast(error.message);
    }
  };
  let searchTimer;
  root.querySelector('[data-course-search]').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadCourses, 250);
  });
  root.querySelector('[data-course-university]').addEventListener('change', loadCourses);
  root.querySelector('[data-close-course]').addEventListener('click', () => root.querySelector('[data-course-dialog]').close());
  root.querySelector('[data-create-course]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await apiRequest('/admin/courses', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      window.location.reload();
    } catch (error) {
      form.querySelector('[data-create-message]').textContent = error.message;
      submit.disabled = false;
    }
  });
  const editForm = root.querySelector('[data-course-edit]');
  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(editForm));
    const id = payload.id;
    delete payload.id;
    const submit = editForm.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await apiRequest(`/admin/courses/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
      window.location.reload();
    } catch (error) {
      editForm.querySelector('[data-edit-message]').textContent = error.message;
      submit.disabled = false;
    }
  });
  root.addEventListener('click', async (event) => {
    const editButton = event.target.closest('[data-edit-course]');
    const deleteButton = event.target.closest('[data-delete-course]');
    if (editButton) {
      const course = filteredCourses.find((item) => item.id === editButton.dataset.editCourse);
      if (!course) return;
      for (const [key, value] of Object.entries({ id: course.id, title: course.title, code: course.code, universityId: course.universityId, level: course.level, semester: course.semester || '', description: course.description })) {
        editForm.elements.namedItem(key).value = value || '';
      }
      editForm.querySelector('[data-edit-message]').textContent = '';
      root.querySelector('[data-course-dialog]').showModal();
    }
    if (deleteButton && window.confirm('Delete this course? This is allowed only when it has no associated materials.')) {
      deleteButton.disabled = true;
      try {
        await apiRequest(`/admin/courses/${encodeURIComponent(deleteButton.dataset.deleteCourse)}`, { method: 'DELETE' });
        await loadCourses();
      } catch (error) {
        window.qmarketplaceApi.showToast(error.message);
        deleteButton.disabled = false;
      }
    }
  });
  renderRows();
}

async function renderSettings(root, apiRequest, escapeHtml) {
  const status = await apiRequest('/admin/status');
  const items = [
    ['PostgreSQL', status.databaseConfigured],
    ['PayPal', status.paypalConfigured],
    ['Private R2 storage', status.storageConfigured]
  ];
  root.innerHTML = `<header class="admin-page-head"><div><span class="badge">Configuration</span><h1>Service settings</h1><p>Readiness indicators only; secret values are never exposed here.</p></div></header>
    <div class="service-status">${items.map(([name, ready]) => `<span data-ready="${Boolean(ready)}">${escapeHtml(name)}: ${ready ? 'Configured' : 'Not configured'}</span>`).join('')}</div>
    <section class="admin-panel"><h2>Setup checklist</h2><p>Set service credentials as deployment environment variables. Apply Prisma migrations before using database-backed administration. Use PayPal sandbox credentials to test the complete capture flow.</p></section>`;
}

async function renderContactQueries(root, apiRequest, escapeHtml, showError) {
  root.innerHTML = `<header class="admin-page-head"><div><span class="badge">Support</span><h1>Contact queries</h1><p>Review messages submitted through the public contact form. No email reply is sent by this interface.</p></div></header>
    <div class="admin-form-grid">
      <label class="field">Search<input class="input" type="search" data-contact-search placeholder="Name, email, subject, or message" /></label>
      <label class="field">Status<select class="select" data-contact-status><option value="">All statuses</option><option value="new">New</option><option value="read">Read</option><option value="in_progress">In progress</option><option value="replied">Replied</option><option value="closed">Closed</option></select></label>
    </div>
    <div data-contact-table></div>
    <dialog class="admin-dialog" data-contact-dialog aria-labelledby="contact-query-title"><form data-contact-edit>
      <h2 id="contact-query-title">Contact message</h2>
      <p><strong data-contact-name></strong> · <a data-contact-email></a></p>
      <p><strong>Subject:</strong> <span data-contact-subject></span></p>
      <p data-contact-body></p>
      <input type="hidden" name="id" />
      <label class="field">Status<select class="select" name="status"><option value="new">New</option><option value="read">Read</option><option value="in_progress">In progress</option><option value="replied">Replied</option><option value="closed">Closed</option></select></label>
      <label class="field">Internal notes<textarea class="input" name="internalNotes" maxlength="5000" rows="4"></textarea></label>
      <p class="form-message" data-contact-error role="alert"></p>
      <div class="dialog-actions"><button class="btn btn-secondary" type="button" data-close-contact>Close</button><button class="btn btn-primary" type="submit">Save update</button></div>
    </form></dialog>`;
  const tableContainer = root.querySelector('[data-contact-table]');
  const dialog = root.querySelector('[data-contact-dialog]');
  const form = root.querySelector('[data-contact-edit]');
  let queries = [];
  let sequence = 0;
  const loadQueries = async () => {
    const current = ++sequence;
    const params = new URLSearchParams();
    const query = root.querySelector('[data-contact-search]').value.trim();
    const statusFilter = root.querySelector('[data-contact-status]').value;
    if (query) params.set('q', query);
    if (statusFilter) params.set('status', statusFilter);
    tableContainer.innerHTML = '<div class="loading-state">Loading contact messages...</div>';
    try {
      const result = await apiRequest(`/admin/contact-queries?${params}`);
      if (current !== sequence) return;
      queries = result;
      tableContainer.innerHTML = result.length ? table(
        ['Sender', 'Subject', 'Submitted', 'Status', 'Actions'],
        result.map((item) => [
          `${escapeHtml(item.name)}<br /><small>${escapeHtml(item.email)}</small>`,
          escapeHtml(item.subject),
          escapeHtml(new Date(item.createdAt).toLocaleString()),
          status(item.status, escapeHtml),
          `<button class="btn btn-secondary" type="button" data-open-contact="${escapeHtml(item.id)}">Review</button>`
        ])
      ) : '<div class="empty-state"><p>No contact messages match these filters.</p></div>';
    } catch (error) {
      if (current !== sequence) return;
      tableContainer.innerHTML = '<div class="empty-state"><p>Could not load contact messages.</p></div>';
      showError(error);
    }
  };
  let timer;
  root.querySelector('[data-contact-search]').addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(loadQueries, 250);
  });
  root.querySelector('[data-contact-status]').addEventListener('change', loadQueries);
  root.querySelector('[data-close-contact]').addEventListener('click', () => dialog.close());
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-open-contact]');
    if (!button) return;
    const item = queries.find((query) => query.id === button.dataset.openContact);
    if (!item) return;
    root.querySelector('[data-contact-name]').textContent = item.name;
    const emailLink = root.querySelector('[data-contact-email]');
    emailLink.textContent = item.email;
    emailLink.href = `mailto:${encodeURIComponent(item.email)}`;
    root.querySelector('[data-contact-subject]').textContent = item.subject;
    root.querySelector('[data-contact-body]').textContent = item.message;
    form.elements.id.value = item.id;
    form.elements.status.value = item.status;
    form.elements.internalNotes.value = item.internalNotes || '';
    form.querySelector('[data-contact-error]').textContent = '';
    dialog.showModal();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    const id = form.elements.id.value;
    try {
      await apiRequest(`/admin/contact-queries/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: form.elements.status.value, internalNotes: form.elements.internalNotes.value })
      });
      dialog.close();
      await loadQueries();
    } catch (error) {
      form.querySelector('[data-contact-error]').textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
  await loadQueries();
}

function status(value, escapeHtml) {
  const safe = escapeHtml(value || 'unknown');
  return `<span class="status-pill" data-status="${safe}">${safe}</span>`;
}

function table(headers, rows) {
  return `<div class="admin-table-wrap"><table class="table admin-table"><thead><tr>${headers.map((header) => `<th scope="col">${header}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}