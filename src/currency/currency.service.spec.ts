import { CurrencyService } from './currency.service';
import { MonobankService } from '../monobank/monobank.service';
import { ok, err } from '../common/result';
import { MonobankRate } from '../monobank/interfaces/monobank-rate.interface';

const makeRate = (
  a: number,
  b: number,
  overrides: Partial<MonobankRate> = {},
): MonobankRate => ({ currencyCodeA: a, currencyCodeB: b, date: 1_000_000, ...overrides });

// USD(840), EUR(978), UAH(980), GBP(826), CHF(756)
const mockRates = new Map<string, MonobankRate>([
  ['840:980', makeRate(840, 980, { rateBuy: 39.5, rateSell: 40.1 })],  // USD:UAH
  ['978:980', makeRate(978, 980, { rateBuy: 42.0, rateSell: 43.0 })],  // EUR:UAH
  ['978:840', makeRate(978, 840, { rateCross: 1.08 })],                 // EUR:USD (cross only)
  ['826:980', makeRate(826, 980, { rateBuy: 50.0, rateSell: 51.0 })],  // GBP:UAH
]);

describe('CurrencyService', () => {
  let service: CurrencyService;
  let mockMonobankService: jest.Mocked<Pick<MonobankService, 'getRates'>>;

  beforeEach(() => {
    mockMonobankService = { getRates: jest.fn().mockResolvedValue(ok(mockRates)) };
    service = new CurrencyService(mockMonobankService as any);
  });

  describe('input validation', () => {
    it('returns UNKNOWN_CURRENCY_CODE for an unrecognized from currency', async () => {
      const result = await service.convert('XYZ', 'USD', 100);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('UNKNOWN_CURRENCY_CODE');
        expect((result.error as any).code).toBe('XYZ');
      }
    });

    it('returns UNKNOWN_CURRENCY_CODE for an unrecognized to currency', async () => {
      const result = await service.convert('USD', 'XYZ', 100);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('UNKNOWN_CURRENCY_CODE');
        expect((result.error as any).code).toBe('XYZ');
      }
    });

    it('returns rate 1 and the same amount for same-currency conversion', async () => {
      const result = await service.convert('USD', 'USD', 100);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.convertedAmount).toBe(100);
        expect(result.value.rate).toBe(1);
      }
    });

    it('does not call MonobankService for same-currency conversion', async () => {
      await service.convert('USD', 'USD', 100);
      expect(mockMonobankService.getRates).not.toHaveBeenCalled();
    });
  });

  describe('conversion logic — direct pair', () => {
    it('uses rateBuy when the direct pair is found', async () => {
      // USD → UAH: pair 840:980, rateBuy = 39.5
      const result = await service.convert('USD', 'UAH', 100);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.convertedAmount).toBe(+(100 * 39.5).toFixed(4));
      }
    });

    it('falls back to rateCross when rateBuy is absent on the direct pair', async () => {
      // EUR → USD: pair 978:840, only rateCross = 1.08
      const result = await service.convert('EUR', 'USD', 100);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.convertedAmount).toBe(+(100 * 1.08).toFixed(4));
      }
    });
  });

  describe('conversion logic — inverse pair', () => {
    it('uses rateSell when the inverse pair is found', async () => {
      // UAH → USD: inverse of 840:980, rateSell = 40.1 → amount / rateSell
      const result = await service.convert('UAH', 'USD', 100);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.convertedAmount).toBe(+(100 / 40.1).toFixed(4));
      }
    });

    it('falls back to rateCross when rateSell is absent on the inverse pair', async () => {
      // USD → EUR: inverse of 978:840, only rateCross = 1.08 → amount / rateCross
      const result = await service.convert('USD', 'EUR', 100);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.convertedAmount).toBe(+(100 / 1.08).toFixed(4));
      }
    });
  });

  describe('conversion logic — cross via UAH', () => {
    it('converts through UAH when no direct or inverse pair exists', async () => {
      // GBP → EUR: no GBP:EUR or EUR:GBP pair
      // GBP→UAH = 50.0 (826:980 rateBuy), EUR→UAH = 42.0 (978:980 rateBuy)
      const expected = +(100 * (50 / 42)).toFixed(4);
      const result = await service.convert('GBP', 'EUR', 100);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.convertedAmount).toBe(expected);
      }
    });
  });

  describe('error cases', () => {
    it('returns CURRENCY_PAIR_NOT_SUPPORTED when no conversion path exists', async () => {
      // CHF(756) has no rates in the mock map — neither direct, inverse, nor UAH cross
      const result = await service.convert('CHF', 'GBP', 100);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('CURRENCY_PAIR_NOT_SUPPORTED');
      }
    });

    it('propagates MONOBANK_API_UNAVAILABLE from MonobankService', async () => {
      mockMonobankService.getRates.mockResolvedValue(
        err({ type: 'MONOBANK_API_UNAVAILABLE' }),
      );

      const result = await service.convert('USD', 'UAH', 100);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('MONOBANK_API_UNAVAILABLE');
      }
    });
  });

  describe('output precision', () => {
    it('rounds convertedAmount to at most 4 decimal places', async () => {
      const result = await service.convert('UAH', 'USD', 100);
      if (result.ok) {
        const decimals = result.value.convertedAmount.toString().split('.')[1]?.length ?? 0;
        expect(decimals).toBeLessThanOrEqual(4);
      }
    });

    it('rounds rate to at most 6 decimal places', async () => {
      const result = await service.convert('UAH', 'USD', 100);
      if (result.ok) {
        const decimals = result.value.rate.toString().split('.')[1]?.length ?? 0;
        expect(decimals).toBeLessThanOrEqual(6);
      }
    });

    it('includes from, to and original amount in the result', async () => {
      const result = await service.convert('USD', 'UAH', 250);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.from).toBe('USD');
        expect(result.value.to).toBe('UAH');
        expect(result.value.amount).toBe(250);
      }
    });
  });
});
