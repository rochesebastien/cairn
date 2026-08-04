import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/stack-sans-text";
import "@fontsource-variable/stack-sans-headline";
import "@fontsource-variable/geist-mono";
import "./app.css";
import { App } from "./App.js";
import { AppStateProvider } from "./lib/app-state.js";
import { readStoredTheme } from "./lib/theme.js";

// Apply the stored theme before the first paint so the app never flashes dark.
document.documentElement.dataset["theme"] = readStoredTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </QueryClientProvider>
  </StrictMode>,
);
