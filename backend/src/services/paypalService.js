const {
  createPendingOrder,
  claimOrderForCapture,
  getMaterialById,
  getOrderByPaymentId,
  markOrderPaid
} = require('./dataService');
const { getPublicSiteOrigin } = require('../utils/siteUrl');

function getPayPalConfig() {
  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET } = process.env;
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    const error = new Error('Checkout is unavailable until PayPal credentials are configured.');
    error.statusCode = 503;
    throw error;
  }
  return {
    clientId: PAYPAL_CLIENT_ID,
    clientSecret: PAYPAL_CLIENT_SECRET,
    baseUrl: (process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com').replace(/\/$/, '')
  };
}

async function paypalRequest(path, options = {}) {
  const config = getPayPalConfig();
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const tokenResponse = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const tokenPayload = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenPayload.access_token) {
    const providerCode = typeof tokenPayload.error === 'string' &&
      /^[a-z0-9_.-]{1,64}$/i.test(tokenPayload.error)
      ? tokenPayload.error
      : 'unknown_error';
    const environment = config.baseUrl.includes('sandbox') ? 'sandbox' : 'live';
    const message = `PayPal rejected the configured credentials (${providerCode}). Confirm the client ID and secret belong to a ${environment} app.`;
    const error = new Error(message);
    error.statusCode = 502;
    error.publicMessage = message;
    throw error;
  }

  const response = await fetch(`${config.baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.message || 'PayPal could not process the request.');
    error.statusCode = 502;
    throw error;
  }
  return payload;
}

async function createPayPalCheckout({ userId, materialId }) {
  const material = await getMaterialById(materialId);
  if (!material) {
    const error = new Error('Material not found.');
    error.statusCode = 404;
    throw error;
  }
  if (!material.hasPreview) {
    const error = new Error('This document is not ready to sell. An administrator must finish watermark processing first.');
    error.statusCode = 409;
    throw error;
  }
  const frontendUrl = getPublicSiteOrigin() || 'http://localhost:4000';
  const paypalOrder = await paypalRequest('/v2/checkout/orders', {
    method: 'POST',
    headers: { 'PayPal-Request-Id': `qmarketplace-${userId}-${materialId}-${Date.now()}` },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: material.id,
        description: material.title.slice(0, 127),
        amount: { currency_code: 'USD', value: material.price.toFixed(2) }
      }],
      application_context: {
        brand_name: 'QMarketplace',
        user_action: 'PAY_NOW',
        return_url: `${frontendUrl}/payment-success.html`,
        cancel_url: `${frontendUrl}/payment-cancelled.html`
      }
    })
  });
  const approvalUrl = paypalOrder.links?.find((link) => link.rel === 'payer-action' || link.rel === 'approve')?.href;
  if (!paypalOrder.id || !approvalUrl) {
    const error = new Error('PayPal did not return an approval link for this payment.');
    error.statusCode = 502;
    throw error;
  }
  const order = await createPendingOrder({ userId, materialId, paymentId: paypalOrder.id });
  return { orderId: paypalOrder.id, approvalUrl, orderIdInternal: order.id };
}

async function capturePayPalCheckout({ userId, paymentId }) {
  const existingOrder = await getOrderByPaymentId(userId, paymentId);
  if (existingOrder?.status === 'paid') return { order: existingOrder, status: 'COMPLETED' };
  const pendingOrder = await claimOrderForCapture(userId, paymentId);
  if (!pendingOrder) {
    const error = new Error('No cancellable or processing order was found for this payment.');
    error.statusCode = 409;
    throw error;
  }

  const capture = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(paymentId)}/capture`, {
    method: 'POST',
    headers: { 'PayPal-Request-Id': `capture-${paymentId}` },
    body: '{}'
  });
  const captureRecord = capture.purchase_units?.flatMap((unit) => unit.payments?.captures || [])
    .find((item) => item.status === 'COMPLETED');
  const expectedAmount = Number(pendingOrder.amount ?? pendingOrder.material?.price);
  if (capture.status !== 'COMPLETED' || !captureRecord ||
      captureRecord.amount?.currency_code !== 'USD' ||
      Number(captureRecord.amount.value) !== expectedAmount) {
    const error = new Error('PayPal did not confirm a completed payment for the expected amount.');
    error.statusCode = 402;
    throw error;
  }
  const updatedOrder = await markOrderPaid(pendingOrder.id, paymentId);
  return { order: updatedOrder, status: capture.status };
}

module.exports = { capturePayPalCheckout, createPayPalCheckout };
