import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ToastProvider } from "./components/ui/ToastStack";
import { AuthProvider } from "./features/auth/AuthProvider";
import { PairProvider } from "./features/sync/PairProvider";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastProvider>
      <AuthProvider>
        <PairProvider>
          <App />
        </PairProvider>
      </AuthProvider>
    </ToastProvider>
  </React.StrictMode>
);
