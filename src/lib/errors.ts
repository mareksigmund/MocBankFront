// src/lib/errors.ts
import { isAxiosError } from "axios";

// Struktura błędu z backendu
type ApiErrorBody = {
  message?: unknown;
};

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

/** Wyciąga przyjazne komunikaty z błędu HTTP/AXIOS lub zwraca domyślny. */
export function extractApiMessages(error: unknown): string[] {
  if (isAxiosError<ApiErrorBody>(error)) {
    const status = error.response?.status;
    const msg = error.response?.data?.message;

    if (Array.isArray(msg)) return msg.filter(isNonEmptyString);
    if (isNonEmptyString(msg)) return [msg];

    if (status === 502 || status === 503 || status === 504) {
      return ["Serwer chwilowo niedostępny. Spróbuj ponownie."];
    }
  }
  return ["Coś poszło nie tak. Spróbuj ponownie."];
}
