import { useState } from "react";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Link } from "react-router-dom";

import { api } from "../lib/api";
import { extractApiMessages } from "../lib/errors";
import { useTitle } from "../lib/title";

type Webhook = {
  id: string;
  clientId: string;
  url: string;
  events: string[];
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

const CreateSchema = z.object({
  url: z.string().url({
    message: "Podaj poprawny URL",
  }),
  // kontrolujemy format heksadecymalny; 32–64 znaki (pasuje do przykładu z dokumentacji)
  secret: z.string().regex(/^[0-9a-fA-F]{32,64}$/, {
    message: "Sekret powinien mieć 32–64 znaki hex (0–9, a–f).",
  }),
  events: z
    .array(z.literal("transaction.created"))
    .min(1, { message: "Wybierz przynajmniej jedno zdarzenie" }),
});

type CreateInput = z.infer<typeof CreateSchema>;

export default function Webhooks() {
  useTitle("Webhooki");

  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateInput>({
    url: "",
    secret: "",
    events: ["transaction.created"],
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState<string | null>(null);

  const listQuery = useQuery<Webhook[]>({
    queryKey: ["webhooks"],
    queryFn: async () => {
      const res = await api.get<Webhook[]>("/v1/webhooks");
      return res.data;
    },
  });

  const createMutation = useMutation<Webhook, unknown, CreateInput>({
    mutationFn: async (payload) => {
      const res = await api.post<Webhook>("/v1/webhooks", payload);
      return res.data;
    },
    onSuccess: async () => {
      setSuccess("Webhook dodany ✅");
      setErrors([]);
      setForm({ url: "", secret: "", events: ["transaction.created"] });
      await qc.invalidateQueries({ queryKey: ["webhooks"] });
      setTimeout(() => {
        setSuccess(null);
        setOpen(false);
      }, 800);
    },
    onError: (error) => {
      if (isAxiosError(error)) {
        if (error.response?.status === 409) {
          setErrors([
            "Taki webhook już istnieje (duplikat URL dla tego użytkownika).",
          ]);
          return;
        }
        const msgs = extractApiMessages(error);
        setErrors(msgs.length ? msgs : ["Nie udało się dodać webhooka."]);
      } else {
        setErrors(["Nie udało się dodać webhooka."]);
      }
    },
  });

  const deleteMutation = useMutation<void, unknown, string>({
    mutationFn: async (id) => {
      await api.delete(`/v1/webhooks/${id}`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["webhooks"] });
    },
    onError: (error) => {
      if (isAxiosError(error)) {
        const msgs = extractApiMessages(error);
        alert(msgs.join("\n") || "Nie udało się usunąć webhooka.");
      } else {
        alert("Nie udało się usunąć webhooka.");
      }
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    setSuccess(null);

    const parsed = CreateSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((i) => i.message));
      return;
    }
    createMutation.mutate(parsed.data);
  }

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-2xl md:text-3xl font-semibold tracking-tight">
          <span
            className="inline-block h-2 w-2 rounded-full bg-accent"
            aria-hidden
          />
          Webhooki
        </h2>
        <p className="text-sm text-muted mt-1">
          Zdarzenia:{" "}
          <code className="text-foreground">transaction.created</code>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="btn-primary"
          aria-expanded={open}
          aria-controls="create-webhook-panel"
        >
          {open ? "Zamknij" : "Dodaj webhook"}
        </button>
        <Link
          to="/accounts"
          className="rounded-lg border border-border px-4 py-2.5"
        >
          ← Wróć do kont
        </Link>
      </div>
    </div>
  );

  if (listQuery.isLoading) {
    return (
      <section className="space-y-6">
        {header}
        <div className="card p-4">
          <div className="h-6 w-1/3 rounded bg-overlay mb-3" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 w-full rounded bg-overlay mb-2" />
          ))}
        </div>
      </section>
    );
  }

  if (listQuery.isError) {
    return (
      <section className="space-y-6">
        {header}
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-danger">
          <p>Nie udało się pobrać listy webhooków.</p>
          <button
            onClick={() => listQuery.refetch()}
            className="btn-primary mt-3"
          >
            Spróbuj ponownie
          </button>
        </div>
      </section>
    );
  }

  const hooks = listQuery.data ?? [];

  return (
    <section className="space-y-6">
      {header}

      {open && (
        <div id="create-webhook-panel" className="card p-4">
          {success && (
            <div className="mb-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-emerald-300">
              {success}
            </div>
          )}
          {errors.length > 0 && (
            <div className="mb-3 rounded-md border border-danger/40 bg-danger/10 p-3 text-danger">
              <ul className="list-disc ms-5 space-y-1">
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm text-muted">URL</label>
              <input
                className="input"
                placeholder="https://twoj-endpoint.example.com/api/bank/webhook"
                value={form.url}
                onChange={(e) =>
                  setForm((f) => ({ ...f, url: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm text-muted">Sekret (HMAC-SHA256)</label>
              <input
                className="input"
                type="password"
                placeholder="0123456789abcdef0123456789abcdef"
                value={form.secret}
                onChange={(e) =>
                  setForm((f) => ({ ...f, secret: e.target.value }))
                }
              />
              <p className="text-xs text-muted">
                Będzie użyty do weryfikacji nagłówka{" "}
                <code className="text-foreground">X-MockBank-Signature</code>.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-muted">Zdarzenia</label>
              <div className="flex items-center gap-2">
                <input
                  id="evt-created"
                  type="checkbox"
                  className="h-4 w-4"
                  checked
                  disabled
                />
                <label htmlFor="evt-created" className="text-sm">
                  transaction.created
                </label>
              </div>
              <p className="text-xs text-muted">
                Aktualnie jedyne obsługiwane zdarzenie.
              </p>
            </div>

            <div className="sm:col-span-2 flex gap-2 pt-1">
              <button
                type="submit"
                className="btn-primary"
                disabled={createMutation.isPending}
                aria-busy={createMutation.isPending}
              >
                {createMutation.isPending ? "Tworzę…" : "Dodaj webhook"}
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

      {/* Lista */}
      {hooks.length === 0 ? (
        <div className="card p-6 text-muted">
          Brak webhooków. Kliknij „Dodaj webhook”, aby zarejestrować endpoint.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {hooks.map((h) => (
            <article key={h.id} className="card p-4">
              <header className="mb-2">
                <h3 className="text-lg font-semibold">transaction.created</h3>
                <p className="text-xs text-muted break-all">URL: {h.url}</p>
              </header>

              <p className="text-xs text-muted">
                Utworzono: {new Date(h.createdAt).toLocaleString("pl-PL")}
              </p>

              <footer className="mt-4 flex items-center justify-between">
                <span className="text-xs text-muted">ID: {h.id}</span>
                <button
                  onClick={() => {
                    if (confirm("Usunąć ten webhook?")) {
                      deleteMutation.mutate(h.id);
                    }
                  }}
                  className="rounded-lg border border-border px-3 py-1.5 hover:bg-overlay/70"
                >
                  Usuń
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
