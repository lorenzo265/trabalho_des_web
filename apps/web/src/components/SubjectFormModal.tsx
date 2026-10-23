import { SUBJECT_COLORS, subjectInputSchema, type Subject } from '@edumind/contracts';
import { useState, type FormEvent } from 'react';
import { useSubjectMutations } from '../lib/queries';
import { Modal } from './ui/Modal';
import { ColorPicker, Field, Spinner } from './ui/bits';
import { useToast } from './ui/Toast';

/** Cadastro/edição de disciplina: nome, professor/instrutor, local da aula e cor temática. */
export function SubjectFormModal({ subject, onClose, onSaved }: { subject?: Subject; onClose: () => void; onSaved?: (s: Subject) => void }) {
  const { create, update } = useSubjectMutations();
  const toast = useToast();
  const [name, setName] = useState(subject?.name ?? '');
  const [professor, setProfessor] = useState(subject?.professor ?? '');
  const [room, setRoom] = useState(subject?.room ?? '');
  const [color, setColor] = useState(subject?.color ?? SUBJECT_COLORS[0]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = subjectInputSchema.safeParse({ name, professor, room, color });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    try {
      const saved = subject
        ? await update.mutateAsync({ id: subject.id, patch: parsed.data })
        : await create.mutateAsync(parsed.data);
      toast.show(subject ? 'Disciplina atualizada.' : 'Disciplina adicionada.');
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    }
  }

  return (
    <Modal
      title={subject ? 'Editar disciplina' : 'Nova disciplina'}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="subject-form" className="btn btn-primary" disabled={busy}>
            {busy && <Spinner />} Salvar
          </button>
        </>
      }
    >
      <form id="subject-form" className="form-grid" onSubmit={submit} noValidate>
        {formError && (
          <div className="form-error" role="alert">
            {formError}
          </div>
        )}
        <Field label="Nome da disciplina" htmlFor="sf-name" error={errors.name}>
          <input id="sf-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Desenvolvimento Móvel" aria-invalid={!!errors.name || undefined} />
        </Field>
        <Field label="Professor / instrutor" htmlFor="sf-prof" error={errors.professor}>
          <input id="sf-prof" className="input" value={professor} onChange={(e) => setProfessor(e.target.value)} placeholder="Ex.: Prof. João" />
        </Field>
        <Field label="Local da aula" htmlFor="sf-room" error={errors.room}>
          <input id="sf-room" className="input" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Ex.: Sala 311 · Prédio 01" />
        </Field>
        <div className="field">
          <span className="field-label">Cor temática</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
      </form>
    </Modal>
  );
}
