# Tevel Trip Registration Scaffold

שלד עובד לטופס הרשמה דינמי:
- Frontend: `trip-registration.html`
- Backend: `server.js` (Express)
- מקור נתונים: Airtable דרך API פנימי (`/api/...`) ללא חשיפת token בדפדפן
- שליחה: `/api/submissions` במצב `dry-run` עד שמוגדר `SUBMIT_WEBHOOK_URL`

## Quick Start

```bash
npm install
copy .env.example .env
npm run dev
```

פתחו בדפדפן:
- `http://localhost:3000`
- או `http://localhost:3000/?id=recXXXX`

## Environment Variables

ראו `.env.example`.

חובה:
- `AIRTABLE_TOKEN`
- `AIRTABLE_BASE_ID`

רשות:
- `DEFAULT_TRIP_ID` (לבדיקות כאשר אין `?id=`)
- `SUBMIT_WEBHOOK_URL` (להפעלת שליחה אמיתית)

## API Endpoints

- `GET /health`
- `GET /api/config`
- `GET /api/trips/:id`
- `GET /api/cruise-options?ids=rec1,rec2`
- `POST /api/submissions`

## Current Behavior

- הטופס טוען טיול לפי מזהה מה-URL.
- אם אין webhook, השליחה נשמרת כ-`dry-run` ונרשמת לשרת.
- לאחר הגדרת webhook, השליחה עוברת החוצה אוטומטית.
