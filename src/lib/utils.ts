/**
 * Returns the display name with pizza emojis appended based on pizza_count
 */
export function getDisplayName(name: string, pizzaCount: number = 0): string {
  if (!pizzaCount || pizzaCount <= 0) return name;
  return `${name} ${"🍕".repeat(pizzaCount)}`;
}

// Formats a date to a readable string
export function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export { errorToLogMetadata, logger } from "@/lib/logger";
export type { LogMetadata } from "@/lib/logger";
