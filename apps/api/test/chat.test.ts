import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { beforeEach, describe, expect, it } from 'vitest';
import { MINUTE } from '../src/clock';
import { DemoLlm } from '../src/modules/chat/demo';
import { LlmError, type LlmClient, type LlmRequest } from '../src/modules/chat/llm';
import { buildSystemPrompt } from '../src/modules/chat/prompt';
import { makeApp, parseSse, signup, sseParser, type TestApp } from './helpers';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** IA falsa: emite os pedaços e, opcionalmente, falha no fim. */
class ScriptedLlm implements LlmClient {
  readonly mode = 'demo' as const;
  requests: LlmRequest[] = [];
  constructor(private pieces: string[], private opts: { failWith?: LlmError; delayMs?: number } = {}) {}
  async *stream(req: LlmRequest) {
    this.requests.push(req);
    for (const p of this.pieces) {
      if (req.signal?.aborted) return;
      yield p;
      if (this.opts.delayMs) await sleep(this.opts.delayMs);
    }
    if (this.opts.failWith) throw this.opts.failWith;
  }
}

async function chatWith(t: TestApp, subject?: { name: string }) {
  const { agent, user } = await signup(t.app, { name: 'Gustavo Peixoto' });
  let subjectId: number | null = null;
  if (subject) subjectId = (await agent.post('/api/subjects').send({ name: subject.name, color: '#2563EB' })).body.id;
  const thread = (await agent.post('/api/chats').send({ subjectId })).body;
  return { agent, user, thread, subjectId };
}

describe('threads', () => {
  it('cria, lista (mais recente primeiro, filtro por disciplina), abre e exclui', async () => {
    const t = makeApp();
    const { agent, thread, subjectId } = await chatWith(t, { name: 'Móvel' });
    expect(thread).toMatchObject({ subjectId, subjectName: 'Móvel', subjectColor: '#2563EB', title: null });
    t.clock.advance(MINUTE);
    const general = (await agent.post('/api/chats').send({ title: 'Dúvida geral' })).body;
    expect(general).toMatchObject({ subjectId: null, subjectName: null, title: 'Dúvida geral' });
    expect((await agent.get('/api/chats')).body.items.map((x: any) => x.id)).toEqual([general.id, thread.id]);
    expect((await agent.get(`/api/chats?subjectId=${subjectId}`)).body.items.map((x: any) => x.id)).toEqual([thread.id]);
    const open = await agent.get(`/api/chats/${thread.id}/messages`);
    expect(open.body).toMatchObject({ thread: { id: thread.id }, items: [] });
    expect((await agent.delete(`/api/chats/${thread.id}`)).status).toBe(204);
    expect((await agent.get(`/api/chats/${thread.id}/messages`)).status).toBe(404);
    expect((await agent.post('/api/chats').send({ subjectId: 99999 })).status).toBe(404);
  });

  it('excluir a disciplina remove as conversas ligadas', async () => {
    const t = makeApp();
    const { agent, thread, subjectId } = await chatWith(t, { name: 'Móvel' });
    await agent.delete(`/api/subjects/${subjectId}`);
    expect((await agent.get(`/api/chats/${thread.id}/messages`)).status).toBe(404);
  });
});

describe('streaming SSE', () => {
  it('emite user → token… → done; grava as duas mensagens e o título automático', async () => {
    const t = makeApp({ llm: new DemoLlm({ delayMs: 0 }) });
    const { agent, thread } = await chatWith(t, { name: 'Desenvolvimento Móvel' });
    const res = await agent
      .post(`/api/chats/${thread.id}/messages`)
      .send({ content: '  Pode me explicar o que é um Requisito Funcional?  ' })
      .buffer(true)
      .parse(sseParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.headers['cache-control']).toMatch(/no-cache/);
    const events = parseSse(res.body as string);
    expect(events[0]).toMatchObject({ event: 'user', data: { role: 'user', content: 'Pode me explicar o que é um Requisito Funcional?' } });
    const tokens = events.filter((e) => e.event === 'token');
    expect(tokens.length).toBeGreaterThan(10);
    const last = events.at(-1)!;
    expect(last.event).toBe('done');
    expect(last.data).toMatchObject({ role: 'assistant', threadId: thread.id });
    expect(tokens.map((e) => e.data.t).join('')).toBe(last.data.content); // pedaços recompõem a resposta
    expect(last.data.content).toMatch(/Modo demonstração/);
    expect(last.data.content).toMatch(/Gustavo/);
    expect(last.data.content).toMatch(/Desenvolvimento Móvel/);

    const history = (await agent.get(`/api/chats/${thread.id}/messages`)).body;
    expect(history.items.map((m: any) => m.role)).toEqual(['user', 'assistant']);
    expect(history.thread.title).toBe('Pode me explicar o que é um Requisito Funcional?');
  });

  it('título longo é cortado em ~60 caracteres e não é trocado nas mensagens seguintes', async () => {
    const t = makeApp({ llm: new ScriptedLlm(['ok']) });
    const { agent, thread } = await chatWith(t);
    const long = 'Explique '.repeat(20).trim();
    await agent.post(`/api/chats/${thread.id}/messages`).send({ content: long }).buffer(true).parse(sseParser);
    await agent.post(`/api/chats/${thread.id}/messages`).send({ content: 'outra pergunta' }).buffer(true).parse(sseParser);
    const title = (await agent.get(`/api/chats/${thread.id}/messages`)).body.thread.title as string;
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith('…')).toBe(true);
    expect(long.startsWith(title.slice(0, -1))).toBe(true);
  });

  it('envia o prompt de sistema e só as últimas 12 mensagens à IA', async () => {
    const llm = new ScriptedLlm(['resposta']);
    const t = makeApp({ llm });
    const { agent, thread } = await chatWith(t, { name: 'Banco de Dados' });
    await agent.patch('/api/me').send({ level: 'concurso' });
    for (let i = 1; i <= 8; i++) {
      t.clock.advance(4 * 1000);
      await agent.post(`/api/chats/${thread.id}/messages`).send({ content: `pergunta ${i}` }).buffer(true).parse(sseParser);
    }
    const last = llm.requests.at(-1)!;
    expect(last.history).toHaveLength(12);
    expect(last.history.at(-1)).toEqual({ role: 'user', content: 'pergunta 8' });
    expect(last.history[0]).toEqual({ role: 'assistant', content: 'resposta' }); // 16 msgs gravadas → 12 mais recentes
    expect(last.system).toMatch(/Professor Tutor/);
    expect(last.system).toMatch(/Gustavo/);
    expect(last.system).toMatch(/Banco de Dados/);
    expect(last.system).toMatch(/preparação para concursos/);
    expect(last.system).toMatch(/português do Brasil/);
    expect(last.context).toEqual({ firstName: 'Gustavo', subjectName: 'Banco de Dados', level: 'concurso' });
  });

  it('prompt de sistema sem disciplina diz que é conversa geral', () => {
    expect(buildSystemPrompt({ firstName: 'Ana', subjectName: null, level: 'superior' })).toMatch(/Conversa geral/);
  });

  it('falha da IA: evento error amigável, sem resposta gravada; parcial vira "interrompida"', async () => {
    const t = makeApp({ llm: new ScriptedLlm([], { failWith: new LlmError('ai_busy', 'A IA está muito ocupada agora.') }) });
    const { agent, thread } = await chatWith(t);
    const res = await agent.post(`/api/chats/${thread.id}/messages`).send({ content: 'oi' }).buffer(true).parse(sseParser);
    const events = parseSse(res.body as string);
    expect(events.map((e) => e.event)).toEqual(['user', 'error']);
    expect(events[1]!.data).toEqual({ code: 'ai_busy', message: 'A IA está muito ocupada agora.' });
    expect((await agent.get(`/api/chats/${thread.id}/messages`)).body.items).toHaveLength(1); // só a pergunta; dá para reenviar

    const t2 = makeApp({ llm: new ScriptedLlm(['Uma ', 'resposta '], { failWith: new LlmError('ai_unavailable', 'Falhou.') }) });
    const c2 = await chatWith(t2);
    const res2 = await c2.agent.post(`/api/chats/${c2.thread.id}/messages`).send({ content: 'oi' }).buffer(true).parse(sseParser);
    expect(parseSse(res2.body as string).map((e) => e.event)).toEqual(['user', 'token', 'token', 'error']);
    const saved = (await c2.agent.get(`/api/chats/${c2.thread.id}/messages`)).body.items;
    expect(saved.at(-1).content).toBe('Uma resposta \n\n_[resposta interrompida]_');
  });

  it('erro inesperado do cliente de IA vira ai_unavailable (sem vazar detalhes)', async () => {
    const boom: LlmClient = { mode: 'demo', stream: async function* () { throw new Error('segredo interno'); } };
    const t = makeApp({ llm: boom });
    const { agent, thread } = await chatWith(t);
    const res = await agent.post(`/api/chats/${thread.id}/messages`).send({ content: 'oi' }).buffer(true).parse(sseParser);
    const err = parseSse(res.body as string).at(-1)!;
    expect(err.event).toBe('error');
    expect(err.data.code).toBe('ai_unavailable');
    expect(JSON.stringify(err.data)).not.toMatch(/segredo/);
  });

  it('IA que não devolve nada → ai_empty', async () => {
    const t = makeApp({ llm: new ScriptedLlm([]) });
    const { agent, thread } = await chatWith(t);
    const res = await agent.post(`/api/chats/${thread.id}/messages`).send({ content: 'oi' }).buffer(true).parse(sseParser);
    expect(parseSse(res.body as string).at(-1)!.data.code).toBe('ai_empty');
  });

  it('valida a mensagem (422 JSON, antes de abrir o stream)', async () => {
    const t = makeApp();
    const { agent, thread } = await chatWith(t);
    const empty = await agent.post(`/api/chats/${thread.id}/messages`).send({ content: '   ' });
    expect(empty.status).toBe(422);
    expect(empty.body.error.code).toBe('validation_error');
    expect((await agent.post(`/api/chats/${thread.id}/messages`).send({ content: 'x'.repeat(4001) })).status).toBe(422);
    expect((await agent.get(`/api/chats/${thread.id}/messages`)).body.items).toEqual([]);
  });

  it('limita a 20 mensagens por minuto por usuário (429 + Retry-After)', async () => {
    const t = makeApp({ llm: new ScriptedLlm(['ok']) });
    const { agent, thread } = await chatWith(t);
    for (let i = 0; i < 20; i++) {
      expect((await agent.post(`/api/chats/${thread.id}/messages`).send({ content: `m${i}` }).buffer(true).parse(sseParser)).status).toBe(200);
    }
    const blocked = await agent.post(`/api/chats/${thread.id}/messages`).send({ content: 'demais' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('rate_limited');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    t.clock.advance(61 * 1000);
    expect((await agent.post(`/api/chats/${thread.id}/messages`).send({ content: 'volta' }).buffer(true).parse(sseParser)).status).toBe(200);
  });
});

describe('conexões reais (desconexão e 1 stream por usuário)', () => {
  async function listen(t: TestApp) {
    const server = t.app.listen(0);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return { base, close: () => new Promise<void>((r) => server.close(() => r())) };
  }

  it('cliente que desconecta no meio: guarda a resposta parcial marcada como interrompida', async () => {
    const t = makeApp({ llm: new ScriptedLlm(Array.from({ length: 50 }, (_, i) => `p${i} `), { delayMs: 15 }) });
    const { agent, thread } = await chatWith(t);
    const login = await agent.get('/api/me');
    expect(login.status).toBe(200);
    const cookie = (agent as any).jar.getCookies({ path: '/', domain: '127.0.0.1', secure: false, script: false }).map((c: any) => `${c.name}=${c.value}`).join('; ');
    const { base, close } = await listen(t);
    try {
      const ctl = new AbortController();
      const res = await fetch(`${base}/api/chats/${thread.id}/messages`, {
        method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ content: 'pergunta longa' }),
      });
      const reader = res.body!.getReader();
      let seen = '';
      while (!seen.includes('event: token')) seen += new TextDecoder().decode((await reader.read()).value);
      ctl.abort();
      let saved: any;
      for (let i = 0; i < 40 && !saved; i++) {
        await sleep(25);
        saved = (t.db.prepare("select content from chat_messages where role = 'assistant'").get() as any);
      }
      expect(saved).toBeDefined();
      expect(saved.content).toMatch(/_\[resposta interrompida\]_$/);
      expect(saved.content).toMatch(/^p0 /);
      expect(saved.content.split(' ').length).toBeLessThan(50); // não gerou tudo
      // O usuário fica liberado para um novo stream.
      await sleep(50);
      const again = await fetch(`${base}/api/chats/${thread.id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ content: 'de novo' }),
      });
      expect(again.status).toBe(200);
      await again.body!.cancel();
    } finally {
      await close();
    }
  });

  it('segundo stream do mesmo usuário enquanto o primeiro roda = 429 stream_busy', async () => {
    const t = makeApp({ llm: new ScriptedLlm(Array.from({ length: 20 }, (_, i) => `w${i} `), { delayMs: 20 }) });
    const { agent, thread } = await chatWith(t);
    const cookie = (agent as any).jar.getCookies({ path: '/', domain: '127.0.0.1', secure: false, script: false }).map((c: any) => `${c.name}=${c.value}`).join('; ');
    const { base, close } = await listen(t);
    try {
      const url = `${base}/api/chats/${thread.id}/messages`;
      const init = { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ content: 'oi' }) };
      const first = await fetch(url, init);
      const reader = first.body!.getReader();
      await reader.read(); // stream aberto
      const second = await fetch(url, init);
      expect(second.status).toBe(429);
      expect(((await second.json()) as any).error.code).toBe('stream_busy');
      while (!(await reader.read()).done); // deixa o primeiro terminar
      expect((await fetch(url, init)).status).toBe(200);
    } finally {
      await close();
    }
  });
});

describe('DemoLlm', () => {
  it('é determinístico e preserva quebras de linha do Markdown', async () => {
    const llm = new DemoLlm({ delayMs: 0 });
    const req: LlmRequest = {
      system: '', history: [{ role: 'user', content: 'O que é uma lista ligada?' }],
      context: { firstName: 'Ana', subjectName: 'Estruturas de Dados', level: 'medio' },
    };
    const collect = async () => { let s = ''; for await (const p of llm.stream(req)) s += p; return s; };
    const a = await collect();
    expect(a).toBe(await collect());
    expect(a).toContain('\n\n1. **Ideia central:**');
    expect(a).toMatch(/O que é uma lista ligada\?/);
    expect(a).toMatch(/ensino médio/);
  });
});
