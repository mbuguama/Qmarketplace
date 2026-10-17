const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const { signToken } = require('../utils/jwt');
const { universities, courses, materials, users, orders } = require('../data/mockData');
const { ensureMaterialVariants, isMaterialVariantKey } = require('./pdfProcessingService');

const databaseConfigured = Boolean(process.env.DATABASE_URL);
const databaseUnavailableCodes = new Set(['P1001', 'P1002', 'P1003', 'P1017', 'P2024']);

function isDatabaseUnavailable(error) {
  return databaseUnavailableCodes.has(error.code);
}

function fallbackOrThrow(error, fallback) {
  if (databaseConfigured && !isDatabaseUnavailable(error)) throw error;
  if (databaseConfigured) console.warn(`Database unavailable; using development data (${error.code || error.message})`);
  return fallback();
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function toPublicUser(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt
  };
}

function toPublicMaterial(material) {
  return {
    id: material.id,
    title: material.title,
    type: material.type,
    description: material.description,
    price: Number(material.price || material.amount || 0),
    pages: material.pages,
    fileFormat: material.fileFormat || null,
    academicYear: material.academicYear || null,
    status: material.status,
    featured: material.featured,
    universityId: material.universityId,
    university: material.university || universities.find((item) => item.id === material.universityId) || null,
    courseId: material.courseId,
    course: material.course || courses.find((item) => item.id === material.courseId) || null,
    hasPreview: material.status === 'active' && material.processingStatus === 'complete' &&
      isMaterialVariantKey(material.previewUrl, 'previews'),
    createdAt: material.createdAt || null
  };
}

async function getUniversities() {
  if (!databaseConfigured) return universities;
  try {
    return await prisma.university.findMany({ orderBy: { name: 'asc' } });
  } catch (error) {
    return fallbackOrThrow(error, () => universities);
  }
}

async function getCourses() {
  if (!databaseConfigured) {
    return courses.map((course) => ({
      ...course,
      university: universities.find((item) => item.id === course.universityId) || null
    }));
  }
  try {
    return await prisma.course.findMany({
      include: { university: { select: { id: true, name: true, slug: true } } },
      orderBy: { title: 'asc' }
    });
  } catch (error) {
    return fallbackOrThrow(error, () => courses.map((course) => ({
      ...course,
      university: universities.find((item) => item.id === course.universityId) || null
    })));
  }
}

async function getMaterials() {
  if (!databaseConfigured) return materials.filter((item) => item.status === 'active').map(toPublicMaterial);
  try {
    const rows = await prisma.material.findMany({
      where: { status: 'active' },
      include: {
        university: { select: { id: true, name: true, slug: true, location: true } },
        course: { select: { id: true, title: true, code: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    return rows.map(toPublicMaterial);
  } catch (error) {
    return fallbackOrThrow(error, () => materials.filter((item) => item.status === 'active').map(toPublicMaterial));
  }
}

async function getMaterialPage({ query = '', type = '', universityId = '', sort = 'recent', page = 1, pageSize = 9 }) {
  const normalizedQuery = String(query).trim();
  const where = { status: 'active' };
  if (universityId) where.universityId = universityId;
  if (type) where.type = { equals: type, mode: 'insensitive' };
  if (normalizedQuery) {
    where.OR = [
      { title: { contains: normalizedQuery, mode: 'insensitive' } },
      { description: { contains: normalizedQuery, mode: 'insensitive' } },
      { type: { contains: normalizedQuery, mode: 'insensitive' } },
      { course: { is: { title: { contains: normalizedQuery, mode: 'insensitive' } } } },
      { course: { is: { code: { contains: normalizedQuery, mode: 'insensitive' } } } },
      { university: { is: { name: { contains: normalizedQuery, mode: 'insensitive' } } } }
    ];
  }
  const orderBy = sort === 'price-asc'
    ? { price: 'asc' }
    : sort === 'price-desc'
      ? { price: 'desc' }
      : sort === 'title'
        ? { title: 'asc' }
        : { createdAt: 'desc' };

  if (!databaseConfigured) return getMockMaterialPage(normalizedQuery, type, universityId, sort, page, pageSize);

  try {
    const [total, rows] = await Promise.all([
      prisma.material.count({ where }),
      prisma.material.findMany({
        where,
        include: {
          university: { select: { id: true, name: true, slug: true, location: true } },
          course: { select: { id: true, title: true, code: true } }
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);
    return { items: rows.map(toPublicMaterial), total, page, pageSize };
  } catch (error) {
    return fallbackOrThrow(error, () => getMockMaterialPage(normalizedQuery, type, universityId, sort, page, pageSize));
  }
}

function getMockMaterialPage(query, type, universityId, sort, page, pageSize) {
  const queryText = query.toLowerCase();
  const filtered = materials.filter((material) => {
    const course = courses.find((item) => item.id === material.courseId);
    const university = universities.find((item) => item.id === material.universityId);
    const text = [
      material.title, material.description, material.type,
      course?.title, course?.code, university?.name
    ].filter(Boolean).join(' ').toLowerCase();
    return material.status === 'active' &&
      (!universityId || material.universityId === universityId) &&
      (!type || material.type.toLowerCase() === type.toLowerCase()) &&
      (!queryText || text.includes(queryText));
  });
  filtered.sort((a, b) => {
    if (sort === 'price-asc') return Number(a.price) - Number(b.price);
    if (sort === 'price-desc') return Number(b.price) - Number(a.price);
    if (sort === 'title') return a.title.localeCompare(b.title);
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
  return {
    items: filtered.slice((page - 1) * pageSize, page * pageSize).map(toPublicMaterial),
    total: filtered.length,
    page,
    pageSize
  };
}

async function getMaterialById(id) {
  if (!databaseConfigured) {
    const material = materials.find((item) => item.id === id && item.status === 'active');
    return material ? toPublicMaterial(material) : null;
  }
  try {
    const material = await prisma.material.findFirst({
      where: { id, status: 'active' },
      include: {
        university: { select: { id: true, name: true, slug: true, location: true } },
        course: { select: { id: true, title: true, code: true } }
      }
    });
    return material ? toPublicMaterial(material) : null;
  } catch (error) {
    return fallbackOrThrow(error, () => {
      const material = materials.find((item) => item.id === id && item.status === 'active');
      return material ? toPublicMaterial(material) : null;
    });
  }
}

async function getMaterialPreviewKey(id) {
  if (!databaseConfigured) return null;
  const material = await prisma.material.findFirst({
    where: { id, status: 'active', processingStatus: 'complete', previewUrl: { not: null } },
    select: { previewUrl: true }
  });
  return isMaterialVariantKey(material?.previewUrl, 'previews') ? material.previewUrl : null;
}

async function findUserByEmail(email) {
  if (!databaseConfigured) return users.find((user) => user.email.toLowerCase() === email) || null;
  try {
    return await prisma.user.findUnique({ where: { email } });
  } catch (error) {
    return fallbackOrThrow(error, () => users.find((user) => user.email.toLowerCase() === email) || null);
  }
}

async function registerUser({ firstName, lastName, email, password }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) throw httpError(409, 'A user with this email already exists.');

  const passwordHash = await bcrypt.hash(password, 12);
  let user;
  if (databaseConfigured) {
    try {
      user = await prisma.user.create({
        data: {
          firstName: String(firstName).trim(),
          lastName: String(lastName).trim(),
          email: normalizedEmail,
          passwordHash,
          role: 'student'
        }
      });
    } catch (error) {
      if (error.code === 'P2002') throw httpError(409, 'A user with this email already exists.');
      user = fallbackOrThrow(error, () => {
        const fallbackUser = {
          id: `user-${Date.now()}`,
          firstName: String(firstName).trim(),
          lastName: String(lastName).trim(),
          email: normalizedEmail,
          passwordHash,
          role: 'student',
          createdAt: new Date().toISOString()
        };
        users.push(fallbackUser);
        return fallbackUser;
      });
    }
  } else {
    user = {
      id: `user-${Date.now()}`,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      email: normalizedEmail,
      passwordHash,
      role: 'student',
      createdAt: new Date().toISOString()
    };
    users.push(user);
  }

  const publicUser = toPublicUser(user);
  const token = signToken({ id: user.id, email: user.email, role: user.role });
  return { token, user: publicUser };
}

async function loginUser({ email, password }) {
  const match = await findUserByEmail(String(email).trim().toLowerCase());
  if (!match || !(await bcrypt.compare(password, match.passwordHash))) {
    throw httpError(401, 'Invalid email or password.');
  }

  const token = signToken({ id: match.id, email: match.email, role: match.role });
  return { token, user: toPublicUser(match) };
}

async function getUserProfile(userId) {
  if (!databaseConfigured) {
    const match = users.find((user) => user.id === userId);
    return match ? toPublicUser(match) : null;
  }
  try {
    const match = await prisma.user.findUnique({ where: { id: userId } });
    return match ? toPublicUser(match) : null;
  } catch (error) {
    return fallbackOrThrow(error, () => {
      const match = users.find((user) => user.id === userId);
      return match ? toPublicUser(match) : null;
    });
  }
}

async function getUserOrders(userId) {
  if (!databaseConfigured) {
    return orders.filter((order) => order.userId === userId).map((order) => {
      const material = materials.find((item) => item.id === order.materialId);
      return {
        id: order.id,
        materialId: order.materialId,
        title: material ? material.title : 'Study material',
        amount: Number(order.amount || material?.price || 0),
        currency: order.currency || 'USD',
        status: order.status,
        provider: order.provider,
        createdAt: order.createdAt || new Date().toISOString()
      };
    });
  }
  try {
    const rows = await prisma.order.findMany({
      where: { userId },
      include: { material: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' }
    });
    return rows.map((order) => ({
      id: order.id,
      materialId: order.materialId,
      title: order.material.title,
      amount: Number(order.amount),
      currency: order.currency,
      status: order.status,
      provider: order.provider,
      createdAt: order.createdAt
    }));
  } catch (error) {
    return fallbackOrThrow(error, () => getUserOrdersFromMemory(userId));
  }
}

function getUserOrdersFromMemory(userId) {
  return orders.filter((order) => order.userId === userId).map((order) => {
    const material = materials.find((item) => item.id === order.materialId);
    return {
      id: order.id,
      materialId: order.materialId,
      title: material ? material.title : 'Study material',
      amount: Number(order.amount || material?.price || 0),
      currency: order.currency || 'USD',
      status: order.status,
      provider: order.provider,
      createdAt: order.createdAt || new Date().toISOString()
    };
  });
}

async function getPurchasedMaterial(userId, materialId) {
  let order;
  if (!databaseConfigured) {
    order = orders.find((item) => item.userId === userId && item.materialId === materialId && item.status === 'paid');
  } else {
    try {
      order = await prisma.order.findFirst({
        where: { userId, materialId, status: 'paid' },
        include: { material: true }
      });
    } catch (error) {
      order = fallbackOrThrow(error, () => orders.find(
        (item) => item.userId === userId && item.materialId === materialId && item.status === 'paid'
      ));
    }
  }
  if (!order) return null;
  if (databaseConfigured && (order.material?.originalFileKey || order.material?.downloadUrl)) {
    return ensureMaterialVariants(order.material);
  }
  return order.material || materials.find((item) => item.id === materialId) || null;
}

async function createPendingOrder({ userId, materialId, paymentId }) {
  const material = await getMaterialById(materialId);
  if (!material) throw httpError(404, 'Material not found.');
  const orderData = {
    userId,
    materialId,
    amount: material.price,
    currency: 'USD',
    status: 'pending',
    paymentId,
    provider: 'paypal'
  };

  if (!databaseConfigured) {
    const order = { id: `ord-${Date.now()}`, ...orderData, createdAt: new Date().toISOString() };
    orders.push(order);
    return order;
  }
  try {
    return await prisma.order.create({ data: orderData });
  } catch (error) {
    return fallbackOrThrow(error, () => {
      const order = { id: `ord-${Date.now()}`, ...orderData, createdAt: new Date().toISOString() };
      orders.push(order);
      return order;
    });
  }
}

async function claimOrderForCapture(userId, paymentId) {
  if (!databaseConfigured) {
    const order = orders.find((item) => item.userId === userId && item.paymentId === paymentId);
    if (order?.status === 'pending') order.status = 'processing';
    return order?.status === 'processing' ? order : null;
  }
  try {
    await prisma.order.updateMany({
      where: { userId, paymentId, status: 'pending' },
      data: { status: 'processing' }
    });
    return await prisma.order.findFirst({
      where: { userId, paymentId, status: 'processing' },
      include: { material: { select: { id: true, price: true } } }
    });
  } catch (error) {
    return fallbackOrThrow(error, () => {
      const order = orders.find((item) => item.userId === userId && item.paymentId === paymentId);
      if (order?.status === 'pending') order.status = 'processing';
      return order?.status === 'processing' ? order : null;
    });
  }
}

async function getOrderByPaymentId(userId, paymentId) {
  if (!databaseConfigured) {
    return orders.find((order) => order.userId === userId && order.paymentId === paymentId) || null;
  }
  try {
    return await prisma.order.findFirst({ where: { userId, paymentId } });
  } catch (error) {
    return fallbackOrThrow(error, () => orders.find(
      (order) => order.userId === userId && order.paymentId === paymentId
    ) || null);
  }
}

async function markOrderPaid(orderId, paymentId) {
  if (!databaseConfigured) {
    const order = orders.find((item) => item.id === orderId);
    if (order) {
      order.status = 'paid';
      order.paymentId = paymentId;
    }
    return order;
  }
  try {
    await prisma.order.updateMany({
      where: { id: orderId, status: 'processing' },
      data: { status: 'paid', paymentId }
    });
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (order?.status !== 'paid') throw httpError(409, 'The order changed state before payment could be confirmed.');
    return order;
  } catch (error) {
    return fallbackOrThrow(error, () => {
      const order = orders.find((item) => item.id === orderId);
      if (order) {
        order.status = 'paid';
        order.paymentId = paymentId;
      }
      return order;
    });
  }
}

async function searchCatalog(term) {
  const query = String(term || '').trim().toLowerCase();
  const allMaterials = await getMaterials();
  if (!query) return allMaterials;
  return allMaterials.filter((material) => {
    const haystack = [
      material.title,
      material.description,
      material.type,
      material.course?.title,
      material.course?.code,
      material.university?.name
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

async function getAdminOverview() {
  if (!databaseConfigured) {
    const completedOrders = orders.filter((order) => order.status === 'paid');
    return {
      metrics: {
        totalMaterials: materials.filter((material) => material.status === 'active').length,
        draftMaterials: materials.filter((material) => material.status === 'draft').length,
        archivedMaterials: materials.filter((material) => material.status !== 'active' && material.status !== 'draft').length,
        totalOrders: orders.length,
        totalSales: completedOrders.length,
        totalRevenue: completedOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0),
        totalUsers: users.length
      },
      recentOrders: orders.slice(-5).reverse().map((order) => ({
        id: order.id,
        amount: Number(order.amount || 0),
        status: order.status,
        userId: order.userId,
        createdAt: order.createdAt || null
      })),
      recentMaterials: materials.slice(-5).reverse().map((material) => ({
        id: material.id,
        title: material.title,
        status: material.status,
        createdAt: material.createdAt || null
      }))
    };
  }
  try {
    const [totalMaterials, draftMaterials, archivedMaterials, totalOrders, totalSales, totalUsers, paidOrders, recentOrders, recentMaterials] = await Promise.all([
      prisma.material.count({ where: { status: 'active' } }),
      prisma.material.count({ where: { status: 'draft' } }),
      prisma.material.count({ where: { status: { notIn: ['active', 'draft'] } } }),
      prisma.order.count(),
      prisma.order.count({ where: { status: 'paid' } }),
      prisma.user.count(),
      prisma.order.aggregate({ where: { status: 'paid' }, _sum: { amount: true } }),
      prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, amount: true, status: true, userId: true, createdAt: true,
          user: { select: { firstName: true, lastName: true, email: true } },
          material: { select: { title: true } }
        }
      }),
      prisma.material.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, status: true, createdAt: true }
      })
    ]);
    return {
      metrics: {
        totalMaterials,
        draftMaterials,
        archivedMaterials,
        totalOrders,
        totalSales,
        totalRevenue: Number(paidOrders._sum.amount || 0),
        totalUsers
      },
      recentOrders: recentOrders.map((order) => ({ ...order, amount: Number(order.amount) })),
      recentMaterials
    };
  } catch (error) {
    return fallbackOrThrow(error, () => getAdminOverviewFromMemory());
  }
}

function getAdminOverviewFromMemory() {
  const completedOrders = orders.filter((order) => order.status === 'paid');
  return {
    metrics: {
      totalMaterials: materials.filter((material) => material.status === 'active').length,
      draftMaterials: materials.filter((material) => material.status === 'draft').length,
      archivedMaterials: materials.filter((material) => material.status !== 'active' && material.status !== 'draft').length,
      totalOrders: orders.length,
      totalSales: completedOrders.length,
      totalRevenue: completedOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0),
      totalUsers: users.length
    },
    recentOrders: orders.slice(-5).reverse().map((order) => ({
      id: order.id,
      amount: Number(order.amount || 0),
      status: order.status,
      userId: order.userId,
      createdAt: order.createdAt || null
    })),
    recentMaterials: materials.slice(-5).reverse().map((material) => ({
      id: material.id,
      title: material.title,
      status: material.status,
      createdAt: material.createdAt || null
    }))
  };
}

module.exports = {
  createPendingOrder,
  claimOrderForCapture,
  findUserByEmail,
  getAdminOverview,
  getCourses,
  getMaterialById,
  getMaterialPreviewKey,
  getMaterials,
  getMaterialPage,
  getOrderByPaymentId,
  getPurchasedMaterial,
  getUniversities,
  getUserOrders,
  getUserProfile,
  loginUser,
  markOrderPaid,
  searchCatalog,
  registerUser,
  toPublicMaterial
};
