# Currency Converter API

A NestJS API that converts currencies using real-time exchange rates from the [Monobank public API](https://api.monobank.ua/docs/), with Redis caching to avoid redundant external calls.

## Stack

- **NestJS** + TypeScript
- **ioredis** — Redis client for caching
- **nestjs-pino** — structured JSON logging (pretty-printed in development)
- **class-validator** — DTO validation
- **Result pattern** — custom `Result<T, E>` type for explicit error handling without exceptions in the service layer

## Prerequisites

- Node.js 20+
- pnpm
- Docker (for Redis)

## Setup

```bash
# 1. Start Redis
docker compose up -d

# 2. Install dependencies
pnpm install

# 3. Create env file
cp .env.example .env

# 4. Start in dev mode
pnpm start:dev
```

## Environment variables

| Variable            | Default                                 | Description                                                                              |
| ------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `PORT`              | `3000`                                  | HTTP port                                                                                |
| `REDIS_URL`         | `redis://localhost:6379`                | Redis connection string                                                                  |
| `MONOBANK_API_URL`  | `https://api.monobank.ua/bank/currency` | Monobank rates endpoint                                                                  |
| `CACHE_TTL_SECONDS` | `300`                                   | Cache TTL — 300s matches Monobank's own update frequency                                 |
| `LOG_LEVEL`         | `info`                                  | Pino log level: `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` \| `silent` |
| `NODE_ENV`          | —                                       | Set to `production` for JSON logs; any other value enables pretty-printed output         |

## Endpoint

### `POST /currency/convert`

**Request body:**

```json
{
  "from": "USD",
  "to": "UAH",
  "amount": 100
}
```

**Response:**

```json
{
  "from": "USD",
  "to": "UAH",
  "amount": 100,
  "convertedAmount": 4150,
  "rate": 41.5
}
```

### Supported currencies

`USD`, `EUR`, `UAH`, `GBP`, `CHF`, `PLN`, `CZK`, `CAD`, `JPY`, `AUD`

### Error responses

All errors follow the same shape:

```json
{
  "statusCode": 400,
  "message": "Unknown currency code: XYZ",
  "timestamp": "2026-05-14T10:00:00.000Z",
  "path": "/currency/convert"
}
```

| Scenario                                 | Status |
| ---------------------------------------- | ------ |
| Invalid DTO (bad format, missing fields) | 400    |
| Unknown currency code                    | 400    |
| Pair not available in Monobank data      | 400    |
| Monobank API unavailable                 | 503    |

## Caching strategy

Rates are cached in Redis under a single key (`monobank:rates`) for `CACHE_TTL_SECONDS`. On cache miss, the API is called once — concurrent requests are deduplicated in memory so only one outbound call is made per instance.

> **Multi-instance note:** the in-memory deduplication is per-instance. In a horizontally scaled deployment, the Redis cache still prevents most redundant calls, but a proper solution would require a background worker that refreshes the cache proactively, decoupling the HTTP service from the Monobank API entirely.

## Conversion logic

Rates are resolved in order:

1. **Direct pair** — e.g. USD→UAH found as `840:980` in Monobank data
2. **Inverse pair** — e.g. UAH→USD resolved by inverting the `840:980` pair
3. **Cross via UAH** — e.g. GBP→PLN computed as `(GBP→UAH) / (PLN→UAH)`

If no path resolves, the pair is reported as unsupported.

## Running tests

```bash
# Unit tests
pnpm test

# Unit tests with coverage report
pnpm test:cov
```

## Postman collection

Import `postman_collection.json` from the project root. The `{{baseUrl}}` variable defaults to `http://localhost:3000`.

## Design decisions

**Result pattern over exceptions in the service layer** — services return `Result<T, E>` instead of throwing. This makes error paths explicit in the type signature and forces the caller (controller) to handle them. NestJS exceptions are only introduced at the HTTP boundary via a single mapper function, keeping domain logic framework-agnostic.

**Single Redis key for all rates** — all exchange rates are stored serialized under one key (`monobank:rates`) rather than one key per currency pair. This makes reads and writes atomic: one `GET` retrieves everything, one `SET` with a single TTL replaces it. Per-pair keys would require pipelines to stay consistent and complicate TTL management.

**Cache TTL defaults to 300s** — Monobank's own documentation states rates are cached and updated at most once every 5 minutes. Caching for less than 300s produces redundant API calls against data that hasn't changed; caching for more serves stale data without benefit.

**In-memory promise deduplication on cache miss** — when the cache expires and multiple concurrent requests arrive simultaneously, only the first one calls the Monobank API; the rest await the same promise. This prevents cache stampede without introducing a distributed lock. The trade-off — deduplication is per-instance — is documented and acceptable for a single-instance deployment.

**Three-path rate resolution (direct → inverse → UAH cross)** — Monobank publishes rates primarily as foreign currency against UAH. Direct pairs between two foreign currencies (e.g. EUR:USD) exist for common combinations but not all. Resolving through UAH as a pivot covers the remaining cases without requiring a full cross-rate matrix.

**Native floating-point arithmetic for conversions** — It is common in Node.js applications with financial calculations to use libraries like `decimal.js` to avoid precision issues inherent to floating-point arithmetic. However, in this case, the application is only a currency converter, not a payments or accounting system. Since the rates already come from the `Monobank API` as limited-precision floats and the final result is rounded to 4 decimal places using `toFixed(4)`, adding `decimal.js` would not provide any practical correctness benefit in this scenario.
