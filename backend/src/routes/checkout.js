const express = require('express');
const { authRequired } = require('../middleware/auth');
const { capturePayPalCheckout, createPayPalCheckout } = require('../services/paypalService');

const router = express.Router();

router.post('/create-order', authRequired, async (req, res, next) => {
  try {
    const { materialId } = req.body;
    if (typeof materialId !== 'string' || !materialId.trim()) {
      return res.status(400).json({ message: 'A material ID is required.' });
    }
    const checkout = await createPayPalCheckout({ userId: req.user.id, materialId: materialId.trim() });
    return res.status(201).json(checkout);
  } catch (error) {
    return next(error);
  }
});

router.post('/verify', authRequired, async (req, res, next) => {
  try {
    const paymentId = typeof req.body.paymentId === 'string' ? req.body.paymentId.trim() : '';
    if (!paymentId) {
      return res.status(400).json({ message: 'A PayPal order ID is required.' });
    }
    const result = await capturePayPalCheckout({ userId: req.user.id, paymentId });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
