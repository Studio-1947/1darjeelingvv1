// First import so error reporting starts as early as possible. Inert unless the build was given
// VITE_SENTRY_DSN, and then it loads the SDK on its own  see observability.js.
import "@/observability";
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
// The Leaflet marker fix is imported by LocationPicker, the only Leaflet map, so the map library
// (about 170 KB) loads with that page instead of before every page.
import App from "@/App";
import * as serviceWorkerRegistration from "@/serviceWorkerRegistration";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);

serviceWorkerRegistration.register();
