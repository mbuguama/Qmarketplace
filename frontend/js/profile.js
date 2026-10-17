document.addEventListener('DOMContentLoaded', async () => {
  const profileEl = document.querySelector('[data-profile]');
  const ordersEl = document.querySelector('[data-orders]');
  const { apiRequest, escapeHtml, getCurrentUser } = window.qmarketplaceApi;
  const user = getCurrentUser();
  if (!user) {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/login.html?next=${encodeURIComponent(next)}`;
    return;
  }

  if (profileEl) {
    const firstName = escapeHtml(user.firstName || '');
    const lastName = escapeHtml(user.lastName || '');
    profileEl.innerHTML = `
      <div class="profile-header">
        <div class="avatar" aria-hidden="true">${escapeHtml((user.firstName || 'A').charAt(0))}${escapeHtml((user.lastName || 'U').charAt(0))}</div>
        <div><h2>${firstName} ${lastName}</h2><p>${escapeHtml(user.email)}</p></div>
      </div>
      <p class="small">Account created ${user.createdAt ? escapeHtml(new Date(user.createdAt).toLocaleDateString()) : ''}</p>
      <a class="text-link" href="/orders.html">View all orders</a>
    `;
  }

  if (!ordersEl) return;
  try {
    const orders = await apiRequest('/users/orders');
    if (!orders.length) {
      ordersEl.innerHTML = '<div class="empty-state"><h3>No orders yet</h3><p>Completed purchases will appear here.</p><a class="btn btn-primary" href="/materials.html">Browse materials</a></div>';
      return;
    }
    ordersEl.innerHTML = orders.slice(0, 5).map((order) => `
      <div class="list-row">
        <div>
          <strong>${escapeHtml(order.title)}</strong>
          <div class="small">Order ${escapeHtml(order.id)} · ${order.createdAt ? escapeHtml(new Date(order.createdAt).toLocaleDateString()) : ''}</div>
        </div>
        <div>
          <strong>$${Number(order.amount || 0).toFixed(2)}</strong>
          <div class="small">${escapeHtml(order.status)}</div>
          ${order.status === 'paid' ? `<button class="btn btn-secondary" type="button" data-download-material="${escapeHtml(order.materialId)}">Download</button><p class="form-message" data-download-message role="status"></p>` : ''}
        </div>
      </div>
    `).join('');
  } catch (error) {
    ordersEl.innerHTML = `<div class="empty-state"><h3>Unable to load orders</h3><p>${escapeHtml(error.message)}</p></div>`;
  }
});
