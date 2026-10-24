import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { LlmError } from '../src/modules/chat/llm';
import { OpenRouterLlm } from '../src/modules/chat/openrouter';

let server: Server | undefined;
afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

async function fake(handler: (req: IncomingMessage, body: any, res: import('node:http').ServerResponse) => void) {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => handler(req, raw ? JSON.parse(raw) : null, res));
  });
  await new Promise<void>((r) => server!.listen(0, r));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

const request = {
  system: 'SISTEMA',
  history: [{ role: 'user' as const, content: 'oi' }],
  context: { firstName: 'Ana', subjectName: null, level: 'superior' as const },
};
const collect = async (llm: OpenRouterLlm, signal?: AbortSignal) => {
  const out: string[] = [];
  for await (const p of llm.stream({ ...request, signal })) out.push(p);
  return out;
};

describe('OpenRouterLlm', () => {
  it('envia o pedido no formato esperado e lê o stream SSE (ignora comentários e linhas inválidas)', async () => {
    let seen: { auth?: string; url?: string; body?: any } = {};
    const baseUrl = await fake((req, body, res) => {
      seen = { auth: req.headers.authorization, url: req.url, body };
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(': OPENROUTER PROCESSING\n\n');
      res.write('data: {"choices":[{"delta":{"content":"Olá"}}]}\n\n');
      res.write('data: não é json\n\n');
      // quebra no meio de um evento: precisa remontar entre chunks
      res.write('data: {"choices":[{"delta":{"content":", mu');
      res.write('ndo"}}]}\n\n');
      res.write('data: {"choices":[{"delta":{}}]}\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
    });
    const out = await collect(new OpenRouterLlm({ apiKey: 'sk-teste', model: 'modelo/x', baseUrl }));
    expect(out.join('')).toBe('Olá, mundo');
    expect(seen.url).toBe('/chat/completions');
    expect(seen.auth).toBe('Bearer sk-teste');
    expect(seen.body).toMatchObject({ model: 'modelo/x', stream: true, temperature: 0.4, max_tokens: 700 });
    expect(seen.body.messages).toEqual([{ role: 'system', content: 'SISTEMA' }, { role: 'user', content: 'oi' }]);
  });

  it.each([
    [401, 'ai_not_configured'],
    [402, 'ai_no_credit'],
    [429, 'ai_busy'],
    [500, 'ai_unavailable'],
  ])('HTTP %i vira LlmError %s com mensagem amigável', async (status, code) => {
    const baseUrl = await fake((_req, _b, res) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end('{"error":{"message":"detalhe interno"}}');
    });
    const err = await collect(new OpenRouterLlm({ apiKey: 'k', model: 'm', baseUrl })).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.code).toBe(code);
    expect(err.message).not.toMatch(/detalhe interno/);
  });

  it('erro dentro do stream e falha de rede viram ai_unavailable', async () => {
    const baseUrl = await fake((_r, _b, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"ok "}}]}\n\n');
      res.write('data: {"error":{"message":"provider caiu"}}\n\n');
      res.end();
    });
    const err = await collect(new OpenRouterLlm({ apiKey: 'k', model: 'm', baseUrl })).catch((e) => e);
    expect(err.code).toBe('ai_unavailable');
    const down = await collect(new OpenRouterLlm({ apiKey: 'k', model: 'm', baseUrl: 'http://127.0.0.1:1' })).catch((e) => e);
    expect(down).toBeInstanceOf(LlmError);
    expect(down.code).toBe('ai_unavailable');
  });

  it('cancelar pelo signal encerra sem erro', async () => {
    const baseUrl = await fake((_r, _b, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"a"}}]}\n\n');
      setTimeout(() => res.end(), 2000);
    });
    const ctl = new AbortController();
    const out: string[] = [];
    for await (const p of new OpenRouterLlm({ apiKey: 'k', model: 'm', baseUrl }).stream({ ...request, signal: ctl.signal })) {
      out.push(p);
      ctl.abort();
    }
    expect(out).toEqual(['a']);
  });
});
