import { Body, Controller, Post } from '@nestjs/common';
import { CurrencyService } from './currency.service';
import { ConvertCurrencyDto } from './dto/convert-currency.dto';
import { toHttpException } from '../common/http-error.mapper';

@Controller('currency')
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  @Post('convert')
  async convert(@Body() dto: ConvertCurrencyDto) {
    const result = await this.currencyService.convert(dto.from, dto.to, dto.amount);
    if (!result.ok) throw toHttpException(result.error);
    return result.value;
  }
}
