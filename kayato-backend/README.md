# KayaTo API

Express, MongoDB, and JWT backend for KayaTo. The app exports its Express instance for Vercel while retaining the local `npm start` workflow.

## Setup

Create a `.env` file, set `MONGO_URI`, a long random `JWT_SECRET`, and your Gmail SMTP credentials, then run:

```powershell
npm install
npm run dev
```

The local API runs at `http://localhost:5000/api`. Set `CLIENT_URL` to the frontend origins allowed to call the API. Multiple origins can be separated with commas.

## Vercel deployment

Import the repository as a new Vercel project and set the Root Directory to `kayato-backend`. Leave Framework Preset, Build Command, and Output Directory on their automatic defaults. Add the variables from `.env.example` to the Vercel project, set `NODE_ENV=production`, and set `CLIENT_URL` to the deployed frontend origin.

Vercel detects the default Express export in `server.js` and deploys the API as one Function. Chat refreshes through REST polling so it does not require a persistent Socket.IO server or Redis.

Signup verification uses a six-digit OTP sent through Gmail SMTP. Enable 2-Step Verification on a dedicated Google account, create an App Password, and set `GMAIL_USER`, `GMAIL_APP_PASSWORD`, and `EMAIL_FROM`. Never use the account's regular password. Codes expire after 10 minutes, can be requested once per minute, and are invalidated after five incorrect attempts.

## Gemini AI

Set `GEMINI_API_KEY` in the backend environment to enable Gemini for the project planner and task-aware `@Kaya` chat replies. `GEMINI_MODEL` is optional and defaults to `gemini-3.5-flash-lite`.

The planner requests structured JSON, validates and sanitizes every generated task, and never saves a plan until the user confirms it. Kaya sends at most ten active task summaries to Gemini and does not give the model direct database access. Both features retain deterministic fallbacks when Gemini is missing or temporarily unavailable. AI requests are rate-limited to protect the API quota.

The health endpoint reports `"ai":"gemini"` when a key is configured and `"ai":"fallback"` otherwise. Add the same Gemini environment variables separately to the deployed backend service.

## Notifications and reminders

Notification categories and delivery channels are stored per user. Task activity, chat messages, friend activity, team membership, task deadlines, and bill due dates all use the same preference-aware delivery pipeline.

For browser push, run `npx web-push generate-vapid-keys` and copy the two values to `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. Set `VAPID_SUBJECT` to a `mailto:` address. The web app registers `/kayato-sw.js` after the user explicitly enables browser push in Settings.

For Android and iOS push, create a Firebase project and service account. Put the project ID in `FIREBASE_PROJECT_ID` and the complete service-account JSON on one line in `FIREBASE_SERVICE_ACCOUNT_JSON`. Build the Flutter app with these values:

```powershell
flutter run --dart-define=API_URL=http://10.0.2.2:5000/api --dart-define=FIREBASE_API_KEY=... --dart-define=FIREBASE_APP_ID=... --dart-define=FIREBASE_MESSAGING_SENDER_ID=... --dart-define=FIREBASE_PROJECT_ID=...
```

When the backend runs through `npm start`, it checks reminders at startup and every five minutes. Serverless deployments should call `GET /api/internal/reminders/run` on a schedule with `Authorization: Bearer <CRON_SECRET>`. The reminder pipeline uses deduplication keys, so repeating a cron request does not resend the same due-date reminder.
