import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 180 },
  description: { type: String, trim: true, maxlength: 5000 },
  taskType: { type: String, enum: ['personal', 'team'], required: true },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  assignmentMode: { type: String, enum: ['direct', 'request', 'auto_accept'], default: 'direct' },
  status: { type: String, enum: ['todo', 'open', 'requested', 'assigned', 'in-progress', 'review', 'done'], default: 'todo' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  dueDate: Date,
  sourceFile: { name: String, url: String, mimeType: String },
  aiGenerated: { type: Boolean, default: false },
  completionCriteria: [String],
}, { timestamps: true });

export default mongoose.model('Task', taskSchema);
