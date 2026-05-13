import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MonobankService } from './monobank.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [HttpModule, RedisModule],
  providers: [MonobankService],
  exports: [MonobankService],
})
export class MonobankModule {}
