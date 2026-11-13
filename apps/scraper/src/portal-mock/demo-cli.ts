/**
 * `npm run portal:mudar`  → o portal mock passa a mostrar mudanças (prazo, nota, aula remarcada…).
 * `npm run portal:reset`  → volta ao estado original.
 * Depois de mudar, clique em "Sincronizar" no app para ver as Novidades.
 */
export {}; // torna o arquivo um módulo (necessário para o await de nível superior)

const action = process.argv[2] === 'reset' ? 'reset' : 'mudancas';
const base = process.env.PORTAL_URL ?? `http://localhost:${process.env.PORTAL_PORT ?? 4010}`;

try {
  const res = await fetch(`${base}/__demo/${action}`, { method: 'POST' });
  if (res.status !== 204) throw new Error(`o portal respondeu ${res.status}`);
  console.log(
    action === 'reset'
      ? 'Portal mock voltou ao estado original.'
      : 'Mudanças simuladas aplicadas no portal mock (prazo, trabalho novo, nota, aula remarcada, sala). Sincronize de novo no app.',
  );
} catch (err) {
  console.error(`Não consegui falar com o portal mock em ${base}: ${err instanceof Error ? err.message : String(err)}`);
  console.error('Ele está rodando? (npm run dev  ou  npm run dev:portal)');
  process.exit(1);
}
