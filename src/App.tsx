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
import ThumbnailPage from "./pages/ThumbnailPage";
 import SrtSubPage from "./pages/SrtSubPage";
import AdminRegisterPage from "./pages/AdminRegisterPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import UserLoginPage from "./pages/UserLoginPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import AboutPage from "./pages/AboutPage";
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
          <Route path="/thumbnail" element={<ThumbnailPage />} />
           <Route path="/srt" element={<SrtSubPage />} />
          {/* Admin Routes */}
          <Route path="/admin/register" element={<AdminRegisterPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          {/* User Routes */}
          <Route path="/login" element={<UserLoginPage />} />
          {/* Legal Pages */}
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/about" element={<AboutPage />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
