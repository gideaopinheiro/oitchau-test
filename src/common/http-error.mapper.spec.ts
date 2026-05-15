import {
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { toHttpException } from './http-error.mapper';

describe('toHttpException', () => {
  it('maps UNKNOWN_CURRENCY_CODE to BadRequestException with the code in the message', () => {
    const result = toHttpException({ type: 'UNKNOWN_CURRENCY_CODE', code: 'XYZ' });
    expect(result).toBeInstanceOf(BadRequestException);
    expect(result.message).toContain('XYZ');
  });

  it('maps CURRENCY_PAIR_NOT_SUPPORTED to BadRequestException with both currencies in the message', () => {
    const result = toHttpException({
      type: 'CURRENCY_PAIR_NOT_SUPPORTED',
      from: 'USD',
      to: 'GBP',
    });
    expect(result).toBeInstanceOf(BadRequestException);
    expect(result.message).toContain('USD');
    expect(result.message).toContain('GBP');
  });

  it('maps MONOBANK_API_UNAVAILABLE to ServiceUnavailableException', () => {
    const result = toHttpException({ type: 'MONOBANK_API_UNAVAILABLE' });
    expect(result).toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps CACHE_ERROR to InternalServerErrorException', () => {
    const result = toHttpException({ type: 'CACHE_ERROR' });
    expect(result).toBeInstanceOf(InternalServerErrorException);
  });
});
