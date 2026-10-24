/** Dados do portal mock, gerados a partir de "hoje" (função pura → testes determinísticos). */

export interface PortalLesson {
  id: string;
  /** AAAA-MM-DD */
  date: string;
  start: string;
  end: string;
  topic: string;
  room: string | null;
}

export type PortalStatus = 'Pendente' | 'Enviado' | 'Corrigido' | 'Em atraso';

export interface PortalAssignment {
  id: string;
  title: string;
  description: string | null;
  /** AAAA-MM-DD */
  dueDate: string;
  status: PortalStatus;
  grade: number | null;
}

export interface PortalCourse {
  id: string;
  name: string;
  professor: string;
  room: string;
  /** Como o portal escreve o horário: "19:00 - 20:30" (colon) ou "19h às 20h30" (h). */
  timeStyle: 'colon' | 'h';
  lessons: PortalLesson[];
  assignments: PortalAssignment[];
}

interface CourseSpec {
  id: string;
  name: string;
  professor: string;
  room: string;
  weekday: number; // 0 = domingo … 6 = sábado
  start: string;
  end: string;
  timeStyle: 'colon' | 'h';
  topics: string[];
  /** Sala diferente da padrão em aulas específicas (índice → sala; `null` = sem sala informada). */
  roomOverrides?: Record<number, string | null>;
  assignments: {
    title: string;
    description: string | null;
    /** Dias em relação a hoje (negativo = prazo já passou). */
    offset: number;
    status: PortalStatus;
    grade?: number;
  }[];
}

const SPECS: CourseSpec[] = [
  {
    id: 'ddm',
    name: 'Desenvolvimento de Dispositivos Móveis',
    professor: 'Prof. João',
    room: 'Sala 311 · Prédio 01',
    weekday: 4,
    start: '19:00',
    end: '20:30',
    timeStyle: 'colon',
    topics: [
      'Introdução ao desenvolvimento móvel',
      'Interfaces e usabilidade em telas pequenas',
      'Navegação entre telas',
      'Persistência de dados local e na nuvem',
      'Autenticação e log de acesso',
      'Consumo de APIs',
      'Prototipação e testes',
    ],
    roomOverrides: { 2: 'Laboratório 1 · Prédio 03' },
    assignments: [
      {
        title: 'Protótipo das telas do Projeto G2',
        description: 'Entregar o documento com os protótipos e a descrição de cada tela.',
        offset: -7,
        status: 'Corrigido',
        grade: 9.5,
      },
      {
        title: 'Modelo de dados e fluxograma de acesso',
        description: 'DER (ou texto explicativo) do acesso do usuário e do log, mais o fluxograma.',
        offset: 0,
        status: 'Pendente',
      },
      {
        title: 'Protótipo funcional do aplicativo',
        description: 'Aplicação rodando com autenticação, log de acesso e área do administrador.',
        offset: 21,
        status: 'Pendente',
      },
    ],
  },
  {
    id: 'ia',
    name: 'Inteligência Artificial',
    professor: 'Profa. Carla',
    room: 'Sala 105 · Prédio 1',
    weekday: 2,
    start: '19:00',
    end: '20:30',
    timeStyle: 'h',
    topics: [
      'O que é IA: história e aplicações',
      'Agentes inteligentes',
      'Busca em espaço de estados',
      'Heurísticas e busca A*',
      'Representação do conhecimento',
      'Aprendizado de máquina: visão geral',
      'Modelos de linguagem e prompts',
    ],
    assignments: [
      {
        title: 'Lista de exercícios: busca e heurísticas',
        description: 'Resolver os exercícios 1 a 8 do capítulo 3.',
        offset: -10,
        status: 'Corrigido',
        grade: 8.5,
      },
      {
        title: 'Trabalho: projeto de um agente inteligente',
        description: 'Descrever ambiente, sensores, atuadores e função de desempenho de um agente.',
        offset: 9,
        status: 'Pendente',
      },
    ],
  },
  {
    id: 'bd',
    name: 'Banco de Dados',
    professor: 'Prof. Marcos',
    room: 'Laboratório 2 · Prédio 3',
    weekday: 1,
    start: '19:00',
    end: '20:30',
    timeStyle: 'colon',
    topics: [
      'Modelo relacional',
      'Modelagem entidade-relacionamento',
      'SQL: consultas básicas',
      'SQL: junções e subconsultas',
      'Normalização',
      'Transações e integridade',
      'Índices e desempenho',
    ],
    assignments: [
      {
        title: 'Modelagem ER: estudo de caso',
        description: 'Modelar o banco de uma biblioteca universitária.',
        offset: -14,
        status: 'Corrigido',
        grade: 7,
      },
      {
        title: 'Lista de SQL: consultas e junções',
        description: null,
        offset: -2,
        status: 'Em atraso',
      },
      {
        title: 'Projeto: normalização até a 3FN',
        description: 'Normalizar o esquema entregue em aula e justificar cada passo.',
        offset: 14,
        status: 'Pendente',
      },
    ],
  },
  {
    id: 'es',
    name: 'Engenharia de Software',
    professor: 'Profa. Renata',
    room: 'Sala 208 · Prédio 2',
    weekday: 3,
    start: '19:00',
    end: '20:30',
    timeStyle: 'h',
    topics: [
      'Processos de software',
      'Levantamento de requisitos',
      'Casos de uso e histórias de usuário',
      'Diagramas UML',
      'Arquitetura de software',
      'Testes de software',
      'Gestão ágil: Scrum',
    ],
    assignments: [
      {
        title: 'Documento de requisitos',
        description: 'Requisitos funcionais e não funcionais do sistema da equipe.',
        offset: -5,
        status: 'Enviado',
      },
      {
        title: 'Diagramas UML do sistema',
        description: 'Casos de uso e diagrama de classes.',
        offset: 6,
        status: 'Pendente',
      },
    ],
  },
  {
    id: 'redes',
    name: 'Redes de Computadores',
    professor: 'Prof. Ricardo',
    room: 'Laboratório 4 · Prédio 3',
    weekday: 5,
    start: '19:00',
    end: '20:30',
    timeStyle: 'colon',
    topics: [
      'Modelo OSI e TCP/IP',
      'Camada de enlace e Ethernet',
      'Endereçamento IP e sub-redes',
      'Roteamento',
      'Camada de transporte: TCP e UDP',
      'Camada de aplicação: HTTP e DNS',
      'Segurança em redes',
    ],
    roomOverrides: { 1: null },
    assignments: [
      {
        title: 'Laboratório: divisão em sub-redes',
        description: 'Planejar o endereçamento de uma rede com 4 departamentos.',
        offset: 3,
        status: 'Pendente',
      },
    ],
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

const toUtc = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date): string => d.toISOString().slice(0, 10);
export const addDays = (iso: string, n: number): string => toIso(new Date(toUtc(iso).getTime() + n * DAY_MS));
export const weekdayOf = (iso: string): number => toUtc(iso).getUTCDay();

/** Datas do dia da semana [weekday] entre hoje-21 e hoje+21 (6 ou 7 aulas, em ordem cronológica). */
function lessonDates(today: string, weekday: number): string[] {
  const from = addDays(today, -21);
  let first = from;
  while (weekdayOf(first) !== weekday) first = addDays(first, 1);
  const dates: string[] = [];
  for (let d = first; d <= addDays(today, 21); d = addDays(d, 7)) dates.push(d);
  return dates;
}

/** Monta as disciplinas do portal para a data [today] (AAAA-MM-DD). */
export function buildFixtures(today: string): PortalCourse[] {
  return SPECS.map((spec) => ({
    id: spec.id,
    name: spec.name,
    professor: spec.professor,
    room: spec.room,
    timeStyle: spec.timeStyle,
    lessons: lessonDates(today, spec.weekday).map((date, i) => ({
      id: `${spec.id}-a${String(i + 1).padStart(2, '0')}`,
      date,
      start: spec.start,
      end: spec.end,
      topic: spec.topics[i % spec.topics.length]!,
      room:
        spec.roomOverrides && i in spec.roomOverrides ? (spec.roomOverrides[i] ?? null) : spec.room,
    })),
    assignments: spec.assignments.map((a, i) => ({
      id: `${spec.id}-t${i + 1}`,
      title: a.title,
      description: a.description,
      dueDate: addDays(today, a.offset),
      status: a.status,
      grade: a.grade ?? null,
    })),
  }));
}
