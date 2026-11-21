import { count, countDistinct, desc, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import {
  CourseStatus,
  categories,
  courses,
  lessons,
  modules,
  users,
} from "~/db/schema";

// ─── Landing ───
// Everything the landing page (`/`) shows about the catalogue: the newest
// published courses and the headline figures. Only published courses count;
// a draft or archived course is not something anyone can buy.

export type Db = BetterSQLite3Database<typeof schema>;

const FEATURED_COURSE_COUNT = 3;

export type FeaturedCourse = {
  id: number;
  title: string;
  slug: string;
  description: string;
  coverImageUrl: string | null;
  instructorName: string;
  lessonCount: number;
};

export type LandingStats = {
  courses: number;
  categories: number;
  lessons: number;
  instructors: number;
};

export type LandingPage = {
  featuredCourses: FeaturedCourse[];
  stats: LandingStats;
};

const isPublished = eq(courses.status, CourseStatus.Published);

function lessonCountsByCourse(db: Db) {
  return db
    .select({
      courseId: modules.courseId,
      lessonCount: count(lessons.id).as("lesson_count"),
    })
    .from(modules)
    .innerJoin(lessons, eq(lessons.moduleId, modules.id))
    .groupBy(modules.courseId)
    .as("lesson_counts");
}

function getFeaturedCourses(db: Db): FeaturedCourse[] {
  const lessonCounts = lessonCountsByCourse(db);
  return db
    .select({
      id: courses.id,
      title: courses.title,
      slug: courses.slug,
      description: courses.description,
      coverImageUrl: courses.coverImageUrl,
      instructorName: users.name,
      lessonCount: sql<number>`coalesce(${lessonCounts.lessonCount}, 0)`,
    })
    .from(courses)
    .innerJoin(users, eq(courses.instructorId, users.id))
    .leftJoin(lessonCounts, eq(lessonCounts.courseId, courses.id))
    .where(isPublished)
    .orderBy(desc(courses.createdAt), desc(courses.id))
    .limit(FEATURED_COURSE_COUNT)
    .all();
}

function getStats(db: Db): LandingStats {
  const published = db
    .select({
      courses: count(courses.id),
      instructors: countDistinct(courses.instructorId),
    })
    .from(courses)
    .where(isPublished)
    .get();

  const publishedLessons = db
    .select({ lessons: count(lessons.id) })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(isPublished)
    .get();

  const allCategories = db
    .select({ categories: count(categories.id) })
    .from(categories)
    .get();

  return {
    courses: published?.courses ?? 0,
    instructors: published?.instructors ?? 0,
    lessons: publishedLessons?.lessons ?? 0,
    categories: allCategories?.categories ?? 0,
  };
}

export function getLandingPage(db: Db): LandingPage {
  return { featuredCourses: getFeaturedCourses(db), stats: getStats(db) };
}
