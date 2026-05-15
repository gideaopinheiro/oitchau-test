import { plainToInstance, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  PORT: number;

  @IsString()
  @IsNotEmpty()
  REDIS_URL: string;

  @IsOptional()
  @IsUrl()
  MONOBANK_API_URL: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  CACHE_TTL_SECONDS: number;

  @IsOptional()
  @IsString()
  @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  LOG_LEVEL: string;
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(
      errors
        .map((e) => Object.values(e.constraints ?? {}).join(', '))
        .join('\n'),
    );
  }

  return validated;
}
