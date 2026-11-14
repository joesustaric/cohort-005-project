export function normaliseGreeting(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "Hello, stranger!";
  return `Hello, ${trimmed[0].toUpperCase()}${trimmed.slice(1)}!`;
}
