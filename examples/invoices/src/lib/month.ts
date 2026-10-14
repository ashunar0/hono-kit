/**
 * 月（YYYY-MM、UTC）の計算。業務を知らないので、別のアプリにそのまま持っていける
 */

/** 月を表す文字列（YYYY-MM、UTC） */
export type Month = `${number}-${number}`;

/** その月の初め（UTC） */
export const startOfMonth = (month: Month) => new Date(`${month}-01T00:00:00Z`);

/** 次の月 */
export const nextMonth = (month: Month): Month => {
  const d = startOfMonth(month);
  d.setUTCMonth(d.getUTCMonth() + 1);

  return d.toISOString().slice(0, 7) as Month;
};

/** from から to まで（両端を含む）の月を並べる */
export const monthsBetween = (from: Month, to: Month): Month[] => {
  const months: Month[] = [];
  for (let m = from; m <= to; m = nextMonth(m)) months.push(m);

  return months;
};
