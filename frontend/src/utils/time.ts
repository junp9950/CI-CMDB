export function toKST(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  // SQLite는 timezone 없이 저장하므로 Z를 붙여 UTC로 명시
  const utc = dateStr.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(dateStr)
    ? dateStr
    : dateStr + "Z";
  const date = new Date(utc);
  if (isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}
