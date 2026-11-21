import { db } from "~/db";
import { getLandingPage, type Db } from "./lib/landing";

export type {
  FeaturedCourse,
  LandingPage,
  LandingStats,
} from "./lib/landing";

/**
 * The landing page's catalogue data bound to a database. The app uses
 * `landing`, which reads the app database; tests build their own against a
 * test database.
 */
export function createLanding(database: Db) {
  return {
    /**
     * The newest published courses (at most three, each with its lesson
     * count) and the headline figures: published courses, categories,
     * lessons in published courses, and instructors with a published course.
     */
    get() {
      return getLandingPage(database);
    },
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const landing = /* @__PURE__ */ createLanding(db);
