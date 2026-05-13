import {
  BadRequestException,
  HttpException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppError } from './errors';

export function toHttpException(error: AppError): HttpException {
  switch (error.type) {
    case 'UNKNOWN_CURRENCY_CODE':
      return new BadRequestException(`Unknown currency code: ${error.code}`);
    case 'CURRENCY_PAIR_NOT_SUPPORTED':
      return new BadRequestException(
        `Currency pair not supported: ${error.from} → ${error.to}`,
      );
    case 'MONOBANK_API_UNAVAILABLE':
      return new ServiceUnavailableException(
        'Exchange rate service is currently unavailable',
      );
    case 'CACHE_ERROR':
      return new InternalServerErrorException('Cache error');
  }
}
