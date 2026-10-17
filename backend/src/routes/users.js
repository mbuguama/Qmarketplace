const express = require('express');
const { authRequired } = require('../middleware/auth');
const { getPurchasedMaterial, getUserProfile, getUserOrders } = require('../services/dataService');
const { createMaterialDownloadUrl } = require('../services/storageService');

const router = express.Router();

router.get('/profile', authRequired, async (req, res, next) => {
  try {
    const profile = await getUserProfile(req.user.id);
    if (!profile) {
      return res.status(404).json({ message: 'User not found.' });
    }
    return res.json(profile);
  } catch (error) {
    return next(error);
  }
});

router.get('/orders', authRequired, async (req, res, next) => {
  try {
    const items = await getUserOrders(req.user.id);
    return res.json(items);
  } catch (error) {
    return next(error);
  }
});

router.get('/materials/:materialId/download', authRequired, async (req, res, next) => {
  try {
    const material = await getPurchasedMaterial(req.user.id, req.params.materialId);
    if (!material) {
      return res.status(403).json({ message: 'A completed purchase is required to download this material.' });
    }
    const url = await createMaterialDownloadUrl(material);
    return res.json({ url, expiresIn: 300 });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
