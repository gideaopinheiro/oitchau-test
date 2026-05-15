import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { CurrencyModule } from './currency/currency.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { validate } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction = config.get<string>('NODE_ENV') === 'production';
        const level = config.get<string>('LOG_LEVEL', 'info');

        return {
          pinoHttp: {
            level,
            ...(isProduction
              ? {}
              : {
                  transport: {
                    target: 'pino-pretty',
                    options: {
                      colorize: true,
                      singleLine: true,
                      translateTime: 'SYS:HH:MM:ss.l',
                      ignore: 'pid,hostname',
                    },
                  },
                }),
          },
        };
      },
    }),
    CurrencyModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
