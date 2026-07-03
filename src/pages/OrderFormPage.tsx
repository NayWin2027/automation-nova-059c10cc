import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, FileCheck, ArrowLeft, ShieldCheck, Phone, Send, MessageCircle, Mail } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";

interface OrderFormPageProps {
  embedded?: boolean;
}

const OrderFormPage: React.FC<OrderFormPageProps> = ({ embedded = false }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null);

  const [formData, setFormData] = useState({
    orderType: "" as "new_user" | "topup" | "renew" | "",
    paymentMethod: "" as "kpay" | "wave" | "thai_bank" | "",
    paymentRef: "",
    referrerDisplayId: "",
    contactMethod: "" as "email" | "messenger" | "viber" | "telegram" | "",
    contactValue: "",
  });
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUser({ id: session.user.id, email: session.user.email || "" });
      }
    };
    checkAuth();
  }, []);

  // Prefill referrer from ?ref= URL param (surgical, non-invasive)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get("ref");
      if (ref) {
        setFormData((prev) => (prev.referrerDisplayId ? prev : { ...prev, referrerDisplayId: ref.trim().substring(0, 50) }));
      }
    } catch {}
  }, []);

  const handleSlipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "File too large", description: "Max 5MB", variant: "destructive" });
        return;
      }
      setSlipFile(file);
      const reader = new FileReader();
      reader.onload = () => setSlipPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (
      !formData.orderType ||
      !formData.paymentMethod ||
      !formData.paymentRef.trim() ||
      !slipFile ||
      !formData.contactMethod ||
      !formData.contactValue.trim()
    ) {
      toast({
        title: "လိုအပ်ချက်မပြည့်စုံပါ",
        description: "Order type, payment method, transaction number, contact info, payment slip အားလုံး ဖြည့်ပေးပါ",
        variant: "destructive",
      });
      return;
    }

    // Sanitize contact value
    const sanitizedContact = formData.contactValue.trim().substring(0, 200).replace(/[<>]/g, "");

    if ((formData.orderType === "topup" || formData.orderType === "renew") && !currentUser) {
      toast({ title: "Login လိုအပ်ပါသည်", description: "Top-up/Renew အတွက် login ဝင်ပေးပါ", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      let slipImagePath: string | null = null;

      if (slipFile) {
        const ext = slipFile.name.split(".").pop();
        const folder = currentUser?.id ? currentUser.id : "public";
        const fileName = `${folder}/${Date.now()}_${crypto.randomUUID().substring(0, 8)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("payment-slips").upload(fileName, slipFile);

        if (uploadError) {
          console.error("Slip upload error:", uploadError);
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(slipFile);
          });
          slipImagePath = fileName;
        } else {
          slipImagePath = fileName;
        }
      }

      const { data, error } = await supabase.functions.invoke("process-order", {
        body: {
          action: currentUser ? "submit_order" : "submit_order_public",
          order_type: formData.orderType,
          payment_method: formData.paymentMethod,
          user_email: currentUser?.email || "public_order",
          slip_image_path: slipImagePath,
          payment_ref: formData.paymentRef.trim().substring(0, 100),
          referrer_display_id: formData.referrerDisplayId ? formData.referrerDisplayId.trim().substring(0, 50) : null,
          contact_method: formData.contactMethod,
          contact_value: sanitizedContact,
        },
      });

      if (error) throw error;
      if (data?.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
        setLoading(false);
        return;
      }

      setOrderNumber(data.order?.order_number || "");
      setSubmitted(true);
      toast({ title: "✅ Order တင်ပြီးပါပြီ", description: `Order No: ${data.order?.order_number}` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Something went wrong", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className={embedded ? "p-4" : "min-h-screen bg-background flex items-center justify-center p-4"}>
        <Card className={embedded ? "w-full border-primary/20" : "w-full max-w-md border-primary/20"}>
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
              <FileCheck className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Order တင်ပြီးပါပြီ!</h2>
            <div className="bg-secondary/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Order Number</p>
              <p className="text-2xl font-bold text-primary tracking-wider">{orderNumber}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Admin မှ စစ်ဆေးပြီး approved လုပ်ပေးပါမည်။
              <br />
              Approved ဖြစ်ပါက အကောင့်အချက်အလက်များ ပို့ပေးပါမည်။
            </p>
            {!embedded && (
              <Button onClick={() => navigate("/")} variant="outline" className="mt-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                ပင်မစာမျက်နှာသို့
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={embedded ? "p-4" : "min-h-screen bg-background flex items-center justify-center p-4"}>
      <Card className={embedded ? "w-full border-none shadow-none" : "w-full max-w-lg border-primary/20"}>
        <CardHeader className="text-center pb-2 bg-[#020627]">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-lg">Payment Order Form</CardTitle>
          <CardDescription className="text-sm">
            Plan ဝယ်ယူခြင်း / Credit ဖြည့်သွင်းခြင်း / သက်တမ်းတိုးခြင်း
          </CardDescription>
          <div className="flex items-center justify-center gap-2 mt-2">
            <AppLogo size={28} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/plans")}
              className="border-violet-500/50 text-violet-400 hover:bg-violet-500/10 hover:text-violet-300 transition-all duration-300 shadow-[0_0_12px_rgba(139,92,246,0.3)] hover:shadow-[0_0_20px_rgba(139,92,246,0.5)]"
            >
              Plan အသေးစိပ်
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 bg-[#050524]">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Order Type *</Label>
            <Select
              value={formData.orderType}
              onValueChange={(v) => setFormData((prev) => ({ ...prev, orderType: v as any }))}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="ရွေးချယ်ပါ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new_user">🆕 New User (အကောင့်အသစ်)</SelectItem>
                <SelectItem value="topup">💰 Credit Top-up</SelectItem>
                <SelectItem value="renew">🔄 Plan Renew (သက်တမ်းတိုး)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Payment Method *</Label>
            <Select
              value={formData.paymentMethod}
              onValueChange={(v) => setFormData((prev) => ({ ...prev, paymentMethod: v as any }))}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="ရွေးချယ်ပါ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kpay">KPay</SelectItem>
                <SelectItem value="wave">Wave Pay</SelectItem>
                <SelectItem value="thai_bank">Thai Bank</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Transaction Number (ငွေလွှဲ reference no) *</Label>
            <Input
              value={formData.paymentRef}
              onChange={(e) => setFormData((prev) => ({ ...prev, paymentRef: e.target.value }))}
              placeholder="ဥပမာ: KP123456789"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Referrer ID (မရှိရင် ကျော်လိုက်ပါ)</Label>
            <Input
              value={formData.referrerDisplayId}
              onChange={(e) => setFormData((prev) => ({ ...prev, referrerDisplayId: e.target.value }))}
              placeholder="Referrer ၏ User ID"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">ဆက်သွယ်ရန် နည်းလမ်း (Contact Method) *</Label>
            <Select
              value={formData.contactMethod}
              onValueChange={(v) => setFormData((prev) => ({ ...prev, contactMethod: v as any, contactValue: "" }))}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="ဆက်သွယ်ရန် နည်းလမ်းရွေးပါ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">
                  <Mail className="w-3.5 h-3.5 inline mr-1.5" />
                  Email Address
                </SelectItem>
                <SelectItem value="messenger">
                  <MessageCircle className="w-3.5 h-3.5 inline mr-1.5" />
                  Messenger Link
                </SelectItem>
                <SelectItem value="viber">
                  <Phone className="w-3.5 h-3.5 inline mr-1.5" />
                  Viber No
                </SelectItem>
                <SelectItem value="telegram">
                  <Send className="w-3.5 h-3.5 inline mr-1.5" />
                  Telegram
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.contactMethod && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                {formData.contactMethod === "email"
                  ? "Email Address *"
                  : formData.contactMethod === "messenger"
                    ? "Messenger Link / Username *"
                    : formData.contactMethod === "viber"
                      ? "Viber Phone Number *"
                      : "Telegram Username / Phone *"}
              </Label>
              <Input
                value={formData.contactValue}
                onChange={(e) => setFormData((prev) => ({ ...prev, contactValue: e.target.value.substring(0, 200) }))}
                placeholder={
                  formData.contactMethod === "email"
                    ? "example@gmail.com"
                    : formData.contactMethod === "messenger"
                      ? "https://m.me/username"
                      : formData.contactMethod === "viber"
                        ? "09xxxxxxxxx"
                        : "@username"
                }
                className="h-9 text-sm"
                maxLength={200}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Payment Slip (ငွေလွှဲ slip ပုံ) *</Label>
            <div className="border border-dashed border-primary/30 rounded-lg p-4 text-center">
              {slipPreview ? (
                <div className="space-y-2">
                  <img src={slipPreview} alt="Slip" className="max-h-40 mx-auto rounded-lg" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSlipFile(null);
                      setSlipPreview(null);
                    }}
                    className="text-xs text-destructive"
                  >
                    ဖျက်ပြီး အသစ်တင်မယ်
                  </Button>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Slip ပုံ တင်ပါ (Max 5MB)</span>
                  <input type="file" accept="image/*" onChange={handleSlipChange} className="hidden" />
                </label>
              )}
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={
              loading ||
              !formData.orderType ||
              !formData.paymentMethod ||
              !formData.paymentRef.trim() ||
              !slipFile ||
              !formData.contactMethod ||
              !formData.contactValue.trim()
            }
            className="w-full h-10 text-gold font-extrabold bg-black"
          >
            {loading ? "တင်နေသည်..." : "Order တင်မယ်"}
          </Button>

          <p className="text-3xs text-muted-foreground text-center text-sm">
            Admin စစ်ဆေးပြီး approved လုပ်ပေးပါမည်။ စစ်ဆေးရန် အချိန်အနည်းငယ် ယူပါမည်။
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default OrderFormPage;
