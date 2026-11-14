import { normaliseGreeting } from "./lib/impl";

export function greet(name: string): string {
  return normaliseGreeting(name);
}
