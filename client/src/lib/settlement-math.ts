/**
 * Settlement Math Utilities
 * 
 * Implements the Integer Largest-Remainder Method (Hare-Niemeyer / Hamilton apportionment)
 * for cash-based settlements. In contexts like Bangladeshi messes, transactions occur in
 * whole currency units (৳1, no fractional poisha).
 * 
 * This ensures that:
 * 1. All member settlement balances are exact integers.
 * 2. Sum(member.allocatedBalance) === roundedRemainingBalance.
 * 3. Manager Outflow (refunds) === Manager Inflow (collections) + Leftover Cash.
 * 4. Settlement mismatch is 0, eliminating false "Calculation Mismatch" lock blocks.
 */

const EPSILON = 1e-6;

/**
 * Normalizes floating-point inaccuracies to avoid rounding anomalies
 * (e.g. 0.00000000000004 or -1e-14).
 */
export function cleanCurrencyFloat(val: number): number {
  const rounded = Math.round((val + Number.EPSILON) * 10000) / 10000;
  return Math.abs(rounded) < EPSILON ? 0 : rounded;
}

/**
 * Distributes fractional remainders among members using the Largest-Remainder Method.
 * 
 * @param members List of members with their raw (floating-point) balances
 * @param targetRemainingBalance Total leftover cycle cash (deposits - expenses)
 * @returns Map of member ID to integer-apportioned balance
 */
export function allocateIntegerBalances(
  members: Array<{ id: string; name?: string; balance: number }>,
  targetRemainingBalance: number,
): Map<string, number> {
  const resultMap = new Map<string, number>();
  if (members.length === 0) {
    return resultMap;
  }

  const roundedTarget = Math.round(targetRemainingBalance);

  // Compute base floor and fractional remainder for each member
  const itemEntries = members.map((member) => {
    const raw = cleanCurrencyFloat(member.balance);
    const floor = Math.floor(raw);
    const rem = cleanCurrencyFloat(raw - floor);
    return {
      id: member.id,
      name: member.name ?? '',
      raw,
      floor,
      rem,
    };
  });

  const sumFloor = itemEntries.reduce((sum, item) => sum + item.floor, 0);
  const rawNeeded = roundedTarget - sumFloor;
  const neededUnits = Math.max(0, Math.min(itemEntries.length, rawNeeded));

  // Sort candidates by fractional remainder descending.
  // Deterministic tie-breaker uses member ID to prevent fluctuations between renders.
  const sorted = [...itemEntries].sort((a, b) => {
    if (Math.abs(b.rem - a.rem) > EPSILON) {
      return b.rem - a.rem;
    }
    return a.id.localeCompare(b.id);
  });

  const bonusIds = new Set<string>();
  for (let i = 0; i < neededUnits; i++) {
    bonusIds.add(sorted[i].id);
  }

  for (const item of itemEntries) {
    const finalBalance = item.floor + (bonusIds.has(item.id) ? 1 : 0);
    resultMap.set(item.id, finalBalance);
  }

  return resultMap;
}

export interface SettlementSummary {
  allocatedBalances: Map<string, number>;
  managerShouldGet: number;
  managerShouldGive: number;
  managerGetPlusRemaining: number;
  settlementMismatch: number;
  roundedRemainingBalance: number;
}

/**
 * Computes a completely balanced settlement summary where inflow equals outflow.
 */
export function computeSettlementSummary(
  members: Array<{ id: string; name?: string; balance: number }>,
  remainingBalance: number,
): SettlementSummary {
  const roundedRemainingBalance = Math.round(remainingBalance);
  const allocatedBalances = allocateIntegerBalances(members, roundedRemainingBalance);

  let managerShouldGet = 0;
  let managerShouldGive = 0;

  for (const member of members) {
    const bal = allocatedBalances.get(member.id) ?? Math.round(member.balance);
    if (bal < 0) {
      managerShouldGet += Math.abs(bal);
    } else if (bal > 0) {
      managerShouldGive += bal;
    }
  }

  const managerGetPlusRemaining = managerShouldGet + roundedRemainingBalance;
  const settlementMismatch = managerShouldGive - managerGetPlusRemaining;

  return {
    allocatedBalances,
    managerShouldGet,
    managerShouldGive,
    managerGetPlusRemaining,
    settlementMismatch,
    roundedRemainingBalance,
  };
}
