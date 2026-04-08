import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import AnnouncementBanner from "./components/AnnouncementBanner";

// Retry wrapper for dynamic imports (handles stale chunk errors)
const lazyRetry = (importFn: () => Promise<any>) =>
  lazy(() =>
    importFn().catch(() => {
      // Reload to fetch fresh chunks; return a never-resolving promise
      // since calling importFn() again before reload completes also fails
      window.location.reload();
      return new Promise<{ default: React.ComponentType<any> }>(() => {});
    })
  );

// Lazy-loaded pages for instant navigation
const TranslatePage2 = lazyRetry(() => import("./pages/TranslatePage2"));
const TranscribePage = lazyRetry(() => import("./pages/TranscribePage"));
const VideoRecapPage = lazyRetry(() => import("./pages/VideoRecapPage"));
const TransformativeVideoPage = lazyRetry(() => import("./pages/TransformativeVideoPage"));
const RecapVideoPage = lazyRetry(() => import("./pages/RecapVideoPage"));
const RecapVideoNVPage = lazyRetry(() => import("./pages/RecapVideoNVPage"));
const VoicePage = lazyRetry(() => import("./pages/VoicePage"));
const CreatorPage = lazyRetry(() => import("./pages/CreatorPage"));
const StoryCreatorPage = lazyRetry(() => import("./pages/StoryCreatorPage"));
const NovelTransPage = lazyRetry(() => import("./pages/NovelTransPage"));
const ThumbnailPage = lazyRetry(() => import("./pages/ThumbnailPage"));
const SrtSubPage = lazyRetry(() => import("./pages/SrtSubPage"));
const TutorialVideosPage = lazyRetry(() => import("./pages/TutorialVideosPage"));
const NovaCutVideoPage = lazyRetry(() => import("./pages/NovaCutVideoPage"));
const TranslateVideoPage = lazyRetry(() => import("./pages/TranslateVideoPage"));


const AdminDashboardPage = lazyRetry(() => import("./pages/AdminDashboardPage"));
const AdminRoute = lazyRetry(() => import("./components/AdminRoute"));
const AdminLoginPage = lazyRetry(() => import("./pages/AdminLoginPage"));
const UserLoginPage = lazyRetry(() => import("./pages/UserLoginPage"));
const TermsPage = lazyRetry(() => import("./pages/TermsPage"));
const PrivacyPage = lazyRetry(() => import("./pages/PrivacyPage"));
const AboutPage = lazyRetry(() => import("./pages/AboutPage"));
const NotFound = lazyRetry(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AnnouncementBanner />
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/transcribe" element={<TranscribePage />} />
            <Route path="/translate" element={<TranslatePage2 />} />
            <Route path="/video-recap" element={<VideoRecapPage />} />
            <Route path="/transformative" element={<TransformativeVideoPage />} />
            <Route path="/recap" element={<RecapVideoPage />} />
            <Route path="/recap-nv" element={<RecapVideoNVPage />} />
            <Route path="/voice" element={<VoicePage />} />
            <Route path="/creator" element={<CreatorPage />} />
            <Route path="/story" element={<StoryCreatorPage />} />
            <Route path="/novel" element={<NovelTransPage />} />
            <Route path="/thumbnail" element={<ThumbnailPage />} />
            <Route path="/srt" element={<SrtSubPage />} />
            <Route path="/tutorials" element={<TutorialVideosPage />} />
            <Route path="/nova-cut" element={<NovaCutVideoPage />} />
            <Route path="/translate-video" element={<TranslateVideoPage />} />
            {/* Admin Routes */}
            <Route path="/x9k2m7" element={<AdminLoginPage />} />
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
