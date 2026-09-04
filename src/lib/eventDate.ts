import { APP_TIME_ZONE } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

type DateValue = Date | string;

function validDate(value: DateValue) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatEventDate(
  startValue: DateValue,
  endValue?: DateValue,
  allDay = true,
) {
  const startDate = validDate(startValue);
  const endDate = endValue ? validDate(endValue) : null;
  if (!startDate) return "Date unavailable";

  const formatter = allDay
    ? (value: Date) => formatDate(value)
    : (value: Date) =>
        new Intl.DateTimeFormat("en-IN", {
          timeZone: APP_TIME_ZONE,
          dateStyle: "medium",
          timeStyle: "short",
        }).format(value);
  const start = formatter(startDate);
  return endDate ? `${start} - ${formatter(endDate)}` : start;
}
