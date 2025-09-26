import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";

import { api } from "../lib/api";
import { formatPLN } from "../lib/money";
import { useTitle } from "../lib/title";
import CreateAccountForm from "../components/CreateAccountForm";
import InternalTransferModal from "../components/InternalTransferModal";

type Account = {
  id: string;
  userId: string;
  name: string;
  iban: string;
  currency: "PLN";
  balance: number; // grosze
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

type ApiErrorBody = {
  message?: string | string[];
};

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

export default function Accounts() {
  useTitle("Konta");

  const [createOpen, setCreateOpen] = useState(false);

  // modal przelewu
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferDefaultFrom, setTransferDefaultFrom] = useState<string | null>(
    null
  );

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const res = await api.get<Account[]>("/v1/accounts");
      return res.data;
    },
  });

  // ---------- LOADING ----------
  if (isLoading) {
    return (
      <section className="space-y-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-2xl font-semibold">Twoje konta</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Ładowanie…</span>
            <button className="btn-primary" disabled>
              Utwórz konto
            </button>
            <button
              className="rounded-lg border border-border px-4 py-2.5"
              disabled
            >
              Przelew
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card p-4">
              <div className="h-5 w-2/3 rounded bg-overlay mb-3" />
              <div className="h-4 w-1/2 rounded bg-overlay" />
              <div className="h-10 w-1/3 rounded bg-overlay mt-4" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // ---------- ERROR ----------
  if (isError) {
    let status: number | undefined;
    let msg = "Nie udało się pobrać listy kont.";

    if (isAxiosError(error)) {
      status = error.response?.status;
      const m = (error.response?.data as ApiErrorBody | undefined)?.message;

      if (Array.isArray(m)) {
        const texts = m.filter(isNonEmptyString);
        if (texts.length) msg = texts.join("\n");
      } else if (isNonEmptyString(m)) {
        msg = m;
      }
    }

    return (
      <section className="space-y-6">
        <div className="flex items-baseline justify-between gap-3">
          {!createOpen ? (
            <h2 className="text-2xl font-semibold">Twoje konta</h2>
          ) : (
            <div aria-hidden className="h-8" />
          )}
          <div className="flex items-center gap-2">
            <button
              className="btn-primary"
              onClick={() => setCreateOpen((v) => !v)}
              aria-expanded={createOpen}
              aria-controls="create-account-panel"
            >
              {createOpen ? "Zamknij" : "Utwórz konto"}
            </button>
            <button
              className="rounded-lg border border-border px-4 py-2.5"
              disabled
            >
              Przelew
            </button>
          </div>
        </div>

        <CreateAccountForm open={createOpen} onOpenChange={setCreateOpen} />

        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-danger">
          <p className="mb-2 whitespace-pre-line">{msg}</p>
          {status === 429 && (
            <p className="text-sm">
              Limit zapytań przekroczony. Spróbuj za chwilę.
            </p>
          )}
          <button onClick={() => refetch()} className="btn-primary mt-3">
            Spróbuj ponownie
          </button>
        </div>
      </section>
    );
  }

  // ---------- DATA ----------
  const accounts = data ?? [];
  const canTransfer = accounts.length >= 2;

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        {/* tytuł znika, gdy panel otwarty */}
        {!createOpen ? (
          <div>
            <h2 className="flex items-center gap-2 text-2xl md:text-3xl font-semibold tracking-tight">
              <span
                className="inline-block h-2 w-2 rounded-full bg-accent"
                aria-hidden
              />
              Twoje konta
            </h2>
            <p className="text-sm text-muted mt-1">
              Zarządzaj rachunkami i saldami
            </p>
          </div>
        ) : (
          <div aria-hidden className="h-8" />
        )}

        <div className="flex items-center gap-2">
          {isFetching && <span className="text-sm text-muted">Odświeżam…</span>}

          <button
            className="btn-primary"
            onClick={() => setCreateOpen((v) => !v)}
            aria-expanded={createOpen}
            aria-controls="create-account-panel"
          >
            {createOpen ? "Zamknij" : "Utwórz konto"}
          </button>

          <button
            className="rounded-lg border border-border px-4 py-2.5"
            onClick={() => {
              setTransferDefaultFrom(null); // modal sam wybierze pierwsze konto jako źródło
              setTransferOpen(true);
            }}
            disabled={!canTransfer}
            title={!canTransfer ? "Potrzebne co najmniej 2 konta" : undefined}
          >
            Przelew
          </button>
        </div>
      </div>

      {/* panel formularza zawsze pod nagłówkiem */}
      <CreateAccountForm open={createOpen} onOpenChange={setCreateOpen} />

      {accounts.length === 0 ? (
        <div className="card p-6 text-muted">
          Nie masz jeszcze żadnych kont.
          <div className="text-sm mt-2">
            Skorzystaj z przycisku „Utwórz konto” powyżej.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map((a) => (
            <article key={a.id} className="card p-4">
              <header className="mb-2">
                <h3 className="text-lg font-semibold">{a.name}</h3>
                <p className="text-xs text-muted">
                  IBAN:{" "}
                  <span className="font-mono tracking-tight">{a.iban}</span>
                </p>
              </header>

              <div className="mt-3">
                <p className="text-3xl font-semibold tracking-tight">
                  {formatPLN(a.balance)}
                </p>
                <p className="text-xs text-muted mt-1">Waluta: {a.currency}</p>
              </div>

              <footer className="mt-4 flex items-center justify-between">
                <p className="text-xs text-muted">
                  Utworzone: {new Date(a.createdAt).toLocaleString("pl-PL")}
                </p>
                <div className="flex items-center gap-3">
                  <Link
                    to={`/accounts/${a.id}`}
                    className="text-accent text-sm hover:underline"
                  >
                    Szczegóły →
                  </Link>
                  <Link
                    to={`/accounts/${a.id}/transactions`}
                    className="text-accent text-sm hover:underline"
                  >
                    Transakcje →
                  </Link>
                </div>
              </footer>
            </article>
          ))}
        </div>
      )}

      {/* Modal przelewu między własnymi kontami */}
      {transferOpen && (
        <InternalTransferModal
          open={transferOpen}
          onClose={() => setTransferOpen(false)}
          defaultFromId={transferDefaultFrom}
          // onSuccess nie jest konieczny – modal sam invaliduje queries
        />
      )}
    </section>
  );
}
