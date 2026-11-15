import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import App from "./App";
import { I18nProvider } from "@/lib/i18n";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="mealtrack:theme">
    <I18nProvider>
      <App />
    </I18nProvider>
  </ThemeProvider>,
);