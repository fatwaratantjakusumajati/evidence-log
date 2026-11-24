# Evidence Log · Warehouse Intelligence

**Evidence Log** is an enterprise warehouse intelligence and operational evidence monitoring web platform. It integrates CCTV computer vision, Automated License Plate Recognition (ALPR), ArUco fiducial marker pallet tracking, and OCR document processing to provide end-to-end visibility across logistics and warehouse operations.

---

## Key Features

- **Document Processing & OCR Archive**: Automatically ingest and archive warehouse documents (Purchase Orders, Invoices, Delivery Orders / Surat Jalan, Receipts). Features full-text search, Excel export, and structured data extraction.
- **ArUco Marker Lifecycle Management**: Dynamic assignment, pool allocation, and batch A4 printing of ArUco markers for pallets and POs to support computer-vision-based spatial tracking.
- **Real-Time Pallet & PO Tracking**: Multi-camera monitoring of pallet movements across Inbound, Storage/Staging, and Outbound zones. Outbound disappearance is recorded as exit; disappearance in other zones waits for operator confirmation. Tracking records do not update inventory stock.
- **Vehicle Access & ALPR Logging**: Real-time logging of vehicle movements, license plate recognition confidence scores, parking duration tracking, and photographic evidence capture.
- **Live Notifications & Incident Alerts**: Real-time updates delivered via Server-Sent Events (SSE) powered by PostgreSQL `LISTEN`/`NOTIFY`, including alerts for missing pallets and camera connection changes.
- **Operational Analytics Dashboard**: Real-time KPI summaries, zone utilization breakdown, staging turnarounds, and interactive historical trends powered by Recharts.
- **Export & Reporting**: Automated generation and download of formatted Excel spreadsheets and PDF reports with Puppeteer.

---

## Tech Stack

| Layer          | Technologies                                                                                                     |
| :------------- | :--------------------------------------------------------------------------------------------------------------- |
| **Frontend**   | React 19, TanStack Start, TanStack Router, TanStack Query, Vite, Tailwind CSS v4, Recharts, Lucide Icons, Sonner |
| **Backend**    | Node.js, Express, PostgreSQL (`pg`), JWT, bcrypt, Puppeteer, ExcelJS, Multer                                     |
| **Realtime**   | PostgreSQL `LISTEN` / `NOTIFY` + Server-Sent Events (SSE)                                                        |
| **Deployment** | Docker (multi-stage production builds for both Frontend and Backend)                                             |

---

## Project Structure

```text
evidence-log/
├── src/                    # Frontend source code (TanStack Start / React)
│   ├── routes/             # File-based routing (Dashboard, Logs, Settings, Login)
│   ├── components/         # Reusable UI components & dialogs
│   ├── lib/                # Client utilities (auth, api-config, aruco generator)
│   └── router.tsx          # Router configuration
├── backend/                # Backend API (Express.js)
│   ├── server.js           # Server entry point & SSE hub
│   ├── routes/             # REST API routes (auth, documents, tracking, vehicles, etc.)
│   ├── middleware/         # Auth, validation, and upload middleware
│   ├── utils/              # Reporting, notifications, logger, and formatters
│   ├── migrations/         # PostgreSQL database migration scripts
│   └── scripts/            # Helper scripts (e.g., create-admin.js)
├── Dockerfile              # Production Dockerfile for Frontend
├── backend/Dockerfile      # Production Dockerfile for Backend
└── README.md
```

---

## Getting Started

### Prerequisites

- **Node.js** v22+
- **PostgreSQL** v14+
- **npm** or **pnpm**

---

### 1. Backend Setup

```bash
cd backend
npm install
cp .env.example .env     # Configure your database and secret keys
npm run dev              # Or 'npm start' for production mode
```

The backend runs on port `5000` by default. It requires valid `DB_*` connection credentials and a `JWT_SECRET`.

#### Database Migration & Admin Account

Apply SQL files from `backend/migrations/` to your PostgreSQL database, then create your initial administrator account:

```bash
cd backend
node scripts/create-admin.js
```

---

### 2. Frontend Setup

From the root project directory:

```bash
npm install --legacy-peer-deps
cp .env.example .env     # Set VITE_API_BASE_URL to point to your backend API
npm run dev
```

Open the local URL displayed in your terminal (typically `http://localhost:3000`).

---

## Environment Variables

### Frontend (`.env` in root directory)

| Variable            | Description        | Example                 |
| :------------------ | :----------------- | :---------------------- |
| `VITE_API_BASE_URL` | Backend server URL | `http://localhost:5000` |

### Backend (`backend/.env`)

#### Required Configuration:

| Variable                                                  | Description                                   |
| :-------------------------------------------------------- | :-------------------------------------------- |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | PostgreSQL connection details                 |
| `JWT_SECRET`                                              | Strong secret key for signing JWT auth tokens |

#### Optional / Feature-Specific Configuration:

| Variable               | Description                                                      | Default / Example       |
| :--------------------- | :--------------------------------------------------------------- | :---------------------- |
| `PORT`                 | Backend server port                                              | `5000`                  |
| `NODE_ENV`             | Environment mode (`development` / `production`)                  | `production`            |
| `CORS_ORIGIN`          | Allowed CORS origins (comma-separated)                           | `http://localhost:3000` |
| `DOCUMENTS_DIR`        | Storage path for uploaded document files (.xlsx, images)         | `./documents`           |
| `TRACKING_DIR`         | Storage path for tracking event snapshot images                  | `./tracking`            |
| `DOCUMENTS_INGEST_KEY` | Ingest API authentication key for n8n/OCR webhooks               | -                       |
| `TRACKING_INGEST_KEY`  | Ingest API authentication key for camera monitors                | -                       |
| `OUTBOUND_ZONES`       | Names of zones designated as outbound (comma-separated)          | `outbound,loading dock` |
| `MARKER_POOL_MAX`      | Upper limit for allocated ArUco marker IDs                       | `300`                   |
| `MAX_PALLET_PER_PO`    | Maximum pallets allowed per Purchase Order                       | `100`                   |
| `MISSING_ALERT_HOURS`  | Inactivity threshold hours triggering missing alerts             | `3,6`                   |

---

## Docker Deployment

### 1. Build and Run Backend

```bash
docker build -t evidence-log-backend ./backend
docker run -d -p 5000:5000 --env-file backend/.env --name evidence-backend evidence-log-backend
```

### 2. Build and Run Frontend

```bash
# Pass the backend address during build time
docker build --build-arg VITE_API_BASE_URL=http://your-backend-host:5000 -t evidence-log-frontend .
docker run -d -p 3000:3000 --name evidence-frontend evidence-log-frontend
```

---

## Code Quality & Testing

```bash
# Backend unit tests
cd backend && npm test

# Frontend linting
npm run lint

# Production build test
npm run build
```

---

## License

Proprietary — PT Aristides Logistik Indonesia. All rights reserved.
