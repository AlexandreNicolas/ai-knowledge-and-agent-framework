import { Module } from '@nestjs/common';
import { CheesecakeService } from './cheesecake.service';
import { CheesecakeController } from './cheesecake.controller';

@Module({
  controllers: [CheesecakeController],
  providers: [CheesecakeService],
})
export class CheesecakeModule {}
