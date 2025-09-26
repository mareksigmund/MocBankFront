import { useState } from "react";
import { z } from "zod";

type Props = {
  open: boolean;
  onClose: () => void;
  accountName: string;
  onConfirm: (data: {
    // zwracamy do rodzica dane do API
    password: string;
    nameConfirm: string;
  }) => void;
  isSubmitting?: boolean; // opcjonalnie: spinner / disabled
};

// walidacja: nazwa + hasło
const Schema = z.object({
  nameConfirm: z
    .string()
    .min(1, { message: "Podaj nazwę konta do potwierdzenia" }),
  password: z.string().min(1, { message: "Podaj hasło" }),
});

export default function ConfirmCloseAccountModal({
  open,
  onClose,
  accountName,
  onConfirm,
  isSubmitting = false,
}: Props) {
  const [form, setForm] = useState<z.infer<typeof Schema>>({
    nameConfirm: "",
    password: "",
  });
  const [errors, setErrors] = useState<string[]>([]);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);

    const parsed = Schema.safeParse(form);
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((i) => i.message));
      return;
    }

    // wymagamy dokładnego dopasowania (trimujemy białe znaki po obu stronach)
    if (parsed.data.nameConfirm.trim() !== accountName.trim()) {
      setErrors([`Aby zamknąć, wpisz dokładnie nazwę konta: "${accountName}"`]);
      return;
    }

    onConfirm(parsed.data); // rodzic wywoła API
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md card p-0 overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-lg font-semibold">Zamknij konto</h3>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5"
          >
            Anuluj
          </button>
        </header>

        <form onSubmit={submit} className="p-4 space-y-3">
          <p className="text-sm text-muted">
            Ta operacja jest nieodwracalna. Aby potwierdzić, wpisz{" "}
            <span className="text-foreground font-medium">
              dokładną nazwę konta
            </span>{" "}
            oraz podaj{" "}
            <span className="text-foreground font-medium">hasło</span>.
          </p>

          {errors.length > 0 && (
            <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-danger">
              <ul className="list-disc ms-5 space-y-1">
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm text-muted">Nazwa konta</label>
            <input
              className="input"
              placeholder={accountName}
              value={form.nameConfirm}
              onChange={(e) =>
                setForm((f) => ({ ...f, nameConfirm: e.target.value }))
              }
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-muted">Hasło</label>
            <input
              className="input"
              type="password"
              placeholder="Hasło do konta"
              value={form.password}
              onChange={(e) =>
                setForm((f) => ({ ...f, password: e.target.value }))
              }
            />
          </div>

          <footer className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2.5"
            >
              Anuluj
            </button>
            <button
              type="submit"
              className="rounded-lg border border-danger/50 text-danger px-4 py-2.5"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? "Zamykam…" : "Zamknij konto"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
