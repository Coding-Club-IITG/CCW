export interface ImageFocalPoint {
  x: number;
  y: number;
}

export const DEFAULT_IMAGE_FOCAL_POINT: ImageFocalPoint = { x: 0.5, y: 0.5 };

function coordinate(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : fallback;
}

export function parseImageFocalPoint(value: unknown): ImageFocalPoint {
  if (!value || typeof value !== "object") return DEFAULT_IMAGE_FOCAL_POINT;
  const point = value as { x?: unknown; y?: unknown };
  return {
    x: coordinate(point.x, DEFAULT_IMAGE_FOCAL_POINT.x),
    y: coordinate(point.y, DEFAULT_IMAGE_FOCAL_POINT.y),
  };
}

export function focalPointObjectPosition(value?: ImageFocalPoint): string {
  const point = parseImageFocalPoint(value);
  return `${point.x * 100}% ${point.y * 100}%`;
}
