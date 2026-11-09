import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  coupons,
  lessonProgress,
  LessonProgressStatus,
  lessons,
  modules,
  purchases,
  refunds,
  RefundStatus,
  videoWatchEvents,
} from "~/db/schema";
import { assessRefundEligibility, type RefundEligibility } from "~/lib/refunds";

function getLatestPurchase(userId: number, courseId: number) {
  return db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .orderBy(sql`${purchases.createdAt} desc`)
    .get();
}

function getLessonIdsForCourse(courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

function hasOpenRefundRequest(purchaseId: number) {
  return !!db
    .select({ id: refunds.id })
    .from(refunds)
    .where(
      and(
        eq(refunds.purchaseId, purchaseId),
        eq(refunds.status, RefundStatus.Requested)
      )
    )
    .get();
}

// A seat that came out of a team licence, and has been claimed, belongs to
// the team — the learner cannot hand it back on their own.
function isClaimedTeamSeat(purchaseId: number) {
  return !!db
    .select({ id: coupons.id })
    .from(coupons)
    .where(
      and(eq(coupons.purchaseId, purchaseId), isNotNull(coupons.redeemedAt))
    )
    .get();
}

function countCompletedLessons(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();

  return result?.count ?? 0;
}

function sumSecondsWatched(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  return db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all()
    .reduce((total, row) => total + row.furthest, 0);
}

export type RefundOffer =
  | { purchase: null }
  | {
      purchase: typeof purchases.$inferSelect;
      refundableAmount: number;
      eligibility: RefundEligibility;
    };

/**
 * Whether the learner's latest Purchase of a course is eligible for a refund,
 * and the Refundable amount if so.
 */
export function getRefundOffer(userId: number, courseId: number): RefundOffer {
  const purchase = getLatestPurchase(userId, courseId);
  if (!purchase) return { purchase: null };

  const lessonIds = getLessonIdsForCourse(courseId);

  const eligibility = assessRefundEligibility({
    purchasedAt: purchase.createdAt,
    today: new Date(),
    hasOpenRefundRequest: hasOpenRefundRequest(purchase.id),
    isClaimedTeamSeat: isClaimedTeamSeat(purchase.id),
    secondsWatched: sumSecondsWatched(userId, lessonIds),
    completedLessons: countCompletedLessons(userId, lessonIds),
    totalLessons: lessonIds.length,
  });

  return { purchase, refundableAmount: purchase.amountPaid, eligibility };
}
