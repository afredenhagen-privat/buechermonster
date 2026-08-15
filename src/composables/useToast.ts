import { ref } from 'vue';

export type ToastTone = 'info' | 'error';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const toasts = ref<Toast[]>([]);
let nextId = 0;

export function useToast() {
  function show(message: string, tone: ToastTone = 'info') {
    const id = (nextId += 1);
    toasts.value.push({ id, message, tone });
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id);
    }, tone === 'error' ? 4200 : 2400);
  }

  /**
   * Fehler aus Store-Aktionen landen hier. Die Meldungen sind bewusst
   * ausformuliert — "Error: constraint failed" hilft niemandem.
   */
  function showError(error: unknown) {
    show(error instanceof Error ? error.message : 'Das hat leider nicht geklappt.', 'error');
  }

  return { toasts, show, showError };
}
