/** Ajuda curta e contextual de cada tela (dica da aula: telas que precisam de help/treinamento). */
export interface HelpContent {
  title: string;
  tips: string[];
}

export const HELP: Record<string, HelpContent> = {
  dashboard: {
    title: 'Como usar o Início',
    tips: [
      'Os cartões coloridos mostram o quanto você já concluiu de cada disciplina.',
      'Em "Metas de hoje", marque a caixinha quando terminar cada tarefa.',
      'Toque em "Tutor IA" para tirar uma dúvida a qualquer momento.',
    ],
  },
  subjects: {
    title: 'Como usar Disciplinas',
    tips: [
      'Toque em "+ Adicionar nova matéria" para cadastrar nome, professor, local e cor.',
      'Abra uma disciplina para ver tópicos, aulas e trabalhos.',
      'Disciplinas com o selo "Sincronizada" vieram da faculdade; você pode ajustar a cor e os tópicos.',
    ],
  },
  subject: {
    title: 'Como usar a disciplina',
    tips: [
      'Marque o status de cada tópico: pendente, estudando ou concluído. O progresso é calculado por eles.',
      'Use o prazo opcional para lembrar quando precisa terminar o tópico.',
      'O botão "Perguntar ao Tutor" já abre a conversa com o contexto desta disciplina.',
    ],
  },
  lessons: {
    title: 'Como usar Aulas',
    tips: [
      'Toque em "Sincronizar" para ler suas aulas e trabalhos direto da plataforma da faculdade.',
      'A sincronização é somente leitura: nada é enviado ou alterado na faculdade.',
      'Use as setas para navegar entre as semanas.',
    ],
  },
  tutor: {
    title: 'Como usar o Professor Tutor',
    tips: [
      'Escolha a disciplina antes de começar para a explicação ficar no contexto certo.',
      'A resposta aparece aos poucos, em tempo real. Você pode interromper com "Parar".',
      'O Tutor orienta o caminho e explica; confira sempre o conteúdo com seu material de aula.',
    ],
  },
  progress: {
    title: 'Como usar o Progresso',
    tips: [
      'Inicie o cronômetro quando começar a estudar e pare ao terminar: o tempo vai para o gráfico.',
      'Esqueceu de cronometrar? Use "Registrar manualmente".',
      'Toque no lápis para mudar a sua meta semanal de estudo.',
    ],
  },
  profile: {
    title: 'Como usar o Perfil',
    tips: [
      'Você pode entrar em qualquer aparelho com o mesmo e-mail e senha: seus dados ficam na sua conta.',
      'Em "Dispositivos conectados" dá para desconectar um aparelho que você não usa mais.',
      '"Meus acessos" mostra quando você entrou e saiu do app.',
    ],
  },
  admin: {
    title: 'Como usar a Administração',
    tips: [
      'A Visão geral resume usuários, sessões e acessos recentes.',
      'No Log de acessos você vê nome, data, hora de login e hora de logout, e pode exportar em CSV.',
      'Em Sessões ativas é possível encerrar o acesso de um dispositivo à força.',
    ],
  },
};
