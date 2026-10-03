import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import Task from '../models/Task.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const query = { $or: [{ creator: req.user.id }, { assignees: req.user.id }] };
    if (req.query.type) query.taskType = req.query.type;
    if (req.query.status) query.status = req.query.status;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const [items, total] = await Promise.all([Task.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), Task.countDocuments(query)]);
    res.json({ items, page, pages: Math.ceil(total / limit), total });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try { res.status(201).json(await Task.create({ ...req.body, creator: req.user.id })); } catch (error) { next(error); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const task = await Task.findOneAndUpdate({ _id: req.params.id, creator: req.user.id }, req.body, { new: true, runValidators: true });
    if (!task) return res.status(404).json({ message: 'Task not found.' });
    res.json(task);
  } catch (error) { next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, creator: req.user.id });
    if (!task) return res.status(404).json({ message: 'Task not found.' });
    res.status(204).end();
  } catch (error) { next(error); }
});

export default router;
