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

// Shared logger
// Outputs in development environment
const createLogger = (level: "log" | "warn" | "error" | "debug") => {
  return (...args: unknown[]) => {
    if (
      process.env.NODE_ENV === "development" ||
      level === "error" ||
      level === "warn"
    ) {
      console[level]("[CCW]", ...args);
    }
  };
};

export const logger = {
  info: createLogger("log"),
  warn: createLogger("warn"),
  error: createLogger("error"),
  debug: createLogger("debug"),
};
