import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Shield, Eye, EyeOff, Lock, Mail, Smartphone, ArrowLeft } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const GATE_SESSION_KEY = "admin_gate_verified";
const MAX_GATE_ATTEMPTS = 3;

const AdminLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
   
  // Gate code state
  const [gateVerified, setGateVerified] = useState(false);
  const [gateCode, setGateCode] = useState("");
  const [gateAttempts, setGateAttempts] = useState(0);
  const [gateLocked, setGateLocked] = useState(false);

  // 2FA state
  const [show2FA, setShow2FA] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [pendingSession, setPendingSession] = useState<{ userId: string; token: string } | null>(null);

  // Check gate session on mount
  useEffect(() => {
    const verified = sessionStorage.getItem(GATE_SESSION_KEY);
    if (verified === "true") {
      setGateVerified(true);
    }
  }, []);

  useEffect(() => {
    // Check if already logged in as admin - MUST also check 2FA
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: isAdmin } = await supabase.rpc('has_role', {
          _user_id: session.user.id,
          _role: 'admin'
        });
        
        if (isAdmin) {
          // SECURITY FIX: Check if 2FA is enabled for this admin
          const { data: status2FA, error: status2FAError } = await supabase.functions.invoke("admin-2fa", {
            body: { action: "status" },
          });
          
          if (status2FAError) {
            // Security check failed - do not auto-navigate
            console.error("2FA status check failed:", status2FAError);
            return;
          }
          
          if (status2FA?.enabled) {
            // 2FA is enabled - check if this session has verified 2FA
            const verified = sessionStorage.getItem(`2fa_verified_${session.user.id}`);
            if (!verified) {
              // Need to verify 2FA - show 2FA prompt
              setPendingSession({
                userId: session.user.id,
                token: session.access_token,
              });
              setShow2FA(true);
              return;
            }
          }
          
          // Either no 2FA or already verified
          navigate('/admin/dashboard');
        }
      }
    };
    checkSession();
  }, [navigate]);

  const verify2FACode = async () => {
    if (!pendingSession || totpCode.length !== 6) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-2fa", {
        body: { action: "verify-login", code: totpCode },
      });

      if (error) {
        throw new Error(error.message || "Backend connection error");
      }
      
      if (!data?.success) {
        throw new Error(data?.error || "Invalid 2FA code");
      }

      // SECURITY FIX: Mark this session as 2FA verified
      sessionStorage.setItem(`2fa_verified_${pendingSession.userId}`, Date.now().toString());

      toast({
        title: "✅ Login Successful",
        description: "Welcome to Admin Dashboard",
      });

      navigate('/admin/dashboard');
    } catch (err) {
      toast({
        title: "❌ Verification Failed",
        description: err instanceof Error ? err.message : "Invalid code. Please try again.",
        variant: "destructive",
      });
      setTotpCode("");
    } finally {
      setLoading(false);
    }
  };
 
  const verifyGateCode = async () => {
    if (gateLocked || !gateCode) return;
    try {
      const { data, error } = await supabase.functions.invoke('verify-gate', {
        body: { code: gateCode }
      });
      if (!error && data?.success) {
        sessionStorage.setItem(GATE_SESSION_KEY, "true");
        setGateVerified(true);
        setGateCode("");
      } else {
        const newAttempts = gateAttempts + 1;
        setGateAttempts(newAttempts);
        setGateCode("");
        if (newAttempts >= MAX_GATE_ATTEMPTS) {
          setGateLocked(true);
          toast({
            title: "🔒 Access Locked",
            description: "Too many failed attempts. Please refresh and try again.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "❌ Invalid Code",
            description: `Incorrect access code. ${MAX_GATE_ATTEMPTS - newAttempts} attempts remaining.`,
            variant: "destructive",
          });
        }
      }
    } catch {
      toast({
        title: "❌ Error",
        description: "Verification failed. Try again.",
        variant: "destructive",
      });
    }
  };

  const cancelLogin = async () => {
    await supabase.auth.signOut();
    setShow2FA(false);
    setPendingSession(null);
    setTotpCode("");
    setFormData({ email: "", password: "" });
  };
 
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      const validated = loginSchema.parse(formData);
      setLoading(true);

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: validated.email,
        password: validated.password,
      });

      if (authError) {
        throw authError;
      }

      if (!authData.user) {
        throw new Error("Login failed");
      }

      // Check if user is admin
      const { data: isAdmin, error: roleError } = await supabase.rpc('has_role', {
        _user_id: authData.user.id,
        _role: 'admin'
      });

      if (roleError) {
        throw roleError;
      }

      if (!isAdmin) {
        await supabase.auth.signOut();
        throw new Error("Access denied. Admin privileges required.");
      }

      // Check if user is banned
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_banned, ban_reason')
        .eq('user_id', authData.user.id)
        .maybeSingle();

      if (profile?.is_banned) {
        await supabase.auth.signOut();
        throw new Error(`Account banned: ${profile.ban_reason || 'Contact support'}`);
      }

      // Check if 2FA is enabled for this admin
      const { data: status2FA, error: status2FAError } = await supabase.functions.invoke("admin-2fa", {
        body: { action: "status" },
      });

      // SECURITY FIX: Do NOT allow bypass on error - sign out and show error
      if (status2FAError) {
        console.error("Failed to check 2FA status:", status2FAError);
        await supabase.auth.signOut();
        throw new Error("Security check failed. Please try again.");
      }

      if (status2FA?.enabled) {
        // Show 2FA verification step
        setPendingSession({
          userId: authData.user.id,
          token: authData.session.access_token,
        });
        setShow2FA(true);
        setLoading(false);
        return;
      }
 
      // No 2FA, proceed directly
      toast({
        title: "✅ Login Successful",
        description: "Welcome to Admin Dashboard",
      });
 
      navigate('/admin/dashboard');
    } catch (err) {
      if (err instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        err.errors.forEach((e) => {
          if (e.path[0]) {
            fieldErrors[e.path[0] as string] = e.message;
          }
        });
        setErrors(fieldErrors);
      } else {
        toast({
          title: "❌ Login Failed",
          description: err instanceof Error ? err.message : "Invalid credentials",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Gate code verification UI
  if (!gateVerified) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-destructive/80 to-destructive mb-4">
              <Shield className="w-8 h-8 text-destructive-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Restricted Area</h1>
            <p className="text-muted-foreground mt-2">This page requires authorized access</p>
          </div>

          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-destructive" />
                Access Code Required
              </CardTitle>
              <CardDescription>
                Enter the security access code to proceed
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {gateLocked ? (
                <div className="text-center py-4">
                  <p className="text-destructive font-semibold">🔒 Access Locked</p>
                  <p className="text-muted-foreground text-sm mt-2">Too many failed attempts. Refresh and try again.</p>
                </div>
              ) : (
                <>
                  <Input
                    type="password"
                    placeholder="Enter access code"
                    value={gateCode}
                    onChange={(e) => setGateCode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && verifyGateCode()}
                  />
                  <Button
                    onClick={verifyGateCode}
                    className="w-full"
                    variant="destructive"
                    disabled={!gateCode}
                  >
                    Verify Access
                  </Button>
                </>
              )}

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => navigate("/")}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Go Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // 2FA Verification UI
  if (show2FA) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 mb-4">
              <Smartphone className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Two-Factor Verification</h1>
            <p className="text-muted-foreground mt-2">Enter the 6-digit code from your authenticator app</p>
          </div>
 
          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-cyan-500" />
                Verify Your Identity
              </CardTitle>
              <CardDescription>
                Open Google Authenticator or Authy and enter the code
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={totpCode}
                  onChange={setTotpCode}
                  disabled={loading}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
 
              <Button
                onClick={verify2FACode}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700"
                disabled={loading || totpCode.length !== 6}
              >
                {loading ? "Verifying..." : "Verify & Login"}
              </Button>
 
              <Button
                variant="ghost"
                className="w-full"
                onClick={cancelLogin}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Login
              </Button>
            </CardContent>
          </Card>
 
          <p className="text-center text-xs text-muted-foreground mt-4">
            Can't access your authenticator? Contact system admin
          </p>
        </div>
      </div>
    );
  }
 
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <AppLogo size={64} />
          </div>
          <h1
            className="text-3xl font-black"
            style={{
              fontFamily: "'Caveat', cursive",
              backgroundImage: "linear-gradient(135deg, hsl(0 0% 92%), hsl(220 30% 80%), hsl(245 80% 72%), hsl(200 100% 70%))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 18px hsl(200 100% 65% / 0.6))",
            }}
          >
            Automation Nova AI
          </h1>
          <p className="text-muted-foreground mt-2">Admin Login</p>
        </div>

        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-cyan-500" />
              Secure Access
            </CardTitle>
            <CardDescription>
              Enter your admin credentials to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={errors.email ? "border-destructive" : ""}
                />
                {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className={errors.password ? "border-destructive pr-10" : "pr-10"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700"
                disabled={loading}
              >
                {loading ? "Authenticating..." : "Login"}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                <Link to="/login" className="text-cyan-500 hover:underline">
                  ← User Login သို့ ပြန်သွားရန်
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Protected by end-to-end encryption
        </p>
      </div>
    </div>
  );
};

export default AdminLoginPage;
