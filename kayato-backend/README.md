# KayaTo API

Express, MongoDB, JWT, and Socket.IO backend for KayaTo.

## Setup

Copy `.env.example` to `.env`, set `MONGO_URI`, a long random `JWT_SECRET`, and your Gmail SMTP credentials, then run:

```powershell
npm install
npm run dev
```

The local API runs at `http://localhost:5000/api`. Set `CLIENT_URL` to the frontend origins allowed to call the API. Multiple origins can be separated with commas.

Signup verification uses a six-digit OTP sent through Gmail SMTP. Enable 2-Step Verification on a dedicated Google account, create an App Password, and set `GMAIL_USER`, `GMAIL_APP_PASSWORD`, and `EMAIL_FROM`. Never use the account's regular password. Codes expire after 10 minutes, can be requested once per minute, and are invalidated after five incorrect attempts.

`POST /api/planner/generate` currently creates a deterministic plan from submitted text. It does not send project content to an external AI provider.
