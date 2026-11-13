import { vi } from 'vitest';
import { streamChat, parseSse } from './sse';
import { todayLocal } from './dates';

describe('parseSse', () => {
  it('separa eventos completos e guarda o resto', () => {
    const { events, rest } = parseSse('event: token\ndata: {"t":"Olá"}\n\nevent: token\ndata: {"t":" mun');
    expect(events).toEqual([{ event: 'token', data: '{"t":"Olá"}' }]);
    expect(rest).toBe('event: token\ndata: {"t":" mun');
  });

  it('junta o resto com o próximo pedaço', () => {
    const first = parseSse('event: done\ndata: {"a"');
    const second = parseSse(first.rest + ':1}\n\n');
    expect(second.events).toEqual([{ event: 'done', data: '{"a":1}' }]);
  });

  it('ignora comentários e aceita CRLF', () => {
    const { events } = parseSse(': ok\r\n\r\nevent: error\r\ndata: {"code":"x"}\r\n\r\n');
    expect(events).toEqual([{ event: 'error', data: '{"code":"x"}' }]);
  });
});

describe('streamChat', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('envia o texto e a data local do aluno (para o Tutor saber o que é "hoje")', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        const enc = new TextEncoder();
        c.enqueue(enc.encode('event: token\ndata: {"t":"Oi"}\n\n'));
        c.enqueue(enc.encode('event: done\ndata: {"id":1,"threadId":7,"role":"assistant","content":"Oi","createdAt":"2026-10-23T15:00:00.000Z"}\n\n'));
        c.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const tokens: string[] = [];
    let done = '';
    await streamChat(7, 'O que estudo hoje?', {
      onUserMessage: () => undefined,
      onToken: (t) => tokens.push(t),
      onDone: (m) => (done = m.content),
      onError: () => undefined,
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/chats/7/messages');
    expect(JSON.parse(init.body as string)).toEqual({ content: 'O que estudo hoje?', today: todayLocal() });
    expect(tokens).toEqual(['Oi']);
    expect(done).toBe('Oi');
  });
});
