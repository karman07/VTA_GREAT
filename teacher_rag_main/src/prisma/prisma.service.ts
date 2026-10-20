import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private static readonly logger = new Logger(PrismaService.name);
  private static initPromise: Promise<void> | null = null;
  private isConnected = false;

  constructor() {
    super({
      datasources: {
        db: {
          url: PrismaService.getDatabaseUrlWithSafeDefaults(process.env.DATABASE_URL),
        },
      },
      log:
        process.env.PRISMA_DEBUG_LOGS === 'true'
          ? ['query', 'info', 'warn', 'error']
          : ['warn', 'error'],
    });
  }

  async onModuleInit() {
    if (this.isConnected) {
      return;
    }

    if (!PrismaService.initPromise) {
      PrismaService.initPromise = this.connectWithRetry();
    }

    await PrismaService.initPromise;
    this.isConnected = true;
  }

  async onModuleDestroy() {
    if (!this.isConnected) {
      return;
    }

    await this.$disconnect();
    this.isConnected = false;
    PrismaService.initPromise = null;
  }

  async isDbReady(): Promise<boolean> {
    try {
      await this.$queryRawUnsafe('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private async connectWithRetry(): Promise<void> {
    const maxAttempts = Number(process.env.PRISMA_CONNECT_MAX_RETRIES ?? '8');
    const baseDelayMs = Number(process.env.PRISMA_CONNECT_RETRY_BASE_MS ?? '500');
    const maxDelayMs = Number(process.env.PRISMA_CONNECT_RETRY_MAX_MS ?? '15000');

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await this.$connect();
        await this.$queryRawUnsafe('SELECT 1');
        PrismaService.logger.log(`Prisma connected on attempt ${attempt}/${maxAttempts}`);
        return;
      } catch (error) {
        const isLastAttempt = attempt === maxAttempts;
        const waitMs = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
        const jitterMs = Math.floor(Math.random() * 250);

        PrismaService.logger.warn(
          `Prisma connection attempt ${attempt}/${maxAttempts} failed. ${isLastAttempt ? 'No retries left.' : `Retrying in ${waitMs + jitterMs}ms.`}`,
        );

        if (isLastAttempt) {
          throw error;
        }

        await this.sleep(waitMs + jitterMs);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private static getDatabaseUrlWithSafeDefaults(rawUrl?: string): string {
    if (!rawUrl) {
      throw new Error('DATABASE_URL is not set');
    }

    const url = new URL(rawUrl);
    const params = url.searchParams;

    if (!params.has('sslmode')) {
      params.set('sslmode', 'require');
    }

    if (!params.has('connection_limit')) {
      params.set('connection_limit', '5');
    }

    if (!params.has('pool_timeout')) {
      params.set('pool_timeout', '30');
    }

    if (!params.has('connect_timeout')) {
      params.set('connect_timeout', '30');
    }

    url.search = params.toString();
    return url.toString();
  }
}
