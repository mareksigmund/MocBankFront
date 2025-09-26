// src/pages/AccountDetails.tsx
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import { api } from "../lib/api";
import { useTitle } from "../lib/title";
import { formatPLN } from "../lib/money";
import SimulateTransactionModal from "../components/SimulateTransactionModal";
import InternalTransferModal from "../components/InternalTransferModal";
import ConfirmCloseAccountModal from "../components/ConfirmCloseAccountModal";
import { closeAccount } from "../lib/accounts";
import AccountQuickStats from "../components/AccountQuickStats";

type Account = {
  id: string;
  userId: string;
  name: string;
  iban: string;
  currency: "PLN";
  balance: number;
  createdAt: string;
  updatedAt: string;
};

type ApiErrorBody = { message?: string | string[] };

export default function AccountDetails() {
  const { accountId = "" } = useParams();

  const q = useQuery<Account[]>({
    queryKey: ["accounts"],
    queryFn: async () => {
      const res = await api.get<Account[]>("/v1/accounts");
      return res.data;
    },
  });

  const account = useMemo(
    () => (q.data ?? []).find((a) => a.id === accountId),
    [q.data, accountId]
  );

  useTitle(account ? `Konto: ${account.name}` : "Szczegóły konta");

  const [simOpen, setSimOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  if (q.isLoading) {
    return (
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 rounded bg-overlay" />
          <Link
            to="/accounts"
            className="rounded-lg border border-border px-4 py-2.5"
          >
            ← Wróć do kont
          </Link>
        </div>
        <div className="card p-4">
          <div className="h-6 w-1/3 rounded bg-overlay mb-3" />
          <div className="h-5 w-1/4 rounded bg-overlay" />
          <div className="h-10 w-1/5 rounded bg-overlay mt-4" />
        </div>
      </section>
    );
  }

  if (q.isError) {
    let msg = "Nie udało się pobrać danych konta.";
    if (isAxiosError(q.error)) {
      const m = (q.error.response?.data as ApiErrorBody | undefined)?.message;
      if (typeof m === "string" && m.trim()) msg = m;
      if (Array.isArray(m) && m.length) msg = m.join("\n");
    }
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Szczegóły konta</h2>
          <Link
            to="/accounts"
            className="rounded-lg border border-border px-4 py-2.5"
          >
            ← Wróć do kont
          </Link>
        </div>
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-danger">
          <p className="whitespace-pre-line">{msg}</p>
        </div>
      </section>
    );
  }

  if (!account) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Szczegóły konta</h2>
          <Link
            to="/accounts"
            className="rounded-lg border border-border px-4 py-2.5"
          >
            ← Wróć do kont
          </Link>
        </div>
        <div className="card p-4">Nie znaleziono konta.</div>
      </section>
    );
  }

  const acc: Account = account;
  const canClose = acc.balance === 0;

  async function handleCloseConfirm(data: {
    password: string;
    nameConfirm: string;
  }) {
    setCloseError(null);
    setCloseSubmitting(true);
    try {
      await closeAccount(acc.id, {
        password: data.password,
        confirmName: data.nameConfirm,
      });
      setCloseOpen(false);
      await q.refetch();
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        const s = err.response?.status ?? 0;
        if (s === 400) setCloseError("Nazwa konta nie zgadza się.");
        else if (s === 401)
          setCloseError("Nieprawidłowe hasło lub sesja wygasła.");
        else if (s === 403) setCloseError("Brak uprawnień do tego konta.");
        else if (s === 409)
          setCloseError("Saldo musi wynosić 0 przed zamknięciem.");
        else setCloseError("Nie udało się zamknąć konta. Spróbuj ponownie.");
      } else {
        setCloseError("Wystąpił nieoczekiwany błąd.");
      }
    } finally {
      setCloseSubmitting(false);
    }
  }

  return (
    <section className="space-y-6">
      {/* Pasek nagłówka + akcje */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl md:text-3xl font-semibold tracking-tight">
            <span
              className="inline-block h-2 w-2 rounded-full bg-accent"
              aria-hidden
            />
            {acc.name}
          </h2>
          <p className="text-sm text-muted mt-1">
            IBAN:&nbsp;<span className="font-mono">{acc.iban}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/accounts"
            className="rounded-lg border border-border px-4 py-2.5"
            title="Powrót do listy"
          >
            ← Wróć do kont
          </Link>
        </div>
      </div>

      {/* Karta z balansem i akcjami */}
      <div className="card p-4">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <div className="text-sm text-muted">Saldo</div>
            <div className="text-4xl font-semibold tracking-tight">
              {formatPLN(acc.balance)}
            </div>
            <div className="text-xs text-muted mt-1">
              Waluta: {acc.currency}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/accounts/${acc.id}/transactions`}
              className="rounded-lg border border-border px-4 py-2.5"
            >
              Transakcje
            </Link>

            <button
              className="rounded-lg border border-border px-4 py-2.5"
              onClick={() => setTransferOpen(true)}
              title="Przelew między własnymi kontami"
            >
              Przelew
            </button>

            <button className="btn-primary" onClick={() => setSimOpen(true)}>
              Symuluj transakcję
            </button>

            <button
              className={`rounded-lg border px-4 py-2.5 ${
                canClose
                  ? "border-danger/50 text-danger"
                  : "border-border text-muted"
              }`}
              onClick={() => setCloseOpen(true)}
              disabled={!canClose}
              title={
                canClose
                  ? "Zamknij konto"
                  : "Saldo musi wynosić 0, aby zamknąć konto"
              }
            >
              Zamknij konto
            </button>
          </div>
        </div>

        <div className="text-xs text-muted mt-3">
          Utworzone: {new Date(acc.createdAt).toLocaleString("pl-PL")}
        </div>

        {closeError && (
          <div className="mt-3 rounded-md border border-danger/40 bg-danger/10 p-3 text-danger">
            {closeError}
          </div>
        )}
      </div>

      {/* ⬇️ Statystyki konta – WPROST w szczegółach, bez klikania */}
      <AccountQuickStats accountId={acc.id} />

      {/* Modale */}
      {simOpen && (
        <SimulateTransactionModal
          accountId={acc.id}
          open={simOpen}
          onClose={() => setSimOpen(false)}
        />
      )}
      {transferOpen && (
        <InternalTransferModal
          open={transferOpen}
          onClose={() => setTransferOpen(false)}
          defaultFromId={acc.id}
        />
      )}
      {closeOpen && (
        <ConfirmCloseAccountModal
          open={closeOpen}
          onClose={() => setCloseOpen(false)}
          accountName={acc.name}
          onConfirm={handleCloseConfirm}
          isSubmitting={closeSubmitting}
        />
      )}
    </section>
  );
}
