import { PrismaClient } from '@prisma/client';

type GlobalWithPrisma = typeof globalThis & { prisma?: PrismaClient };

const g = globalThis as GlobalWithPrisma;

export const prisma =
  g.prisma ??
  new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  g.prisma = prisma;
}

export async function ensureConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('Prisma connected to database');
  } catch (err) {
    console.error('Prisma connection failed', err);
  }
}

export default prisma;
