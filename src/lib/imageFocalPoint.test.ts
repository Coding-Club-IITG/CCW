import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMAGE_FOCAL_POINT,
  focalPointObjectPosition,
  parseImageFocalPoint,
} from "./imageFocalPoint";

describe("image focal points", () => {
  it("defaults missing and invalid coordinates to the center", () => {
    expect(parseImageFocalPoint(undefined)).toEqual(DEFAULT_IMAGE_FOCAL_POINT);
    expect(parseImageFocalPoint({ x: -1, y: 2 })).toEqual(
      DEFAULT_IMAGE_FOCAL_POINT,
    );
  });

  it("accepts normalized numeric coordinates and form values", () => {
    expect(parseImageFocalPoint({ x: 0.25, y: 0.75 })).toEqual({
      x: 0.25,
      y: 0.75,
    });
    expect(parseImageFocalPoint({ x: "0.1", y: "0.9" })).toEqual({
      x: 0.1,
      y: 0.9,
    });
  });

  it("converts coordinates to a CSS object position", () => {
    expect(focalPointObjectPosition({ x: 0.2, y: 0.8 })).toBe("20% 80%");
  });
});
