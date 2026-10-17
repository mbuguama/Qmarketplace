const prisma = require('../config/prisma');
const { deletePrivateObjects } = require('./storageService');
const { ensureMaterialVariants, isMaterialVariantKey, processUploadedPdf } = require('./pdfProcessingService');

function requireDatabase() {
  if (!process.env.DATABASE_URL) {
    const error = new Error('Administration requires a configured PostgreSQL database.');
    error.statusCode = 503;
    throw error;
  }
}

function materialIncludes() {
  return {
    university: { select: { id: true, name: true } },
    course: { select: { id: true, title: true, code: true } }
  };
}

function hasCompleteMaterialVariants(material) {
  return material.processingStatus === 'complete' &&
    isMaterialVariantKey(material.originalFileKey, 'original') &&
    isMaterialVariantKey(material.downloadUrl, 'watermarked') &&
    isMaterialVariantKey(material.previewUrl, 'previews');
}

async function getAdminMaterials() {
  requireDatabase();
  const rows = await prisma.material.findMany({
    include: materialIncludes(),
    orderBy: { createdAt: 'desc' }
  });
  return rows.map((item) => ({
    id: item.id,
    title: item.title,
    type: item.type,
    description: item.description,
    price: Number(item.price),
    pages: item.pages,
    fileFormat: item.fileFormat,
    academicYear: item.academicYear,
    status: item.status,
    processingStatus: item.processingStatus,
    hasWatermarkedFiles: hasCompleteMaterialVariants(item),
    featured: item.featured,
    universityId: item.universityId,
    university: item.university,
    courseId: item.courseId,
    course: item.course,
    createdAt: item.createdAt,
    hasDownload: Boolean(item.downloadUrl)
  }));
}

async function getAdminMaterialPage({ query = '', type = '', status = '', universityId = '', courseId = '', minPrice, maxPrice, from, to, sort = 'recent', page = 1, pageSize = 20 }) {
  requireDatabase();
  const where = {};
  if (status) where.status = status;
  if (type) where.type = { equals: type, mode: 'insensitive' };
  if (universityId) where.universityId = universityId;
  if (courseId) where.courseId = courseId;
  if (minPrice !== undefined || maxPrice !== undefined) {
    where.price = {};
    if (minPrice !== undefined) where.price.gte = minPrice;
    if (maxPrice !== undefined) where.price.lte = maxPrice;
  }
  if (from !== undefined || to !== undefined) {
    where.createdAt = {};
    if (from !== undefined) where.createdAt.gte = from;
    if (to !== undefined) where.createdAt.lte = to;
  }
  if (query) {
    where.OR = [
      { title: { contains: query, mode: 'insensitive' } },
      { description: { contains: query, mode: 'insensitive' } },
      { university: { is: { name: { contains: query, mode: 'insensitive' } } } },
      { course: { is: { title: { contains: query, mode: 'insensitive' } } } },
      { course: { is: { code: { contains: query, mode: 'insensitive' } } } }
    ];
  }
  const orderBy = sort === 'price-asc'
    ? { price: 'asc' }
    : sort === 'price-desc'
      ? { price: 'desc' }
      : sort === 'title'
        ? { title: 'asc' }
        : { createdAt: 'desc' };
  const [total, rows] = await Promise.all([
    prisma.material.count({ where }),
    prisma.material.findMany({
      where,
      include: materialIncludes(),
      orderBy: [orderBy, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  ]);
  return {
    items: rows.map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      description: item.description,
      price: Number(item.price),
      pages: item.pages,
      fileFormat: item.fileFormat,
      academicYear: item.academicYear,
      status: item.status,
      processingStatus: item.processingStatus,
      hasWatermarkedFiles: hasCompleteMaterialVariants(item),
      featured: item.featured,
      universityId: item.universityId,
      university: item.university,
      courseId: item.courseId,
      course: item.course,
      createdAt: item.createdAt,
      hasDownload: Boolean(item.downloadUrl)
    })),
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize)
  };
}

async function createAdminMaterial(input) {
  requireDatabase();
  if (!/^materials\/uploads\/[0-9a-f-]{36}\.pdf$/i.test(input.uploadKey)) {
    const error = new Error('Upload the PDF file before saving the material.');
    error.statusCode = 400;
    throw error;
  }
  let draft;
  let variants;
  let processingStarted = false;
  try {
    const university = await prisma.university.findUnique({ where: { id: input.universityId }, select: { id: true } });
    if (!university) {
      const error = new Error('Choose an existing university.');
      error.statusCode = 400;
      throw error;
    }
    if (input.courseId) {
      const course = await prisma.course.findFirst({
        where: { id: input.courseId, universityId: input.universityId },
        select: { id: true }
      });
      if (!course) {
        const error = new Error('Choose a course belonging to the selected university.');
        error.statusCode = 400;
        throw error;
      }
    }
    draft = await prisma.material.create({
      data: {
        title: input.title,
        type: input.type,
        description: input.description,
        price: input.price,
        pages: input.pages || 1,
        fileFormat: 'PDF',
        academicYear: input.academicYear || null,
        status: 'draft',
        processingStatus: 'processing',
        featured: input.featured,
        universityId: input.universityId,
        courseId: input.courseId || null,
        sellerId: input.actorId
      }
    });
    processingStarted = true;
    variants = await processUploadedPdf(input.uploadKey, draft.id);
    const item = await prisma.material.update({
      where: { id: draft.id },
      data: {
        downloadUrl: variants.downloadUrl,
        originalFileKey: variants.originalFileKey,
        previewUrl: variants.previewUrl,
        fileSize: variants.fileSize,
        pages: variants.pageCount,
        status: 'active',
        processingStatus: 'complete'
      },
      include: materialIncludes()
    });
    return {
      id: item.id,
      title: item.title,
      type: item.type,
      description: item.description,
      price: Number(item.price),
      pages: item.pages,
      fileFormat: item.fileFormat,
      status: item.status,
      processingStatus: item.processingStatus,
      featured: item.featured,
      university: item.university,
      course: item.course
    };
  } catch (error) {
    if (draft) {
      try {
        await prisma.material.update({
          where: { id: draft.id },
          data: { status: 'draft', processingStatus: 'failed' }
        });
      } catch (stateError) {
        console.error(`Could not mark failed PDF processing for material ${draft.id}:`, stateError);
      }
    }
    if (variants) {
      try {
        await deletePrivateObjects([variants.originalFileKey, variants.downloadUrl, variants.previewUrl]);
      } catch (cleanupError) {
        console.error(`Could not remove PDF variants for material ${draft?.id || 'new upload'}:`, cleanupError);
      }
    } else if (!processingStarted) {
      try {
        await deletePrivateObjects([input.uploadKey]);
      } catch (cleanupError) {
        console.error('Could not remove the unprocessed private PDF upload:', cleanupError);
      }
    }
    throw error;
  }
}

async function updateAdminMaterial(id, input) {
  requireDatabase();
  if (input.status === 'active') {
    const current = await prisma.material.findUnique({ where: { id } });
    if (!current) {
      const error = new Error('Material not found.');
      error.statusCode = 404;
      throw error;
    }
    if (current.status !== 'active' || current.originalFileKey || current.downloadUrl) {
      const processed = await ensureMaterialVariants(current);
      if (processed.processingStatus !== 'complete' || !processed.originalFileKey ||
          !processed.downloadUrl || !processed.previewUrl) {
        const error = new Error('This material cannot be published until its watermark and preview are successfully processed.');
        error.statusCode = 409;
        throw error;
      }
    }
  }
  const item = await prisma.material.update({
    where: { id },
    data: input,
    include: materialIncludes()
  });
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    description: item.description,
    price: Number(item.price),
    pages: item.pages,
    fileFormat: item.fileFormat,
    academicYear: item.academicYear,
    status: item.status,
    featured: item.featured,
    university: item.university,
    course: item.course
  };
}

async function processAdminMaterial(id) {
  requireDatabase();
  const current = await prisma.material.findUnique({ where: { id } });
  if (!current) {
    const error = new Error('Material not found.');
    error.statusCode = 404;
    throw error;
  }
  const processed = await ensureMaterialVariants(current);
  return {
    id: processed.id,
    status: processed.status,
    processingStatus: processed.processingStatus,
    pages: processed.pages,
    hasWatermarkedFiles: hasCompleteMaterialVariants(processed)
  };
}

async function deactivateAdminMaterial(id) {
  requireDatabase();
  return prisma.material.update({ where: { id }, data: { status: 'inactive' }, select: { id: true, status: true } });
}

async function getAdminOrders({ query = '', status = '', page = 1, pageSize = 50 } = {}) {
  requireDatabase();
  const where = {
    ...(status ? { status } : {}),
    ...(query ? {
      OR: [
        { id: { contains: query, mode: 'insensitive' } },
        { user: { is: { email: { contains: query, mode: 'insensitive' } } } },
        { user: { is: { firstName: { contains: query, mode: 'insensitive' } } } },
        { user: { is: { lastName: { contains: query, mode: 'insensitive' } } } },
        { material: { is: { title: { contains: query, mode: 'insensitive' } } } }
      ]
    } : {})
  };
  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        material: { select: { id: true, title: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
  ]);
  return {
    items: rows.map((order) => ({
      id: order.id,
      amount: Number(order.amount),
      currency: order.currency,
      status: order.status,
      provider: order.provider,
      paymentId: order.paymentId,
      cancellationReason: order.cancellationReason,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      user: order.user,
      material: order.material
    })),
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize)
  };
}

async function cancelAdminOrder({ id, reason, actorId }) {
  requireDatabase();
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.order.findUnique({
      where: { id },
      select: { id: true, status: true }
    });
    if (!existing) {
      const error = new Error('Order not found.');
      error.statusCode = 404;
      throw error;
    }
    if (existing.status !== 'pending') {
      const error = new Error('Only pending, unpaid orders can be cancelled. Paid transactions must be handled through a verified refund workflow.');
      error.statusCode = 409;
      throw error;
    }
    const update = await transaction.order.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'cancelled', cancelledAt: new Date(), cancellationReason: reason }
    });
    if (update.count !== 1) {
      const error = new Error('This order is already being processed or has changed status; it was not cancelled.');
      error.statusCode = 409;
      throw error;
    }
    const order = await transaction.order.findUnique({
      where: { id },
      select: { id: true, status: true, cancelledAt: true, cancellationReason: true }
    });
    await transaction.adminAuditLog.create({
      data: {
        actorId,
        action: 'pending_order_cancelled',
        entityType: 'Order',
        entityId: id,
        details: { reason }
      }
    });
    return order;
  });
}

async function getAdminUsers({ query = '', role = '', status = '', page = 1, pageSize = 50 } = {}) {
  requireDatabase();
  const where = {
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    ...(query ? {
      OR: [
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } }
      ]
    } : {})
  };
  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, firstName: true, lastName: true, email: true, role: true, status: true, createdAt: true,
        _count: { select: { orders: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
  ]);
  return { items, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
}

async function updateAdminUser({ id, input, actorId }) {
  requireDatabase();
  return prisma.$transaction(async (transaction) => {
    const current = await transaction.user.findUnique({
      where: { id },
      select: { id: true, role: true, status: true }
    });
    if (!current) {
      const error = new Error('User not found.');
      error.statusCode = 404;
      throw error;
    }
    const nextRole = input.role ?? current.role;
    const nextStatus = input.status ?? current.status;
    if (current.role === 'admin' && current.status === 'active' &&
        (nextRole !== 'admin' || nextStatus !== 'active')) {
      const activeAdmins = await transaction.user.count({ where: { role: 'admin', status: 'active' } });
      if (activeAdmins <= 1) {
        const error = new Error('The final active administrator cannot be demoted or suspended.');
        error.statusCode = 409;
        throw error;
      }
    }
    const updated = await transaction.user.update({
      where: { id },
      data: input,
      select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true, updatedAt: true }
    });
    await transaction.adminAuditLog.create({
      data: {
        actorId,
        action: 'user_updated',
        entityType: 'User',
        entityId: id,
        details: {
          previousRole: current.role,
          role: updated.role,
          previousStatus: current.status,
          status: updated.status
        }
      }
    });
    return updated;
  });
}

async function getAdminUniversities() {
  requireDatabase();
  return prisma.university.findMany({
    include: { _count: { select: { courses: true, materials: true } } },
    orderBy: { name: 'asc' }
  });
}

async function createAdminUniversity(input) {
  requireDatabase();
  try {
    return await prisma.university.create({ data: input });
  } catch (error) {
    if (error.code === 'P2002') {
      const conflict = new Error('A university with that name or slug already exists.');
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }
}

async function updateAdminUniversity(id, input) {
  requireDatabase();
  try {
    return await prisma.university.update({ where: { id }, data: input });
  } catch (error) {
    if (error.code === 'P2002') {
      const conflict = new Error('A university with that name or slug already exists.');
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }
}

async function deleteAdminUniversity(id) {
  requireDatabase();
  const university = await prisma.university.findUnique({
    where: { id },
    include: { _count: { select: { courses: true, materials: true } } }
  });
  if (!university) {
    const error = new Error('University not found.');
    error.statusCode = 404;
    throw error;
  }
  if (university._count.courses || university._count.materials) {
    const error = new Error(`This university is linked to ${university._count.courses} course(s) and ${university._count.materials} material(s). Reassign those records before deleting it.`);
    error.statusCode = 409;
    throw error;
  }
  try {
    return await prisma.university.delete({ where: { id }, select: { id: true } });
  } catch (error) {
    if (error.code === 'P2003') {
      const conflict = new Error('This university has related records and cannot be deleted.');
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }
}

async function getAdminCourses({ query = '', universityId = '' } = {}) {
  requireDatabase();
  return prisma.course.findMany({
    where: {
      ...(universityId ? { universityId } : {}),
      ...(query ? {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { code: { contains: query, mode: 'insensitive' } },
          { university: { is: { name: { contains: query, mode: 'insensitive' } } } }
        ]
      } : {})
    },
    include: {
      university: { select: { id: true, name: true } },
      _count: { select: { materials: true } }
    },
    orderBy: [{ university: { name: 'asc' } }, { code: 'asc' }]
  });
}

async function ensureCourseUniversity(universityId) {
  const exists = await prisma.university.findUnique({ where: { id: universityId }, select: { id: true } });
  if (!exists) {
    const error = new Error('Choose an existing university.');
    error.statusCode = 400;
    throw error;
  }
}

async function ensureUniqueCourseCode({ universityId, code, excludeId }) {
  const duplicate = await prisma.course.findFirst({
    where: {
      universityId,
      code: { equals: code, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: { id: true }
  });
  if (duplicate) {
    const error = new Error('A course with this code already exists at the selected university.');
    error.statusCode = 409;
    throw error;
  }
}

async function createAdminCourse(input) {
  requireDatabase();
  await ensureCourseUniversity(input.universityId);
  await ensureUniqueCourseCode(input);
  return prisma.course.create({
    data: input,
    include: { university: { select: { id: true, name: true } } }
  });
}

async function updateAdminCourse(id, input) {
  requireDatabase();
  const existing = await prisma.course.findUnique({ where: { id }, select: { id: true, universityId: true, code: true } });
  if (!existing) {
    const error = new Error('Course not found.');
    error.statusCode = 404;
    throw error;
  }
  const universityId = input.universityId || existing.universityId;
  const code = input.code || existing.code;
  if (input.universityId) await ensureCourseUniversity(input.universityId);
  await ensureUniqueCourseCode({ universityId, code, excludeId: id });
  return prisma.course.update({
    where: { id },
    data: input,
    include: { university: { select: { id: true, name: true } } }
  });
}

async function deleteAdminCourse(id) {
  requireDatabase();
  const course = await prisma.course.findUnique({
    where: { id },
    include: { _count: { select: { materials: true } } }
  });
  if (!course) {
    const error = new Error('Course not found.');
    error.statusCode = 404;
    throw error;
  }
  if (course._count.materials) {
    const error = new Error(`This course is linked to ${course._count.materials} material(s). Reassign those materials before deleting it.`);
    error.statusCode = 409;
    throw error;
  }
  try {
    return await prisma.course.delete({ where: { id }, select: { id: true } });
  } catch (error) {
    if (error.code === 'P2003') {
      const conflict = new Error('This course has related records and cannot be deleted.');
      conflict.statusCode = 409;
      throw conflict;
    }
    throw error;
  }
}

module.exports = {
  cancelAdminOrder,
  createAdminCourse,
  createAdminMaterial,
  createAdminUniversity,
  deleteAdminCourse,
  deleteAdminUniversity,
  deactivateAdminMaterial,
  getAdminCourses,
  getAdminMaterialPage,
  getAdminMaterials,
  getAdminOrders,
  getAdminUniversities,
  getAdminUsers,
  processAdminMaterial,
  updateAdminCourse,
  updateAdminMaterial,
  updateAdminUser,
  updateAdminUniversity
};
