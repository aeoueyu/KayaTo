import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  senderType: { type: String, enum: ['user', 'ai'], default: 'user' },
  content: { type: String, trim: true, maxlength: 10000 },
  attachments: [{ name: String, url: String, mimeType: String }],
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  aiMetadata: { action: String, triggeredBy: mongoose.Schema.Types.ObjectId, referencedTask: mongoose.Schema.Types.ObjectId },
}, { timestamps: true });

export default mongoose.model('Message', messageSchema);
