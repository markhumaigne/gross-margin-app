import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/permissions';

@Controller('api')
export class HealthController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
