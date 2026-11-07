-- Notas e projeção (migração 3). Colunas LOCAIS: o sync com a faculdade não as sobrescreve.
-- Média desejada por disciplina (0–10); padrão 7.
alter table subjects add column target_average real not null default 7
  check (target_average >= 0 and target_average <= 10);
-- Peso do trabalho na média da disciplina; padrão 1 (todos iguais). O aluno ajusta conforme o plano de ensino.
alter table assignments add column weight real not null default 1
  check (weight > 0 and weight <= 100);
