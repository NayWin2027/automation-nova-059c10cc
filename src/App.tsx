import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";

// Lazy-loaded pages for instant navigation
const TranslatePage2 = lazy(() => import("./pages/TranslatePage2"));
const TranscribePage = lazy(() => import("./pages/TranscribePage"));
const VideoRecapPage = lazy(() => import("./pages/VideoRecapPage"));
const TransformativeVideoPage = lazy(() => import("./pages/TransformativeVideoPage"));
const RecapVideoPage = lazy(() => import("./pages/RecapVideoPage"));
const RecapVideoNVPage = lazy(() => import("./pages/RecapVideoNVPage"));
const VoicePage = lazy(() => import("./pages/VoicePage"));
const CreatorPage = lazy(() => import("./pages/CreatorPage"));
const StoryCreatorPage = lazy(() => import("./pages/StoryCreatorPage"));
const NovelTransPage = lazy(() => import("./pages/NovelTransPage"));
const ThumbnailPage = lazy(() => import("./pages/ThumbnailPage"));
const SrtSubPage = lazy(() => import("./pages/SrtSubPage"));
const AdminRegisterPage = lazy(() => import("./pages/AdminRegisterPage"));
const AdminLoginPage = lazy(() => import("./pages/AdminLoginPage"));
const AdminDashboardPage = lazy(() => import("./pages/AdminDashboardPage"));
const AdminRoute = lazy(() => import("./components/AdminRoute"));
const UserLoginPage = lazy(() => import("./pages/UserLoginPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/transcribe" element={<TranscribePage />} />
            <Route path="/translate" element={<TranslatePage2 />} />
            <Route path="/video-recap" element={<VideoRecapPage />} />
            <Route path="/transformative" element={<TransformativeVideoPage />} />
            <Route path="/recap" element={<RecapVideoPage />} />
            <Route path="/recap-nv" element={<Suspense fallback={null}><AdminRoute><RecapVideoNVPage /></AdminRoute></Suspense>} />
            <Route path="/voice" element={<VoicePage />} />
            <Route path="/creator" element={<CreatorPage />} />
            <Route path="/story" element={<StoryCreatorPage />} />
            <Route path="/novel" element={<NovelTransPage />} />
            <Route path="/thumbnail" element={<ThumbnailPage />} />
            <Route path="/srt" element={<SrtSubPage />} />
            {/* Admin Routes */}
            <Route path="/admin/register" element={<Suspense fallback={null}><AdminRoute><AdminRegisterPage /></AdminRoute></Suspense>} />
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/admin/dashboard" element={<Suspense fallback={null}><AdminRoute><AdminDashboardPage /></AdminRoute></Suspense>} />
            {/* User Routes */}
            <Route path="/login" element={<UserLoginPage />} />
            {/* Legal Pages */}
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/about" element={<AboutPage />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
