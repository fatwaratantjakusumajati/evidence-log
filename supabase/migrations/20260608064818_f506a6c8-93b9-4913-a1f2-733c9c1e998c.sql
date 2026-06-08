
CREATE TABLE public.evidence_entries (
  id BIGSERIAL PRIMARY KEY,
  image_url TEXT NOT NULL,
  location TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  occurred_at TIMESTAMPTZ NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.evidence_entries TO anon, authenticated;
GRANT ALL ON public.evidence_entries TO service_role;

ALTER TABLE public.evidence_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read evidence entries"
  ON public.evidence_entries FOR SELECT
  USING (true);

CREATE INDEX evidence_entries_occurred_at_idx ON public.evidence_entries (occurred_at DESC);

INSERT INTO public.evidence_entries (image_url, location, latitude, longitude, occurred_at, description) VALUES
('https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1200&q=80', 'Jalan Merdeka 10, Jakarta', -6.1751, 106.8650, '2026-05-20T14:30:00Z', 'Keterangan singkat mengenai kejadian di pusat kota.'),
('https://images.unsplash.com/photo-1528909514045-2fa4ac7a08ba?w=1200&q=80', 'Kota Bandung', -6.9175, 107.6191, '2026-05-18T09:15:00Z', NULL),
('https://images.unsplash.com/photo-1505765050516-f72dcac9c60e?w=1200&q=80', 'Surabaya - Terminal A', -7.2575, 112.7521, '2026-04-30T22:00:00Z', 'Pengamatan malam hari di terminal.'),
('https://images.unsplash.com/photo-1583309217394-d1d9eb6b6b3a?w=1200&q=80', 'Yogyakarta', -7.7956, 110.3695, '2026-03-12T07:45:00Z', 'Dokumentasi pagi hari.'),
('https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=1200&q=80', 'Bali - Pantai Kuta', -8.7184, 115.1686, '2025-12-01T17:20:00Z', 'Kejadian sore di kawasan pantai.');
