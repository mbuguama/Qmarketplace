document.addEventListener('DOMContentLoaded', async () => {
  const list = document.querySelector('[data-orders-list], [data-my-materials]');
  if (!list) return;
  const { apiRequest, escapeHtml, getCurrentUser } = window.qmarketplaceApi;
  if (!getCurrentUser()) {
    const next = `${window.location.pathname}${window.location.search}`;
    list.className = 'empty-state';
    list.innerHTML = `<h2>Sign in to view your orders</h2><a class="btn btn-primary" href="/login.html?next=${encodeURIComponent(next)}">Sign in</a>`;
    return;
  }

  try {
    const allOrders = await apiRequest('/users/orders');
    const orders = list.hasAttribute('data-my-materials')
      ? allOrders.filter((order) => order.status === 'paid')
      : allOrders;
    if (!orders.length) {
      list.className = 'empty-state';
      list.innerHTML = list.hasAttribute('data-my-materials')
        ? '<h2>No materials available</h2><p>Materials become available here after payment is confirmed.</p><a class="btn btn-primary" href="/materials.html">Browse materials</a>'
        : '<h2>No purchases yet</h2><p>Completed orders will appear here.</p><a class="btn btn-primary" href="/materials.html">Browse materials</a>';
      return;
    }
    list.className = 'account-card';
    list.innerHTML = orders.map((order) => `
      <article class="list-row order-list-row">
        <div class="order-title">
          <strong>${escapeHtml(order.title)}</strong>
          <div class="small">Order ${escapeHtml(order.id)} · ${order.createdAt ? escapeHtml(new Date(order.createdAt).toLocaleDateString()) : 'Date unavailable'}</div>
        </div>
        <div class="order-status">
          <strong>$${Number(order.amount).toFixed(2)} ${escapeHtml(order.currency || 'USD')}</strong>
          <div><span class="status-pill" data-status="${escapeHtml(order.status)}">${escapeHtml(order.status)}</span></div>
        </div>
        ${order.status === 'paid'
          ? `<div class="order-download"><button class="btn btn-secondary" type="button" data-download-material="${escapeHtml(order.materialId)}">Download</button><p class="form-message" data-download-message role="status"></p></div>`
          : '<span class="small">Complete payment to access this material.</span>'}
      </article>
    `).join('');
  } catch (error) {
    list.className = 'empty-state';
    list.innerHTML = `<h2>Unable to load your orders</h2><p>${escapeHtml(error.message)}</p>`;
  }
});
