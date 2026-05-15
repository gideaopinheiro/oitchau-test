# Currency Converter API

A NestJS API that converts currencies using real-time exchange rates from the [Monobank public API](https://api.monobank.ua/docs/), with Redis caching to avoid redundant external calls.

## Stack

- **NestJS** + TypeScript
- **ioredis** — Redis client for caching
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

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `MONOBANK_API_URL` | `https://api.monobank.ua/bank/currency` | Monobank rates endpoint |
| `CACHE_TTL_SECONDS` | `300` | Cache TTL — 300s matches Monobank's own update frequency |

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
  "convertedAmount": 4150.0000,
  "rate": 41.5000
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

| Scenario | Status |
|---|---|
| Invalid DTO (bad format, missing fields) | 400 |
| Unknown currency code | 400 |
| Pair not available in Monobank data | 400 |
| Monobank API unavailable | 503 |

## Caching strategy

Rates are cached in Redis under a single key (`monobank:rates`) for `CACHE_TTL_SECONDS`. On cache miss, the API is called once — concurrent requests are deduplicated in memory so only one outbound call is made per instance regardless of concurrency.

> **Multi-instance note:** the in-memory deduplication is per-instance. In a horizontally scaled deployment, the Redis cache still prevents most redundant calls, but a proper solution would require a background worker that refreshes the cache proactively, decoupling the HTTP service from the Monobank API entirely.

## Conversion logic

Rates are resolved in order:

1. **Direct pair** — e.g. USD→UAH found as `840:980` in Monobank data
2. **Inverse pair** — e.g. UAH→USD resolved by inverting the `840:980` pair
3. **Cross via UAH** — e.g. GBP→PLN computed as `(GBP→UAH) / (PLN→UAH)`

If no path resolves, the pair is reported as unsupported.

## Postman collection

Import `postman_collection.json` from the project root. The `{{baseUrl}}` variable defaults to `http://localhost:3000`.
