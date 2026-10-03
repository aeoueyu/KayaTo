# KayaTo

KayaTo is a MERN productivity platform for personal tasks, team collaboration, AI-assisted planning, chat, and bill reminders.

## Included in this starter

- Public product website
- Responsive light and dark themes using the Violet Dusk palette
- Login and onboarding flows
- Dashboard and task Kanban board
- AI document-to-task planner prototype
- Team chat with `@Kaya` interaction prototype
- Bill reminders with safe redirection to official biller websites
- Express, MongoDB, Mongoose, JWT, and Socket.IO API foundation

## Run the web app

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Run the API

```bash
cd server
npm install
copy .env.example .env
npm run dev
```

MongoDB must be running locally, or replace `MONGODB_URI` with a MongoDB Atlas connection string. Set a long random `JWT_SECRET` before starting the server.

## Current status

The frontend uses realistic prototype data so the complete product flow is reviewable before API wiring. The API currently includes authentication, task CRUD, bill CRUD, models for teams and messages, and a Socket.IO chat foundation.
