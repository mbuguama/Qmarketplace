const prisma = require('../config/prisma');

function requireDatabase() {
  if (!process.env.DATABASE_URL) {
    const error = new Error('Contact submissions require a configured PostgreSQL database.');
    error.statusCode = 503;
    throw error;
  }
}

async function createContactQuery(input) {
  requireDatabase();
  return prisma.contactQuery.create({ data: input, select: { id: true, status: true, createdAt: true } });
}

async function getAdminContactQueries({ query = '', status = '' } = {}) {
  requireDatabase();
  return prisma.contactQuery.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(query ? {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
          { subject: { contains: query, mode: 'insensitive' } },
          { message: { contains: query, mode: 'insensitive' } }
        ]
      } : {})
    },
    orderBy: { createdAt: 'desc' },
    take: 200
  });
}

async function updateAdminContactQuery({ id, status, internalNotes, actorId }) {
  requireDatabase();
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.contactQuery.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!existing) {
      const error = new Error('Contact query not found.');
      error.statusCode = 404;
      throw error;
    }
    const updated = await transaction.contactQuery.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(internalNotes !== undefined ? { internalNotes } : {})
      },
      select: { id: true, status: true, internalNotes: true, updatedAt: true }
    });
    await transaction.adminAuditLog.create({
      data: {
        actorId,
        action: 'contact_query_updated',
        entityType: 'ContactQuery',
        entityId: id,
        details: { previousStatus: existing.status, status: updated.status }
      }
    });
    return updated;
  });
}

module.exports = { createContactQuery, getAdminContactQueries, updateAdminContactQuery };
