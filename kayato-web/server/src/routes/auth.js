
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { requireAuth } from '../middleware/auth.js';
import User from '../models/User.js';

const router = Router();

const sign = (user) =>
  jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

const publicUser = (user) => ({
  id: user._id,
  displayName: user.displayName,
  firstName: user.firstName,
  lastName: user.lastName,
  username: user.username,
  email: user.email,
  profilePicture: user.profilePicture,
  timezone: user.timezone,
  currency: user.currency,
  primaryUsage: user.primaryUsage,
  notificationPreferences: user.notificationPreferences,
  onboardingCompleted: user.onboardingCompleted,
});

const normalizeEmail = (value) =>
  String(value || '').trim().toLowerCase();

const normalizeUsername = (value) =>
  String(value || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();

const validEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
  email.length <= 254;

const validUsername = (username) =>
  /^[a-z0-9_]{3,24}$/.test(username);

const validPassword = (password) =>
  typeof password === 'string' &&
  password.length >= 8 &&
  password.length <= 64 &&
  /[A-Z]/.test(password) &&
  /[a-z]/.test(password) &&
  /\d/.test(password) &&
  /[^A-Za-z0-9]/.test(password);

const validName = (name) =>
  typeof name === 'string' &&
  /^[\p{L} .-]{2,40}$/u.test(name.trim()) &&
  /\p{L}/u.test(name);

// Development-only OTP storage.
// For production, use persistent storage and rate limiting.
const otpStore = new Map();

const OTP_LIFETIME_MS = 10 * 60_000;
const OTP_RESEND_MS = 60_000;
const OTP_MAX_ATTEMPTS = 5;

const hashOtp = (code) =>
  crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(code)
    .digest('hex');

function emailTransport() {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS ||
    !process.env.SMTP_FROM
  ) {
    return null;
  }

  const port = Number(process.env.SMTP_PORT || 587);

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// CHECK EMAIL
router.post('/register/check-email-domain', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!validEmail(email)) {
      return res.status(400).json({
        message: 'Enter a valid email address.',
      });
    }

    if (await User.exists({ email })) {
      return res.status(409).json({
        message: 'An account already uses this email.',
      });
    }

    return res.json({
      valid: true,
      available: true,
    });
  } catch (error) {
    next(error);
  }
});

// CHECK USERNAME
router.post('/register/check-username', async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body?.username);

    if (!validUsername(username)) {
      return res.status(400).json({
        message: 'Username must contain 3 to 24 letters, numbers, or underscores.',
      });
    }

    if (await User.exists({ username })) {
      return res.status(409).json({
        message: 'This username is already taken.',
      });
    }

    return res.json({
      valid: true,
      available: true,
    });
  } catch (error) {
    next(error);
  }
});

// REQUEST REGISTRATION OTP
router.post('/register/request-otp', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const username = normalizeUsername(req.body?.username);

    if (!validEmail(email) || !validUsername(username)) {
      return res.status(400).json({
        message: 'Valid email and username are required.',
      });
    }

    if (await User.exists({ email })) {
      return res.status(409).json({
        message: 'An account already uses this email.',
      });
    }

    if (await User.exists({ username })) {
      return res.status(409).json({
        message: 'This username is already taken.',
      });
    }

    const current = otpStore.get(email);

    if (
      current &&
      Date.now() - current.sentAt < OTP_RESEND_MS
    ) {
      return res.status(429).json({
        message: 'Please wait one minute before requesting another code.',
      });
    }

    const transport = emailTransport();

    if (!transport) {
      return res.status(503).json({
        message: 'Email verification is not configured on the server.',
      });
    }

    const code = String(
      crypto.randomInt(100000, 1000000)
    );

    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: 'KayaTo verification code',
      text: `Your KayaTo verification code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`,
    });

    otpStore.set(email, {
      username,
      codeHash: hashOtp(code),
      sentAt: Date.now(),
      expiresAt: Date.now() + OTP_LIFETIME_MS,
      attempts: 0,
    });

    return res.json({
      message: 'Verification code sent to your email.',
    });
  } catch (error) {
    next(error);
  }
});

// VERIFY OTP AND REGISTER
router.post('/register/verify', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const username = normalizeUsername(req.body?.username);

    const code = String(
      req.body?.otp ?? req.body?.code ?? ''
    ).trim();

    const displayName = String(
      req.body?.displayName || ''
    ).trim();

    const password = req.body?.password;

    if (
      !validEmail(email) ||
      !validUsername(username) ||
      !displayName ||
      displayName.length > 80 ||
      typeof password !== 'string' ||
      password.length < 8
    ) {
      return res.status(400).json({
        message: 'Name, valid email, username, and an 8-character password are required.',
      });
    }

    const record = otpStore.get(email);

    if (!record || Date.now() > record.expiresAt) {
      otpStore.delete(email);

      return res.status(400).json({
        message: 'Verification code expired or missing. Request a new code.',
      });
    }

    if (record.username !== username) {
      return res.status(400).json({
        message: 'Username does not match the verification request.',
      });
    }

    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      otpStore.delete(email);

      return res.status(429).json({
        message: 'Too many attempts. Request a new code.',
      });
    }

    record.attempts += 1;

    if (!/^[0-9]{6}$/.test(code)) {
      return res.status(400).json({
        message: 'Incorrect verification code.',
      });
    }

    const actualHash = Buffer.from(hashOtp(code), 'hex');
    const expectedHash = Buffer.from(record.codeHash, 'hex');

    if (!crypto.timingSafeEqual(actualHash, expectedHash)) {
      return res.status(400).json({
        message: 'Incorrect verification code.',
      });
    }

    if (
      await User.exists({
        $or: [{ email }, { username }],
      })
    ) {
      return res.status(409).json({
        message: 'Email or username is already registered.',
      });
    }

    const user = await User.create({
      displayName,
      username,
      email,
      passwordHash: await bcrypt.hash(password, 12),
    });

    otpStore.delete(email);

    return res.status(201).json({
      token: sign(user),
      user: publicUser(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'Email or username is already registered.',
      });
    }

    next(error);
  }
});

// LEGACY REGISTRATION
// Remove or disable in production if OTP is mandatory.
router.post('/register', async (req, res, next) => {
  try {
    const { displayName, password } = req.body || {};
    const email = normalizeEmail(req.body?.email);

    if (
      !displayName ||
      !validEmail(email) ||
      typeof password !== 'string' ||
      password.length < 8
    ) {
      return res.status(400).json({
        message: 'Name, valid email, and an 8-character password are required.',
      });
    }

    if (await User.exists({ email })) {
      return res.status(409).json({
        message: 'An account already uses this email.',
      });
    }

    const user = await User.create({
      displayName,
      email,
      passwordHash: await bcrypt.hash(password, 12),
    });

    return res.status(201).json({
      token: sign(user),
      user: publicUser(user),
    });
  } catch (error) {
    next(error);
  }
});

// LOGIN
router.post('/login', async (req, res, next) => {
  try {
    const identifier = normalizeEmail(req.body?.email);

    const user = await User.findOne({
      $or: [
        { email: identifier },
        { username: normalizeUsername(identifier) },
      ],
    }).select('+passwordHash');

    if (
      !user ||
      !user.passwordHash ||
      !(await bcrypt.compare(
        req.body?.password || '',
        user.passwordHash
      ))
    ) {
      return res.status(401).json({
        message: 'Incorrect email/username or password.',
      });
    }

    return res.json({
      token: sign(user),
      user: publicUser(user),
    });
  } catch (error) {
    next(error);
  }
});

// GET CURRENT USER
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: 'User not found.',
      });
    }

    return res.json(user);
  } catch (error) {
    next(error);
  }
});

// UPDATE PROFILE AND NOTIFICATIONS
router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: 'User not found.',
      });
    }

    const {
      firstName,
      lastName,
      username,
      timezone,
      currency,
      primaryUsage,
      notificationPreferences,
    } = req.body || {};

    // UPDATE FIRST AND LAST NAME
    if (
      firstName !== undefined ||
      lastName !== undefined
    ) {
      const nameParts = (user.displayName || '')
        .trim()
        .split(/\s+/);

      const first = String(
        firstName !== undefined
          ? firstName
          : user.firstName || nameParts[0] || ''
      ).trim();

      const last = String(
        lastName !== undefined
          ? lastName
          : user.lastName || nameParts.slice(1).join(' ') || ''
      ).trim();

      if (!validName(first) || !validName(last)) {
        return res.status(400).json({
          message: 'First and last name must each contain 2 to 40 valid characters.',
        });
      }

      user.firstName = first;
      user.lastName = last;
      user.displayName = `${first} ${last}`;
    }

    // UPDATE USERNAME
    if (username !== undefined) {
      const normalized = normalizeUsername(username);

      if (!validUsername(normalized)) {
        return res.status(400).json({
          message: 'Username must contain 3 to 24 lowercase letters, numbers, or underscores.',
        });
      }

      if (normalized !== user.username) {
        const existing = await User.exists({
          username: normalized,
          _id: { $ne: user._id },
        });

        if (existing) {
          return res.status(409).json({
            message: 'This username is already taken.',
          });
        }

        user.username = normalized;
      }
    }

    // UPDATE TIMEZONE
    if (timezone !== undefined) {
      const allowedTimezones = [
        'Asia/Manila',
        'Asia/Singapore',
        'UTC',
        'America/New_York',
      ];

      if (!allowedTimezones.includes(timezone)) {
        return res.status(400).json({
          message: 'Invalid timezone.',
        });
      }

      user.timezone = timezone;
    }

    // UPDATE CURRENCY
    if (currency !== undefined) {
      if (!['PHP', 'USD'].includes(currency)) {
        return res.status(400).json({
          message: 'Invalid currency.',
        });
      }

      user.currency = currency;
    }

    // UPDATE PRIMARY USAGE
    if (primaryUsage !== undefined) {
      if (!['personal', 'team', 'both'].includes(primaryUsage)) {
        return res.status(400).json({
          message: 'Invalid primary usage.',
        });
      }

      user.primaryUsage = primaryUsage;
    }

    // UPDATE NOTIFICATION PREFERENCES
    if (notificationPreferences !== undefined) {
      if (
        !notificationPreferences ||
        typeof notificationPreferences !== 'object' ||
        Array.isArray(notificationPreferences)
      ) {
        return res.status(400).json({
          message: 'Invalid notification preferences.',
        });
      }

      const allowedKeys = [
        'taskAssignments',
        'deadlines',
        'teamMessages',
        'bills',
      ];

      const currentPreferences =
        user.notificationPreferences?.toObject?.() ||
        {};

      const updatedPreferences = {
        ...currentPreferences,
      };

      for (const key of allowedKeys) {
        if (notificationPreferences[key] !== undefined) {
          if (typeof notificationPreferences[key] !== 'boolean') {
            return res.status(400).json({
              message: `Invalid notification setting: ${key}.`,
            });
          }

          updatedPreferences[key] = notificationPreferences[key];
        }
      }

      user.notificationPreferences = updatedPreferences;
    }

    await user.save();

    // Return the updated user directly for AuthContext.
    return res.status(200).json(publicUser(user));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'This username is already taken.',
      });
    }

    next(error);
  }
});

// CHANGE PASSWORD
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const {
      currentPassword,
      newPassword,
    } = req.body || {};

    if (
      typeof currentPassword !== 'string' ||
      !currentPassword ||
      typeof newPassword !== 'string' ||
      !newPassword
    ) {
      return res.status(400).json({
        message: 'Current password and new password are required.',
      });
    }

    if (!validPassword(newPassword)) {
      return res.status(400).json({
        message: 'New password must be 8 to 64 characters and contain uppercase, lowercase, number, and symbol.',
      });
    }

    const user = await User.findById(req.user.id)
      .select('+passwordHash');

    if (!user) {
      return res.status(404).json({
        message: 'User not found.',
      });
    }

    if (
      !user.passwordHash ||
      !(await bcrypt.compare(
        currentPassword,
        user.passwordHash
      ))
    ) {
      return res.status(400).json({
        message: 'Current password is incorrect.',
      });
    }

    if (
      await bcrypt.compare(newPassword, user.passwordHash)
    ) {
      return res.status(400).json({
        message: 'New password must be different from your current password.',
      });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);

    await user.save();

    return res.status(200).json({
      message: 'Password updated successfully.',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
