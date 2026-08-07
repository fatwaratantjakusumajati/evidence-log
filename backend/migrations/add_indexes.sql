CREATE INDEX IF NOT EXISTS idx_vehicle_log_timestamp ON vehicle_log ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_log_jenis ON vehicle_log (jenis_kendaraan);
CREATE INDEX IF NOT EXISTS idx_alert_log_created_at ON alert_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_log_class_name ON alert_log (class_name);
CREATE INDEX IF NOT EXISTS idx_attendance_event_timestamp ON attendance_event ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_event_employee_id ON attendance_event (employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_event_event_type ON attendance_event (event_type);
CREATE INDEX IF NOT EXISTS idx_employees_employee_id ON employees (employee_id);