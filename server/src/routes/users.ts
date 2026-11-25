import { Router } from 'express';
import { parse } from '../lib/validate';
import { currentUser, requireRole } from '../middleware/auth';
import { idParam } from '../services/core-http';
import {
  createUser,
  createUserSchema,
  listUsers,
  listUsersSchema,
  setUserStatus,
  statusSchema,
  toUserListItem,
  updateUser,
  updateUserSchema,
} from '../services/users';

const router = Router();
router.use(requireRole('admin'));

router.get('/', (req, res) => {
  res.json(listUsers(parse(listUsersSchema, req.query)));
});

router.get('/:id', (req, res) => {
  res.json(toUserListItem(idParam(req, 'id', 'User')));
});

router.post('/', (req, res) => {
  res.status(201).json(createUser(currentUser(req), parse(createUserSchema, req.body)));
});

router.put('/:id', (req, res) => {
  res.json(updateUser(currentUser(req), idParam(req, 'id', 'User'), parse(updateUserSchema, req.body)));
});

router.patch('/:id/status', (req, res) => {
  const { isActive } = parse(statusSchema, req.body);
  res.json(setUserStatus(currentUser(req), idParam(req, 'id', 'User'), isActive));
});

export default router;
