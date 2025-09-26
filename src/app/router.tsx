import { createBrowserRouter } from "react-router-dom";
import App from "../App";
import Home from "../pages/Home";
import Login from "../pages/Login";
import Register from "../pages/Register";
import Accounts from "../pages/Accounts";
import ProtectedRoute from "./ProtectedRoute";
import Transactions from "../pages/Transactions";
import Webhooks from "../pages/Webhooks";
import AccountDetails from "../pages/AccountDetails";
import AccountStats from "../pages/AccountStats";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: "login", element: <Login /> },
      { path: "register", element: <Register /> },
      {
        path: "accounts",
        element: (
          <ProtectedRoute>
            <Accounts />
          </ProtectedRoute>
        ),
      },

      {
        path: "accounts/:accountId/transactions",
        element: (
          <ProtectedRoute>
            <Transactions />
          </ProtectedRoute>
        ),
      },

      {
        path: "webhooks",
        element: (
          <ProtectedRoute>
            <Webhooks />
          </ProtectedRoute>
        ),
      },

      {
        path: "accounts/:accountId",
        element: (
          <ProtectedRoute>
            <AccountDetails />
          </ProtectedRoute>
        ),
      },

      {
        path: "accounts/:accountId/transactions",
        element: (
          <ProtectedRoute>
            <Transactions />
          </ProtectedRoute>
        ),
      },

      {
        path: "accounts/:accountId/stats",
        element: (
          <ProtectedRoute>
            <AccountStats />
          </ProtectedRoute>
        ),
      },
    ],
  },
]);
