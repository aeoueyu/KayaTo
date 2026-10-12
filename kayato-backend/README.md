# KayaTo API

Express, MongoDB, and JWT backend for KayaTo. The app exports its Express instance for Vercel while retaining the local `npm start` workflow.

## Setup

Copy `.env.example` to `.env`, set `MONGO_URI`, a long random `JWT_SECRET`, and your Gmail SMTP credentials, then run:

```powershell
npm install
npm run dev
```

The local API runs at `http://localhost:5000/api`. Set `CLIENT_URL` to the frontend origins allowed to call the API. Multiple origins can be separated with commas.

## Vercel deployment

Import the repository as a new Vercel project and set the Root Directory to `kayato-backend`. Leave Framework Preset, Build Command, and Output Directory on their automatic defaults. Add the variables from `.env.example` to the Vercel project, set `NODE_ENV=production`, and set `CLIENT_URL` to the deployed frontend origin.

Vercel detects the default Express export in `server.js` and deploys the API as one Function. Chat refreshes through REST polling so it does not require a persistent Socket.IO server or Redis.

Signup verification uses a six-digit OTP sent through Gmail SMTP. Enable 2-Step Verification on a dedicated Google account, create an App Password, and set `GMAIL_USER`, `GMAIL_APP_PASSWORD`, and `EMAIL_FROM`. Never use the account's regular password. Codes expire after 10 minutes, can be requested once per minute, and are invalidated after five incorrect attempts.

`POST /api/planner/generate` currently creates a deterministic plan from submitted text. It does not send project content to an external AI provider.
