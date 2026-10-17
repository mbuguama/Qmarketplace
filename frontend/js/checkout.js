document.addEventListener('DOMContentLoaded', async () => {
  const container = document.querySelector('[data-checkout-content]');
  const materialId = new URLSearchParams(window.location.search).get('materialId');
  const { apiRequest, escapeHtml, getCurrentUser } = window.qmarketplaceApi;
  if (!container) return;

  if (!materialId) {
    container.className = 'empty-state checkout-panel';
    container.innerHTML = '<h2>No material selected</h2><p>Choose a material before starting checkout.</p><a class="btn btn-primary" href="/materials.html">Browse materials</a>';
    return;
  }

  try {
    const material = await apiRequest(`/materials/${encodeURIComponent(materialId)}`);
    container.className = 'checkout-layout';
    const next = `/checkout.html?materialId=${encodeURIComponent(material.id)}`;
    const action = getCurrentUser()
      ? '<button class="btn btn-primary" type="button" data-checkout-button>Continue with PayPal</button>'
      : `<a class="btn btn-primary" href="/login.html?next=${encodeURIComponent(next)}">Sign in to continue</a>`;
    container.innerHTML = `
      <section class="checkout-summary">
        <span class="badge">Order summary</span>
        <h2>${escapeHtml(material.title)}</h2>
        <p>${escapeHtml(material.course?.code || material.course?.title || material.university?.name || 'Digital study material')}</p>
        <dl class="checkout-line"><div><dt>Material</dt><dd>$${Number(material.price).toFixed(2)} USD</dd></div><div><dt>Payment provider</dt><dd>PayPal</dd></div></dl>
        <div class="checkout-total"><span>Total</span><strong>$${Number(material.price).toFixed(2)} USD</strong></div>
        <p class="small">Your order is marked paid only after the server confirms the payment with PayPal.</p>
      </section>
      <section class="checkout-action">
        <h2>Payment</h2>
        <p>Continue to PayPal to review and approve this purchase.</p>
        <p class="form-message" data-checkout-message role="alert" aria-live="polite"></p>
        ${action}
        <a class="text-link checkout-back" href="/material-details.html?id=${encodeURIComponent(material.id)}">Return to material details</a>
      </section>
    `;

    const button = container.querySelector('[data-checkout-button]');
    const message = container.querySelector('[data-checkout-message]');
    button?.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = 'Connecting to PayPal...';
      message.textContent = '';
      try {
        const checkout = await apiRequest('/checkout/create-order', {
          method: 'POST',
          body: JSON.stringify({ materialId: material.id })
        });
        const approvalUrl = new URL(checkout.approvalUrl);
        if (approvalUrl.protocol !== 'https:' ||
            !['www.sandbox.paypal.com', 'www.paypal.com'].includes(approvalUrl.hostname)) {
          throw new Error('PayPal returned an unexpected approval address.');
        }
        window.location.assign(approvalUrl.href);
      } catch (error) {
        message.textContent = error.message;
        button.disabled = false;
        button.textContent = 'Continue with PayPal';
      }
    });
  } catch (error) {
    container.className = 'empty-state checkout-panel';
    container.innerHTML = `<h2>Unable to load checkout</h2><p>${escapeHtml(error.message)}</p><a class="btn btn-primary" href="/materials.html">Browse materials</a>`;
  }
});