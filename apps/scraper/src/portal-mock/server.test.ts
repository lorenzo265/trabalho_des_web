import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyDemoChanges, buildFixtures } from './fixtures';
import { createPortalServer } from './server';

const TODAY = '2026-10-23';

describe('applyDemoChanges (puro)', () => {
  const before = buildFixtures(TODAY);
  const after = applyDemoChanges(before, TODAY);
  const get = (cs: typeof before, id: string) => cs.find((c) => c.id === id)!;

  it('não altera o argumento', () => {
    expect(before).toEqual(buildFixtures(TODAY));
  });

  it('gera exatamente as 5 mudanças documentadas', () => {
    expect(get(after, 'ddm').assignments[1]!.dueDate).toBe('2026-10-30'); // prazo +7
    expect(get(after, 'ddm').assignments).toHaveLength(get(before, 'ddm').assignments.length + 1);
    expect(get(after, 'ddm').assignments.at(-1)).toMatchObject({ id: 'ddm-t4', dueDate: '2026-11-20', status: 'Pendente' });
    expect(get(after, 'es').assignments.find((a) => a.grade === 8.5)).toMatchObject({ status: 'Corrigido' });
    const iaBefore = get(before, 'ia').lessons[2]!;
    expect(get(after, 'ia').lessons[2]).toMatchObject({ date: addOne(iaBefore.date), start: '18:00', end: '19:30' });
    expect(get(after, 'bd').lessons[3]!.room).toBe('Laboratório 3 · Prédio 03');
    expect(get(before, 'bd').lessons[3]!.room).not.toBe('Laboratório 3 · Prédio 03');
  });

  it('o resto fica idêntico', () => {
    for (const id of ['redes']) expect(get(after, id)).toEqual(get(before, id));
  });
});

const addOne = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

describe('portal mock — gatilho de demonstração (HTTP)', () => {
  let server: Server;
  let base: string;
  let cookie = '';

  beforeAll(async () => {
    server = createPortalServer({ user: 'a@b.local', password: 'segredo', today: () => TODAY });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const res = await fetch(`${base}/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'a@b.local', senha: 'segredo' }),
    });
    cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const page = async (path: string) => (await fetch(`${base}${path}`, { headers: { cookie } })).text();
  const post = (path: string) => fetch(`${base}${path}`, { method: 'POST' });

  it('muda o que o portal mostra e volta ao normal com o reset', async () => {
    const original = await page('/disciplinas/es');
    expect(original).toContain('Enviado');
    expect(original).not.toContain('8,5');

    expect((await post('/__demo/mudancas')).status).toBe(204);
    const changed = await page('/disciplinas/es');
    expect(changed).toContain('8,5');
    expect(await page('/disciplinas/ddm')).toContain('Apresentação e demonstração final');

    expect((await post('/__demo/reset')).status).toBe(204);
    expect(await page('/disciplinas/es')).toBe(original);
  });

  it('o gatilho só responde a POST (GET cai no 404 comum)', async () => {
    expect((await fetch(`${base}/__demo/mudancas`)).status).toBe(404);
  });
});
