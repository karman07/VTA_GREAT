import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const userCount = await prisma.user.count();
  const fileCount = await prisma.knowledgeFile.count();
  const files = await prisma.knowledgeFile.findMany({ take: 5 });
  const users = await prisma.user.findMany({ take: 5 });

  console.log('--- DB Check ---');
  console.log('Total Users:', userCount);
  console.log('Total Files:', fileCount);
  console.log('Sample Users:', users.map(u => ({ id: u.id, email: u.email })));
  console.log('Sample Files:', files.map(f => ({ id: f.id, teacherId: f.teacherId, name: f.originalName })));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
