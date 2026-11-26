import { describe, expect, it } from "vitest";
import { computeCycleMath, selectCycleMembers } from "./cycle-math";

describe("cycle math", () => {
  it("includes archived members with cycle history in the fixed cost denominator", () => {
    const roster = [
      { id: "active-1", name: "A", sortOrder: 0 },
      { id: "archived", name: "B", sortOrder: 1, deletedAt: "2026-01-01" },
      { id: "archived-no-history", name: "C", sortOrder: 2, deletedAt: "2026-01-02" },
      { id: "active-2", name: "D", sortOrder: 3 },
    ];
    const members = selectCycleMembers(roster, ["archived"]);
    const result = computeCycleMath({
      members,
      deposits: [],
      expenses: [{ amount: 40, type: "utility" }],
      mealLogs: [],
    });

    expect(members.map((member) => member.id)).toEqual(["active-1", "active-2", "archived"]);
    expect(result.stats.utilityCostPerMember).toBeCloseTo(40 / 3);
    expect(result.members.find((member) => member.id === "archived")?.utilityCost).toBeCloseTo(40 / 3);
  });

  it("preserves roster order and shares one meal rate and fixed cost calculation", () => {
    const result = computeCycleMath({
      members: [
        { id: "second", name: "Second" },
        { id: "first", name: "First" },
      ],
      deposits: [
        { memberId: "second", amount: 30 },
        { memberId: "first", amount: 20 },
      ],
      expenses: [
        { amount: 30, type: "meal" },
        { amount: 10, type: "utility" },
      ],
      mealLogs: [
        { memberId: "second", count: 2 },
        { memberId: "first", count: 1 },
      ],
    });

    expect(result.members.map((member) => member.id)).toEqual(["second", "first"]);
    expect(result.stats.currentMealRate).toBe(10);
    expect(result.stats.utilityCostPerMember).toBe(5);
    expect(result.members.map((member) => member.balance)).toEqual([5, 5]);
    expect(result.stats.remainingCash).toBe(10);
  });

  it("distributes utility cost from unstaffed slices when a cycle is backdated", () => {
    const result = computeCycleMath({
      members: [
        { id: "joined-mid-cycle", name: "A", createdAt: "2026-01-06T00:00:00.000Z" },
        { id: "joined-at-end", name: "B", createdAt: "2026-01-11T00:00:00.000Z" },
      ],
      deposits: [],
      expenses: [{ amount: 100, type: "utility" }],
      mealLogs: [],
      cycleStartedAt: "2026-01-01T00:00:00.000Z",
      cycleEndedAt: "2026-01-11T00:00:00.000Z",
    });

    const allocatedUtility = result.members.reduce((sum, member) => sum + member.utilityCost, 0);
    expect(result.members.map((member) => member.utilityCost)).toEqual([75, 25]);
    expect(allocatedUtility).toBeCloseTo(result.stats.totalUtilityExpenses);
    expect(result.stats.utilityCostPerMember).toBe(50);
  });

  it("starts a restored member's utility proration at their rejoin date", () => {
    const result = computeCycleMath({
      members: [
        {
          id: "restored",
          name: "Restored member",
          createdAt: "2026-04-10T00:00:00.000Z",
          joinedAt: "2026-01-06T00:00:00.000Z",
        },
        {
          id: "continuing",
          name: "Continuing member",
          createdAt: "2026-04-10T00:00:00.000Z",
          joinedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      deposits: [],
      expenses: [{ amount: 100, type: "utility" }],
      mealLogs: [],
      cycleStartedAt: "2026-01-01T00:00:00.000Z",
      cycleEndedAt: "2026-01-11T00:00:00.000Z",
    });

    expect(result.members.map((member) => member.utilityCost)).toEqual([25, 75]);
    expect(result.members.reduce((sum, member) => sum + member.utilityCost, 0)).toBe(100);
  });

  it("ignores deposits and meal logs for members outside the cycle roster", () => {
    const result = computeCycleMath({
      members: [{ id: "known", name: "Known" }],
      deposits: [
        { memberId: "known", amount: 10 },
        { memberId: "unknown", amount: 500 },
      ],
      expenses: [{ amount: 10, type: "meal" }],
      mealLogs: [
        { memberId: "known", count: 1 },
        { memberId: "unknown", count: 99 },
      ],
    });

    expect(result.stats.totalDeposits).toBe(10);
    expect(result.stats.totalMealsConsumed).toBe(1);
    expect(result.members[0].balance).toBe(0);
  });
});
