import Image, { type ImageProps } from "next/image";

type CompatibleImageProps = Omit<ImageProps, "height" | "width"> & {
  height?: number;
  width?: number;
};

export default function CompatibleImage({
  alt,
  height = 450,
  src,
  width = 800,
  ...props
}: CompatibleImageProps) {
  const isUnoptimizableSource =
    typeof src === "string" && /^(?:blob:|data:|https?:\/\/)/i.test(src);

  return (
    <Image
      {...props}
      alt={alt}
      src={src}
      width={width}
      height={height}
      unoptimized={isUnoptimizableSource}
    />
  );
}
