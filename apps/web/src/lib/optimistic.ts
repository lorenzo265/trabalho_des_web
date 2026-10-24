import { useState } from 'react';

/**
 * Valor otimista local para controles controlados (checkbox, select).
 * O React devolve um input controlado ao valor antigo até o estado mudar; guardando o valor novo
 * no estado do componente no mesmo evento, o controle responde na hora, sem "piscar", e volta a
 * seguir o servidor quando a gravação termina ([clear] em onSettled).
 */
export function useOptimisticValue<T>(server: T): [value: T, set: (v: T) => void, clear: () => void] {
  const [pending, setPending] = useState<{ v: T } | null>(null);
  return [pending ? pending.v : server, (v) => setPending({ v }), () => setPending(null)];
}
