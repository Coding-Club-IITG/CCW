/**
 * Returns the display name with pizza emojis appended based on pizza_count
 */
export function getDisplayName(name: string, pizzaCount: number = 0): string {
  if (!pizzaCount || pizzaCount <= 0) return name;
  return `${name} ${"🍕".repeat(pizzaCount)}`;
}

/** Stored avatars may be protocol-relative */
export function normalizeAvatar(image?: string | null): string | null {
  if (!image) return null;
  return image.startsWith("//") ? `https:${image}` : image;
}
