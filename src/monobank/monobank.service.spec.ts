import { of, throwError } from 'rxjs';
import { MonobankService } from './monobank.service';
import { MonobankRate } from './interfaces/monobank-rate.interface';

const sampleRates: MonobankRate[] = [
  { currencyCodeA: 840, currencyCodeB: 980, date: 1_000_000, rateBuy: 39.5, rateSell: 40.1 },
  { currencyCodeA: 978, currencyCodeB: 980, date: 1_000_000, rateBuy: 42.0, rateSell: 43.0 },
];

const makeService = (overrides: {
  redisGet?: jest.Mock;
  redisSet?: jest.Mock;
  httpGet?: jest.Mock;
} = {}): {
  service: MonobankService;
  mockRedis: { get: jest.Mock; set: jest.Mock };
  mockHttpService: { get: jest.Mock };
  mockLogger: { warn: jest.Mock; error: jest.Mock };
} => {
  const mockRedis = {
    get: overrides.redisGet ?? jest.fn().mockResolvedValue(null),
    set: overrides.redisSet ?? jest.fn().mockResolvedValue('OK'),
  };
  const mockHttpService = {
    get: overrides.httpGet ?? jest.fn().mockReturnValue(of({ data: sampleRates })),
  };
  const mockConfig = {
    get: jest.fn().mockImplementation((key: string, fallback: any) => fallback),
  };
  const mockLogger = { warn: jest.fn(), error: jest.fn() };

  const service = new MonobankService(
    mockHttpService as any,
    mockConfig as any,
    mockRedis as any,
    mockLogger as any,
  );

  return { service, mockRedis, mockHttpService, mockLogger };
};

describe('MonobankService', () => {
  describe('getRates — cache hit', () => {
    it('returns cached rates without calling the API', async () => {
      const cached = JSON.stringify(Object.fromEntries(
        sampleRates.map(r => [`${r.currencyCodeA}:${r.currencyCodeB}`, r]),
      ));
      const { service, mockHttpService } = makeService({
        redisGet: jest.fn().mockResolvedValue(cached),
      });

      const result = await service.getRates();

      expect(result.ok).toBe(true);
      expect(mockHttpService.get).not.toHaveBeenCalled();
    });

    it('reconstructs the rates map correctly from the cached string', async () => {
      const map = new Map(sampleRates.map(r => [`${r.currencyCodeA}:${r.currencyCodeB}`, r]));
      const cached = JSON.stringify(Object.fromEntries(map));
      const { service } = makeService({ redisGet: jest.fn().mockResolvedValue(cached) });

      const result = await service.getRates();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.has('840:980')).toBe(true);
        expect(result.value.has('978:980')).toBe(true);
        expect(result.value.get('840:980')?.rateBuy).toBe(39.5);
      }
    });
  });

  describe('getRates — cache miss', () => {
    it('calls the Monobank API and returns rates', async () => {
      const { service } = makeService();

      const result = await service.getRates();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.has('840:980')).toBe(true);
        expect(result.value.has('978:980')).toBe(true);
      }
    });

    it('stores the fetched rates in Redis with the configured TTL', async () => {
      const { service, mockRedis } = makeService();

      await service.getRates();

      expect(mockRedis.set).toHaveBeenCalledWith(
        'monobank:rates',
        expect.any(String),
        'EX',
        expect.any(Number),
      );
    });

    it('keys the rates map as "currencyCodeA:currencyCodeB"', async () => {
      const { service } = makeService();

      const result = await service.getRates();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect([...result.value.keys()]).toEqual(
          expect.arrayContaining(['840:980', '978:980']),
        );
      }
    });

    it('still returns rates when Redis write fails', async () => {
      const { service, mockLogger } = makeService({
        redisSet: jest.fn().mockRejectedValue(new Error('Redis write error')),
      });

      const result = await service.getRates();

      expect(result.ok).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        expect.stringContaining('Redis write failed'),
      );
    });
  });

  describe('getRates — Redis read failure', () => {
    it('falls through to the API when Redis read throws', async () => {
      const { service, mockHttpService, mockLogger } = makeService({
        redisGet: jest.fn().mockRejectedValue(new Error('Redis connection error')),
      });

      const result = await service.getRates();

      expect(result.ok).toBe(true);
      expect(mockHttpService.get).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        expect.stringContaining('Redis read failed'),
      );
    });
  });

  describe('getRates — API failure', () => {
    it('returns MONOBANK_API_UNAVAILABLE when the API call fails', async () => {
      const { service, mockLogger } = makeService({
        httpGet: jest.fn().mockReturnValue(throwError(() => new Error('Network error'))),
      });

      const result = await service.getRates();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.type).toBe('MONOBANK_API_UNAVAILABLE');
      }
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getRates — concurrent call deduplication', () => {
    it('calls the Monobank API exactly once for concurrent cache misses', async () => {
      const { service, mockHttpService } = makeService();

      const results = await Promise.all(
        Array.from({ length: 10 }, () => service.getRates()),
      );

      results.forEach(r => expect(r.ok).toBe(true));
      expect(mockHttpService.get).toHaveBeenCalledTimes(1);
    });
  });
});
