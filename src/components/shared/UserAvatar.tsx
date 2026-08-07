import CompatibleImage from "@/components/shared/CompatibleImage";

interface UserAvatarProps {
  name?: string;
  image?: string | null;
  size: number;
  imageClassName?: string;
  fallbackClassName?: string;
}

export default function UserAvatar({
  name,
  image,
  size,
  imageClassName,
  fallbackClassName,
}: UserAvatarProps) {
  const displayName = name || "User";
  const initials = displayName
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (image) {
    return (
      <CompatibleImage
        src={image}
        alt={displayName}
        className={imageClassName}
        width={size}
        height={size}
      />
    );
  }

  return <span className={fallbackClassName}>{initials}</span>;
}
