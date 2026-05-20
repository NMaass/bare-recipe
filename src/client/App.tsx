import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Nav from "./components/Nav";
import Footer from "./components/Footer";
import ExtractBar from "./components/ExtractBar";
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
    <div className="min-h-screen flex flex-col pb-24">
      <ExtractBar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Navigate to="/saved" replace />} />
          <Route path="/recipe" element={<RecipePage />} />
          <Route path="/recipe/:id" element={<RecipePage />} />
          <Route path="/saved" element={<SavedPage />} />
          <Route path="/grocery" element={<GroceryPage />} />
        </Routes>
      </main>
      <Footer />
      <Nav />
    </div>
  );
}
