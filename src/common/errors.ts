export type AppError =
  | { type: 'UNKNOWN_CURRENCY_CODE'; code: string }
  | { type: 'CURRENCY_PAIR_NOT_SUPPORTED'; from: string; to: string }
  | { type: 'MONOBANK_API_UNAVAILABLE'; cause?: unknown }
  | { type: 'CACHE_ERROR'; cause?: unknown };
