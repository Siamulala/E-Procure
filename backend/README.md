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