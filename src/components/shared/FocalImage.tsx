import type { ComponentProps } from "react";
import type { ImageFocalPoint } from "@/lib/imageFocalPoint";
import { focalPointObjectPosition } from "@/lib/imageFocalPoint";
import CompatibleImage from "./CompatibleImage";

type FocalImageProps = ComponentProps<typeof CompatibleImage> & {
  focalPoint?: ImageFocalPoint;
};

export default function FocalImage({
  focalPoint,
  style,
  ...props
}: FocalImageProps) {
  return (
    <CompatibleImage
      {...props}
      style={{ ...style, objectPosition: focalPointObjectPosition(focalPoint) }}
    />
  );
}
