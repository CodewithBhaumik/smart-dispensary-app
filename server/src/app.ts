import fs from 'node:fs';
import path from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import multer from 'multer';
import { SERVER_ROOT } from './db';
import { AppError, notFound } from './lib/errors';
import { authenticate } from './middleware/auth';
import activityRoutes from './routes/activity';
import appointmentRoutes from './routes/appointments';
import authRoutes from './routes/auth';
import chatRoutes from './routes/chat';
import dashboardRoutes from './routes/dashboard';
import doctorSelfRoutes from './routes/doctor-self';
import doctorRoutes from './routes/doctors';
import emergencyRoutes from './routes/emergencies';
import meRoutes from './routes/me';
import medicineRequestRoutes from './routes/medicine-requests';
import medicineRoutes from './routes/medicines';
import metaRoutes from './routes/meta';
import notificationRoutes from './routes/notifications';
import patientRoutes from './routes/patients';
import prescriptionRoutes from './routes/prescriptions';
import recordRoutes from './routes/records';
import userRoutes from './routes/users';

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, fields: err.fields } });
    return;
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 5 MB).' : err.message;
    res.status(400).json({ error: { code: 'UPLOAD_ERROR', message } });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON.' } });
    return;
  }
  if (typeof err?.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
    res.status(409).json({ error: { code: 'CONFLICT', message: 'This change conflicts with existing data.' } });
    return;
  }
  console.error('[api] unhandled error', err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
};

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);
  app.use(express.json({ limit: '1mb' }));
  app.use(authenticate);

  const api = express.Router();
  api.use('/auth', authRoutes);
  api.use('/me', meRoutes);
  api.use('/', metaRoutes); // /meta, /demo/reset
  api.use('/doctors', doctorRoutes);
  api.use('/doctor', doctorSelfRoutes);
  api.use('/appointments', appointmentRoutes);
  api.use('/prescriptions', prescriptionRoutes);
  api.use('/patients', patientRoutes);
  api.use('/records', recordRoutes);
  api.use('/dashboard', dashboardRoutes);
  api.use('/users', userRoutes);
  api.use('/', medicineRoutes); // /medicines/*, /inventory/*
  api.use('/medicine-requests', medicineRequestRoutes);
  api.use('/emergencies', emergencyRoutes);
  api.use('/notifications', notificationRoutes);
  api.use('/activity', activityRoutes);
  api.use('/', chatRoutes); // /conversations/*, /calls
  api.use(() => {
    throw notFound('Endpoint');
  });
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', api);

  // Production: serve the built client (single process demo).
  const clientDist = path.resolve(SERVER_ROOT, '../client/dist');
  const indexHtml = path.join(clientDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
      res.sendFile(indexHtml);
    });
  }

  app.use(errorHandler);
  return app;
}
