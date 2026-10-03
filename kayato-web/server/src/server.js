import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import authRoutes from './routes/auth.js';
import taskRoutes from './routes/tasks.js';
import billRoutes from './routes/bills.js';

const app = express();
const server = createServer(app);
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
const io = new Server(server, { cors: { origin: clientUrl } });

app.use(cors({ origin: clientUrl, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'KayaTo API' }));
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/bills', billRoutes);

io.on('connection', (socket) => {
  socket.on('conversation:join', (conversationId) => socket.join(`conversation:${conversationId}`));
  socket.on('message:send', (message) => io.to(`conversation:${message.conversationId}`).emit('message:new', message));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error.name === 'ValidationError') return res.status(400).json({ message: error.message });
  res.status(500).json({ message: 'Something went wrong.' });
});

const port = Number(process.env.PORT) || 5000;
if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is required. Copy .env.example to .env and set a secure value.');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kayato');
server.listen(port, () => console.log(`KayaTo API running on http://localhost:${port}`));
