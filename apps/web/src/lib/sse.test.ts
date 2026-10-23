import { parseSse } from './sse';

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
