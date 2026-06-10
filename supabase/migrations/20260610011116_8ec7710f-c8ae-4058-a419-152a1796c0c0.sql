
-- Vehicle logs (in/out)
CREATE TABLE public.vehicle_logs (
  id BIGSERIAL PRIMARY KEY,
  image_url TEXT NOT NULL,
  plate_number TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'masuk' CHECK (direction IN ('masuk','keluar')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vehicle_logs TO anon, authenticated;
GRANT ALL ON public.vehicle_logs TO service_role;
ALTER TABLE public.vehicle_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read vehicle logs" ON public.vehicle_logs FOR SELECT USING (true);

-- Staging item detections
CREATE TABLE public.staging_detections (
  id BIGSERIAL PRIMARY KEY,
  image_url TEXT NOT NULL,
  item_label TEXT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staging_detections TO anon, authenticated;
GRANT ALL ON public.staging_detections TO service_role;
ALTER TABLE public.staging_detections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read staging detections" ON public.staging_detections FOR SELECT USING (true);

-- Camera offline events
CREATE TABLE public.camera_offline_events (
  id BIGSERIAL PRIMARY KEY,
  camera_name TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.camera_offline_events TO anon, authenticated;
GRANT ALL ON public.camera_offline_events TO service_role;
ALTER TABLE public.camera_offline_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read camera offline events" ON public.camera_offline_events FOR SELECT USING (true);

-- Seed sample data
INSERT INTO public.vehicle_logs (image_url, plate_number, direction, occurred_at) VALUES
('https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=800', 'B 1234 ABC', 'masuk', now() - interval '20 minutes'),
('https://images.unsplash.com/photo-1542362567-b07e54358753?w=800', 'B 5678 XYZ', 'keluar', now() - interval '1 hour'),
('https://images.unsplash.com/photo-1597007030739-6d2e7172ee6a?w=800', 'D 9012 KLM', 'masuk', now() - interval '3 hours'),
('https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800', 'F 3456 PQR', 'keluar', now() - interval '5 hours');

INSERT INTO public.staging_detections (image_url, item_label, reported_at, resolved_at) VALUES
('https://images.unsplash.com/photo-1553413077-190dd305871c?w=800', 'Kardus tidak teridentifikasi', now() - interval '15 minutes', NULL),
('https://images.unsplash.com/photo-1601598851547-4302969d0614?w=800', 'Palet kayu', now() - interval '2 hours', NULL),
('https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800', 'Drum kimia', now() - interval '6 hours', now() - interval '1 hour'),
('https://images.unsplash.com/photo-1530541930197-ff16ac917b0e?w=800', 'Karung beras', now() - interval '1 day', NULL);

INSERT INTO public.camera_offline_events (camera_name, occurred_at) VALUES
('CAM-04 Gudang A - Pintu Belakang', now() - interval '2 hours'),
('CAM-11 Loading Dock 2', now() - interval '5 hours'),
('CAM-17 Area Parkir Timur', now() - interval '1 day');
