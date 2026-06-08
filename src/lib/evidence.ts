export type EvidenceEntry = {
  id: number;
  image_url: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  occurred_at: string;
  description: string | null;
};

export function formatDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatShortDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
