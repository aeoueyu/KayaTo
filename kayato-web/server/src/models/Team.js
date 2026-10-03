import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['owner', 'manager', 'member', 'viewer'], default: 'member' },
  skills: [String],
  joinedAt: { type: Date, default: Date.now },
}, { _id: false });

const teamSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [memberSchema],
}, { timestamps: true });

export default mongoose.model('Team', teamSchema);
