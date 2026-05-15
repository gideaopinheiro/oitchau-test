import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { CurrencyController } from './currency.controller';
import { CurrencyService } from './currency.service';
import { ok, err } from '../common/result';
import { ConvertCurrencyDto } from './dto/convert-currency.dto';

describe('CurrencyController', () => {
  let controller: CurrencyController;
  let mockCurrencyService: jest.Mocked<Pick<CurrencyService, 'convert'>>;

  const dto: ConvertCurrencyDto = { from: 'USD', to: 'UAH', amount: 100 };

  beforeEach(() => {
    mockCurrencyService = { convert: jest.fn() };
    controller = new CurrencyController(mockCurrencyService as any);
  });

  it('returns the conversion result when service succeeds', async () => {
    const conversionResult = { from: 'USD', to: 'UAH', amount: 100, convertedAmount: 3950, rate: 39.5 };
    mockCurrencyService.convert.mockResolvedValue(ok(conversionResult));

    const response = await controller.convert(dto);

    expect(response).toEqual(conversionResult);
  });

  it('throws BadRequestException for UNKNOWN_CURRENCY_CODE', async () => {
    mockCurrencyService.convert.mockResolvedValue(
      err({ type: 'UNKNOWN_CURRENCY_CODE', code: 'XYZ' }),
    );

    await expect(controller.convert(dto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException for CURRENCY_PAIR_NOT_SUPPORTED', async () => {
    mockCurrencyService.convert.mockResolvedValue(
      err({ type: 'CURRENCY_PAIR_NOT_SUPPORTED', from: 'USD', to: 'GBP' }),
    );

    await expect(controller.convert(dto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws ServiceUnavailableException for MONOBANK_API_UNAVAILABLE', async () => {
    mockCurrencyService.convert.mockResolvedValue(
      err({ type: 'MONOBANK_API_UNAVAILABLE' }),
    );

    await expect(controller.convert(dto)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
