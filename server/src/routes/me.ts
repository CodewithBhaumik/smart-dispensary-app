import { Router } from 'express';
import { parse } from '../lib/validate';
import { currentUser, requireAuth } from '../middleware/auth';
import { changePassword, passwordSchema, updateOwnProfile } from '../services/users';

const router = Router();
router.use(requireAuth);

router.put('/profile', (req, res) => {
  res.json(updateOwnProfile(currentUser(req), req.body));
});

router.put('/password', (req, res) => {
  changePassword(currentUser(req), parse(passwordSchema, req.body));
  res.json({ ok: true });
});

export default router;
