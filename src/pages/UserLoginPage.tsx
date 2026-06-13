import React, { useState, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getDeviceSessionId } from "@/hooks/useSessionEnforcement";
import {
  User, Lock, ArrowRight, Eye, EyeOff,
  LogIn, Home, MessageCircle, ShoppingCart } from
"lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { LoginChatBot } from "@/components/LoginChatBot";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const OrderFormPage = lazy(() => import("@/pages/OrderFormPage"));

// Gate code moved to backend - verified via edge function

const UserLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    userId: "",
    password: ""
  });
  const [showGateDialog, setShowGateDialog] = useState(false);
  const [gateCode, setGateCode] = useState("");
  const [gateAttempts, setGateAttempts] = useState(0);
  const [gateLocked, setGateLocked] = useState(false);
  const [showOrderDialog, setShowOrderDialog] = useState(false);

  useEffect(() => {
    // Check if already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        checkUserRole(session.user.id);
      }
    });
  }, []);

  const checkUserRole = async (userId: string) => {
    const { data } = await supabase.rpc('has_role', {
      _user_id: userId,
      _role: 'admin'
    });

    if (data === true) {
      navigate('/admin/dashboard');
    } else {
      navigate('/');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.userId || !formData.password) {
      toast({
        title: "❌ လိုအပ်ချက်",
        description: "User ID နှင့် Password ထည့်ပါ",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    // Use internal email format
    const internalEmail = `${formData.userId}@internal.user`;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: internalEmail,
        password: formData.password
      });

      if (error) {
        toast({
          title: "❌ Login မအောင်မြင်ပါ",
          description: "User ID သို့မဟုတ် Password မှားနေပါသည်",
          variant: "destructive"
        });
      } else if (data.user && data.session) {
        // Register this device as the active session (Viber-style single device)
        try {
          await supabase.rpc('register_active_session', {
            _user_id: data.user.id,
            _session_id: getDeviceSessionId()
          });
        } catch (e) {
          console.error('Failed to register session:', e);
        }
        toast({
          title: "✅ Login အောင်မြင်ပါပြီ",
          description: "ကြိုဆိုပါတယ်!"
        });
        checkUserRole(data.user.id);
      }
    } catch (error) {
      toast({
        title: "❌ Error",
        description: "တစ်ခုခုမှားသွားပါသည်",
        variant: "destructive"
      });
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen premium-background relative overflow-hidden flex items-center justify-center p-4">
      {/* Premium rays overlay */}
      <div className="premium-rays" />
      
      {/* Floating orbs */}
      <div className="absolute top-20 left-10 w-32 h-32 rounded-full bg-gradient-to-br from-violet-500/10 to-transparent blur-2xl animate-pulse" />
      <div className="absolute bottom-20 right-10 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/10 to-transparent blur-2xl animate-pulse" style={{ animationDelay: '1s' }} />
      
      {/* Home button */}
      <button
        onClick={() => navigate("/")}
        className="absolute top-4 left-4 p-2.5 rounded-xl premium-nav-glass hover:bg-white/10 transition-all z-20">

        <Home className="w-4 h-4 text-white/70" />
      </button>

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-sm">
        {/* Glow effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-violet-500/20 via-blue-500/20 to-purple-500/20 rounded-2xl blur-xl" />
        
        <div className="relative premium-tool-card rounded-2xl p-6 border border-white/10 bg-black">
          {/* Header */}
           <div className="text-center mb-6">
            <div className="flex justify-center mb-3">
              <AppLogo size={56} />
            </div>
            <h1
              className="text-2xl font-black text-white mb-1"
              style={{
                fontFamily: "'Caveat', cursive",
                backgroundImage: "linear-gradient(135deg, hsl(0 0% 92%), hsl(220 30% 80%), hsl(245 80% 72%), hsl(200 100% 70%))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                filter: "drop-shadow(0 0 18px hsl(200 100% 65% / 0.6))",
                textShadow: "0 0 24px hsl(200,100%,70%,0.4)"
              }}>

              Automation Nova AI
            </h1>
            <p className="uppercase tracking-widest text-primary font-bold text-xs">
              User Login
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* User ID */}
            <div className="space-y-1.5">
              <label className="text-2xs uppercase tracking-wider font-medium text-neon-cyan">
                User ID
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                  <User className="w-3.5 h-3.5 text-white/40" />
                </div>
                <input
                  type="text"
                  value={formData.userId}
                  onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                  placeholder="Enter your ID"
                  className="w-full h-10 pl-9 pr-3 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all" />

              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-2xs uppercase tracking-wider font-medium text-neon-cyan">
                Password
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                  <Lock className="w-3.5 h-3.5 text-white/40" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full h-10 pl-9 pr-10 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all" />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors">

                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-500/25">

              {loading ?
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> :

              <>
                  <LogIn className="w-3.5 h-3.5" />
                  Login
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              }
            </button>
          </form>

          {/* Info text */}
          <div className="mt-4 pt-4 border-t border-white/10 text-center">
            <p className="text-sm text-orange-500 font-extrabold">
              အကောင့်မရှိသေးပါက Admin ထံဆက်သွယ်ပါ
            </p>
            <div className="flex justify-between mt-3">
              <a
                href="https://m.me/NAYWIN2027"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 transition-colors font-extrabold text-xs text-neon-amber"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Nay Win
              </a>
              <LoginChatBot />
              <a
                href="https://m.me/koyeswan.tds"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 transition-colors text-red-600 font-extrabold text-xs"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Ko Ye Swan
              </a>
            </div>
          </div>

          {/* Premium Plan Order Button */}
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => setShowOrderDialog(true)}
              className="relative group flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all duration-300 overflow-hidden"
              style={{
                background: "linear-gradient(135deg, hsl(270 80% 55%), hsl(200 100% 50%))",
                boxShadow: "0 0 20px hsl(270 80% 55% / 0.4), 0 0 40px hsl(200 100% 50% / 0.2)",
              }}
            >
              {/* Animated glow ring */}
              <span className="absolute inset-0 rounded-xl animate-pulse" style={{
                background: "linear-gradient(135deg, hsl(270 80% 65% / 0.3), hsl(200 100% 60% / 0.3))",
                filter: "blur(8px)",
              }} />
              <span className="relative flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" />
                Premium Plan ဝယ်ရန်
              </span>
            </button>
          </div>

          {/* Order Form Dialog */}
          <Dialog open={showOrderDialog} onOpenChange={setShowOrderDialog}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0 border-violet-500/20 bg-background">
              <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>}>
                <OrderFormPage embedded />
              </Suspense>
            </DialogContent>
          </Dialog>

          {/* Admin Link - subtle */}
          {!gateLocked &&
          <div className="mt-3 text-center">
              <button
              type="button"
              onClick={() => setShowGateDialog(true)}
              className="transition-colors text-[sidebar-accent-foreground] text-black opacity-5">

                Admin
              </button>
            </div>
          }
        </div>

        {/* Admin Gate Dialog */}
        {showGateDialog && !gateLocked &&
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="relative w-full max-w-xs mx-4 premium-tool-card rounded-2xl p-5 border border-white/10">
              <h3 className="text-sm font-semibold text-white text-center mb-1">🔐 Security Gate</h3>
              <p className="text-2xs text-white/50 text-center mb-4">Access Code ထည့်ပါ ({3 - gateAttempts} ခါ ကျန်ပါသေးသည်)</p>
              <input
              type="password"
              value={gateCode}
              onChange={(e) => setGateCode(e.target.value)}
              placeholder="Secret Code"
              className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all mb-3"
              autoFocus
              onKeyDown={async (e) => {
                if (e.key === "Enter") {
                  try {
                    const { data, error } = await supabase.functions.invoke('verify-gate', { body: { code: gateCode } });
                    if (!error && data?.success) {
                      setShowGateDialog(false);
                      setGateCode("");
                      setGateAttempts(0);
                      navigate("/x9k2m7");
                    } else {
                      const newAttempts = gateAttempts + 1;
                      setGateAttempts(newAttempts);
                      setGateCode("");
                      if (newAttempts >= 3) {
                        setShowGateDialog(false);
                        setGateLocked(true);
                        toast({ title: "🔒 Locked", description: "ခွင့်ပြုချက် ပိတ်ထားပါသည်", variant: "destructive" });
                      } else {
                        toast({ title: "❌ Access Denied", description: `Code မှားနေပါသည် (${3 - newAttempts} ခါ ကျန်)`, variant: "destructive" });
                      }
                    }
                  } catch {
                    toast({ title: "❌ Error", description: "Verification failed", variant: "destructive" });
                  }
                }
              }} />

              <div className="flex gap-2">
                <button
                onClick={() => {setShowGateDialog(false);setGateCode("");}}
                className="flex-1 h-9 rounded-lg bg-white/5 border border-white/10 text-2xs text-white/60 hover:bg-white/10 transition-all">

                  Cancel
                </button>
                <button
                onClick={async () => {
                  try {
                    const { data, error } = await supabase.functions.invoke('verify-gate', { body: { code: gateCode } });
                    if (!error && data?.success) {
                      setShowGateDialog(false);
                      setGateCode("");
                      setGateAttempts(0);
                      navigate("/x9k2m7");
                    } else {
                      const newAttempts = gateAttempts + 1;
                      setGateAttempts(newAttempts);
                      setGateCode("");
                      if (newAttempts >= 3) {
                        setShowGateDialog(false);
                        setGateLocked(true);
                        toast({ title: "🔒 Locked", description: "ခွင့်ပြုချက် ပိတ်ထားပါသည်", variant: "destructive" });
                      } else {
                        toast({ title: "❌ Access Denied", description: `Code မှားနေပါသည် (${3 - newAttempts} ခါ ကျန်)`, variant: "destructive" });
                      }
                    }
                  } catch {
                    toast({ title: "❌ Error", description: "Verification failed", variant: "destructive" });
                  }
                }}
                className="flex-1 h-9 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 text-2xs text-white font-semibold hover:from-violet-500 hover:to-blue-500 transition-all">

                  Verify
                </button>
              </div>
            </div>
          </div>
        }

        {/* Footer text */}
        <p className="text-center mt-4 text-2xs text-white/30">
          Pro Edition V8.0 • Secure Access
        </p>
      </div>
    </div>);

};

export default UserLoginPage;