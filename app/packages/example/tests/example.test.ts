import { describe, expect, it } from "vitest";
import { greet } from "../index";

describe("greet", () => {
  it("capitalises and trims the name", () => {
    expect(greet("  ada ")).toBe("Hello, Ada!");
  });

  it("falls back for an empty name", () => {
    expect(greet("   ")).toBe("Hello, stranger!");
  });
});
