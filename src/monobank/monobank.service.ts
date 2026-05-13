import { Inject, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import Redis from 'ioredis';
import { err, ok, ResultAsync } from '../common/result';
import { AppError } from '../common/errors';
import { MonobankRate } from './interfaces/monobank-rate.interface';

const RATES_CACHE_KEY = 'monobank:rates';

@Injectable()
export class MonobankService {
  private readonly logger = new Logger(MonobankService.name);
  private readonly apiUrl: string;
  private readonly cacheTtlSeconds: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {
    this.apiUrl = this.config.get<string>(
      'MONOBANK_API_URL',
      'https://api.monobank.ua/bank/currency',
    );
    this.cacheTtlSeconds = this.config.get<number>('CACHE_TTL_SECONDS', 300);
  }

  async getRates(): ResultAsync<Map<string, MonobankRate>, AppError> {
    try {
      const cached = await this.redis.get(RATES_CACHE_KEY);
      if (cached) {
        const obj = JSON.parse(cached) as Record<string, MonobankRate>;
        return ok(new Map(Object.entries(obj)));
      }
    } catch (error) {
      this.logger.warn('Redis read failed, falling through to API', error);
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<MonobankRate[]>(this.apiUrl),
      );

      const map = new Map<string, MonobankRate>();
      for (const rate of response.data) {
        map.set(`${rate.currencyCodeA}:${rate.currencyCodeB}`, rate);
      }

      try {
        await this.redis.set(
          RATES_CACHE_KEY,
          JSON.stringify(Object.fromEntries(map)),
          'EX',
          this.cacheTtlSeconds,
        );
      } catch (cacheError) {
        this.logger.warn('Redis write failed, proceeding without cache', cacheError);
      }

      return ok(map);
    } catch (apiError) {
      this.logger.error('Monobank API request failed', apiError);
      return err({ type: 'MONOBANK_API_UNAVAILABLE', cause: apiError });
    }
  }
}
