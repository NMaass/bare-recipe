import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import Nav from "./components/Nav";
import Footer from "./components/Footer";
import HomePage from "./pages/HomePage";
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
    <main className="max-w-xl mx-auto min-h-screen pb-20">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/recipe" element={<RecipePage />} />
        <Route path="/recipe/:id" element={<RecipePage />} />
        <Route path="/saved" element={<SavedPage />} />
        <Route path="/grocery" element={<GroceryPage />} />
      </Routes>
      <Footer />
      <Nav />
    </main>
  );
}
