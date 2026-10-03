import bcrypt from 'bcryptjs';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../middleware/auth.js';
import User from '../models/User.js';

const router = Router();
const sign = (user) => jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });

router.post('/register', async (req, res, next) => {
  try {
    const { displayName, email, password } = req.body;
    if (!displayName || !email || !password || password.length < 8) return res.status(400).json({ message: 'Name, valid email, and an 8-character password are required.' });
    if (await User.exists({ email: email.toLowerCase() })) return res.status(409).json({ message: 'An account already uses this email.' });
    const user = await User.create({ displayName, email, passwordHash: await bcrypt.hash(password, 12) });
    res.status(201).json({ token: sign(user), user: { id: user._id, displayName: user.displayName, email: user.email } });
  } catch (error) { next(error); }
});

router.post('/login', async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email?.toLowerCase() }).select('+passwordHash');
    if (!user || !user.passwordHash || !(await bcrypt.compare(req.body.password || '', user.passwordHash))) return res.status(401).json({ message: 'Incorrect email or password.' });
    res.json({ token: sign(user), user: { id: user._id, displayName: user.displayName, email: user.email } });
  } catch (error) { next(error); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try { res.json(await User.findById(req.user.id)); } catch (error) { next(error); }
});

export default router;
