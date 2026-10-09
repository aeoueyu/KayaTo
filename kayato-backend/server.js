import 'dotenv/config';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { resolve4, resolve6, resolveMx } from 'node:dns/promises';
import { createServer } from 'node:http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Resend } from 'resend';
import { Server } from 'socket.io';

const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT) || 5000;
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
const jwtSecret = process.env.JWT_SECRET || (!isProduction ? 'kayato-local-development-secret' : '');
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const emailFrom = process.env.EMAIL_FROM || 'KayaTo <onboarding@resend.dev>';
const configuredOrigins = (process.env.CLIENT_URL || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map((value) => value.trim()).filter(Boolean);

if (!mongoUri) throw new Error('MONGO_URI is required. Add it to kayato-backend/.env.');
if (!jwtSecret) throw new Error('JWT_SECRET is required in production.');
if (!process.env.JWT_SECRET) console.warn('Using a development-only JWT secret. Add JWT_SECRET to .env before deployment.');

const app = express();
const httpServer = createServer(app);
const allowOrigin = (origin, callback) => {
  if (!origin || configuredOrigins.includes(origin) || (!isProduction && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) return callback(null, true);
  callback(new Error('Origin is not allowed by CORS.'));
};
const io = new Server(httpServer, { cors: { origin: allowOrigin, credentials: true } });

app.disable('x-powered-by');
app.use(cors({ origin: allowOrigin, credentials: true }));
app.use(express.json({ limit: '2mb' }));

const providerSchema = new mongoose.Schema({
  provider: { type: String, enum: ['local', 'google', 'facebook', 'apple'], required: true },
  providerUserId: String,
}, { _id: false });
const userSchema = new mongoose.Schema({
  firstName: { type: String, trim: true, maxlength: 40 },
  lastName: { type: String, trim: true, maxlength: 40 },
  displayName: { type: String, required: true, trim: true, maxlength: 80 },
  username: { type: String, unique: true, sparse: true, lowercase: true, trim: true, minlength: 3, maxlength: 24, match: /^[a-z0-9_]+$/ },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  profilePicture: String,
  timezone: { type: String, default: 'Asia/Manila' },
  currency: { type: String, default: 'PHP', uppercase: true },
  primaryUsage: { type: String, enum: ['personal', 'team', 'both'], default: 'both' },
  onboardingCompleted: { type: Boolean, default: false },
  notificationPreferences: {
    taskAssignments: { type: Boolean, default: true }, deadlines: { type: Boolean, default: true },
    teamMessages: { type: Boolean, default: true }, bills: { type: Boolean, default: true },
  },
  authProviders: { type: [providerSchema], default: [{ provider: 'local' }] },
}, { timestamps: true });
const memberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['owner', 'manager', 'member', 'viewer'], default: 'member' },
  joinedAt: { type: Date, default: Date.now },
}, { _id: false });
const teamSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 500 },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [memberSchema],
}, { timestamps: true });
const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 180 },
  description: { type: String, trim: true, maxlength: 5000 },
  project: { type: String, trim: true, maxlength: 120, default: 'Personal' },
  taskType: { type: String, enum: ['personal', 'team'], required: true, default: 'personal' },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: { type: String, enum: ['todo', 'in-progress', 'review', 'done'], default: 'todo' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  dueDate: Date,
  aiGenerated: { type: Boolean, default: false },
  completionCriteria: [String],
}, { timestamps: true });
const billSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, trim: true, default: 'Other' },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, uppercase: true, default: 'PHP' },
  dueDate: { type: Date, required: true },
  billingCycle: { type: String, enum: ['one_time', 'weekly', 'monthly', 'quarterly', 'yearly'], default: 'monthly' },
  reminderDaysBefore: { type: [Number], default: [3, 1] },
  status: { type: String, enum: ['unpaid', 'paid', 'overdue', 'skipped'], default: 'unpaid' },
  officialPaymentUrl: { type: String, validate: { validator: (value) => !value || /^https:\/\//i.test(value), message: 'Payment URL must use HTTPS.' } },
  paidAt: Date,
}, { timestamps: true });
const conversationSchema = new mongoose.Schema({
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null, index: true },
  name: { type: String, trim: true, maxlength: 80, default: 'general' },
  kind: { type: String, enum: ['channel', 'direct'], default: 'channel' },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  directKey: { type: String, unique: true, sparse: true },
}, { timestamps: true });
const friendshipSchema = new mongoose.Schema({
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  pairKey: { type: String, required: true, unique: true },
  status: { type: String, enum: ['pending', 'accepted'], default: 'pending', index: true },
  acceptedAt: Date,
}, { timestamps: true });
const messageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  senderType: { type: String, enum: ['user', 'ai'], default: 'user' },
  senderName: { type: String, trim: true },
  content: { type: String, required: true, trim: true, maxlength: 10000 },
}, { timestamps: true });
const signupOtpSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  lastSentAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Team = mongoose.model('Team', teamSchema);
const Task = mongoose.model('Task', taskSchema);
const Bill = mongoose.model('Bill', billSchema);
const Conversation = mongoose.model('Conversation', conversationSchema);
const Message = mongoose.model('Message', messageSchema);
const Friendship = mongoose.model('Friendship', friendshipSchema);
const SignupOtp = mongoose.model('SignupOtp', signupOtpSchema);

const publicUser = (user) => ({ id: String(user._id), firstName: user.firstName, lastName: user.lastName, displayName: user.displayName, username: user.username || '', email: user.email, timezone: user.timezone, currency: user.currency, primaryUsage: user.primaryUsage, onboardingCompleted: user.onboardingCompleted, notificationPreferences: user.notificationPreferences });
const signToken = (user) => jwt.sign({ id: user._id, email: user.email }, jwtSecret, { expiresIn: '7d' });
const normalizeEmail = (value = '') => value.trim().toLowerCase();
const normalizeUsername = (value = '') => String(value).trim().replace(/^@+/, '').toLowerCase();
const usernameIsValid = (value) => /^[a-z0-9_]{3,24}$/.test(value);
const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const personNameIsValid = (value) => value.length >= 2 && value.length <= 40 && /\p{L}/u.test(value) && /^[\p{L} .-]+$/u.test(value);
const normalizePersonName = (value = '') => String(value).trim().replace(/\s+/g, ' ').replace(/(^|[ .-])(\p{L})/gu, (_match, separator, letter) => `${separator}${letter.toLocaleUpperCase()}`);
const emailDomainCache = new Map();
const emailSyntaxIsValid = (email) => {
  if (email.length > 254 || email.includes('..')) return false;
  const match = email.match(/^([a-z0-9.!#$%&'*+/=?^_`{|}~-]+)@([a-z0-9.-]+)$/i);
  if (!match || match[1].length > 64 || match[1].startsWith('.') || match[1].endsWith('.')) return false;
  const labels = match[2].split('.');
  return labels.length >= 2 && labels.every((label) => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)) && /^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(labels.at(-1));
};
async function emailDomainAcceptsMail(email) {
  const domain = email.slice(email.lastIndexOf('@') + 1);
  const cached = emailDomainCache.get(domain);
  if (cached && cached.expiresAt > Date.now()) return cached.status;
  let status = 'invalid';
  try {
    const records = await resolveMx(domain);
    status = records.some((record) => Boolean(record.exchange)) ? 'valid' : 'invalid';
  } catch (error) {
    if (!['ENODATA', 'ENOTFOUND'].includes(error.code)) return 'unavailable';
    try {
      const addresses = await Promise.any([resolve4(domain), resolve6(domain)]);
      status = addresses.length > 0 ? 'valid' : 'invalid';
    } catch {
      status = 'invalid';
    }
  }
  emailDomainCache.set(domain, { status, expiresAt: Date.now() + 30 * 60_000 });
  return status;
}
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ message: 'Authentication required.' });
  try { req.user = jwt.verify(header.slice(7), jwtSecret); next(); }
  catch { res.status(401).json({ message: 'Your session is invalid or has expired.' }); }
}
async function getAuthorizedTeam(teamId, userId) {
  if (!mongoose.isValidObjectId(teamId)) return null;
  return Team.findOne({ _id: teamId, 'members.user': userId });
}
const friendshipPairKey = (left, right) => [String(left), String(right)].sort().join(':');
const directConversationKey = (left, right) => `direct:${friendshipPairKey(left, right)}`;
async function canAccessConversation(conversation, userId) {
  if (!conversation) return false;
  if (conversation.kind === 'direct') return conversation.participants.some((participant) => String(participant._id || participant) === String(userId));
  return Boolean(await getAuthorizedTeam(conversation.team?._id || conversation.team, userId));
}
function cleanUpdate(body, allowed) { return Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key))); }
const otpHash = (email, code) => createHash('sha256').update(`${email}:${code}:${jwtSecret}`).digest('hex');
const passwordIsStrong = (password) => password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
const safeEqual = (left, right) => { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); };
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const buildSignupOtpEmail = (code) => {
  const digits = String(code).split('').map((digit) => `
    <td width="48" height="56" align="center" class="code-cell" style="width:48px;height:56px;border:1px solid #d6dbe8;border-radius:10px;background:#f8f9fd;color:#1f2438;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:800;line-height:56px;font-variant-numeric:tabular-nums;">${escapeHtml(digit)}</td>
  `).join('<td width="8" class="code-spacer" style="width:8px;font-size:0;line-height:0;">&nbsp;</td>');
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
      <title>Verify your KayaTo account</title>
      <style>
        @media only screen and (max-width:620px){.email-shell{padding:20px 8px!important}.email-card{width:100%!important}.email-body{padding:32px 16px!important}.otp-table{width:100%!important}.code-cell{width:14%!important;height:52px!important;font-size:22px!important;line-height:52px!important}.code-spacer{width:3%!important}}
        @media (prefers-color-scheme:dark){.email-bg{background:#11131d!important}.email-card{background:#1a1e2b!important;border-color:#343a4d!important}.email-heading,.email-code-label,.brand-ink{color:#f5f6fb!important}.brand-ruby{color:#ff8a99!important}.email-copy{color:#d9ddea!important}.email-muted{color:#aeb6c9!important}.code-cell{background:#232838!important;border-color:#42495f!important;color:#f5f6fb!important}.email-divider{border-color:#343a4d!important}.info-panel{background:#123a38!important;border-color:#2b7069!important}.info-title{color:#8ce1d7!important}.info-copy{color:#c4e7e3!important}}
      </style>
    </head>
    <body class="email-bg" style="margin:0;padding:0;background:#f2f4fb;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Your KayaTo verification code is ${escapeHtml(code)}. It expires in 10 minutes.</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-bg" style="width:100%;background:#f2f4fb;">
        <tr>
          <td align="center" class="email-shell" style="padding:40px 16px;">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" class="email-card" style="width:600px;max-width:600px;background:#fafbff;border:1px solid #d6dbe8;border-radius:16px;overflow:hidden;">
              <tr>
                <td style="padding:22px 32px;border-bottom:1px solid #d6dbe8;" class="email-divider">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                      <td class="email-heading" style="color:#1f2438;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:800;letter-spacing:-0.3px;"><span class="brand-ink">K</span><span class="brand-ruby" style="color:#8f0016;">a</span><span class="brand-ink">yaTo</span></td>
                      <td align="right" class="email-muted" style="color:#59627a;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;">Verify your email</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td class="email-body" style="padding:44px 48px 40px;">
                  <h1 class="email-heading" style="margin:0 0 12px;color:#1f2438;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:1.2;letter-spacing:-0.6px;">Verify your KayaTo account</h1>
                  <p class="email-copy" style="margin:0;color:#3e465c;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;">Enter this code to finish creating your account. The code is valid for 10 minutes.</p>
                  <p class="email-code-label" style="margin:30px 0 10px;color:#1f2438;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;">Your verification code</p>
                  <table role="presentation" width="328" cellspacing="0" cellpadding="0" border="0" class="otp-table" aria-label="Verification code ${escapeHtml(code)}" style="width:328px;max-width:100%;">
                    <tr>${digits}</tr>
                  </table>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:32px;background:#eaf7f6;border:1px solid #8cc7c1;border-radius:10px;" class="info-panel">
                    <tr>
                      <td style="padding:16px;">
                        <p class="info-title" style="margin:0 0 6px;color:#086f65;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;font-weight:700;">Keep this code private.</p>
                        <p class="info-copy" style="margin:0;color:#285f5a;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;">KayaTo will never ask for this code outside the verification screen. If you did not request it, you can safely ignore this email.</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" class="email-divider email-muted" style="padding:20px 24px;border-top:1px solid #d6dbe8;color:#667085;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;">Sent by KayaTo to help protect your account.</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
};
const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many verification requests. Try again in 15 minutes.' } });
const emailCheckLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many email checks. Try again in 15 minutes.' } });
const usernameCheckLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many username checks. Try again in 15 minutes.' } });

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'KayaTo API', database: mongoose.connection.readyState === 1 ? 'connected' : 'connecting' }));
app.post('/api/auth/register/check-email-domain', emailCheckLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!emailSyntaxIsValid(email)) return res.status(400).json({ valid: false, message: 'Enter a valid email address with a complete domain.' });
    if (await User.exists({ email })) return res.status(409).json({ valid: false, message: 'An account already uses this email address. Log in instead.' });
    const domainStatus = await emailDomainAcceptsMail(email);
    if (domainStatus === 'invalid') return res.status(400).json({ valid: false, message: 'This email domain does not exist or cannot receive messages.' });
    if (domainStatus === 'unavailable') return res.status(503).json({ valid: false, message: 'We could not verify the email domain right now. Please try again.' });
    res.json({ valid: true });
  } catch (error) { next(error); }
});
app.post('/api/auth/register/check-username', usernameCheckLimiter, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body.username);
    if (!usernameIsValid(username)) return res.status(400).json({ valid: false, message: 'Use 3 to 24 lowercase letters, numbers, or underscores.' });
    if (await User.exists({ username })) return res.status(409).json({ valid: false, message: 'This username is already taken.' });
    res.json({ valid: true, username });
  } catch (error) { next(error); }
});
app.post('/api/auth/register/request-otp', otpLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const username = normalizeUsername(req.body.username);
    if (!emailSyntaxIsValid(email)) return res.status(400).json({ message: 'Enter a valid email address with a complete domain.' });
    if (!usernameIsValid(username)) return res.status(400).json({ message: 'Choose a valid username before continuing.' });
    if (await User.exists({ username })) return res.status(409).json({ message: 'This username is already taken.' });
    const domainStatus = await emailDomainAcceptsMail(email);
    if (domainStatus === 'invalid') return res.status(400).json({ message: 'This email domain cannot receive messages. Check the address and try again.' });
    if (domainStatus === 'unavailable') return res.status(503).json({ message: 'We could not verify the email domain right now. Please try again.' });
    if (await User.exists({ email })) return res.status(409).json({ message: 'An account already uses this email address.' });
    if (!resend) return res.status(503).json({ message: 'Email verification is not configured yet. Add RESEND_API_KEY to the backend .env file.' });
    const existing = await SignupOtp.findOne({ email });
    if (existing && Date.now() - existing.lastSentAt.getTime() < 60_000) return res.status(429).json({ message: 'Please wait 60 seconds before requesting another code.' });
    const code = String(randomInt(100000, 1_000_000));
    await SignupOtp.findOneAndUpdate({ email }, { codeHash: otpHash(email, code), expiresAt: new Date(Date.now() + 10 * 60_000), lastSentAt: new Date(), attempts: 0 }, { upsert: true, runValidators: true });
    const { error } = await resend.emails.send({
      from: emailFrom, to: email, subject: `${code} is your KayaTo verification code`,
      html: buildSignupOtpEmail(code),
      text: `Verify your KayaTo account\n\nYour verification code is ${code}.\n\nThis code expires in 10 minutes. Keep it private. If you did not request it, you can safely ignore this email.`,
    }, { idempotencyKey: `signup-otp/${email}/${Math.floor(Date.now() / 60_000)}` });
    if (error) { await SignupOtp.deleteOne({ email }); throw new Error(error.message || 'Resend could not send the verification email.'); }
    res.json({ message: 'Verification code sent.', expiresInSeconds: 600, resendAfterSeconds: 60 });
  } catch (error) { next(error); }
});
app.post('/api/auth/register/verify', otpLimiter, async (req, res, next) => {
  try {
    const firstName = normalizePersonName(req.body.firstName); const lastName = normalizePersonName(req.body.lastName); const displayName = `${firstName} ${lastName}`.trim(); const username = normalizeUsername(req.body.username); const email = normalizeEmail(req.body.email); const password = String(req.body.password || ''); const code = String(req.body.code || '').trim();
    if (!personNameIsValid(firstName)) return res.status(400).json({ message: 'First name may only contain letters, spaces, periods, and hyphens.' });
    if (!personNameIsValid(lastName)) return res.status(400).json({ message: 'Last name may only contain letters, spaces, periods, and hyphens.' });
    if (!usernameIsValid(username)) return res.status(400).json({ message: 'Use 3 to 24 lowercase letters, numbers, or underscores for your username.' });
    if (!emailSyntaxIsValid(email)) return res.status(400).json({ message: 'Enter a valid email address with a complete domain.' });
    if (!passwordIsStrong(password)) return res.status(400).json({ message: 'Password must have at least 8 characters, with uppercase, lowercase, number, and symbol.' });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ message: 'Enter the 6-digit verification code.' });
    if (await User.exists({ email })) return res.status(409).json({ message: 'An account already uses this email address.' });
    if (await User.exists({ username })) return res.status(409).json({ message: 'This username is already taken.' });
    const verification = await SignupOtp.findOne({ email });
    if (!verification || verification.expiresAt <= new Date()) { await SignupOtp.deleteOne({ email }); return res.status(400).json({ message: 'The verification code has expired. Request a new one.' }); }
    if (verification.attempts >= 5) { await SignupOtp.deleteOne({ email }); return res.status(429).json({ message: 'Too many incorrect attempts. Request a new code.' }); }
    if (!safeEqual(verification.codeHash, otpHash(email, code))) { verification.attempts += 1; await verification.save(); return res.status(400).json({ message: 'The verification code is incorrect.' }); }
    const user = await User.create({ firstName, lastName, displayName, username, email, passwordHash: await bcrypt.hash(password, 12), primaryUsage: req.body.primaryUsage || 'both', onboardingCompleted: true });
    await SignupOtp.deleteOne({ email });
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (error) { next(error); }
});
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const user = await User.findOne({ email: normalizeEmail(req.body.email) }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.passwordHash))) return res.status(401).json({ message: 'Incorrect email address or password.' });
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (error) { next(error); }
});
app.get('/api/auth/me', requireAuth, async (req, res, next) => {
  try { const user = await User.findById(req.user.id); if (!user) return res.status(404).json({ message: 'Account not found.' }); res.json(publicUser(user)); }
  catch (error) { next(error); }
});
app.patch('/api/auth/me', requireAuth, async (req, res, next) => {
  try {
    const update = cleanUpdate(req.body, ['displayName', 'username', 'timezone', 'currency', 'primaryUsage', 'onboardingCompleted', 'notificationPreferences']);
    if (Object.hasOwn(update, 'username')) {
      update.username = normalizeUsername(update.username);
      if (!usernameIsValid(update.username)) return res.status(400).json({ message: 'Use 3 to 24 lowercase letters, numbers, or underscores for your username.' });
      if (await User.exists({ username: update.username, _id: { $ne: req.user.id } })) return res.status(409).json({ message: 'This username is already taken.' });
    }
    const user = await User.findByIdAndUpdate(req.user.id, update, { new: true, runValidators: true }); res.json(publicUser(user));
  } catch (error) { next(error); }
});

app.get('/api/tasks', requireAuth, async (req, res, next) => {
  try {
    const teams = await Team.find({ 'members.user': req.user.id }).select('_id');
    const query = { $or: [{ creator: req.user.id }, { assignees: req.user.id }, { team: { $in: teams.map((team) => team._id) } }] };
    if (req.query.type) query.taskType = req.query.type; if (req.query.status) query.status = req.query.status;
    res.json(await Task.find(query).populate('assignees', 'displayName email').sort({ dueDate: 1, createdAt: -1 }));
  } catch (error) { next(error); }
});
app.post('/api/tasks', requireAuth, async (req, res, next) => {
  try {
    const payload = cleanUpdate(req.body, ['title', 'description', 'project', 'taskType', 'team', 'assignees', 'status', 'priority', 'progress', 'dueDate', 'aiGenerated', 'completionCriteria']);
    if (payload.taskType === 'team' && !(await getAuthorizedTeam(payload.team, req.user.id))) return res.status(403).json({ message: 'Select a team you belong to.' });
    const task = await Task.create({ ...payload, creator: req.user.id, assignees: payload.assignees?.length ? payload.assignees : [req.user.id] });
    res.status(201).json(await task.populate('assignees', 'displayName email'));
  } catch (error) { next(error); }
});
app.patch('/api/tasks/:id', requireAuth, async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id); if (!task) return res.status(404).json({ message: 'Task not found.' });
    const canEdit = String(task.creator) === req.user.id || task.assignees.some((id) => String(id) === req.user.id) || (task.team && await getAuthorizedTeam(task.team, req.user.id));
    if (!canEdit) return res.status(403).json({ message: 'You do not have permission to update this task.' });
    Object.assign(task, cleanUpdate(req.body, ['title', 'description', 'project', 'assignees', 'status', 'priority', 'progress', 'dueDate', 'completionCriteria']));
    if (task.status === 'done') task.progress = 100; await task.save(); res.json(await task.populate('assignees', 'displayName email'));
  } catch (error) { next(error); }
});
app.delete('/api/tasks/:id', requireAuth, async (req, res, next) => {
  try { const task = await Task.findOneAndDelete({ _id: req.params.id, creator: req.user.id }); if (!task) return res.status(404).json({ message: 'Task not found or you are not its creator.' }); res.status(204).end(); }
  catch (error) { next(error); }
});

app.get('/api/bills', requireAuth, async (req, res, next) => { try { res.json(await Bill.find({ user: req.user.id }).sort({ dueDate: 1 })); } catch (error) { next(error); } });
app.post('/api/bills', requireAuth, async (req, res, next) => {
  try { const payload = cleanUpdate(req.body, ['name', 'category', 'amount', 'currency', 'dueDate', 'billingCycle', 'reminderDaysBefore', 'status', 'officialPaymentUrl']); res.status(201).json(await Bill.create({ ...payload, user: req.user.id })); }
  catch (error) { next(error); }
});
app.patch('/api/bills/:id', requireAuth, async (req, res, next) => {
  try {
    const update = cleanUpdate(req.body, ['name', 'category', 'amount', 'currency', 'dueDate', 'billingCycle', 'reminderDaysBefore', 'status', 'officialPaymentUrl', 'paidAt']); if (update.status === 'paid' && !update.paidAt) update.paidAt = new Date();
    const bill = await Bill.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, update, { new: true, runValidators: true }); if (!bill) return res.status(404).json({ message: 'Bill reminder not found.' }); res.json(bill);
  } catch (error) { next(error); }
});
app.delete('/api/bills/:id', requireAuth, async (req, res, next) => { try { const bill = await Bill.findOneAndDelete({ _id: req.params.id, user: req.user.id }); if (!bill) return res.status(404).json({ message: 'Bill reminder not found.' }); res.status(204).end(); } catch (error) { next(error); } });

app.get('/api/teams', requireAuth, async (req, res, next) => { try { res.json(await Team.find({ 'members.user': req.user.id }).populate('members.user', 'displayName email').sort({ updatedAt: -1 })); } catch (error) { next(error); } });
app.post('/api/teams', requireAuth, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim(); if (name.length < 2) return res.status(400).json({ message: 'Enter a team name.' });
    const team = await Team.create({ name, description: req.body.description, owner: req.user.id, members: [{ user: req.user.id, role: 'owner' }] });
    await Conversation.create({ team: team._id, name: 'general', participants: [req.user.id] }); res.status(201).json(await team.populate('members.user', 'displayName email'));
  } catch (error) { next(error); }
});
app.post('/api/teams/:id/members', requireAuth, async (req, res, next) => {
  try {
    const team = await Team.findOne({ _id: req.params.id, $or: [{ owner: req.user.id }, { members: { $elemMatch: { user: req.user.id, role: 'manager' } } }] });
    if (!team) return res.status(403).json({ message: 'Only a team owner or manager can add members.' });
    const user = await User.findOne({ email: normalizeEmail(req.body.email) }); if (!user) return res.status(404).json({ message: 'No KayaTo account uses that email address.' });
    if (team.members.some((member) => String(member.user) === String(user._id))) return res.status(409).json({ message: 'This person is already a team member.' });
    team.members.push({ user: user._id, role: req.body.role || 'member' }); await team.save(); await Conversation.updateMany({ team: team._id }, { $addToSet: { participants: user._id } });
    res.json(await team.populate('members.user', 'displayName email'));
  } catch (error) { next(error); }
});

const friendSummary = (user) => ({ id: String(user._id), displayName: user.displayName, username: user.username || '', email: user.email, profilePicture: user.profilePicture || '' });
app.get('/api/friends', requireAuth, async (req, res, next) => {
  try {
    const friendships = await Friendship.find({ $or: [{ requester: req.user.id }, { recipient: req.user.id }] })
      .populate('requester recipient', 'displayName username email profilePicture').sort({ updatedAt: -1 });
    const response = { friends: [], incoming: [], outgoing: [] };
    friendships.forEach((friendship) => {
      const requesterIsMe = String(friendship.requester._id) === req.user.id;
      const otherUser = requesterIsMe ? friendship.recipient : friendship.requester;
      const item = { requestId: String(friendship._id), user: friendSummary(otherUser), createdAt: friendship.createdAt };
      if (friendship.status === 'accepted') response.friends.push(item);
      else if (requesterIsMe) response.outgoing.push(item);
      else response.incoming.push(item);
    });
    res.json(response);
  } catch (error) { next(error); }
});
app.get('/api/users/search', requireAuth, async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) return res.status(400).json({ message: 'Enter at least 2 characters to search.' });
    const matcher = new RegExp(escapeRegex(query.slice(0, 80)), 'i');
    const usernameQuery = normalizeUsername(query).slice(0, 24);
    const searchFields = [{ displayName: matcher }, { email: matcher }];
    if (usernameQuery) searchFields.push({ username: new RegExp(escapeRegex(usernameQuery), 'i') });
    const users = await User.find({ _id: { $ne: req.user.id }, $or: searchFields })
      .select('displayName username email profilePicture').sort({ displayName: 1 }).limit(12);
    const pairKeys = users.map((user) => friendshipPairKey(req.user.id, user._id));
    const relationships = await Friendship.find({ pairKey: { $in: pairKeys } });
    const relationshipByPair = new Map(relationships.map((item) => [item.pairKey, item]));
    res.json(users.map((user) => {
      const relationship = relationshipByPair.get(friendshipPairKey(req.user.id, user._id));
      let relationshipStatus = 'none';
      if (relationship?.status === 'accepted') relationshipStatus = 'friends';
      else if (relationship && String(relationship.requester) === req.user.id) relationshipStatus = 'outgoing';
      else if (relationship) relationshipStatus = 'incoming';
      return { ...friendSummary(user), relationshipStatus, requestId: relationship ? String(relationship._id) : null };
    }));
  } catch (error) { next(error); }
});
app.post('/api/friends/requests', requireAuth, async (req, res, next) => {
  try {
    const recipientId = String(req.body.recipientId || '');
    if (!mongoose.isValidObjectId(recipientId) || recipientId === req.user.id) return res.status(400).json({ message: 'Select another KayaTo user.' });
    const recipient = await User.findById(recipientId).select('displayName username email profilePicture');
    if (!recipient) return res.status(404).json({ message: 'This KayaTo user could not be found.' });
    const pairKey = friendshipPairKey(req.user.id, recipientId);
    const existing = await Friendship.findOne({ pairKey });
    if (existing?.status === 'accepted') return res.status(409).json({ message: 'You are already friends.' });
    if (existing) return res.status(409).json({ message: String(existing.requester) === req.user.id ? 'Friend request already sent.' : 'This person already sent you a friend request.' });
    const request = await Friendship.create({ requester: req.user.id, recipient: recipientId, pairKey });
    res.status(201).json({ requestId: String(request._id), user: friendSummary(recipient), createdAt: request.createdAt });
  } catch (error) { next(error); }
});
app.patch('/api/friends/requests/:id', requireAuth, async (req, res, next) => {
  try {
    if (req.body.action !== 'accept') return res.status(400).json({ message: 'Choose a valid friend request action.' });
    const friendship = await Friendship.findOne({ _id: req.params.id, recipient: req.user.id, status: 'pending' });
    if (!friendship) return res.status(404).json({ message: 'Friend request not found.' });
    friendship.status = 'accepted'; friendship.acceptedAt = new Date(); await friendship.save();
    const directKey = directConversationKey(friendship.requester, friendship.recipient);
    const conversation = await Conversation.findOneAndUpdate(
      { directKey },
      { $setOnInsert: { kind: 'direct', name: 'direct', directKey, participants: [friendship.requester, friendship.recipient] } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).populate('participants', 'displayName username email profilePicture');
    res.json({ friendshipId: String(friendship._id), conversation });
  } catch (error) { next(error); }
});
app.delete('/api/friends/requests/:id', requireAuth, async (req, res, next) => {
  try {
    const request = await Friendship.findOneAndDelete({ _id: req.params.id, status: 'pending', $or: [{ requester: req.user.id }, { recipient: req.user.id }] });
    if (!request) return res.status(404).json({ message: 'Friend request not found.' });
    res.status(204).end();
  } catch (error) { next(error); }
});
app.post('/api/friends/:friendId/conversation', requireAuth, async (req, res, next) => {
  try {
    const friendId = String(req.params.friendId || '');
    if (!mongoose.isValidObjectId(friendId)) return res.status(400).json({ message: 'Select a valid friend.' });
    const friendship = await Friendship.findOne({ pairKey: friendshipPairKey(req.user.id, friendId), status: 'accepted' });
    if (!friendship) return res.status(403).json({ message: 'Only accepted friends can start a direct conversation.' });
    const directKey = directConversationKey(req.user.id, friendId);
    const conversation = await Conversation.findOneAndUpdate(
      { directKey },
      { $setOnInsert: { kind: 'direct', name: 'direct', directKey, participants: [req.user.id, friendId] } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).populate('participants', 'displayName username email profilePicture');
    res.json(conversation);
  } catch (error) { next(error); }
});

app.get('/api/conversations', requireAuth, async (req, res, next) => {
  try {
    const teams = await Team.find({ 'members.user': req.user.id }).select('_id');
    const conversations = await Conversation.find({ $or: [{ participants: req.user.id }, { team: { $in: teams.map((team) => team._id) } }] })
      .populate('team', 'name').populate('participants', 'displayName username email profilePicture').sort({ updatedAt: -1 });
    res.json(conversations);
  }
  catch (error) { next(error); }
});
app.get('/api/conversations/:id/messages', requireAuth, async (req, res, next) => {
  try { const conversation = await Conversation.findById(req.params.id); if (!(await canAccessConversation(conversation, req.user.id))) return res.status(403).json({ message: 'You cannot access this conversation.' }); res.json(await Message.find({ conversation: conversation._id }).populate('sender', 'displayName').sort({ createdAt: 1 }).limit(200)); }
  catch (error) { next(error); }
});
async function buildKayaReply(content, userId) {
  const lower = content.toLowerCase(); const openTasks = await Task.find({ $or: [{ creator: userId }, { assignees: userId }], status: { $ne: 'done' } }).sort({ dueDate: 1 }).limit(5);
  if (/summari[sz]e|summary/.test(lower)) return openTasks.length ? `You have ${openTasks.length} active priorities: ${openTasks.map((task) => task.title).join(', ')}.` : 'There are no active tasks to summarize yet.';
  if (/priorit|what.*next|focus/.test(lower)) { const next = openTasks.find((task) => ['urgent', 'high'].includes(task.priority)) || openTasks[0]; return next ? `Start with “${next.title}”. It has the strongest combination of priority and due date among your active tasks.` : 'Create your first task and I can help you choose what to do next.'; }
  if (/task|plan/.test(lower)) return 'Open the AI Planner to turn your requirements into an editable task breakdown. Nothing is saved until you approve it.';
  return 'I can summarize active work, suggest a priority, or help turn project requirements into a task plan.';
}
app.post('/api/conversations/:id/messages', requireAuth, async (req, res, next) => {
  try {
    const content = String(req.body.content || '').trim(); if (!content) return res.status(400).json({ message: 'Enter a message.' });
    const conversation = await Conversation.findById(req.params.id); if (!(await canAccessConversation(conversation, req.user.id))) return res.status(403).json({ message: 'You cannot access this conversation.' });
    const user = await User.findById(req.user.id); const message = await Message.create({ conversation: conversation._id, sender: req.user.id, senderName: user.displayName, content }); const populated = await message.populate('sender', 'displayName');
    conversation.updatedAt = new Date(); await conversation.save();
    io.to(`conversation:${conversation._id}`).emit('message:new', populated); const response = { message: populated };
    if (/@kaya\b/i.test(content)) { const aiMessage = await Message.create({ conversation: conversation._id, senderType: 'ai', senderName: 'Kaya', content: await buildKayaReply(content, req.user.id) }); io.to(`conversation:${conversation._id}`).emit('message:new', aiMessage); response.aiMessage = aiMessage; }
    res.status(201).json(response);
  } catch (error) { next(error); }
});

function titleCase(value) { return value.charAt(0).toUpperCase() + value.slice(1).replace(/[.;:]$/, ''); }
app.post('/api/planner/generate', requireAuth, async (req, res) => {
  const text = String(req.body.text || '').replace(/\r/g, '').trim(); if (text.length < 20) return res.status(400).json({ message: 'Add at least a short project brief before generating a plan.' });
  const rawItems = text.split(/\n|(?<=[.!?])\s+/).map((item) => item.replace(/^[-*\d.)\s]+/, '').trim()).filter((item) => item.length >= 8);
  const seeds = rawItems.length >= 2 ? rawItems : ['Review requirements and define success criteria', 'Design the solution and prepare project assets', 'Implement the approved project plan', 'Test, document, and prepare the final presentation'];
  const tasks = seeds.slice(0, 8).map((item, index) => ({ title: titleCase(item.length > 100 ? `${item.slice(0, 97)}...` : item), description: 'Generated from the submitted brief. Review this task before saving it to the project.', priority: index < 2 ? 'high' : 'medium', status: 'todo', progress: 0, estimatedHours: [4, 6, 8, 6, 4, 5, 3, 4][index], completionCriteria: ['The expected output is reviewed', 'Any blockers are documented'] }));
  res.json({ summary: `Kaya prepared ${tasks.length} editable work items from your brief.`, tasks });
});
app.get('/api/dashboard', requireAuth, async (req, res, next) => {
  try {
    const teams = await Team.find({ 'members.user': req.user.id }).select('_id'); const access = { $or: [{ creator: req.user.id }, { assignees: req.user.id }, { team: { $in: teams.map((team) => team._id) } }] };
    const [tasks, bills] = await Promise.all([Task.find(access).populate('assignees', 'displayName').sort({ dueDate: 1 }), Bill.find({ user: req.user.id, status: { $ne: 'paid' } }).sort({ dueDate: 1 })]);
    res.json({ metrics: { completed: tasks.filter((task) => task.status === 'done').length, inProgress: tasks.filter((task) => task.status === 'in-progress').length, needsAttention: tasks.filter((task) => task.status !== 'done' && task.dueDate && task.dueDate < new Date()).length, total: tasks.length }, tasks: tasks.slice(0, 6), bills: bills.slice(0, 3) });
  } catch (error) { next(error); }
});

io.use((socket, next) => { try { socket.user = jwt.verify(socket.handshake.auth?.token, jwtSecret); next(); } catch { next(new Error('Authentication required.')); } });
io.on('connection', (socket) => socket.on('conversation:join', async (conversationId) => {
  if (!mongoose.isValidObjectId(conversationId)) return;
  const conversation = await Conversation.findById(conversationId).catch(() => null);
  if (await canAccessConversation(conversation, socket.user.id)) socket.join(`conversation:${conversationId}`);
}));
app.use((req, res) => res.status(404).json({ message: 'Endpoint not found.' }));
app.use((error, _req, res, _next) => { console.error(error); if (error.name === 'ValidationError' || error.name === 'CastError') return res.status(400).json({ message: error.message }); if (error.code === 11000) return res.status(409).json({ message: error.keyPattern?.username ? 'This username is already taken.' : 'That record already exists.' }); res.status(500).json({ message: isProduction ? 'Something went wrong.' : error.message }); });

try { await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 }); httpServer.listen(port, () => console.log(`KayaTo API running on http://localhost:${port}`)); }
catch (error) { console.error(`Could not start KayaTo API: ${error.message}`); process.exit(1); }
