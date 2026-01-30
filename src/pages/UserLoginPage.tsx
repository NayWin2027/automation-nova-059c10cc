import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  User, Lock, ArrowRight, Sparkles, Eye, EyeOff, 
  UserPlus, LogIn, Home
} from "lucide-react";

const UserLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    userId: "",
    password: "",
    confirmPassword: "",
  });

  useEffect(() => {
    // Check if already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Check if admin - if so, redirect to admin dashboard
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
        variant: "destructive",
      });
      return;
    }

    if (!isLogin && formData.password !== formData.confirmPassword) {
      toast({
        title: "❌ Password မတူညီပါ",
        description: "Password နှစ်ခု တူညီအောင် ထည့်ပါ",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    // Use internal email format
    const internalEmail = `${formData.userId}@internal.user`;

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: internalEmail,
          password: formData.password,
        });

        if (error) {
          toast({
            title: "❌ Login မအောင်မြင်ပါ",
            description: "User ID သို့မဟုတ် Password မှားနေပါသည်",
            variant: "destructive",
          });
        } else if (data.user) {
          toast({
            title: "✅ Login အောင်မြင်ပါပြီ",
            description: "ကြိုဆိုပါတယ်!",
          });
          checkUserRole(data.user.id);
        }
      } else {
        // Signup - for regular users, they need to contact admin
        toast({
          title: "ℹ️ အကောင့်ဖွင့်ခြင်း",
          description: "အကောင့်အသစ်ဖွင့်ရန် Admin ထံ ဆက်သွယ်ပါ",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "❌ Error",
        description: "တစ်ခုခုမှားသွားပါသည်",
        variant: "destructive",
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
        className="absolute top-4 left-4 p-2.5 rounded-xl premium-nav-glass hover:bg-white/10 transition-all z-20"
      >
        <Home className="w-4 h-4 text-white/70" />
      </button>

      {/* Login Card */}
      <div className="relative z-10 w-full max-w-sm">
        {/* Glow effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-violet-500/20 via-blue-500/20 to-purple-500/20 rounded-2xl blur-xl" />
        
        <div className="relative premium-tool-card rounded-2xl p-6 border border-white/10">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 mb-3 shadow-lg shadow-violet-500/30">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-lg font-bold text-white mb-1">MediaMaster</h1>
            <p className="text-2xs text-white/50 uppercase tracking-widest">
              {isLogin ? "User Login" : "Create Account"}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* User ID */}
            <div className="space-y-1.5">
              <label className="text-2xs text-white/60 uppercase tracking-wider font-medium">
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
                  className="w-full h-10 pl-9 pr-3 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-2xs text-white/60 uppercase tracking-wider font-medium">
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
                  className="w-full h-10 pl-9 pr-10 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Confirm Password (Signup only) */}
            {!isLogin && (
              <div className="space-y-1.5">
                <label className="text-2xs text-white/60 uppercase tracking-wider font-medium">
                  Confirm Password
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    <Lock className="w-3.5 h-3.5 text-white/40" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    placeholder="••••••••"
                    className="w-full h-10 pl-9 pr-3 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-violet-500/50 focus:bg-white/10 transition-all"
                  />
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-500/25"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {isLogin ? <LogIn className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                  {isLogin ? "Login" : "Sign Up"}
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          {/* Toggle Login/Signup */}
          <div className="mt-4 pt-4 border-t border-white/10 text-center">
            <p className="text-2xs text-white/50">
              {isLogin ? "အကောင့်မရှိသေးဘူးလား?" : "အကောင့်ရှိပြီးသားလား?"}
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="ml-1.5 text-violet-400 hover:text-violet-300 transition-colors font-medium"
              >
                {isLogin ? "Admin ဆက်သွယ်ပါ" : "Login"}
              </button>
            </p>
          </div>

          {/* Admin Link */}
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => navigate("/admin/login")}
              className="text-2xs text-white/30 hover:text-white/50 transition-colors"
            >
              Admin Login →
            </button>
          </div>
        </div>

        {/* Footer text */}
        <p className="text-center mt-4 text-2xs text-white/30">
          Pro Edition V8.0 • Secure Access
        </p>
      </div>
    </div>
  );
};

export default UserLoginPage;
