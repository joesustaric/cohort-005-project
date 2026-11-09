import { formatPrice } from "~/lib/utils";

export const REFUND_WINDOW_DAYS = 14;
export const REFUND_WATCH_LIMIT_SECONDS = 2 * 60 * 60;
export const REFUND_COMPLETION_LIMIT = 0.5;

export type RefundFacts = {
  purchasedAt: string;
  today: Date;
  hasOpenRefundRequest: boolean;
  isClaimedTeamSeat: boolean;
  secondsWatched: number;
  completedLessons: number;
  totalLessons: number;
};

export type RefundEligibility =
  | { eligible: true; lastDayInWindow: string }
  | { eligible: false; status: 403 | 409; message: string };

// The Refund window is counted in whole calendar days, not hours — someone who
// buys at 23:00 still gets the whole of their fourteenth day.
function asDayString(when: Date): string {
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${when.getFullYear()}-${month}-${day}`;
}

export function assessRefundEligibility(
  facts: RefundFacts
): RefundEligibility {
  if (facts.hasOpenRefundRequest) {
    return {
      eligible: false,
      status: 409,
      message: "You already have a refund request open on this purchase.",
    };
  }

  if (facts.isClaimedTeamSeat) {
    return {
      eligible: false,
      status: 403,
      message: "A claimed team seat cannot be refunded.",
    };
  }

  const purchased = new Date(facts.purchasedAt);
  const windowEnd = new Date(purchased);
  windowEnd.setDate(windowEnd.getDate() + REFUND_WINDOW_DAYS);
  const lastDayInWindow = asDayString(windowEnd);
  const today = asDayString(facts.today);

  if (today < asDayString(purchased) || today > lastDayInWindow) {
    return {
      eligible: false,
      status: 403,
      message: `The ${REFUND_WINDOW_DAYS}-day refund window has closed.`,
    };
  }

  if (
    facts.totalLessons > 0 &&
    facts.completedLessons / facts.totalLessons >= REFUND_COMPLETION_LIMIT
  ) {
    return {
      eligible: false,
      status: 403,
      message: "You have completed too much of this course to get a refund.",
    };
  }

  if (facts.secondsWatched >= REFUND_WATCH_LIMIT_SECONDS) {
    return {
      eligible: false,
      status: 403,
      message: "You have watched too much of this course to get a refund.",
    };
  }

  return { eligible: true, lastDayInWindow };
}

/**
 * The confirmation the learner gets in their inbox. There is no mail
 * transport wired up yet, so the built message goes to the server log.
 */
export function buildRefundRequestedEmail(input: {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  amount: number;
}) {
  return {
    to: input.learnerEmail,
    subject: `Refund requested — ${input.courseTitle}`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      `We have your refund request for "${input.courseTitle}".`,
      `The refund is for ${formatPrice(input.amount)}, the amount you paid.`,
      "",
      "Our team reviews every refund request by hand. You do not need to do anything else — we will email you again when it is done.",
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}
