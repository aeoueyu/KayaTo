# KayaTo API

Express, MongoDB, JWT, and Socket.IO backend for KayaTo.

## Setup

Copy `.env.example` to `.env`, set `MONGO_URI`, a long random `JWT_SECRET`, and your Resend credentials, then run:

```powershell
npm install
npm run dev
```

The local API runs at `http://localhost:5000/api`. Set `CLIENT_URL` to the frontend origins allowed to call the API. Multiple origins can be separated with commas.

Signup verification uses a six-digit OTP sent through Resend. Set `RESEND_API_KEY` to a sending-only API key and `EMAIL_FROM` to an address on your verified domain. Codes expire after 10 minutes, can be requested once per minute, and are invalidated after five incorrect attempts.

`POST /api/planner/generate` currently creates a deterministic plan from submitted text. It does not send project content to an external AI provider.
