export const mexicoTimeZone = "America/Mexico_City";

const dateTimeMx = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: mexicoTimeZone,
});

export function formatDateTimeMx(value: string | Date | number) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return dateTimeMx.format(date);
}
