/** Parse an explicitly supplied decimal USD amount without binary multiplication or rounding. */
export function dollarsToCents(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) {
    throw new Error("Enter nonnegative dollars with at most two decimal places; omit currency symbols and separators.");
  }
  const [whole, fraction = ""] = text.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("The dollar amount exceeds the supported exact-cent range.");
  return Number(cents);
}
