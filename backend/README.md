# Backend Setup for Easy-Procure

This backend is built with Express and Mongoose.

## Install dependencies

```bash
cd backend
npm install
```

## Run locally with MongoDB

The backend expects MongoDB at:

```text
mongodb://127.0.0.1:27017/easy-procure
```

Start MongoDB first, then start the backend:

```bash
cd backend
npm start
```

## Health check

Open:

```text
http://localhost:5000/health
```

This returns whether the backend is running and whether the database is connected.

## Atlas / custom MongoDB URI

If you want to use MongoDB Atlas or a different host, set the environment variable first:

```bash
set MONGODB_URI="your-mongo-uri"
npm start
```

Or with PowerShell:

```powershell
$env:MONGODB_URI = "your-mongo-uri"
npm start
```

If the database is unavailable, the backend will continue running in offline mode so the API server remains reachable.

## Gmail password reset

The login page emails a six-digit verification code; it does not email a password. Configure Gmail SMTP with an App Password:

1. Enable 2-Step Verification on the Gmail account, then create an App Password in Google Account security settings.
2. From the repository root, run `Copy-Item backend\.env.example backend\.env` in PowerShell.
3. Set `GMAIL_USER` and `GMAIL_APP_PASSWORD` in `backend/.env`. Use the App Password, not your regular Gmail password; do not share or commit `.env`.
4. Restart the backend with `npm start` from the `backend` directory.

Codes expire after 10 minutes and are limited to five verification attempts. They are held in backend memory, so restarting the backend invalidates outstanding codes. In legacy login mode, accounts remain in browser `localStorage` and a reset updates only that browser's account. API-mode users are stored in the FastAPI database.

When the Alwen FastAPI login is enabled by setting `REACT_APP_ALWEN_API_URL`, create API users in the API database. To let the same verified email code reset an API password, also set `ALWEN_API_URL=http://127.0.0.1:8000` and a long random `ALWEN_PASSWORD_RESET_KEY` in `backend/.env`, and set the identical key in `api/.env` (or the Docker Compose environment). The Node service forwards only the verified email and chosen password to the API over the configured internal endpoint; successful resets revoke active API sessions. The API reset endpoint is disabled until the shared key is configured.