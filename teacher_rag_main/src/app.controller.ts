import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { LIMITS, TERMS_VERSION, APP_ALLOWED_EXTENSIONS } from './common/limits';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Public: usage limits + terms version, so clients render the same rules the server enforces. */
  @Get('config')
  getConfig() {
    return { limits: LIMITS, termsVersion: TERMS_VERSION, allowedExtensions: APP_ALLOWED_EXTENSIONS };
  }

  @Get('health/db')
  async getDbHealth() {
    const ready = await this.prisma.isDbReady();
    return {
      status: ready ? 'ok' : 'error',
      database: ready ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
    };
  }
}
