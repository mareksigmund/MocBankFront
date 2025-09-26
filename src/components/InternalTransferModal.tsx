import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { api } from "../lib/api";
import { formatPLN } from "../lib/money";
import { extractApiMessages } from "../lib/errors";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultFromId?: string | null;
};

type Account = {
  id: string;
  name: string;
  balance: number; // grosze
  currency: "PLN";
};

type Txn = {
  id: string;
  accountId: string;
  amount: number;
  currency: "PLN";
  date: string;
  description: string;
  counterparty?: string;
  categoryHint?: string;
  createdAt: string;
  updatedAt: string;
};

const Schema = z.object({
  fromId: z.string().min(1, { message: "Wybierz konto źródłowe" }),
  toId: z.string().min(1, { message: "Wybierz konto docelowe" }),
  amountZl: z
    .union([z.string(), z.number()])
    .transform((v) =>
      typeof v === "number" ? v : Number(String(v).replace(",", "."))
    )
    .refine((v) => Number.isFinite(v) && v > 0, {
      message: "Kwota musi być liczbą większą od zera",
    }),
  date: z.string().min(1, { message: "Podaj datę" }), // datetime-local
  note: z.string().optional(),
});

function nowAsInputLocal(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

function toMinorPositive(input: string | number): number {
  const n =
    typeof input === "number"
      ? input
      : Number(String(input).replace(/\s+/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(Math.abs(n) * 100);
}

export default function InternalTransferModal({
  open,
  onClose,
  onSuccess,
  defaultFromId = null,
}: Props) {
  const qc = useQueryClient();
  const accounts = useMemo(
    () => (qc.getQueryData<Account[]>(["accounts"]) ?? []) as Account[],
    [qc]
  );

  const [form, setForm] = useState<z.infer<typeof Schema>>({
    fromId: defaultFromId || "",
    toId: "",
    amountZl: "" as unknown as number,
    date: nowAsInputLocal(),
    note: "",
  });
  const [errors, setErrors] = useState<string[]>([]);

  // ustaw konto źródłowe przy otwarciu (lub pierwsze z listy), docelowe – inne niż źródłowe
  useEffect(() => {
    if (!open) return;
    const src =
      defaultFromId && accounts.find((a) => a.id === defaultFromId)
        ? defaultFromId
        : accounts[0]?.id ?? "";
    const dst = accounts.find((a) => a.id !== src)?.id ?? accounts[1]?.id ?? "";
    setForm((f) => ({ ...f, fromId: src, toId: dst, date: nowAsInputLocal() }));
    setErrors([]);
  }, [open, accounts, defaultFromId]);

  const fromAcc = accounts.find((a) => a.id === form.fromId) || null;
  const toAcc = accounts.find((a) => a.id === form.toId) || null;

  const mutation = useMutation<Txn[], unknown, z.infer<typeof Schema>>({
    mutationFn: async (payload) => {
      const amountMinor = toMinorPositive(payload.amountZl);
      const dateIso = new Date(payload.date).toISOString();
      const ref = `xfer_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      // 1) najpierw obciąż źródło
      const debit = await api.post<Txn>("/v1/simulations/transaction", {
        accountId: payload.fromId,
        amount: -amountMinor,
        description:
          payload.note?.trim() ||
          `Przelew do: ${toAcc?.name ?? payload.toId} [${ref}]`,
        counterparty: toAcc?.name ?? "Konto własne",
        categoryHint: "transfer",
        date: dateIso,
      });

      try {
        // 2) potem uznaj cel
        const credit = await api.post<Txn>("/v1/simulations/transaction", {
          accountId: payload.toId,
          amount: amountMinor,
          description:
            payload.note?.trim() ||
            `Przelew z: ${fromAcc?.name ?? payload.fromId} [${ref}]`,
          counterparty: fromAcc?.name ?? "Konto własne",
          categoryHint: "transfer",
          date: dateIso,
        });
        return [debit.data, credit.data];
      } catch (e) {
        // kompensacja – spróbuj cofnąć obciążenie
        try {
          await api.post<Txn>("/v1/simulations/transaction", {
            accountId: payload.fromId,
            amount: amountMinor,
            description: `Korekta nieudanego transferu [${ref}]`,
            categoryHint: "transfer",
            date: dateIso,
          });
        } catch {
          // jeśli nie da się cofnąć – zostawimy to użytkownikowi do wyjaśnienia
        }
        throw e;
      }
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["accounts"] }),
        qc.invalidateQueries({ queryKey: ["transactions"] }),
        qc.invalidateQueries({ queryKey: ["recentTxns"] }),
      ]);
      onSuccess?.();
      onClose();
      setForm({
        fromId: defaultFromId || "",
        toId: "",
        amountZl: "" as unknown as number,
        date: nowAsInputLocal(),
        note: "",
      });
      setErrors([]);
    },
    onError: (error) => {
      if (isAxiosError(error)) {
        const msgs = extractApiMessages(error);
        setErrors(
          msgs.length
            ? msgs
            : [
                "Nie udało się wykonać przelewu. Sprawdź dane i spróbuj ponownie.",
              ]
        );
      } else {
        setErrors(["Nie udało się wykonać przelewu. Spróbuj ponownie."]);
      }
    },
  });

  if (!open) return null;

  const fromBalanceOk = (() => {
    const need = toMinorPositive(form.amountZl);
    return fromAcc ? fromAcc.balance >= need : true; // prosta weryfikacja po stronie UI
  })();

  const sameAccount = form.fromId && form.toId && form.fromId === form.toId;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    const parsed = Schema.safeParse(form);
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((i) => i.message));
      return;
    }
    if (sameAccount) {
      setErrors(["Konta źródłowe i docelowe muszą być różne."]);
      return;
    }
    mutation.mutate(parsed.data);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl card p-0 overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-lg font-semibold">
            Przelew między własnymi kontami
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5"
          >
            Zamknij
          </button>
        </header>

        {errors.length > 0 && (
          <div className="mx-4 mt-3 rounded-md border border-danger/40 bg-danger/10 p-3 text-danger">
            <ul className="list-disc ms-5 space-y-1">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={submit} className="p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm text-muted">Z konta</label>
              <select
                className="input"
                value={form.fromId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, fromId: e.target.value }))
                }
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {formatPLN(a.balance)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-muted">Na konto</label>
              <select
                className="input"
                value={form.toId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, toId: e.target.value }))
                }
              >
                {accounts
                  .filter((a) => a.id !== form.fromId || accounts.length === 1)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} — {formatPLN(a.balance)}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm text-muted">Kwota (zł)</label>
              <input
                className="input"
                inputMode="decimal"
                placeholder="np. 200,00"
                value={String(form.amountZl ?? "")}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    amountZl: e.target.value as unknown as number,
                  }))
                }
              />
              {!fromBalanceOk && (
                <p className="text-xs text-danger">
                  Brak środków na koncie źródłowym.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-muted">Data</label>
              <input
                type="datetime-local"
                className="input"
                value={form.date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, date: e.target.value }))
                }
              />
              <p className="text-xs text-muted">Domyślnie: teraz.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-muted">Notatka (opcjonalnie)</label>
            <input
              className="input"
              placeholder="np. oszczędności"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
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
              className="btn-primary"
              disabled={
                mutation.isPending ||
                accounts.length < 2 ||
                sameAccount ||
                !fromBalanceOk
              }
              aria-busy={mutation.isPending}
            >
              {mutation.isPending ? "Przelewam…" : "Wykonaj przelew"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
