import mongoose from 'mongoose';

const providerSchema = new mongoose.Schema({
  provider: { type: String, enum: ['local', 'google', 'facebook', 'apple'], required: true },
  providerUserId: String,
}, { _id: false });

const userSchema = new mongoose.Schema({
  displayName: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, select: false },
  profilePicture: String,
  timezone: { type: String, default: 'Asia/Manila' },
  currency: { type: String, default: 'PHP', uppercase: true },
  primaryUsage: { type: String, enum: ['personal', 'team', 'both'], default: 'both' },
  onboardingCompleted: { type: Boolean, default: false },
  authProviders: { type: [providerSchema], default: [{ provider: 'local' }] },
}, { timestamps: true });

export default mongoose.model('User', userSchema);
