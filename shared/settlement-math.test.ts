import { describe, it, expect } from "vitest";
import {
  cleanCurrencyFloat,
  allocateIntegerBalances,
  computeSettlementSummary,
} from "./settlement-math";

describe("Settlement Math", () => {
  describe("cleanCurrencyFloat", () => {
    it("should round away tiny floating-point residue", () => {
      expect(cleanCurrencyFloat(0.00000000000004)).toBe(0);
      expect(cleanCurrencyFloat(-1e-14)).toBe(0);
      expect(cleanCurrencyFloat(100.33333333333)).toBe(100.3333);
    });
  });

  describe("allocateIntegerBalances", () => {
    it("returns empty map when members list is empty", () => {
      const result = allocateIntegerBalances([], 100);
      expect(result.size).toBe(0);
    });

    it("apportions 100 Taka evenly across 3 members with remainder awarded to largest fraction", () => {
      // 100 / 3 = 33.3333 each -> total floor = 99, 1 unit needed
      const members = [
        { id: "m1", name: "Alice", balance: 33.3334 },
        { id: "m2", name: "Bob", balance: 33.3333 },
        { id: "m3", name: "Charlie", balance: 33.3333 },
      ];

      const allocation = allocateIntegerBalances(members, 100);
      expect(allocation.get("m1")).toBe(34);
      expect(allocation.get("m2")).toBe(33);
      expect(allocation.get("m3")).toBe(33);

      const sum = Array.from(allocation.values()).reduce((a, b) => a + b, 0);
      expect(sum).toBe(100);
    });

    it("resolves ties deterministically using member ID", () => {
      const members = [
        { id: "b_user", name: "Bob", balance: 33.333333 },
        { id: "a_user", name: "Alice", balance: 33.333333 },
        { id: "c_user", name: "Charlie", balance: 33.333333 },
      ];

      // Ties sorted by ID ascending -> "a_user" gets the bonus
      const allocation1 = allocateIntegerBalances(members, 100);
      const allocation2 = allocateIntegerBalances(members, 100);

      expect(allocation1.get("a_user")).toBe(34);
      expect(allocation1.get("b_user")).toBe(33);
      expect(allocation1.get("c_user")).toBe(33);

      // Determinism test: multiple runs yield identical map
      expect(Array.from(allocation1.entries())).toEqual(Array.from(allocation2.entries()));
    });

    it("handles negative balances (due members) accurately", () => {
      const members = [
        { id: "m1", name: "Debtor", balance: -50.6 }, // floor = -51, rem = 0.4
        { id: "m2", name: "Creditor 1", balance: 80.3 }, // floor = 80, rem = 0.3
        { id: "m3", name: "Creditor 2", balance: 70.3 }, // floor = 70, rem = 0.3
      ];
      // Target remaining = 100
      // Sum floors: -51 + 80 + 70 = 99 -> neededUnits = 1
      // Rem: m1 (0.4) > m2 (0.3) = m3 (0.3) -> m1 gets bonus +1 -> -51 + 1 = -50
      const allocation = allocateIntegerBalances(members, 100);
      expect(allocation.get("m1")).toBe(-50);
      expect(allocation.get("m2")).toBe(80);
      expect(allocation.get("m3")).toBe(70);

      const sum = Array.from(allocation.values()).reduce((a, b) => a + b, 0);
      expect(sum).toBe(100);
    });
  });

  describe("computeSettlementSummary", () => {
    it("guarantees mathematical cashflow equilibrium: Outflow = Inflow + Leftover Cash", () => {
      // 5 members with arbitrary fractional balances
      const members = [
        { id: "m1", name: "Rahim", balance: 142.857 },
        { id: "m2", name: "Karim", balance: -85.714 },
        { id: "m3", name: "Salam", balance: 320.125 },
        { id: "m4", name: "Barkat", balance: -210.450 },
        { id: "m5", name: "Jabbar", balance: 83.182 },
      ];
      // Total raw balance = 142.857 - 85.714 + 320.125 - 210.450 + 83.182 = 250.0
      const remainingCash = 250;

      const summary = computeSettlementSummary(members, remainingCash);

      // Inflow = managerShouldGet + remainingCash
      // Outflow = managerShouldGive
      expect(summary.settlementMismatch).toBe(0);
      expect(summary.managerShouldGive).toBe(summary.managerGetPlusRemaining);
      expect(summary.roundedRemainingBalance).toBe(250);

      // All member allocations must be whole numbers
      for (const bal of summary.allocatedBalances.values()) {
        expect(Number.isInteger(bal)).toBe(true);
      }
    });

    it("works when remaining cash is zero", () => {
      const members = [
        { id: "m1", name: "Rahim", balance: 50.5 },
        { id: "m2", name: "Karim", balance: -50.5 },
      ];
      const summary = computeSettlementSummary(members, 0);

      expect(summary.settlementMismatch).toBe(0);
      expect(summary.managerShouldGive).toBe(summary.managerShouldGet);
      expect(summary.managerGetPlusRemaining).toBe(summary.managerShouldGive);
    });
  });
});
