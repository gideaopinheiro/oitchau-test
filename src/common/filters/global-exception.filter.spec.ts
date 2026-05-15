import { BadRequestException, HttpStatus } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

const makeHost = (method = 'POST', url = '/currency/convert'): ArgumentsHost => {
  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
  const mockResponse = { status: mockStatus };
  const mockRequest = { method, url };

  return {
    switchToHttp: jest.fn().mockReturnValue({
      getResponse: jest.fn().mockReturnValue(mockResponse),
      getRequest: jest.fn().mockReturnValue(mockRequest),
    }),
  } as unknown as ArgumentsHost;
};

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockLogger: { error: jest.Mock; warn: jest.Mock };

  beforeEach(() => {
    mockLogger = { error: jest.fn(), warn: jest.fn() };
    filter = new GlobalExceptionFilter(mockLogger as any);
  });

  describe('when exception is an HttpException', () => {
    it('responds with the exception status and message', () => {
      const host = makeHost();
      const mockJson = (host.switchToHttp().getResponse() as any).status().json;

      filter.catch(new BadRequestException('invalid input'), host);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'invalid input',
        }),
      );
    });

    it('does not call logger.error for expected HTTP errors', () => {
      filter.catch(new BadRequestException('invalid input'), makeHost());
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('includes timestamp and path in the response', () => {
      const host = makeHost('POST', '/currency/convert');
      const mockJson = (host.switchToHttp().getResponse() as any).status().json;

      filter.catch(new BadRequestException('err'), host);

      const payload = mockJson.mock.calls[0][0];
      expect(payload.path).toBe('/currency/convert');
      expect(payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('when exception is not an HttpException', () => {
    it('responds with 500 and a safe generic message', () => {
      const host = makeHost();
      const mockJson = (host.switchToHttp().getResponse() as any).status().json;

      filter.catch(new Error('database exploded'), host);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
        }),
      );
    });

    it('logs the error with the original exception', () => {
      const cause = new Error('unexpected crash');
      filter.catch(cause, makeHost());

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: cause }),
        expect.stringContaining('POST /currency/convert'),
      );
    });

    it('wraps non-Error exceptions in an Error before logging', () => {
      filter.catch('string error', makeHost());

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        expect.any(String),
      );
    });
  });
});
