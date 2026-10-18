/** Convert Bengali numerals to ASCII digits for JavaScript numeric parsing. */
export function normalizeBengaliDigits(value: string): string {
  return value.replace(/[\u09E6-\u09EF]/g, (digit) =>
    String(digit.charCodeAt(0) - 0x09e6),
  );
}
