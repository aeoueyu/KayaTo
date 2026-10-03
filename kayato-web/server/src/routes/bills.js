import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import Bill from '../models/Bill.js';

const router = Router();
router.use(requireAuth);
router.get('/', async (req, res, next) => { try { res.json(await Bill.find({ user: req.user.id }).sort({ dueDate: 1 })); } catch (error) { next(error); } });
router.post('/', async (req, res, next) => { try { res.status(201).json(await Bill.create({ ...req.body, user: req.user.id })); } catch (error) { next(error); } });
router.patch('/:id', async (req, res, next) => { try { const bill = await Bill.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, req.body, { new: true, runValidators: true }); if (!bill) return res.status(404).json({ message: 'Bill not found.' }); res.json(bill); } catch (error) { next(error); } });
router.delete('/:id', async (req, res, next) => { try { const bill = await Bill.findOneAndDelete({ _id: req.params.id, user: req.user.id }); if (!bill) return res.status(404).json({ message: 'Bill not found.' }); res.status(204).end(); } catch (error) { next(error); } });
export default router;
