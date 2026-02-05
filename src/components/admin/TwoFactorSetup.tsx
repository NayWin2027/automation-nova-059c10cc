 import React, { useState, useEffect } from "react";
 import { Shield, Smartphone, CheckCircle, XCircle, Loader2, Copy, QrCode } from "lucide-react";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
 import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
 import { useToast } from "@/hooks/use-toast";
 import { supabase } from "@/integrations/supabase/client";
 import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
 
 interface TwoFactorSetupProps {
   userId: string;
 }
 
 export const TwoFactorSetup: React.FC<TwoFactorSetupProps> = ({ userId }) => {
   const { toast } = useToast();
   const [loading, setLoading] = useState(false);
   const [checking, setChecking] = useState(true);
   const [is2FAEnabled, setIs2FAEnabled] = useState(false);
   const [setupOpen, setSetupOpen] = useState(false);
   const [disableOpen, setDisableOpen] = useState(false);
   
   // Setup state
   const [secret, setSecret] = useState("");
   const [otpauthUrl, setOtpauthUrl] = useState("");
   const [verifyCode, setVerifyCode] = useState("");
   const [setupStep, setSetupStep] = useState<"qr" | "verify">("qr");
   
   // Disable state
   const [disableCode, setDisableCode] = useState("");
 
   useEffect(() => {
     check2FAStatus();
   }, [userId]);
 
   const check2FAStatus = async () => {
     setChecking(true);
     try {
       const { data: { session } } = await supabase.auth.getSession();
       if (!session) return;
 
       const response = await fetch(
         `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-2fa`,
         {
           method: "POST",
           headers: {
             "Content-Type": "application/json",
             Authorization: `Bearer ${session.access_token}`,
           },
           body: JSON.stringify({ action: "status" }),
         }
       );
 
       const data = await response.json();
       setIs2FAEnabled(data?.enabled || false);
     } catch (error) {
       console.error("Failed to check 2FA status:", error);
     } finally {
       setChecking(false);
     }
   };
 
   const startSetup = async () => {
     setLoading(true);
     try {
       const { data: { session } } = await supabase.auth.getSession();
       if (!session) throw new Error("Not authenticated");
 
       const response = await fetch(
         `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-2fa`,
         {
           method: "POST",
           headers: {
             "Content-Type": "application/json",
             Authorization: `Bearer ${session.access_token}`,
           },
           body: JSON.stringify({ action: "setup" }),
         }
       );
 
       const data = await response.json();
       
       if (!response.ok) throw new Error(data.error);
 
       setSecret(data.secret);
       setOtpauthUrl(data.otpauthUrl);
       setSetupStep("qr");
       setSetupOpen(true);
     } catch (error) {
       toast({
         title: "Setup Failed",
         description: error instanceof Error ? error.message : "Failed to start 2FA setup",
         variant: "destructive",
       });
     } finally {
       setLoading(false);
     }
   };
 
   const verifySetup = async () => {
     if (verifyCode.length !== 6) return;
     
     setLoading(true);
     try {
       const { data: { session } } = await supabase.auth.getSession();
       if (!session) throw new Error("Not authenticated");
 
       const response = await fetch(
         `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-2fa`,
         {
           method: "POST",
           headers: {
             "Content-Type": "application/json",
             Authorization: `Bearer ${session.access_token}`,
           },
           body: JSON.stringify({ action: "verify-setup", code: verifyCode }),
         }
       );
 
       const data = await response.json();
       
       if (!response.ok) throw new Error(data.error);
 
       toast({
         title: "✅ 2FA Enabled!",
         description: "Two-factor authentication is now active",
       });
 
       setIs2FAEnabled(true);
       setSetupOpen(false);
       setVerifyCode("");
       setSecret("");
       setOtpauthUrl("");
     } catch (error) {
       toast({
         title: "Verification Failed",
         description: error instanceof Error ? error.message : "Invalid code",
         variant: "destructive",
       });
     } finally {
       setLoading(false);
     }
   };
 
   const disable2FA = async () => {
     if (disableCode.length !== 6) return;
     
     setLoading(true);
     try {
       const { data: { session } } = await supabase.auth.getSession();
       if (!session) throw new Error("Not authenticated");
 
       const response = await fetch(
         `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-2fa`,
         {
           method: "POST",
           headers: {
             "Content-Type": "application/json",
             Authorization: `Bearer ${session.access_token}`,
           },
           body: JSON.stringify({ action: "disable", code: disableCode }),
         }
       );
 
       const data = await response.json();
       
       if (!response.ok) throw new Error(data.error);
 
       toast({
         title: "2FA Disabled",
         description: "Two-factor authentication has been removed",
       });
 
       setIs2FAEnabled(false);
       setDisableOpen(false);
       setDisableCode("");
     } catch (error) {
       toast({
         title: "Failed to Disable",
         description: error instanceof Error ? error.message : "Invalid code",
         variant: "destructive",
       });
     } finally {
       setLoading(false);
     }
   };
 
   const copySecret = () => {
     navigator.clipboard.writeText(secret);
     toast({ title: "Copied!", description: "Secret key copied to clipboard" });
   };
 
   // Generate QR code URL using Google Charts API
   const qrCodeUrl = otpauthUrl
     ? `https://chart.googleapis.com/chart?chs=200x200&chld=M|0&cht=qr&chl=${encodeURIComponent(otpauthUrl)}`
     : "";
 
   if (checking) {
     return (
       <Card className="border-border/50 bg-card/50">
         <CardContent className="flex items-center justify-center py-8">
           <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
         </CardContent>
       </Card>
     );
   }
 
   return (
     <Card className="border-border/50 bg-card/50">
       <CardHeader>
         <CardTitle className="flex items-center gap-2">
           <Shield className="w-5 h-5 text-cyan-500" />
           Two-Factor Authentication
         </CardTitle>
         <CardDescription>
           Secure your admin account with TOTP authenticator app
         </CardDescription>
       </CardHeader>
       <CardContent>
         <div className="flex items-center justify-between">
           <div className="flex items-center gap-3">
             <div className={`p-2 rounded-full ${is2FAEnabled ? "bg-green-500/20" : "bg-muted"}`}>
               {is2FAEnabled ? (
                 <CheckCircle className="w-5 h-5 text-green-500" />
               ) : (
                 <XCircle className="w-5 h-5 text-muted-foreground" />
               )}
             </div>
             <div>
               <p className="font-medium">
                 {is2FAEnabled ? "2FA Enabled" : "2FA Not Enabled"}
               </p>
               <p className="text-sm text-muted-foreground">
                 {is2FAEnabled
                   ? "Your account is protected with authenticator app"
                   : "Add an extra layer of security to your account"}
               </p>
             </div>
           </div>
 
           {is2FAEnabled ? (
             <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
               <DialogTrigger asChild>
                 <Button variant="destructive" size="sm">
                   Disable 2FA
                 </Button>
               </DialogTrigger>
               <DialogContent>
                 <DialogHeader>
                   <DialogTitle>Disable Two-Factor Authentication</DialogTitle>
                   <DialogDescription>
                     Enter your current 2FA code to disable
                   </DialogDescription>
                 </DialogHeader>
                 <div className="space-y-4 py-4">
                   <div className="flex justify-center">
                     <InputOTP
                       maxLength={6}
                       value={disableCode}
                       onChange={setDisableCode}
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
                     variant="destructive"
                     className="w-full"
                     onClick={disable2FA}
                     disabled={loading || disableCode.length !== 6}
                   >
                     {loading ? (
                       <Loader2 className="w-4 h-4 animate-spin mr-2" />
                     ) : null}
                     Confirm Disable
                   </Button>
                 </div>
               </DialogContent>
             </Dialog>
           ) : (
             <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
               <DialogTrigger asChild>
                 <Button
                   onClick={startSetup}
                   disabled={loading}
                   className="bg-gradient-to-r from-cyan-500 to-blue-600"
                 >
                   {loading ? (
                     <Loader2 className="w-4 h-4 animate-spin mr-2" />
                   ) : (
                     <Smartphone className="w-4 h-4 mr-2" />
                   )}
                   Enable 2FA
                 </Button>
               </DialogTrigger>
               <DialogContent className="sm:max-w-md">
                 <DialogHeader>
                   <DialogTitle className="flex items-center gap-2">
                     <QrCode className="w-5 h-5" />
                     Set Up Authenticator
                   </DialogTitle>
                   <DialogDescription>
                     {setupStep === "qr"
                       ? "Scan the QR code with Google Authenticator or Authy"
                       : "Enter the 6-digit code from your app"}
                   </DialogDescription>
                 </DialogHeader>
 
                 {setupStep === "qr" ? (
                   <div className="space-y-4 py-4">
                     <div className="flex justify-center">
                       {qrCodeUrl && (
                         <img
                           src={qrCodeUrl}
                           alt="QR Code"
                           className="rounded-lg border bg-white p-2"
                         />
                       )}
                     </div>
                     
                     <div className="space-y-2">
                       <p className="text-xs text-muted-foreground text-center">
                         Or enter this key manually:
                       </p>
                       <div className="flex gap-2">
                         <Input
                           value={secret}
                           readOnly
                           className="font-mono text-xs"
                         />
                         <Button variant="outline" size="icon" onClick={copySecret}>
                           <Copy className="w-4 h-4" />
                         </Button>
                       </div>
                     </div>
 
                     <Button
                       className="w-full"
                       onClick={() => setSetupStep("verify")}
                     >
                       Continue to Verify
                     </Button>
                   </div>
                 ) : (
                   <div className="space-y-4 py-4">
                     <div className="flex justify-center">
                       <InputOTP
                         maxLength={6}
                         value={verifyCode}
                         onChange={setVerifyCode}
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
 
                     <div className="flex gap-2">
                       <Button
                         variant="outline"
                         className="flex-1"
                         onClick={() => setSetupStep("qr")}
                       >
                         Back
                       </Button>
                       <Button
                         className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600"
                         onClick={verifySetup}
                         disabled={loading || verifyCode.length !== 6}
                       >
                         {loading ? (
                           <Loader2 className="w-4 h-4 animate-spin mr-2" />
                         ) : null}
                         Verify & Enable
                       </Button>
                     </div>
                   </div>
                 )}
               </DialogContent>
             </Dialog>
           )}
         </div>
       </CardContent>
     </Card>
   );
 };