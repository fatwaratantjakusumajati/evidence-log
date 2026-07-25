export type EvidenceEntry = {
  id: number;
  image_url: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  occurred_at: string;
  description: string | null;
};

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return "-";

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit", // sertakan second jika butuh detik
    hour12: false,
  }).format(date);
}

export function formatShortDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
