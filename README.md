VITE_API_BASE_URL=https://plastic-stroke-village-harmony.trycloudflare.com 
# untuk mendapatkan url tunnel, jalanknan cloudflared tunnel --url localhost 5000 dari terminal backend
# Jalanin nya pake npm run dev:tunnel

# EXTRACT_SCRIPT_PATH=/absolute/path/to/attendance_cv_system/scripts/extract_features.py
POSE_DB_PATH="C:\Users\ASUS NUC 13 PRO\Documents\Fatwa\code\attendance_cv_system\pose_database.json"
CORS_ORIGIN=http://localhost:8081,https://mac-bath-copied-objective.trycloudflare.com  
# untuk mendapatkan url tunnel, jalanknan cloudflared tunnel --url localhost 8081 dari terminal frontend
# Jalanin nya pake npm run dev
# yang diganti https yang kedua yaa
```
evidence-log
├─ .lovable
│  └─ project.json
├─ .prettierignore
├─ .prettierrc
├─ backend
│  ├─ assets
│  │  └─ aristides-logo.png
│  ├─ convertImages.js
│  ├─ db.js
│  ├─ middleware
│  │  └─ auth.js
│  ├─ migrations
│  │  ├─ add_indexes.sql
│  │  └─ create_user_table.sql
│  ├─ package-lock.json
│  ├─ package.json
│  ├─ routes
│  │  ├─ alerts.js
│  │  ├─ attendance.js
│  │  ├─ auth.js
│  │  ├─ backup_export.txt
│  │  ├─ export.js
│  │  ├─ live.js
│  │  ├─ notifications.js
│  │  ├─ tes.txt
│  │  ├─ vehicles.js
│  │  └─ wa-recipients.js
│  ├─ scripts
│  │  └─ create-admin.js
│  ├─ server.js
│  └─ utils
│     ├─ errors.js
│     ├─ logger.js
│     └─ pagination.js
├─ bunfig.toml
├─ components.json
├─ eslint.config.js
├─ package-lock.json
├─ package.json
├─ postcss.config.js
├─ public
│  ├─ aristides-logo.png
│  └─ favicon_io
│     ├─ android-chrome-192x192.png
│     ├─ android-chrome-512x512.png
│     ├─ apple-touch-icon.png
│     ├─ favicon-16x16.png
│     ├─ favicon-32x32.png
│     ├─ favicon.ico
│     └─ site.webmanifest
├─ README.md
├─ src
│  ├─ assets
│  │  ├─ aristides-logo.png
│  │  ├─ company-logo.png
│  │  ├─ warehouse-bg.jpg
│  │  ├─ warehouse-bg.mp4
│  │  └─ warehouse-bg.mp4.asset.json
│  ├─ components
│  │  ├─ Toast.tsx
│  │  └─ ui
│  │     ├─ accordion.tsx
│  │     ├─ alert-dialog.tsx
│  │     ├─ alert.tsx
│  │     ├─ aspect-ratio.tsx
│  │     ├─ avatar.tsx
│  │     ├─ badge.tsx
│  │     ├─ breadcrumb.tsx
│  │     ├─ button.tsx
│  │     ├─ calendar.tsx
│  │     ├─ card.tsx
│  │     ├─ carousel.tsx
│  │     ├─ chart.tsx
│  │     ├─ checkbox.tsx
│  │     ├─ collapsible.tsx
│  │     ├─ command.tsx
│  │     ├─ context-menu.tsx
│  │     ├─ dialog.tsx
│  │     ├─ drawer.tsx
│  │     ├─ dropdown-menu.tsx
│  │     ├─ form.tsx
│  │     ├─ hover-card.tsx
│  │     ├─ input-otp.tsx
│  │     ├─ input.tsx
│  │     ├─ label.tsx
│  │     ├─ menubar.tsx
│  │     ├─ navigation-menu.tsx
│  │     ├─ pagination.tsx
│  │     ├─ popover.tsx
│  │     ├─ progress.tsx
│  │     ├─ radio-group.tsx
│  │     ├─ resizable.tsx
│  │     ├─ scroll-area.tsx
│  │     ├─ select.tsx
│  │     ├─ separator.tsx
│  │     ├─ sheet.tsx
│  │     ├─ sidebar.tsx
│  │     ├─ skeleton.tsx
│  │     ├─ slider.tsx
│  │     ├─ sonner.tsx
│  │     ├─ switch.tsx
│  │     ├─ table.tsx
│  │     ├─ tabs.tsx
│  │     ├─ textarea.tsx
│  │     ├─ toggle-group.tsx
│  │     ├─ toggle.tsx
│  │     └─ tooltip.tsx
│  ├─ hooks
│  │  └─ use-mobile.tsx
│  ├─ integrations
│  │  └─ supabase
│  │     ├─ auth-attacher.ts
│  │     ├─ auth-middleware.ts
│  │     ├─ client.server.ts
│  │     ├─ client.ts
│  │     └─ types.ts
│  ├─ lib
│  │  ├─ api
│  │  │  └─ example.functions.ts
│  │  ├─ api-config.ts
│  │  ├─ auth.ts
│  │  ├─ config.server.ts
│  │  ├─ error-capture.ts
│  │  ├─ error-page.ts
│  │  ├─ evidence.ts
│  │  ├─ lovable-error-reporting.ts
│  │  ├─ theme-provider.tsx
│  │  ├─ theme-tokens.ts
│  │  └─ utils.ts
│  ├─ router.tsx
│  ├─ routes
│  │  ├─ attendance.tsx
│  │  ├─ attendance_review.tsx
│  │  ├─ dashboard.tsx
│  │  ├─ entry.$id.tsx
│  │  ├─ index.tsx
│  │  ├─ live.tsx
│  │  ├─ login.tsx
│  │  ├─ README.md
│  │  ├─ settings.tsx
│  │  └─ __root.tsx
│  ├─ routeTree.gen.ts
│  ├─ server.ts
│  ├─ start.ts
│  └─ styles.css
├─ struktur.txt
├─ supabase
│  ├─ config.toml
│  └─ migrations
│     ├─ 20260608064818_f506a6c8-93b9-4913-a1f2-733c9c1e998c.sql
│     └─ 20260610011116_8ec7710f-c8ae-4058-a419-152a1796c0c0.sql
├─ tailwind.config.js
├─ tsconfig.json
└─ vite.config.ts

```