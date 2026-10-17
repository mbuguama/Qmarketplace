const express = require('express');
const { adminRequired, authRequired } = require('../middleware/auth');
const {
  cancelAdminOrder,
  createAdminCourse,
  createAdminMaterial,
  createAdminUniversity,
  deleteAdminCourse,
  deleteAdminUniversity,
  deactivateAdminMaterial,
  getAdminCourses,
  getAdminMaterialPage,
  getAdminOrders,
  getAdminUniversities,
  getAdminUsers,
  processAdminMaterial,
  updateAdminCourse,
  updateAdminUniversity,
  updateAdminUser,
  updateAdminMaterial
} = require('../services/adminService');
const { getAdminContactQueries, updateAdminContactQuery } = require('../services/contactService');
const { createMaterialUploadUrl } = require('../services/storageService');

const router = express.Router();
router.use(authRequired, adminRequired);

router.get('/status', (req, res) => {
  res.json({
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    paypalConfigured: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
    storageConfigured: Boolean(
      process.env.R2_ENDPOINT &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET
    )
  });
});

function requiredString(value, field, maxLength = 160) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    const error = new Error(`${field} is required and must be at most ${maxLength} characters.`);
    error.statusCode = 400;
    throw error;
  }
  return value.trim();
}

function materialPayload(body) {
  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0 || price > 10000) {
    const error = new Error('Price must be a valid amount between 0 and 10000.');
    error.statusCode = 400;
    throw error;
  }
  return {
    title: requiredString(body.title, 'Title'),
    type: requiredString(body.type, 'Type', 80),
    description: requiredString(body.description, 'Description', 5000),
    price,
    academicYear: typeof body.academicYear === 'string' && body.academicYear.trim()
      ? body.academicYear.trim().slice(0, 32)
      : null,
    featured: body.featured === true,
    universityId: requiredString(body.universityId, 'University'),
    courseId: typeof body.courseId === 'string' && body.courseId.trim() ? body.courseId.trim() : null
  };
}

function universityPayload(body, partial = false) {
  const payload = {};
  if (!partial || body.name !== undefined) {
    payload.name = requiredString(body.name, 'Name', 160);
    payload.slug = typeof body.slug === 'string' && body.slug.trim()
      ? body.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 120)
      : payload.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
    if (!payload.slug) {
      const error = new Error('Enter a name that can be used to create a URL slug.');
      error.statusCode = 400;
      throw error;
    }
  } else if (body.slug !== undefined) {
    payload.slug = requiredString(body.slug, 'Slug', 120).toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  }
  if (!partial || body.location !== undefined) payload.location = requiredString(body.location, 'Location', 160);
  if (!partial || body.description !== undefined) payload.description = requiredString(body.description, 'Description', 3000);
  if (body.logoUrl !== undefined) {
    const logoUrl = String(body.logoUrl).trim();
    if (logoUrl) {
      try {
        if (new URL(logoUrl).protocol !== 'https:') throw new Error();
      } catch {
        const error = new Error('Logo URL must be a valid HTTPS URL.');
        error.statusCode = 400;
        throw error;
      }
      payload.logoUrl = logoUrl;
    } else payload.logoUrl = null;
  }
  return payload;
}

function coursePayload(body, partial = false) {
  const payload = {};
  if (!partial || body.title !== undefined) payload.title = requiredString(body.title, 'Title', 160);
  if (!partial || body.code !== undefined) payload.code = requiredString(body.code, 'Course code', 40).toUpperCase();
  if (!partial || body.description !== undefined) payload.description = requiredString(body.description, 'Description', 3000);
  if (!partial || body.level !== undefined) payload.level = requiredString(body.level, 'Level', 80);
  if (!partial || body.universityId !== undefined) payload.universityId = requiredString(body.universityId, 'University', 128);
  if (body.semester !== undefined) {
    payload.semester = typeof body.semester === 'string' && body.semester.trim()
      ? body.semester.trim().slice(0, 80)
      : null;
  } else if (!partial) payload.semester = null;
  return payload;
}

router.get('/materials', async (req, res, next) => {
  try {
    const pageValue = String(req.query.page || '1');
    const pageSizeValue = String(req.query.pageSize || '20');
    const page = Number(pageValue);
    const pageSize = Number(pageSizeValue);
    const query = String(req.query.q || '').trim();
    const type = String(req.query.type || '').trim();
    const status = String(req.query.status || '').trim();
    const universityId = String(req.query.universityId || '').trim();
    const courseId = String(req.query.courseId || '').trim();
    const sort = String(req.query.sort || 'recent');
    const minPriceText = String(req.query.minPrice || '').trim();
    const maxPriceText = String(req.query.maxPrice || '').trim();
    const fromText = String(req.query.from || '').trim();
    const toText = String(req.query.to || '').trim();
    const minPrice = minPriceText ? Number(minPriceText) : undefined;
    const maxPrice = maxPriceText ? Number(maxPriceText) : undefined;
    const from = fromText ? new Date(fromText) : undefined;
    const to = toText ? new Date(toText) : undefined;
    if (!/^[1-9]\d*$/.test(pageValue) || page > 100000 ||
        !/^[1-9]\d*$/.test(pageSizeValue) || pageSize > 100) {
      return res.status(400).json({ message: 'Page must be positive and pageSize must be between 1 and 100.' });
    }
    if (query.length > 160 || type.length > 80 || status.length > 32 ||
        universityId.length > 128 || courseId.length > 128 ||
        !['recent', 'price-asc', 'price-desc', 'title'].includes(sort)) {
      return res.status(400).json({ message: 'One or more material filters are invalid.' });
    }
    if (status && !['active', 'inactive', 'draft', 'archived'].includes(status)) {
      return res.status(400).json({ message: 'Unsupported material status.' });
    }
    if ((minPriceText && (!Number.isFinite(minPrice) || minPrice < 0)) ||
        (maxPriceText && (!Number.isFinite(maxPrice) || maxPrice < 0)) ||
        (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice)) {
      return res.status(400).json({ message: 'Enter a valid minimum and maximum price range.' });
    }
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) ||
        (from && to && from > to)) {
      return res.status(400).json({ message: 'Enter a valid upload date range.' });
    }
    return res.json(await getAdminMaterialPage({
      query, type, status, universityId, courseId, minPrice, maxPrice, from, to, sort, page, pageSize
    }));
  } catch (error) {
    return next(error);
  }
});

router.post('/materials/upload-url', async (req, res, next) => {
  try {
    const { contentType, size } = req.body || {};
    if (contentType !== 'application/pdf' || !Number.isInteger(size) || size < 1 || size > 20 * 1024 * 1024) {
      return res.status(400).json({ message: 'Upload a PDF file no larger than 20 MB.' });
    }
    return res.json(await createMaterialUploadUrl());
  } catch (error) {
    return next(error);
  }
});

router.post('/materials', async (req, res, next) => {
  try {
    const data = materialPayload(req.body || {});
    data.uploadKey = requiredString(req.body.uploadKey, 'Uploaded file reference', 160);
    data.actorId = req.user.id;
    return res.status(201).json(await createAdminMaterial(data));
  } catch (error) {
    return next(error);
  }
});

router.post('/materials/:id/process', async (req, res, next) => {
  try {
    return res.json(await processAdminMaterial(req.params.id));
  } catch (error) {
    return next(error);
  }
});

router.patch('/materials/:id', async (req, res, next) => {
  try {
    const body = req.body || {};
    const update = {};
    if (body.title !== undefined) update.title = requiredString(body.title, 'Title');
    if (body.type !== undefined) update.type = requiredString(body.type, 'Type', 80);
    if (body.description !== undefined) update.description = requiredString(body.description, 'Description', 5000);
    if (body.price !== undefined) {
      const price = Number(body.price);
      if (!Number.isFinite(price) || price < 0 || price > 10000) return res.status(400).json({ message: 'Price must be between 0 and 10000.' });
      update.price = price;
    }
    if (body.academicYear !== undefined) update.academicYear = body.academicYear ? String(body.academicYear).trim().slice(0, 32) : null;
    if (body.featured !== undefined) {
      if (typeof body.featured !== 'boolean') return res.status(400).json({ message: 'Featured must be true or false.' });
      update.featured = body.featured;
    }
    if (body.status !== undefined) {
      if (!['active', 'inactive'].includes(body.status)) return res.status(400).json({ message: 'Status must be active or inactive.' });
      update.status = body.status;
    }
    if (!Object.keys(update).length) return res.status(400).json({ message: 'Provide at least one supported field to update.' });
    return res.json(await updateAdminMaterial(req.params.id, update));
  } catch (error) {
    return next(error);
  }
});

router.delete('/materials/:id', async (req, res, next) => {
  try {
    return res.json(await deactivateAdminMaterial(req.params.id));
  } catch (error) {
    return next(error);
  }
});

router.get('/universities', async (req, res, next) => {
  try {
    return res.json(await getAdminUniversities());
  } catch (error) {
    return next(error);
  }
});

router.post('/universities', async (req, res, next) => {
  try {
    return res.status(201).json(await createAdminUniversity(universityPayload(req.body || {})));
  } catch (error) {
    return next(error);
  }
});

router.patch('/universities/:id', async (req, res, next) => {
  try {
    const input = universityPayload(req.body || {}, true);
    if (!Object.keys(input).length) return res.status(400).json({ message: 'Provide at least one university field to update.' });
    return res.json(await updateAdminUniversity(req.params.id, input));
  } catch (error) {
    return next(error);
  }
});

router.delete('/universities/:id', async (req, res, next) => {
  try {
    return res.json(await deleteAdminUniversity(req.params.id));
  } catch (error) {
    return next(error);
  }
});

router.get('/courses', async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim();
    const universityId = String(req.query.universityId || '').trim();
    if (query.length > 160 || universityId.length > 128) {
      return res.status(400).json({ message: 'One or more course filters are too long.' });
    }
    return res.json(await getAdminCourses({ query, universityId }));
  } catch (error) {
    return next(error);
  }
});

router.post('/courses', async (req, res, next) => {
  try {
    return res.status(201).json(await createAdminCourse(coursePayload(req.body || {})));
  } catch (error) {
    return next(error);
  }
});

router.patch('/courses/:id', async (req, res, next) => {
  try {
    const input = coursePayload(req.body || {}, true);
    if (!Object.keys(input).length) return res.status(400).json({ message: 'Provide at least one course field to update.' });
    return res.json(await updateAdminCourse(req.params.id, input));
  } catch (error) {
    return next(error);
  }
});

router.delete('/courses/:id', async (req, res, next) => {
  try {
    return res.json(await deleteAdminCourse(req.params.id));
  } catch (error) {
    return next(error);
  }
});

router.get('/contact-queries', async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim();
    const status = String(req.query.status || '').trim();
    if (query.length > 160 || (status && !['new', 'read', 'in_progress', 'replied', 'closed'].includes(status))) {
      return res.status(400).json({ message: 'One or more contact query filters are invalid.' });
    }
    return res.json(await getAdminContactQueries({ query, status }));
  } catch (error) {
    return next(error);
  }
});

router.patch('/contact-queries/:id', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (body.status !== undefined && !['new', 'read', 'in_progress', 'replied', 'closed'].includes(body.status)) {
      return res.status(400).json({ message: 'Unsupported contact query status.' });
    }
    if (body.internalNotes !== undefined &&
        (typeof body.internalNotes !== 'string' || body.internalNotes.length > 5000)) {
      return res.status(400).json({ message: 'Internal notes must be 5000 characters or fewer.' });
    }
    if (body.status === undefined && body.internalNotes === undefined) {
      return res.status(400).json({ message: 'Provide a status or internal note to update.' });
    }
    return res.json(await updateAdminContactQuery({
      id: req.params.id,
      status: body.status,
      internalNotes: body.internalNotes,
      actorId: req.user.id
    }));
  } catch (error) {
    return next(error);
  }
});

router.get('/orders', async (req, res, next) => {
  try {
    const pageValue = String(req.query.page || '1');
    const pageSizeValue = String(req.query.pageSize || '50');
    const page = Number(pageValue);
    const pageSize = Number(pageSizeValue);
    const query = String(req.query.q || '').trim();
    const status = String(req.query.status || '').trim();
    if (!/^[1-9]\d*$/.test(pageValue) || page > 100000 ||
        !/^[1-9]\d*$/.test(pageSizeValue) || pageSize > 100 ||
        query.length > 160 ||
        (status && !['pending', 'processing', 'paid', 'cancelled', 'failed'].includes(status))) {
      return res.status(400).json({ message: 'One or more order filters are invalid.' });
    }
    return res.json(await getAdminOrders({ query, status, page, pageSize }));
  } catch (error) {
    return next(error);
  }
});

router.post('/orders/:id/cancel', async (req, res, next) => {
  try {
    const reason = requiredString(req.body?.reason, 'Cancellation reason', 500);
    return res.json(await cancelAdminOrder({ id: req.params.id, reason, actorId: req.user.id }));
  } catch (error) {
    return next(error);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    const pageValue = String(req.query.page || '1');
    const pageSizeValue = String(req.query.pageSize || '50');
    const page = Number(pageValue);
    const pageSize = Number(pageSizeValue);
    const query = String(req.query.q || '').trim();
    const role = String(req.query.role || '').trim();
    const status = String(req.query.status || '').trim();
    if (!/^[1-9]\d*$/.test(pageValue) || page > 100000 ||
        !/^[1-9]\d*$/.test(pageSizeValue) || pageSize > 100 ||
        query.length > 160 ||
        (role && !['student', 'admin'].includes(role)) ||
        (status && !['active', 'suspended'].includes(status))) {
      return res.status(400).json({ message: 'One or more user filters are invalid.' });
    }
    return res.json(await getAdminUsers({ query, role, status, page, pageSize }));
  } catch (error) {
    return next(error);
  }
});

router.patch('/users/:id', async (req, res, next) => {
  try {
    const body = req.body || {};
    const input = {};
    if (body.firstName !== undefined) input.firstName = requiredString(body.firstName, 'First name', 80);
    if (body.lastName !== undefined) input.lastName = requiredString(body.lastName, 'Last name', 80);
    if (body.role !== undefined) {
      if (!['student', 'admin'].includes(body.role)) return res.status(400).json({ message: 'Role must be student or admin.' });
      input.role = body.role;
    }
    if (body.status !== undefined) {
      if (!['active', 'suspended'].includes(body.status)) return res.status(400).json({ message: 'Status must be active or suspended.' });
      input.status = body.status;
    }
    if (!Object.keys(input).length) return res.status(400).json({ message: 'Provide at least one user field to update.' });
    return res.json(await updateAdminUser({ id: req.params.id, input, actorId: req.user.id }));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
