import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Footer from "./components/Footer";
import ExtractBar from "./components/ExtractBar";
import ErrorBoundary from "./components/ErrorBoundary";
import NavTabs from "./components/NavTabs";
import RecipePage from "./pages/RecipePage";
import SavedPage from "./pages/SavedPage";
import GroceryPage from "./pages/GroceryPage";
import AddRecipePage from "./pages/AddRecipePage";
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
        <div className="max-w-xl mx-auto px-5 pt-3">
          <NavTabs />
        </div>
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Navigate to="/saved" replace />} />
            <Route path="/recipe" element={<RecipePage />} />
            <Route path="/recipe/:id" element={<RecipePage />} />
            <Route path="/saved" element={<SavedPage />} />
            <Route path="/grocery" element={<GroceryPage />} />
            <Route path="/add" element={<AddRecipePage />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </ErrorBoundary>
  );
}
