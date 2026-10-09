# KayaTo Web

The responsive React client for KayaTo. It includes real account registration and login, MongoDB-backed tasks and bills, teams, live team chat, project-plan generation, a combined calendar, dashboard, and profile settings.

## Local development

Run the API in one terminal:

```powershell
cd "C:\Users\Administrator\Desktop\TASK MANAGEMENT SYSTEM\kayato-backend"
npm install
npm run dev
```

Run the web app in another terminal:

```powershell
cd "C:\Users\Administrator\Desktop\TASK MANAGEMENT SYSTEM\kayato-web"
npm install
npm run dev
```

Open `http://localhost:5173`. The default API address is `http://localhost:5000/api`.

For deployment, set `VITE_API_URL` to the public backend URL ending in `/api`. The frontend can be deployed to Vercel using the included `vercel.json`; deploy the Socket.IO backend to a persistent Node.js host.
