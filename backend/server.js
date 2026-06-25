const express = require('express');
const cors = require('cors');
const { Pool } = require('pg'); // Tambahkan ini
require('dotenv').config();

const app = express();
app.use(cors({ origin: 'http://localhost:8081' }));
app.use(express.json());

// Route API
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/live', require('./routes/live'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/wa-recipients', require('./routes/wa-recipients'));
app.use('/api/export', require('./routes/export'));

// --- KONFIGURASI SSE (REAL-TIME) ---
// Buat koneksi DB khusus untuk mendengarkan event (tidak boleh pakai pool biasa)
const listenerPool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Buat array untuk menyimpan koneksi client yang sedang membuka SSE
let clients = [];

// Function to send event to all connected clients
function sendEventToAll(data) {
  clients.forEach(client => {
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

// Endpoint SSE
app.get('/api/events', async (req, res) => {
  // Setup SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Simpan koneksi client
  const clientId = Date.now();
  const newClient = { id: clientId, res };
  clients.push(newClient);

  // Kirim heartbeat setiap 15 detik agar koneksi tidak putus
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  // Jika client menutup koneksi (refresh browser), hapus dari list
  req.on('close', () => {
    clearInterval(heartbeat);
    clients = clients.filter(c => c.id !== clientId);
  });
});

// --- LISTENER POSTGRESQL ---
listenerPool.connect((err, client, done) => {
  if (err) {
    console.error('❌ Gagal connect listener DB:', err);
    return;
  }

  // Listen ke channel vehicle_log_event
  client.query('LISTEN vehicle_log_event');
  client.query('LISTEN alert_log_event');

  // Saat ada notifikasi dari PostgreSQL
  client.on('notification', (msg) => {
    if (msg.channel === 'vehicle_log_event' || msg.channel === 'alert_log_event') {
      const payload = JSON.parse(msg.payload);
      console.log(`📡 Real-time update dari ${msg.channel}:`, payload.jenis_kendaraan || payload.class_name);
      
      // Kirim ke semua client frontend yang terhubung
      sendEventToAll({
        channel: msg.channel,
        data: payload
      });
    }
  });

  client.on('error', (err) => {
    console.error('❌ Listener DB Error:', err);
  });
});

// Route awal
app.get('/', (req, res) => res.json({ message: 'API berjalan!!!' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server berjalan di port ${PORT}`));