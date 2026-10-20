import { describe, expect, it } from 'vitest';
import {
  compareMoney,
  CurrencyMismatchError,
  formatMoney,
  fromDecimal,
  money,
  MoneyRangeSchema,
  MoneySchema,
  toDecimalString,
} from '../src/index.ts';

describe('money (ADR-006, SPEC-08)', () => {
  it('parses decimals exactly for each exponent', () => {
    expect(fromDecimal('USD', '300').minorUnits).toBe('30000');
    expect(fromDecimal('USD', '0.1').minorUnits).toBe('10');
    expect(fromDecimal('JPY', '1500').minorUnits).toBe('1500');
    expect(fromDecimal('KWD', '1.234').minorUnits).toBe('1234');
  });

  it('rejects too many decimal places instead of rounding', () => {
    expect(() => fromDecimal('USD', '1.234')).toThrow(/at most 2/);
    expect(() => fromDecimal('JPY', '1.5')).toThrow(/at most 0/);
  });

  it('rejects unknown currencies and malformed minor units', () => {
    expect(MoneySchema.safeParse({ currency: 'XYZ', minorUnits: '1' }).success).toBe(false);
    expect(MoneySchema.safeParse({ currency: 'USD', minorUnits: '-1' }).success).toBe(false);
    expect(MoneySchema.safeParse({ currency: 'USD', minorUnits: '1.5' }).success).toBe(false);
    expect(MoneySchema.safeParse({ currency: 'USD', minorUnits: '007' }).success).toBe(false);
  });

  it('never compares across currencies', () => {
    expect(() => compareMoney(money('USD', '100'), money('EUR', '100'))).toThrow(CurrencyMismatchError);
    expect(compareMoney(money('USD', '29999'), money('USD', '30000'))).toBe(-1);
  });

  it('formats exactly, including three-decimal currencies', () => {
    expect(toDecimalString(money('USD', '5'))).toBe('0.05');
    expect(toDecimalString(money('BHD', '1234'))).toBe('1.234');
    expect(formatMoney(money('USD', '30000'))).toBe('$300.00');
    expect(formatMoney(money('USD', '900719925474099312'))).toBe('$9,007,199,254,740,993.12');
  });

  it('validates ranges', () => {
    const ok = MoneyRangeSchema.safeParse({ min: money('USD', '100'), max: money('USD', '200'), basis: 'project' });
    expect(ok.success).toBe(true);
    const inverted = MoneyRangeSchema.safeParse({ min: money('USD', '300'), max: money('USD', '200'), basis: 'project' });
    expect(inverted.success).toBe(false);
    const mixed = MoneyRangeSchema.safeParse({ min: money('USD', '100'), max: money('EUR', '200'), basis: 'project' });
    expect(mixed.success).toBe(false);
  });
});
