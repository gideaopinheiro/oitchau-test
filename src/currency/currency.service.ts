import { Injectable } from '@nestjs/common';
import { MonobankService } from '../monobank/monobank.service';
import { MonobankRate } from '../monobank/interfaces/monobank-rate.interface';
import { err, ok, ResultAsync } from '../common/result';
import { AppError } from '../common/errors';
import { ConversionResult } from './interfaces/conversion-result.interface';
import { ISO_CURRENCY_CODES, UAH_CODE } from './currency.constants';

@Injectable()
export class CurrencyService {
  constructor(private readonly monobankService: MonobankService) {}

  async convert(
    from: string,
    to: string,
    amount: number,
  ): ResultAsync<ConversionResult, AppError> {
    const fromCode = ISO_CURRENCY_CODES[from];
    const toCode = ISO_CURRENCY_CODES[to];

    if (fromCode === undefined)
      return err({ type: 'UNKNOWN_CURRENCY_CODE', code: from });
    if (toCode === undefined)
      return err({ type: 'UNKNOWN_CURRENCY_CODE', code: to });

    if (fromCode === toCode) {
      return ok({ from, to, amount, convertedAmount: amount, rate: 1 });
    }

    const ratesResult = await this.monobankService.getRates();
    if (!ratesResult.ok) return ratesResult;

    const rates = ratesResult.value;
    const convertedAmount = this.resolveConversion(
      rates,
      fromCode,
      toCode,
      amount,
    );

    if (convertedAmount === null) {
      return err({ type: 'CURRENCY_PAIR_NOT_SUPPORTED', from, to });
    }

    return ok({
      from,
      to,
      amount,
      convertedAmount: +convertedAmount.toFixed(4),
      rate: +(convertedAmount / amount).toFixed(6),
    });
  }

  private resolveConversion(
    rates: Map<string, MonobankRate>,
    fromCode: number,
    toCode: number,
    amount: number,
  ): number | null {
    // Direct pair: bank buys `from`, gives `to` → use rateBuy
    const direct = rates.get(`${fromCode}:${toCode}`);
    if (direct) {
      if (direct.rateBuy !== undefined) return amount * direct.rateBuy;
      if (direct.rateCross !== undefined) return amount * direct.rateCross;
    }

    // Inverse pair: bank sells `from` for `to` → use rateSell
    const inverse = rates.get(`${toCode}:${fromCode}`);
    if (inverse) {
      if (inverse.rateSell !== undefined) return amount / inverse.rateSell;
      if (inverse.rateCross !== undefined) return amount / inverse.rateCross;
    }

    // Cross via UAH
    const fromToUAH = this.getToUAHRate(rates, fromCode);
    const toToUAH = this.getToUAHRate(rates, toCode);
    if (fromToUAH !== null && toToUAH !== null) {
      return amount * (fromToUAH / toToUAH);
    }

    return null;
  }

  private getToUAHRate(
    rates: Map<string, MonobankRate>,
    code: number,
  ): number | null {
    if (code === UAH_CODE) return 1;

    const pair = rates.get(`${code}:${UAH_CODE}`);
    if (pair) return pair.rateBuy ?? pair.rateCross ?? null;

    return null;
  }
}
