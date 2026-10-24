import { goalInputSchema, type Subject } from '@edumind/contracts';
import { useState, type FormEvent } from 'react';
import { useGoalMutations } from '../lib/queries';
import { Modal } from './ui/Modal';
import { Field, Spinner } from './ui/bits';
import { useToast } from './ui/Toast';

export function GoalFormModal({ subjects, date, onClose }: { subjects: Subject[]; date: string; onClose: () => void }) {
  const { create } = useGoalMutations();
  const toast = useToast();
  const [subjectId, setSubjectId] = useState<number>(subjects[0]?.id ?? 0);
  const [description, setDescription] = useState('');
  const [minutes, setMinutes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = goalInputSchema.safeParse({
      subjectId,
      goalDate: date,
      description,
      targetMinutes: minutes.trim() ? Number(minutes) : null,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    try {
      await create.mutateAsync(parsed.data);
      toast.show('Meta adicionada.');
      onClose();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <Modal
      title="Nova meta do dia"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="goal-form" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending && <Spinner />} Adicionar
          </button>
        </>
      }
    >
      <form id="goal-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Disciplina" htmlFor="gf-subject" error={errors.subjectId}>
          <select id="gf-subject" className="select" value={subjectId} onChange={(e) => setSubjectId(Number(e.target.value))}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="O que você vai fazer?" htmlFor="gf-desc" error={errors.description}>
          <input id="gf-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Estudar requisitos do Projeto G2" aria-invalid={!!errors.description || undefined} />
        </Field>
        <Field label="Tempo previsto (minutos, opcional)" htmlFor="gf-min" error={errors.targetMinutes}>
          <input id="gf-min" className="input" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} placeholder="Ex.: 45" />
        </Field>
      </form>
    </Modal>
  );
}
