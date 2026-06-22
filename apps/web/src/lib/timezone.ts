/**
 * Converts a date input to Date or formatted string
 * @param timestamp - Date string or Date object
 * @param format - Optional format string (e.g., "d-m-Y", "d/m/Y H:i:s", "Y-m-d H:i")
 *                 d = day (01-31), m = month (01-12), Y = year (2025)
 *                 H = hours (00-23), i = minutes (00-59), s = seconds (00-59)
 * @returns Date object if no format, formatted string if format provided
 */
export function toArgTime(
  timestamp: string | Date | null | undefined,
  format: string
): string;

export function toArgTime(
  timestamp: string | Date | null | undefined
): Date;

export function toArgTime(
  timestamp: string | Date | null | undefined,
  format?: string
): string | Date {
  if (!timestamp) {
    return format ? "" : new Date();
  }

  let date: Date;

  if (typeof timestamp === "string") {
    date = new Date(timestamp);
  } else {
    date = timestamp;
  }

  // If no format specified, return the Date object
  if (!format) {
    return date;
  }

  // Format the date according to the specified format
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear().toString();
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");

  return format
    .replace(/d/g, day)
    .replace(/m/g, month)
    .replace(/Y/g, year)
    .replace(/H/g, hours)
    .replace(/i/g, minutes)
    .replace(/s/g, seconds);
}
