import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import Team from '../models/Team.js';

const router = Router();

router.use(requireAuth);

// GET ALL TEAMS OF LOGGED-IN USER
router.get('/', async (req, res, next) => {
  try {
    const teams = await Team.find({
      $or: [
        { owner: req.user.id },
        { 'members.user': req.user.id },
      ],
    }).sort({ createdAt: -1 });

    return res.json(teams);
  } catch (error) {
    next(error);
  }
});

// CREATE TEAM
router.post('/', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();

    if (!name || name.length > 100) {
      return res.status(400).json({
        message: 'Team name must be between 1 and 100 characters.',
      });
    }

    const team = await Team.create({
      name,
      owner: req.user.id,
      members: [
        {
          user: req.user.id,
          role: 'owner',
        },
      ],
    });

    return res.status(201).json(team);
  } catch (error) {
    next(error);
  }
});

// GET ONE TEAM
router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid team ID.',
      });
    }

    const team = await Team.findOne({
      _id: req.params.id,
      $or: [
        { owner: req.user.id },
        { 'members.user': req.user.id },
      ],
    }).populate('members.user', 'displayName username email');

    if (!team) {
      return res.status(404).json({
        message: 'Team not found.',
      });
    }

    return res.json(team);
  } catch (error) {
    next(error);
  }
});

export default router;
