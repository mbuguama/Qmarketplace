const express = require('express');
const {
  getUniversities,
  getCourses,
  getMaterials,
  getMaterialPage,
  getMaterialById,
  getMaterialPreviewKey,
  searchCatalog,
  getAdminOverview
} = require('../services/dataService');
const { adminRequired, authRequired } = require('../middleware/auth');
const { getPrivateObjectBuffer, pipePrivateObject } = require('../services/storageService');
const { renderPreviewPage } = require('../services/pdfProcessingService');
const { getPublicSiteOrigin } = require('../utils/siteUrl');

const router = express.Router();

function getRequestSiteOrigin(req) {
  return getPublicSiteOrigin() || `${req.protocol}://${req.get('host')}`;
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;'
  })[character]);
}

router.get('/robots.txt', (req, res, next) => {
  try {
    const origin = getRequestSiteOrigin(req);
    res.type('text/plain').send([
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin/',
      'Disallow: /api/',
      `Sitemap: ${origin}/sitemap.xml`,
      ''
    ].join('\n'));
  } catch (error) {
    next(error);
  }
});

router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const origin = getRequestSiteOrigin(req);
    const staticPaths = [
      '/',
      '/materials.html',
      '/universities.html',
      '/courses.html',
      '/about.html',
      '/faq.html',
      '/contact.html',
      '/privacy.html',
      '/terms.html',
      '/refund-policy.html',
      '/copyright-policy.html'
    ];
    const materials = await getMaterials();
    const entries = staticPaths.map((pathname) => ({ url: new URL(pathname, origin).href }));
    materials.filter((material) => material.hasPreview).forEach((material) => {
      const detailUrl = new URL('/material-details.html', origin);
      detailUrl.searchParams.set('id', material.id);
      entries.push({ url: detailUrl.href, lastModified: material.createdAt });
    });
    const urls = entries.map(({ url, lastModified }) => {
      const lastmod = lastModified && Number.isFinite(new Date(lastModified).getTime())
        ? `<lastmod>${new Date(lastModified).toISOString()}</lastmod>`
        : '';
      return `<url><loc>${escapeXml(url)}</loc>${lastmod}</url>`;
    }).join('');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
  } catch (error) {
    next(error);
  }
});

router.get('/universities', async (req, res, next) => {
  try {
    const items = await getUniversities();
    res.json(items);
  } catch (error) {
    next(error);
  }
});

router.get('/courses', async (req, res, next) => {
  try {
    const items = await getCourses();
    res.json(items);
  } catch (error) {
    next(error);
  }
});

router.get('/materials', async (req, res, next) => {
  try {
    if ('page' in req.query || 'limit' in req.query) {
      const pageValue = String(req.query.page || '1');
      const limitValue = String(req.query.limit || '9');
      const page = Number(pageValue);
      const pageSize = Number(limitValue);
      if (!/^[1-9]\d*$/.test(pageValue) || !/^[1-9]\d*$/.test(limitValue) ||
          page > 100000 || pageSize > 100) {
        return res.status(400).json({ message: 'Page must be positive and limit must be between 1 and 100.' });
      }
      const sort = String(req.query.sort || 'recent');
      if (!['recent', 'price-asc', 'price-desc', 'title'].includes(sort)) {
        return res.status(400).json({ message: 'Unsupported material sort order.' });
      }
      const query = String(req.query.q || '').trim();
      const type = String(req.query.type || '').trim();
      const universityId = String(req.query.universityId || '').trim();
      if (query.length > 160 || type.length > 80 || universityId.length > 128) {
        return res.status(400).json({ message: 'One or more catalog filters are too long.' });
      }
      return res.json(await getMaterialPage({ query, type, universityId, sort, page, pageSize }));
    }
    const items = await getMaterials();
    res.json(items);
  } catch (error) {
    next(error);
  }
});

router.get('/materials/:id', async (req, res, next) => {
  try {
    const item = await getMaterialById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Material not found.' });
    }
    return res.json(item);
  } catch (error) {
    return next(error);
  }
});

router.get('/materials/:id/preview', async (req, res, next) => {
  try {
    const previewKey = await getMaterialPreviewKey(req.params.id);
    if (!previewKey) return res.status(404).json({ message: 'A processed preview is not available for this material.' });
    await pipePrivateObject(previewKey, req, res);
  } catch (error) {
    return next(error);
  }
});

router.get('/materials/:id/preview/pages/:page.png', async (req, res, next) => {
  try {
    if (!/^[1-3]$/.test(req.params.page)) {
      return res.status(400).json({ message: 'Preview page must be a whole number between 1 and 3.' });
    }
    const previewKey = await getMaterialPreviewKey(req.params.id);
    if (!previewKey) {
      return res.status(404).json({ message: 'A processed preview is not available for this material.' });
    }
    const pdf = await getPrivateObjectBuffer(previewKey);
    const image = await renderPreviewPage(pdf, Number(req.params.page));
    res.type('png');
    res.setHeader('Content-Disposition', 'inline; filename="study-material-preview.png"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(image);
  } catch (error) {
    return next(error);
  }
});

router.get('/search', async (req, res, next) => {
  try {
    const items = await searchCatalog(req.query.q || '');
    res.json(items);
  } catch (error) {
    next(error);
  }
});

router.get('/admin/overview', authRequired, adminRequired, async (req, res, next) => {
  try {
    const payload = await getAdminOverview();
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
