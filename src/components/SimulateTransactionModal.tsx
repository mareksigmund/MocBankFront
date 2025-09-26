import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import { api } from "../lib/api";
import { formatPLN } from "../lib/money";
import { extractApiMessages } from "../lib/errors";

// ---- Typy ----
type Props = {
  accountId: string;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

type Txn = {
  id: string;
  accountId: string;
  amount: number; // grosze (minus = wydatek, plus = przychód)
  currency: "PLN";
  date: string; // ISO
  description: string;
  counterparty?: string;
  categoryHint?: string;
  externalTxnId?: string;
  createdAt: string;
  updatedAt: string;
};

type SimulateTxnInput = {
  accountId: string;
  amount: number; // grosze
  description: string;
  counterparty?: string;
  categoryHint?: string;
  date?: string; // ISO (opcjonalnie)
};

// ---- Presety (stałe kwoty i dane; data zawsze = dziś) ----
const presets = [
  {
    id: "groceries",
    label: "Zakupy spożywcze",
    description: "Biedronka",
    counterparty: "Biedronka 123",
    categoryHint: "groceries",
    amountMinor: -4999, // 49,99 zł
  },
  {
    id: "coffee",
    label: "Kawa na mieście",
    description: "Starbucks",
    counterparty: "Starbucks Wrocław",
    categoryHint: "food-and-drink",
    amountMinor: -1790, // 17,90 zł
  },
  {
    id: "rent",
    label: "Czynsz / mieszkanie",
    description: "Czynsz",
    counterparty: "Wspólnota Mieszkaniowa",
    categoryHint: "housing",
    amountMinor: -220000, // 2200,00 zł
  },
  {
    id: "salary",
    label: "Wynagrodzenie",
    description: "Wynagrodzenie",
    counterparty: "ACME Sp. z o.o.",
    categoryHint: "salary",
    amountMinor: 650000, // 6500,00 zł
  },
  {
    id: "friend",
    label: "Przelew od znajomego",
    description: "Zwrot za obiad",
    counterparty: "Jan Kowalski",
    categoryHint: "transfer",
    amountMinor: 4000, // 40,00 zł
  },
] as const;

type PresetId = (typeof presets)[number]["id"];

// ---- Helpers ----
function toMinorUnitsPositive(input: string | number): number {
  const n =
    typeof input === "number"
      ? input
      : Number(String(input).replace(/\s+/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(Math.abs(n) * 100);
}

function nowAsInputLocal(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

// Walidacja pól ręcznych (kwota zawsze dodatnia, znak wybieramy przełącznikiem)
const ManualSchema = z.object({
  description: z.string().min(1, { message: "Podaj opis" }),
  counterparty: z.string().optional(),
  categoryHint: z.string().optional(),
  amountZl: z
    .union([z.string(), z.number()])
    .transform((v) =>
      typeof v === "number" ? v : Number(String(v).replace(",", "."))
    )
    .refine((v) => Number.isFinite(v) && v > 0, {
      message: "Kwota musi być liczbą większą od zera",
    }),
  date: z.string().min(1, { message: "Podaj datę" }), // datetime-local
});

export default function SimulateTransactionModal({
  accountId,
  open,
  onClose,
  onSuccess,
}: Props) {
  const qc = useQueryClient();

  // tryb i widok
  const [mode, setMode] = useState<"preset" | "manual">("preset");

  // PRESET: tylko wybór scenariusza – nic do wpisywania
  const [selectedPreset, setSelectedPreset] = useState<PresetId>("groceries");
  const selected = useMemo(
    () => presets.find((p) => p.id === selectedPreset)!,
    [selectedPreset]
  );

  // RĘCZNIE:
  const [flow, setFlow] = useState<"out" | "in">("out"); // wydatek/przychód
  const [manual, setManual] = useState<z.infer<typeof ManualSchema>>({
    description: "",
    counterparty: "",
    categoryHint: "",
    amountZl: "" as unknown as number,
    date: nowAsInputLocal(),
  });

  const [errors, setErrors] = useState<string[]>([]);

  // Przy każdym otwarciu modala ustawiamy "dzisiaj" w polach daty
  useEffect(() => {
    if (open) {
      setManual((m) => ({ ...m, date: nowAsInputLocal() }));
      setErrors([]);
    }
  }, [open]);

  const mutation = useMutation<Txn, unknown, SimulateTxnInput>({
    mutationFn: async (payload) => {
      const res = await api.post<Txn>("/v1/simulations/transaction", payload);
      return res.data;
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["transactions"] }),
        qc.invalidateQueries({ queryKey: ["accounts"] }),
        qc.invalidateQueries({ queryKey: ["recentTxns"] }),
      ]);
      onSuccess?.();
      onClose();
      // reset delikatny
      setMode("preset");
      setSelectedPreset("groceries");
      setFlow("out");
      setManual({
        description: "",
        counterparty: "",
        categoryHint: "",
        amountZl: "" as unknown as number,
        date: nowAsInputLocal(),
      });
      setErrors([]);
    },
    onError: (error) => {
      if (isAxiosError(error)) {
        const msgs = extractApiMessages(error);
        setErrors(msgs.length ? msgs : ["Nie udało się utworzyć transakcji."]);
      } else {
        setErrors(["Nie udało się utworzyć transakcji."]);
      }
    },
  });

  if (!open) return null;

  // --- submity ---
  function submitPreset(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    const dateIso = new Date().toISOString(); // zawsze "dzisiaj"
    const p = selected;

    mutation.mutate({
      accountId,
      amount: p.amountMinor,
      description: p.description,
      counterparty: p.counterparty,
      categoryHint: p.categoryHint,
      date: dateIso,
    });
  }

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    const parsed = ManualSchema.safeParse(manual);
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((i) => i.message));
      return;
    }
    const absMinor = toMinorUnitsPositive(parsed.data.amountZl);
    if (!Number.isFinite(absMinor) || absMinor <= 0) {
      setErrors(["Kwota musi być liczbą większą od zera"]);
      return;
    }
    const amount = flow === "out" ? -absMinor : absMinor;
    const dateIso = new Date(parsed.data.date).toISOString();

    mutation.mutate({
      accountId,
      amount,
      description: parsed.data.description,
      counterparty: parsed.data.counterparty || undefined,
      categoryHint: parsed.data.categoryHint || undefined,
      date: dateIso,
    });
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
          <h3 className="text-lg font-semibold">Symuluj transakcję</h3>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5"
          >
            Zamknij
          </button>
        </header>

        {/* przełącznik trybu */}
        <div className="px-4 pt-3">
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            <button
              className={`px-3 py-2 text-sm ${
                mode === "preset" ? "bg-accent/20" : ""
              }`}
              onClick={() => setMode("preset")}
            >
              Presety
            </button>
            <button
              className={`px-3 py-2 text-sm ${
                mode === "manual" ? "bg-accent/20" : ""
              }`}
              onClick={() => setMode("manual")}
            >
              Ręcznie
            </button>
          </div>
        </div>

        {errors.length > 0 && (
          <div className="mx-4 mt-3 rounded-md border border-danger/40 bg-danger/10 p-3 text-danger">
            <ul className="list-disc ms-5 space-y-1">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {/* --- PRESETY: wybierasz i wysyłasz; brak edycji --- */}
        {mode === "preset" && (
          <form onSubmit={submitPreset} className="p-4 space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted">
                Wybierz scenariusz. Transakcja zostanie dodana z{" "}
                <span className="font-medium">dzisiejszą datą</span> i
                predefiniowaną kwotą/opisem.
              </p>

              <div className="grid sm:grid-cols-2 gap-2">
                {presets.map((p) => {
                  const active = p.id === selectedPreset;
                  const positive = p.amountMinor > 0;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => setSelectedPreset(p.id)}
                      className={`text-left rounded-lg border px-3 py-2 transition ${
                        active
                          ? "border-accent bg-accent/10"
                          : "border-border hover:bg-overlay/60"
                      }`}
                    >
                      <div className="font-medium">{p.label}</div>
                      <div className="text-xs text-muted">
                        {p.description} • {p.counterparty}
                      </div>
                      <div
                        className={`mt-1 font-semibold ${
                          positive ? "text-success" : "text-danger"
                        }`}
                      >
                        {formatPLN(p.amountMinor)}
                      </div>
                    </button>
                  );
                })}
              </div>
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
                disabled={mutation.isPending}
                aria-busy={mutation.isPending}
              >
                {mutation.isPending ? "Dodaję…" : "Dodaj transakcję"}
              </button>
            </footer>
          </form>
        )}

        {/* --- RĘCZNIE: przełącznik wydatek/przychód + kwota bez minusa --- */}
        {mode === "manual" && (
          <form onSubmit={submitManual} className="p-4 space-y-3">
            {/* Wydatek/Przychód */}
            <div className="space-y-1.5">
              <label className="text-sm text-muted">Rodzaj</label>
              <div className="inline-flex rounded-lg border border-border overflow-hidden">
                <button
                  type="button"
                  className={`px-3 py-2 text-sm ${
                    flow === "out" ? "bg-danger/20 text-danger" : ""
                  }`}
                  onClick={() => setFlow("out")}
                >
                  Wydatek
                </button>
                <button
                  type="button"
                  className={`px-3 py-2 text-sm ${
                    flow === "in" ? "bg-success/20 text-success" : ""
                  }`}
                  onClick={() => setFlow("in")}
                >
                  Przychód
                </button>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm text-muted">Opis</label>
                <input
                  className="input"
                  value={manual.description}
                  onChange={(e) =>
                    setManual((m) => ({ ...m, description: e.target.value }))
                  }
                  placeholder="np. Biedronka"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-muted">
                  Kontrahent (opcjonalnie)
                </label>
                <input
                  className="input"
                  value={manual.counterparty}
                  onChange={(e) =>
                    setManual((m) => ({ ...m, counterparty: e.target.value }))
                  }
                  placeholder="np. Biedronka 123"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm text-muted">
                  Kategoria (opcjonalnie)
                </label>
                <input
                  className="input"
                  value={manual.categoryHint}
                  onChange={(e) =>
                    setManual((m) => ({ ...m, categoryHint: e.target.value }))
                  }
                  placeholder="np. groceries"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-muted">Kwota (zł)</label>
                <input
                  className="input"
                  inputMode="decimal"
                  value={String(manual.amountZl ?? "")}
                  onChange={(e) =>
                    setManual((m) => ({
                      ...m,
                      amountZl: e.target.value as unknown as number,
                    }))
                  }
                  placeholder="129,99"
                />
                <p className="text-xs text-muted">
                  Znak zostanie ustawiony automatycznie (
                  {flow === "out" ? "wydatek" : "przychód"}).
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-muted">Data</label>
              <input
                type="datetime-local"
                className="input"
                value={manual.date}
                onChange={(e) =>
                  setManual((m) => ({ ...m, date: e.target.value }))
                }
              />
              <p className="text-xs text-muted">Domyślnie: teraz.</p>
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
                disabled={mutation.isPending}
                aria-busy={mutation.isPending}
              >
                {mutation.isPending ? "Dodaję…" : "Dodaj transakcję"}
              </button>
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}
