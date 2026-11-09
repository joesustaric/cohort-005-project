import { describe, it, expect } from "vitest";
import { assessRefundEligibility, type RefundFacts } from "./refunds";

const eligible: RefundFacts = {
  purchasedAt: "2026-03-01T23:00:00",
  today: new Date("2026-03-05T12:00:00"),
  hasOpenRefundRequest: false,
  isClaimedTeamSeat: false,
  secondsWatched: 0,
  completedLessons: 0,
  totalLessons: 10,
};

describe("assessRefundEligibility", () => {
  it("is eligible inside the Refund window with little progress", () => {
    expect(assessRefundEligibility(eligible)).toEqual({
      eligible: true,
      lastDayInWindow: "2026-03-15",
    });
  });

  it("includes the last day of the Refund window", () => {
    const result = assessRefundEligibility({
      ...eligible,
      today: new Date("2026-03-15T23:59:00"),
    });
    expect(result.eligible).toBe(true);
  });

  it("is not eligible the day after the Refund window closes", () => {
    const result = assessRefundEligibility({
      ...eligible,
      today: new Date("2026-03-16T00:01:00"),
    });
    expect(result).toMatchObject({ eligible: false, status: 403 });
  });

  it("is not eligible once half the lessons are completed", () => {
    const result = assessRefundEligibility({
      ...eligible,
      completedLessons: 5,
    });
    expect(result).toMatchObject({ eligible: false, status: 403 });
  });

  it("is not eligible after two hours watched", () => {
    const result = assessRefundEligibility({
      ...eligible,
      secondsWatched: 2 * 60 * 60,
    });
    expect(result).toMatchObject({ eligible: false, status: 403 });
  });

  it("is not eligible for a claimed team seat", () => {
    const result = assessRefundEligibility({
      ...eligible,
      isClaimedTeamSeat: true,
    });
    expect(result).toMatchObject({ eligible: false, status: 403 });
  });

  it("is not eligible while a Refund request is already open", () => {
    const result = assessRefundEligibility({
      ...eligible,
      hasOpenRefundRequest: true,
    });
    expect(result).toMatchObject({ eligible: false, status: 409 });
  });
});
