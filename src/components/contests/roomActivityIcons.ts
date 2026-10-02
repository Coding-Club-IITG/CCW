import {
  CircleAlert,
  CircleCheck,
  Gavel,
  Info,
  Lock,
  RefreshCw,
  User,
  UserX,
  type LucideIcon,
} from "lucide-react";

export const ROOM_ACTIVITY_ICONS: Record<string, LucideIcon> = {
  info: Info,
  gavel: Gavel,
  lock: Lock,
  sync: RefreshCw,
  check_circle: CircleCheck,
  error: CircleAlert,
  person: User,
  person_off: UserX,
};
