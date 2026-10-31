// Everything the app shows or reasons about by calendar is India time (IST,
// UTC+5:30, no daylight saving).

export const IST_OFFSET_MS = 5.5 * 3600_000;

/** A Date whose UTC fields read as the IST wall clock: toIst(d).getUTCDate() is the day in India. */
export const toIst = (date: Date): Date => new Date(date.getTime() + IST_OFFSET_MS);

/** The IST wall clock as "YYYY-MM-DDTHH:mm:ss.sss"; slice to the precision needed. */
export const istIso = (date = new Date()): string => toIst(date).toISOString().slice(0, 23);
