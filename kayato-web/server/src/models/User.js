
import mongoose from 'mongoose';

const notificationPreferencesSchema = new mongoose.Schema(
  {
    taskAssignments: { type: Boolean, default: true },
    deadlines: { type: Boolean, default: true },
    teamMessages: { type: Boolean, default: true },
    bills: { type: Boolean, default: true },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },

    firstName: {
      type: String,
      trim: true,
      maxlength: 40,
    },

    lastName: {
      type: String,
      trim: true,
      maxlength: 40,
    },

    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 24,
      match: /^[a-z0-9_]+$/,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    passwordHash: {
      type: String,
      select: false,
    },

    profilePicture: String,

    timezone: {
      type: String,
      default: 'Asia/Manila',
    },

    currency: {
      type: String,
      default: 'PHP',
      uppercase: true,
    },

    primaryUsage: {
      type: String,
      enum: ['personal', 'team', 'both'],
      default: 'both',
    },

    notificationPreferences: {
      type: notificationPreferencesSchema,
      default: () => ({}),
    },

    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
