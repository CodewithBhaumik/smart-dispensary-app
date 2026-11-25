import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ChatMessage, Conversation } from '@shared/types';
import { createApp } from '../src/app';
import { db } from '../src/db';
import { bearer, setupCommsFixtures } from './comms.helpers';

let app: ReturnType<typeof createApp>;
let f: ReturnType<typeof setupCommsFixtures>;

beforeAll(() => {
  f = setupCommsFixtures();
  app = createApp();
});

describe('chat REST API', () => {
  let conversation: Conversation;

  it('requires authentication', async () => {
    const res = await request(app).get('/api/conversations');
    expect(res.status).toBe(401);
  });

  it('lets a student start a conversation with a doctor (get-or-create)', async () => {
    const first = await request(app)
      .post('/api/conversations')
      .set(bearer(f.student.token))
      .send({ participantId: f.doctor.id });
    expect(first.status).toBe(201);
    conversation = first.body;
    expect(conversation.student.id).toBe(f.student.id);
    expect(conversation.doctor.id).toBe(f.doctor.id);
    expect(conversation.otherParty.id).toBe(f.doctor.id);
    expect(conversation.otherParty.subtitle).toBe('General Medicine');
    expect(conversation.otherParty.online).toBe(false);
    expect(conversation.unreadCount).toBe(0);
    expect(conversation.lastMessage).toBeNull();

    const again = await request(app)
      .post('/api/conversations')
      .set(bearer(f.student.token))
      .send({ participantId: f.doctor.id });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(conversation.id);

    // Doctor starting a chat with the same student reuses the same conversation.
    const fromDoctor = await request(app)
      .post('/api/conversations')
      .set(bearer(f.doctor.token))
      .send({ participantId: f.student.id });
    expect(fromDoctor.status).toBe(200);
    expect(fromDoctor.body.id).toBe(conversation.id);
    expect(fromDoctor.body.otherParty.subtitle).toBe('B.E. CSE · Year 3');
  });

  it('only allows student ↔ doctor conversations', async () => {
    const studentToStudent = await request(app)
      .post('/api/conversations')
      .set(bearer(f.student.token))
      .send({ participantId: f.student2.id });
    expect(studentToStudent.status).toBe(403);

    const staffList = await request(app).get('/api/conversations').set(bearer(f.staff.token));
    expect(staffList.status).toBe(403);

    const missing = await request(app)
      .post('/api/conversations')
      .set(bearer(f.student.token))
      .send({ participantId: 999999 });
    expect(missing.status).toBe(404);

    const invalid = await request(app).post('/api/conversations').set(bearer(f.student.token)).send({});
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('sends messages, tracks unread counts and read receipts', async () => {
    const sent = await request(app)
      .post(`/api/conversations/${conversation.id}/messages`)
      .set(bearer(f.student.token))
      .send({ body: '  Hello doctor, my rash is itchy at night.  ' });
    expect(sent.status).toBe(201);
    const msg: ChatMessage = sent.body;
    expect(msg.body).toBe('Hello doctor, my rash is itchy at night.');
    expect(msg.senderId).toBe(f.student.id);
    expect(msg.kind).toBe('text');
    expect(msg.readAt).toBeNull();

    await request(app)
      .post(`/api/conversations/${conversation.id}/messages`)
      .set(bearer(f.student.token))
      .send({ body: 'Should I continue the cream?' })
      .expect(201);

    const doctorView = await request(app).get('/api/conversations').set(bearer(f.doctor.token));
    expect(doctorView.status).toBe(200);
    const convForDoctor = (doctorView.body as Conversation[]).find((c) => c.id === conversation.id)!;
    expect(convForDoctor.unreadCount).toBe(2);
    expect(convForDoctor.lastMessage?.body).toBe('Should I continue the cream?');

    const studentView = await request(app).get('/api/conversations').set(bearer(f.student.token));
    expect((studentView.body as Conversation[])[0].unreadCount).toBe(0);

    // Recipient (doctor) is offline → a notification is created.
    const notes = db
      .prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'message'")
      .all(f.doctor.id) as { title: string; link: string }[];
    expect(notes.length).toBe(2);
    expect(notes[0].title).toBe('New message from Riya Sharma');
    expect(notes[0].link).toBe(`/doctor/messages?c=${conversation.id}`);

    await request(app).patch(`/api/conversations/${conversation.id}/read`).set(bearer(f.doctor.token)).expect(200);
    const after = await request(app).get('/api/conversations').set(bearer(f.doctor.token));
    expect((after.body as Conversation[]).find((c) => c.id === conversation.id)!.unreadCount).toBe(0);

    const msgs = await request(app).get(`/api/conversations/${conversation.id}/messages`).set(bearer(f.student.token));
    expect((msgs.body as ChatMessage[]).every((m) => m.readAt !== null)).toBe(true);
  });

  it('validates message bodies', async () => {
    const empty = await request(app)
      .post(`/api/conversations/${conversation.id}/messages`)
      .set(bearer(f.student.token))
      .send({ body: '   ' });
    expect(empty.status).toBe(400);
    expect(empty.body.error.message).toBe('Message cannot be empty.');

    const tooLong = await request(app)
      .post(`/api/conversations/${conversation.id}/messages`)
      .set(bearer(f.student.token))
      .send({ body: 'x'.repeat(2001) });
    expect(tooLong.status).toBe(400);
  });

  it('blocks non-participants', async () => {
    const res = await request(app).get(`/api/conversations/${conversation.id}/messages`).set(bearer(f.doctor2.token));
    expect(res.status).toBe(403);
    const missing = await request(app).get('/api/conversations/987654/messages').set(bearer(f.student.token));
    expect(missing.status).toBe(404);
  });

  it('paginates messages in ascending order', async () => {
    for (let i = 1; i <= 6; i++) {
      await request(app)
        .post(`/api/conversations/${conversation.id}/messages`)
        .set(bearer(i % 2 ? f.doctor.token : f.student.token))
        .send({ body: `Message ${i}` })
        .expect(201);
    }
    const latest = await request(app)
      .get(`/api/conversations/${conversation.id}/messages`)
      .query({ limit: 3 })
      .set(bearer(f.student.token));
    const latestBodies = (latest.body as ChatMessage[]).map((m) => m.body);
    expect(latestBodies).toEqual(['Message 4', 'Message 5', 'Message 6']);

    const older = await request(app)
      .get(`/api/conversations/${conversation.id}/messages`)
      .query({ limit: 3, before: (latest.body as ChatMessage[])[0].id })
      .set(bearer(f.student.token));
    expect((older.body as ChatMessage[]).map((m) => m.body)).toEqual(['Message 1', 'Message 2', 'Message 3']);
    const ids = (older.body as ChatMessage[]).map((m) => m.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });

  it('returns a single conversation and the caller’s call logs', async () => {
    const one = await request(app).get(`/api/conversations/${conversation.id}`).set(bearer(f.doctor.token));
    expect(one.status).toBe(200);
    expect(one.body.otherParty.id).toBe(f.student.id);

    const calls = await request(app).get('/api/calls').set(bearer(f.student.token));
    expect(calls.status).toBe(200);
    expect(Array.isArray(calls.body)).toBe(true);
  });
});
