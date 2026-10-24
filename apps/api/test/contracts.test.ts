import { describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  accessLogEntrySchema, adminOverviewSchema, adminUserRowSchema, appConfigSchema, assignmentSchema,
  authResponseSchema, deviceSessionSchema, goalSchema, lessonSchema, listOf, messageSchema, pageOf,
  studySessionSchema, subjectSchema, syncRunSchema, syncStatusSchema, threadSchema, threadWithMessagesSchema,
  topicSchema, weekStatsSchema, apiErrorSchema,
} from '@edumind/contracts';
import { adminAgent, makeApp, parseSse, signup, sseParser } from './helpers';

/** As respostas reais da API precisam obedecer aos schemas de `packages/contracts` (o front confia neles). */
describe('conformidade com packages/contracts', () => {
  it('todas as respostas principais passam nos schemas', async () => {
    const t = makeApp();
    const admin = await adminAgent(t);
    const { agent } = await signup(t.app, { name: 'Gustavo Peixoto' });

    expect(appConfigSchema.parse((await request(t.app).get('/api/config')).body)).toBeTruthy();
    expect(authResponseSchema.parse((await agent.get('/api/me')).body)).toBeTruthy();

    const subject = subjectSchema.parse((await agent.post('/api/subjects').send({ name: 'Móvel', professor: 'Prof. João', room: 'Sala 311', color: '#2563EB' })).body);
    listOf(subjectSchema).parse((await agent.get('/api/subjects')).body);
    const topic = topicSchema.parse((await agent.post(`/api/subjects/${subject.id}/topics`).send({ title: 'Requisitos', dueDate: '2026-11-01' })).body);
    listOf(topicSchema).parse((await agent.get(`/api/subjects/${subject.id}/topics`)).body);
    topicSchema.parse((await agent.patch(`/api/topics/${topic.id}`).send({ status: 'concluido' })).body);

    const goal = goalSchema.parse((await agent.post('/api/goals').send({ subjectId: subject.id, goalDate: '2026-10-23', description: 'Ler', targetMinutes: 30 })).body);
    listOf(goalSchema).parse((await agent.get('/api/goals?date=2026-10-23')).body);
    goalSchema.parse((await agent.patch(`/api/goals/${goal.id}`).send({ done: true })).body);

    studySessionSchema.parse((await agent.post('/api/study-sessions').send({ subjectId: subject.id, startedAt: '2026-10-23T10:00:00.000Z', day: '2026-10-23', minutes: 25 })).body);
    weekStatsSchema.parse((await agent.get('/api/stats/week?today=2026-10-23')).body);

    const thread = threadSchema.parse((await agent.post('/api/chats').send({ subjectId: subject.id })).body);
    const sse = await agent.post(`/api/chats/${thread.id}/messages`).send({ content: 'Olá' }).buffer(true).parse(sseParser);
    const events = parseSse(sse.body as string);
    messageSchema.parse(events.find((e) => e.event === 'user')!.data);
    messageSchema.parse(events.find((e) => e.event === 'done')!.data);
    listOf(threadSchema).parse((await agent.get('/api/chats')).body);
    threadWithMessagesSchema.parse((await agent.get(`/api/chats/${thread.id}/messages`)).body);

    pageOf(accessLogEntrySchema).parse((await agent.get('/api/me/access-log')).body);
    listOf(deviceSessionSchema).parse((await agent.get('/api/me/sessions')).body);

    syncStatusSchema.parse((await agent.get('/api/sync')).body);
    syncRunSchema.parse((await agent.post('/api/sync')).body);
    await t.services.waitForSyncs();
    syncStatusSchema.parse((await agent.get('/api/sync')).body);
    listOf(lessonSchema).parse((await agent.get('/api/lessons')).body);
    listOf(assignmentSchema).parse((await agent.get('/api/assignments')).body);

    adminOverviewSchema.parse((await admin.get('/api/admin/overview')).body);
    pageOf(adminUserRowSchema).parse((await admin.get('/api/admin/users')).body);
    pageOf(accessLogEntrySchema).parse((await admin.get('/api/admin/access-logs')).body);
    pageOf(deviceSessionSchema).parse((await admin.get('/api/admin/sessions')).body);
    const row = (await admin.get('/api/admin/users')).body.items[0];
    adminUserRowSchema.parse((await admin.patch(`/api/admin/users/${row.id}`).send({ role: 'admin' })).body);
  });

  it('erros seguem o envelope { error: { code, message } }', async () => {
    const t = makeApp();
    for (const res of [
      await request(t.app).get('/api/me'),
      await request(t.app).post('/api/auth/login').send({}),
      await request(t.app).get('/api/nada'),
    ]) {
      expect(res.status).toBeGreaterThanOrEqual(400);
      apiErrorSchema.parse(res.body);
    }
  });
});
