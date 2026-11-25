import { Router } from 'express';
import { currentUser, requireRole } from '../middleware/auth';
import { adminDashboard, doctorDashboard, staffDashboard, studentDashboard } from '../services/dashboards';

const router = Router();

router.get('/student', requireRole('student'), (req, res) => {
  res.json(studentDashboard(currentUser(req).id));
});

router.get('/doctor', requireRole('doctor'), (req, res) => {
  res.json(doctorDashboard(currentUser(req).id));
});

router.get('/staff', requireRole('staff', 'admin'), (_req, res) => {
  res.json(staffDashboard());
});

router.get('/admin', requireRole('admin'), (_req, res) => {
  res.json(adminDashboard());
});

export default router;
