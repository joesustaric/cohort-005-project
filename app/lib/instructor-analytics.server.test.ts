import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { markdown } from "~/lib/text";
import { getInstructorAnalytics } from "./instructor-analytics.server";

const NOW = new Date(2026, 9, 6, 12, 0, 0);

function daysBefore(days: number) {
  const when = new Date(NOW);
  when.setDate(when.getDate() - days);
  return when.toISOString();
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let otherInstructor: typeof schema.users.$inferSelect;
let otherCourse: typeof schema.courses.$inferSelect;
let admin: typeof schema.users.$inferSelect;

function buy(courseId: number, amountPaid: number, createdAt: string) {
  db.insert(schema.purchases)
    .values({ userId: base.user.id, courseId, amountPaid, createdAt })
    .run();
}

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  otherInstructor = db
    .insert(schema.users)
    .values({
      name: "Other Instructor",
      email: "other@example.com",
      role: schema.UserRole.Instructor,
    })
    .returning()
    .get();

  admin = db
    .insert(schema.users)
    .values({
      name: "Admin",
      email: "admin@example.com",
      role: schema.UserRole.Admin,
    })
    .returning()
    .get();

  otherCourse = db
    .insert(schema.courses)
    .values({
      title: "Other Course",
      slug: "other-course",
      description: "Someone else's course",
      salesCopy: markdown("## Other"),
      instructorId: otherInstructor.id,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();

  buy(base.course.id, 1000, daysBefore(2));
  buy(otherCourse.id, 5000, daysBefore(2));
});

describe("getInstructorAnalytics", () => {
  describe("who sees what", () => {
    it("pins an instructor to their own figures whatever they ask for", () => {
      const result = getInstructorAnalytics(
        db,
        { userId: base.instructor.id, isAdmin: false },
        { range: "30d", instructorId: otherInstructor.id, courseId: null },
        NOW
      );

      expect(result.instructorId).toBe(base.instructor.id);
      expect(result.summary.grossCents).toBe(1000);
    });

    it("lets an admin pick an instructor, or see everyone with none picked", () => {
      const viewer = { userId: admin.id, isAdmin: true };

      const picked = getInstructorAnalytics(
        db,
        viewer,
        { range: "30d", instructorId: otherInstructor.id, courseId: null },
        NOW
      );
      const everyone = getInstructorAnalytics(
        db,
        viewer,
        { range: "30d", instructorId: null, courseId: null },
        NOW
      );

      expect(picked.summary.grossCents).toBe(5000);
      expect(everyone.summary.grossCents).toBe(6000);
    });

    it("drops a course the instructor does not own", () => {
      const result = getInstructorAnalytics(
        db,
        { userId: base.instructor.id, isAdmin: false },
        { range: "30d", instructorId: null, courseId: otherCourse.id },
        NOW
      );

      expect(result.selectedCourseId).toBeNull();
      expect(result.funnel).toBeNull();
    });
  });

  describe("the clock", () => {
    it("measures the range back from the given moment", () => {
      buy(base.course.id, 300, daysBefore(10));
      const viewer = { userId: base.instructor.id, isAdmin: false };
      const query = { range: "7d" as const, instructorId: null, courseId: null };

      expect(
        getInstructorAnalytics(db, viewer, query, NOW).summary.grossCents
      ).toBe(1000);

      const sixDaysLater = new Date(NOW);
      sixDaysLater.setDate(sixDaysLater.getDate() + 6);
      expect(
        getInstructorAnalytics(db, viewer, query, sixDaysLater).summary
          .grossCents
      ).toBe(0);
    });

    it("counts refund exposure in days left from the given moment", () => {
      buy(base.course.id, 400, daysBefore(14));
      buy(base.course.id, 700, daysBefore(15));

      const { refundExposure } = getInstructorAnalytics(
        db,
        { userId: base.instructor.id, isAdmin: false },
        { range: "all", instructorId: null, courseId: null },
        NOW
      );

      // Two days in leaves twelve; fourteen days in is the last day; fifteen
      // is past the window.
      expect(refundExposure.grossCents).toBe(1400);
      expect(refundExposure.purchaseCount).toBe(2);
      expect(refundExposure.closingTodayCount).toBe(1);
      expect(refundExposure.courses).toEqual([
        expect.objectContaining({ courseId: base.course.id, daysLeft: 0 }),
      ]);
    });

    it("runs the revenue series up to the given moment", () => {
      const { series } = getInstructorAnalytics(
        db,
        { userId: base.instructor.id, isAdmin: false },
        { range: "7d", instructorId: null, courseId: null },
        NOW
      );

      expect(series.points.at(-1)?.bucket).toBe(
        NOW.toISOString().slice(0, 10)
      );
    });
  });
});
