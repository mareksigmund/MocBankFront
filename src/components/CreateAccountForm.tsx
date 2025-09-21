import { useState } from "react";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { extractApiMessages } from "../lib/errors";
import { formatPLN } from "../lib/money";

const WELCOME_BONUS_PLN = 200;
const WELCOME_BONUS_MINOR = WELCOME_BONUS_PLN * 100;

const Schema = z.object({
  name: z.string().min(2, { message: "Nazwa min. 2 znaki" }),
  currency: z.literal("PLN"),
  initialBalanceZl: z
    .union([z.string(), z.number()])
    .transform((val) => {
      if (typeof val === "number") return val;
      const s = val.replace(/\s+/g, "").replace(",", ".").trim();
      if (s === "") return 0;
      return Number(s);
    })
    .refine((v) => Number.isFinite(v), { message: "Kwota musi być liczbą" })
    .refine((v) => v >= 0, { message: "Kwota nie może być ujemna" })
    .refine((v) => v <= 1_000_000, { message: "Kwota zbyt duża" })
    .default(WELCOME_BONUS_PLN),
});

type FormInput = z.infer<typeof Schema>;
type AccountResponse = {
  id: string;
  userId: string;
  name: string;
  iban: string;
  currency: "PLN";
  balance: number;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export default function CreateAccountForm(props: Props) {
  const qc = useQueryClient();

  const [internalOpen, setInternalOpen] = useState(false);
  const open = props.open ?? internalOpen;
  const setOpen = props.onOpenChange ?? setInternalOpen;

  const [form, setForm] = useState<FormInput>({
    name: "",
    currency: "PLN",
    initialBalanceZl: WELCOME_BONUS_PLN,
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState<string | null>(null);

  const mutation = useMutation<AccountResponse, unknown, FormInput>({
    mutationFn: async (payload) => {
      const res = await api.post<AccountResponse>("/v1/accounts", {
        name: payload.name,
        currency: payload.currency,
        initialBalance: WELCOME_BONUS_MINOR, // zawsze bonus 200 zł
      });
      return res.data;
    },
    onSuccess: async () => {
      setSuccess(
        `Konto utworzone ✅ Bonus: ${formatPLN(WELCOME_BONUS_MINOR)}.`
      );
      setErrors([]);
      setForm({
        name: "",
        currency: "PLN",
        initialBalanceZl: WELCOME_BONUS_PLN,
      });
      await qc.invalidateQueries({ queryKey: ["accounts"] });
      setTimeout(() => {
        setSuccess(null);
        setOpen(false);
      }, 800);
    },
    onError: (error) => {
      setSuccess(null);
      setErrors(extractApiMessages(error));
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    setSuccess(null);

    const normalized = {
      ...form,
      initialBalanceZl:
        typeof form.initialBalanceZl === "string"
          ? Number(String(form.initialBalanceZl).replace(",", "."))
          : form.initialBalanceZl,
    };

    const parsed = Schema.safeParse(normalized);
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((i) => i.message));
      return;
    }
    mutation.mutate(parsed.data);
  }

  const isUncontrolled = props.open === undefined;

  return (
    <div className="w-full">
      {/* Lokalny trigger tylko w trybie niekontrolowanym */}
      {isUncontrolled && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpen(!open)}
            className="btn-primary"
            aria-expanded={open}
            aria-controls="create-account-panel"
          >
            {open ? "Zamknij" : "Utwórz konto"}
          </button>
          {success && <span className="text-success text-sm">{success}</span>}
        </div>
      )}

      {open && (
        <div id="create-account-panel" className="card mt-3 p-4">
          {success && !isUncontrolled && (
            <div className="mb-3 text-success text-sm">{success}</div>
          )}

          {/* info o bonusie */}
          <div className="mb-3 rounded-md border border-accent/30 bg-accent/10 p-3 text-sm">
            <p>
              <span className="font-medium">Saldo początkowe:</span>{" "}
              {formatPLN(WELCOME_BONUS_MINOR)} (ustalane automatycznie jako
              bonus od banku).
            </p>
          </div>

          {errors.length > 0 && (
            <div className="mb-3 rounded-md border border-danger/40 bg-danger/10 p-3 text-danger">
              <ul className="list-disc ms-5 space-y-1">
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="name" className="text-sm text-muted">
                Nazwa konta
              </label>
              <input
                id="name"
                name="name"
                className="input"
                placeholder="np. Konto PLN"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>

            {/* Waluta zostaje na przyszłość */}
            <div className="space-y-1.5">
              <label className="text-sm text-muted">Waluta</label>
              <select
                className="input"
                value={form.currency}
                onChange={(e) =>
                  setForm((f) => ({ ...f, currency: e.target.value as "PLN" }))
                }
                disabled
                title="API wspiera tylko PLN"
              >
                <option value="PLN">PLN</option>
              </select>
              <p className="text-xs text-muted">
                Aktualnie dostępna tylko PLN.
              </p>
            </div>

            {/* Saldo początkowe tylko jako informacja (disabled) */}
            <div className="space-y-1.5">
              <label htmlFor="initialBalanceZl" className="text-sm text-muted">
                Saldo początkowe (zł)
              </label>
              <input
                id="initialBalanceZl"
                name="initialBalanceZl"
                className="input"
                value={WELCOME_BONUS_PLN}
                readOnly
                disabled
              />
              <p className="text-xs text-muted">
                Bonus od banku: {formatPLN(WELCOME_BONUS_MINOR)}.
              </p>
            </div>

            <div className="sm:col-span-2 flex gap-2 pt-1">
              <button
                type="submit"
                className="btn-primary"
                disabled={mutation.isPending}
                aria-busy={mutation.isPending}
              >
                {mutation.isPending ? "Tworzę…" : "Utwórz konto"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-border px-4 py-2.5"
                onClick={() => setOpen(false)}
              >
                Anuluj
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
