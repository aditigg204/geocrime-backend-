# GeoCrime Backend

Node.js + Express + PostgreSQL + Prisma backend for the GeoCrime Flutter app.

## Covers

- Auth and role routing for citizen/officer/admin/analyst
- User profile and settings
- Citizen dashboard, zone risk, SOS, incident reporting, my reports
- Officer dashboard, live incidents, status updates, patrol plan
- Admin dashboard, users, zones, categories, dataset upload, logs
- Analyst dashboard, heatmap, zone comparison, time patterns, risk history, reports, exports
- ML prediction APIs, model report, current risk, 7-day forecast, hotspots
- AI assistant/chatbot API with role-aware replies and prediction cards
- Alerts and geofence warning
- Socket.io event hooks for future real-time updates

## Quick Start

```bash
cd geocrime_backend
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```

Health check:

```bash
curl http://localhost:5000/health
```

## Demo Users

Password for all demo users: `123456`

| Role | Email |
|---|---|
| Citizen | citizen@geocrime.com |
| Officer | officer@geocrime.com |
| Admin | admin@geocrime.com |
| Analyst | analyst@geocrime.com |

## Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "citizen@geocrime.com",
  "password": "123456"
}
```

Use returned token:

```http
Authorization: Bearer <token>
```

## Important APIs

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

### Settings

- `GET /api/me/settings`
- `PATCH /api/me/settings`
- `PATCH /api/me/location-consent`

### Citizen

- `GET /api/citizen/dashboard?lat=&lng=`
- `GET /api/citizen/my-zone?lat=&lng=`
- `GET /api/citizen/safety-guide?zoneId=`
- `POST /api/citizen/sos`
- `POST /api/sos`

### Reports / Incidents

- `POST /api/reports`
- `GET /api/reports/mine`
- `GET /api/reports/:id`
- `GET /api/incidents`
- `GET /api/incidents/nearby?lat=&lng=`
- `PATCH /api/incidents/:id/status`
- `POST /api/incidents/:id/updates`
- `POST /api/incidents/:id/media`
- `GET /api/incidents/:id/timeline`

### Officer

- `GET /api/officer/dashboard`
- `GET /api/officer/incidents`
- `GET /api/officer/heatmap`
- `GET /api/officer/patrol-plan`
- `POST /api/officer/patrol-routes/generate`
- `POST /api/officer/patrol-routes/:id/start`

### Admin

- `GET /api/admin/dashboard`
- `GET /api/admin/users`
- `POST /api/admin/officers`
- `PATCH /api/admin/users/:id`
- `GET /api/admin/zones`
- `POST /api/admin/zones`
- `PATCH /api/admin/zones/:id`
- `GET /api/admin/categories`
- `POST /api/admin/categories`
- `PATCH /api/admin/categories/:id`
- `POST /api/admin/dataset-upload`
- `GET /api/admin/audit-logs`
- `GET /api/admin/alerts`

### Analyst

- `GET /api/analyst/dashboard`
- `GET /api/analyst/crime-analysis?crimeType=`
- `GET /api/analyst/heatmap`
- `GET /api/analyst/zones/compare?zoneIds=id1,id2`
- `GET /api/analyst/time-patterns`
- `GET /api/analyst/risk-history?zoneId=`
- `GET /api/analyst/reports`

### ML / Predictions

- `GET /api/ml/status`
- `POST /api/ml/train`
- `POST /api/ml/predict`
- `GET /api/ml/jobs`
- `GET /api/ml/report`
- `GET /api/predictions/current-risk`
- `GET /api/predictions/7-day?zoneId=`
- `GET /api/predictions/hotspots`
- `POST /api/predictions/run-model`

### Assistant

- `POST /api/assistant/message`
- `GET /api/assistant/history`
- `POST /api/assistant/session`
- `GET /api/assistant/faqs`

## Notes

The current ML endpoints contain a working backend contract and DB storage flow. When your real Python ML pipeline is ready, save its outputs into these tables:

- `ZoneRiskScore`
- `MlPrediction`
- `Hotspot`
- `MlModelRun`

The Flutter app should call the Node.js API only. It should not call the Python model directly.
