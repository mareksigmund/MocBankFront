import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { authStore } from "../lib/auth";

type Props = { children: ReactNode };

export default function ProtectedRoute({ children }: Props) {
  const location = useLocation();

  if (authStore.token) {
    return <>{children}</>;
  }

  const from = encodeURIComponent(location.pathname + location.search);
  return <Navigate to={`/login?from=${from}`} replace />;
}
