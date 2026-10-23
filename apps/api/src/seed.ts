import { loadConfig } from './config';
import { openDb } from './db/db';
import { seedDemo } from './seed/demo';

// Dados de demonstração: administrador + alunos de exemplo. Idempotente.
const config = loadConfig();
const db = openDb(config.dbPath);

const summary = await seedDemo(db, {
  now: new Date(),
  admin: {
    email: config.adminEmail ?? 'admin@edumind.local',
    password: config.adminPassword ?? 'admin12345',
    name: config.adminName,
  },
});

console.log(`[seed] banco: ${config.dbPath}`);
console.log(`[seed] administrador: ${summary.admin}`);
console.log(
  summary.usersCreated.length
    ? `[seed] usuários criados: ${summary.usersCreated.join(', ')} (senha dos alunos: aluno12345)`
    : '[seed] nada a criar — os dados de demonstração já existem.',
);
db.close();
