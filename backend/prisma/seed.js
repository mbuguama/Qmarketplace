require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'ava@student.com' },
    update: {},
    create: {
      firstName: 'Ava',
      lastName: 'Student',
      email: 'ava@student.com',
      passwordHash: await bcrypt.hash(process.env.SEED_DEMO_PASSWORD || 'DemoPassword123!', 12),
      role: 'student'
    }
  });

  const university = await prisma.university.upsert({
    where: { slug: 'berkeley' },
    update: {},
    create: {
      name: 'University of California, Berkeley',
      slug: 'berkeley',
      location: 'California',
      description: 'Academic excellence, collaborative learning, and a strong research culture.'
    }
  });

  let course = await prisma.course.findFirst({
    where: { code: 'CS 61B', universityId: university.id }
  });
  if (!course) {
    course = await prisma.course.create({
      data: {
        title: 'Data Structures and Algorithms',
        code: 'CS 61B',
        description: 'Core principles of algorithms, memory models, and efficient data structures.',
        semester: 'Spring',
        level: 'Undergraduate',
        universityId: university.id
      }
    });
  }

  const existingMaterial = await prisma.material.findFirst({
    where: { title: 'CS 61B Final Review Pack', universityId: university.id }
  });
  if (!existingMaterial) {
    await prisma.material.create({
      data: {
        title: 'CS 61B Final Review Pack',
        type: 'Exam Papers',
        description: 'A curated set of previous exam questions, practice tasks, and revision notes.',
        price: 18.99,
        pages: 42,
        fileFormat: 'PDF',
        academicYear: '2025-2026',
        featured: true,
        universityId: university.id,
        courseId: course.id,
        sellerId: user.id
      }
    });
  }

  console.log('Seed completed without deleting existing data.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
