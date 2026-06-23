import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ExtractBar from "./components/ExtractBar";
import ErrorBoundary from "./components/ErrorBoundary";
import NavTabs from "./components/NavTabs";
import RecipePage from "./pages/RecipePage";
import SavedPage from "./pages/SavedPage";
import GroceryPage from "./pages/GroceryPage";
import { useStore } from "./store";

export default function App() {
  const prefetch = useStore((s) => s.prefetch);

  useEffect(() => {
    prefetch();
  }, [prefetch]);

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col">
        <ExtractBar />
        <main className="flex-1 pb-16">
          <Routes>
            <Route path="/" element={<Navigate to="/saved" replace />} />
            <Route path="/recipe" element={<RecipePage />} />
            <Route path="/recipe/:id" element={<RecipePage />} />
            <Route path="/saved" element={<SavedPage />} />
            <Route path="/grocery" element={<GroceryPage />} />
            <Route path="/add" element={<Navigate to="/saved" replace />} />
          </Routes>
        </main>
        <NavTabs />
      </div>
    </ErrorBoundary>
  );
}
