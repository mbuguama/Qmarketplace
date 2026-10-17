document.addEventListener('DOMContentLoaded', async () => {
  const result = document.querySelector('[data-payment-result]');
  const paymentId = new URLSearchParams(window.location.search).get('token');
  const { apiRequest, escapeHtml, getCurrentUser } = window.qmarketplaceApi;
  if (!result) return;
  if (!paymentId) {
    result.innerHTML = '<h1>Payment could not be verified</h1><p>PayPal did not return an order reference. Your purchase has not been marked as paid.</p><a class="btn btn-primary" href="/materials.html">Browse materials</a>';
    return;
  }
  if (!getCurrentUser()) {
    result.innerHTML = `<h1>Sign in to verify your order</h1><p>The payment return requires your account session. Sign in to continue verification.</p><a class="btn btn-primary" href="/login.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}">Sign in</a>`;
    return;
  }

  try {
    const response = await apiRequest('/checkout/verify', {
      method: 'POST',
      body: JSON.stringify({ paymentId })
    });
    if (!response.ok || response.order.status !== 'paid') throw new Error('The payment has not been confirmed.');
    result.className = 'empty-state payment-result payment-confirmed';
    result.innerHTML = `
      <span class="badge">Payment confirmed by PayPal</span>
      <h1>Your order is complete</h1>
      <p>Order <strong>${escapeHtml(response.order.id)}</strong> has been recorded.</p>
      <div class="payment-result-actions">
        <a class="btn btn-primary" href="/orders.html">View your orders</a>
        <a class="btn btn-secondary" href="/my-materials.html">My materials</a>
      </div>
    `;
  } catch (error) {
    result.className = 'empty-state payment-result';
    result.innerHTML = `
      <span class="badge">Not confirmed</span>
      <h1>We could not confirm this payment</h1>
      <p>${escapeHtml(error.message)} Your order has not been shown as paid. If PayPal charged you, contact support with the PayPal order reference.</p>
      <p class="small">Reference: ${escapeHtml(paymentId)}</p>
      <a class="btn btn-primary" href="/orders.html">View order status</a>
    `;
  }
});
