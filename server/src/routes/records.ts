import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ALLOWED_UPLOAD_MIME, MAX_UPLOAD_BYTES, RECORD_CATEGORIES } from '@shared/constants';
import { UPLOADS_DIR } from '../db';
import { AppError } from '../lib/errors';
import { todayStr } from '../lib/time';
import { parse, zDate, zId, zOptionalText } from '../lib/validate';
import { currentUser, requireAuth } from '../middleware/auth';
import { idParam, inlineDisposition } from '../services/core-http';
import { createUploadedRecord, deleteRecord, getRecordFile, listRecords } from '../services/records';

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      cb(null, UPLOADS_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8);
      cb(null, `${crypto.randomBytes(12).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_UPLOAD_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new AppError(400, 'UNSUPPORTED_FILE', 'Only PDF, PNG, JPG or WEBP files can be uploaded.'));
  },
});

const listSchema = z.object({
  studentId: zId.optional(),
  category: z.enum(RECORD_CATEGORIES).optional(),
});

const uploadSchema = z.object({
  category: z.enum(RECORD_CATEGORIES, { message: 'Choose a record category.' }),
  title: z.string().trim().min(2, 'Enter a title for the document.').max(120),
  recordDate: zDate.refine((d) => d <= todayStr(), 'The record date cannot be in the future.'),
  description: zOptionalText(1000),
  studentId: zId.optional(),
});

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(listRecords(currentUser(req), parse(listSchema, req.query)));
});

router.post('/', upload.single('file'), (req, res) => {
  let input: z.output<typeof uploadSchema>;
  try {
    input = parse(uploadSchema, req.body ?? {});
  } catch (err) {
    if (req.file) fs.rmSync(req.file.path, { force: true });
    throw err;
  }
  res.status(201).json(createUploadedRecord(currentUser(req), input, req.file));
});

router.get('/:id/file', (req, res, next) => {
  const file = getRecordFile(currentUser(req), idParam(req, 'id', 'Record'));
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', inlineDisposition(file.fileName));
  res.sendFile(file.absPath, (err) => {
    if (err && !res.headersSent) next(err);
  });
});

router.delete('/:id', (req, res) => {
  deleteRecord(currentUser(req), idParam(req, 'id', 'Record'));
  res.json({ ok: true });
});

export default router;
