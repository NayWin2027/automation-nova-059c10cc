import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import TranslatePage2 from "./pages/TranslatePage2";
import TranscribePage from "./pages/TranscribePage";
import VideoRecapPage from "./pages/VideoRecapPage";
import TransformativeVideoPage from "./pages/TransformativeVideoPage";
import RecapVideoPage from "./pages/RecapVideoPage";
import VoicePage from "./pages/VoicePage";
import CreatorPage from "./pages/CreatorPage";
import StoryCreatorPage from "./pages/StoryCreatorPage";
import NovelTransPage from "./pages/NovelTransPage";
import AdminRegisterPage from "./pages/AdminRegisterPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/transcribe" element={<TranscribePage />} />
          <Route path="/translate" element={<TranslatePage2 />} />
          <Route path="/video-recap" element={<VideoRecapPage />} />
          <Route path="/transformative" element={<TransformativeVideoPage />} />
          <Route path="/recap" element={<RecapVideoPage />} />
          <Route path="/voice" element={<VoicePage />} />
          <Route path="/creator" element={<CreatorPage />} />
          <Route path="/story" element={<StoryCreatorPage />} />
          <Route path="/novel" element={<NovelTransPage />} />
          {/* Admin Routes */}
          <Route path="/admin/register" element={<AdminRegisterPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
