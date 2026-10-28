const CURRENCY_SYMBOL = '\u09F3';

export function formatMealCount(value: number, fractionDigits = 3) {
  const factor = 10 ** fractionDigits;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return rounded.toString();
}

export function formatCurrency(
  value: number,
  fractionDigits = 2,
  options: { absolute?: boolean; grouping?: boolean } = {},
) {
  const amount = options.absolute ? Math.abs(value) : value;
  const formatted = amount.toLocaleString('en-US', {
    useGrouping: options.grouping ?? false,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `${CURRENCY_SYMBOL}${formatted}`;
}

export function formatMoney(value: number, fractionDigits = 2) {
  return formatCurrency(value, fractionDigits, { absolute: true, grouping: true });
}

export function formatSignedMoney(value: number, fractionDigits = 2) {
  return `${value < 0 ? '−' : '+'}${formatMoney(value, fractionDigits)}`;
}

export function formatWholeCurrency(value: number) {
  return formatCurrency(value, 0);
}
