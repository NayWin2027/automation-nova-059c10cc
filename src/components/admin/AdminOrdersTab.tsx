import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  CheckCircle, XCircle, Eye, RefreshCw, Search,
  Clock, Copy, ImageIcon, FileText, Mail, MessageCircle, Phone, Send
} from "lucide-react";

interface PaymentOrder {
  id: string;
  order_number: string;
  order_type: string;
  payment_method: string;
  user_email: string;
  user_id: string | null;
  slip_image_path: string | null;
  payment_ref: string | null;
  referrer_display_id: string | null;
  status: string;
  admin_credit_amount: number | null;
  admin_bonus_amount: number;
  admin_notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

const AdminOrdersTab: React.FC = () => {
  const { toast } = useToast();
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState<{
    nw: { total: number; approved: number; pending: number; totalCredits: number; totalBonus: number; newUser: number; topup: number; renew: number };
    kys: { total: number; approved: number; pending: number; totalCredits: number; totalBonus: number; newUser: number; topup: number; renew: number };
  } | null>(null);

  // Approval dialog state
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PaymentOrder | null>(null);
  const [approvalData, setApprovalData] = useState({
    creditAmount: 0,
    bonusAmount: 0,
    referrerDisplayId: "",
    adminNotes: "",
  });
  const [approving, setApproving] = useState(false);

  // Slip view dialog
  const [slipDialogOpen, setSlipDialogOpen] = useState(false);
  const [slipUrl, setSlipUrl] = useState<string | null>(null);

  // New user result dialog
  const [newUserResult, setNewUserResult] = useState<{ userId: string; password: string } | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-order", {
        body: { action: "get_orders", status: statusFilter || undefined }
      });
      if (error) throw error;
      setOrders(data?.orders || []);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  const fetchSummary = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("process-order", {
        body: { action: "get_order_summary" }
      });
      if (error) throw error;
      setSummary(data?.summary || null);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchSummary();
  }, [fetchOrders, fetchSummary]);

  const handleViewSlip = async (path: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("process-order", {
        body: { action: "get_slip_url", path }
      });
      if (error) throw error;
      setSlipUrl(data?.url || null);
      setSlipDialogOpen(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const openApproveDialog = (order: PaymentOrder) => {
    setSelectedOrder(order);
    setApprovalData({
      creditAmount: 0,
      bonusAmount: 0,
      referrerDisplayId: order.referrer_display_id || "",
      adminNotes: "",
    });
    setApproveDialogOpen(true);
  };

  const handleApprove = async () => {
    if (!selectedOrder) return;
    setApproving(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-order", {
        body: {
          action: "approve_order",
          orderId: selectedOrder.id,
          creditAmount: approvalData.creditAmount,
          bonusAmount: approvalData.bonusAmount,
          referrerDisplayId: approvalData.referrerDisplayId || null,
          adminNotes: approvalData.adminNotes || null,
        }
      });

      if (error) throw error;
      if (data?.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
        setApproving(false);
        return;
      }

      // If new user was created, show credentials
      if (data?.password) {
        setNewUserResult({ userId: data.userId, password: data.password });
      }

      toast({ title: "✅ Approved", description: `Order ${selectedOrder.order_number} approved` });
      setApproveDialogOpen(false);
      fetchOrders();
      fetchSummary();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async (order: PaymentOrder) => {
    if (!confirm(`Order ${order.order_number} ကို reject လုပ်မှာလား?`)) return;
    try {
      const { data, error } = await supabase.functions.invoke("process-order", {
        body: { action: "reject_order", orderId: order.id }
      });
      if (error) throw error;
      toast({ title: "❌ Rejected", description: `Order ${order.order_number} rejected` });
      fetchOrders();
      fetchSummary();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: text });
  };

  const filteredOrders = orders.filter(o =>
    o.order_number.toLowerCase().includes(search.toLowerCase()) ||
    o.user_email.toLowerCase().includes(search.toLowerCase()) ||
    (o.payment_ref?.toLowerCase() || "").includes(search.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge className="bg-amber-500/20 text-amber-400 text-3xs"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case "approved": return <Badge className="bg-emerald-500/20 text-emerald-400 text-3xs"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case "rejected": return <Badge className="bg-red-500/20 text-red-400 text-3xs"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default: return <Badge className="text-3xs">{status}</Badge>;
    }
  };

  const getOrderTypeBadge = (type: string) => {
    switch (type) {
      case "new_user": return <Badge variant="outline" className="text-3xs border-blue-400/30 text-blue-400">🆕 New User</Badge>;
      case "topup": return <Badge variant="outline" className="text-3xs border-amber-400/30 text-amber-400">💰 Top-up</Badge>;
      case "renew": return <Badge variant="outline" className="text-3xs border-emerald-400/30 text-emerald-400">🔄 Renew</Badge>;
      default: return <Badge variant="outline" className="text-3xs">{type}</Badge>;
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case "kpay": return "KPay";
      case "wave": return "Wave";
      case "thai_bank": return "Thai Bank";
      default: return method;
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-blue-500/20">
            <CardContent className="py-3 px-4 space-y-1.5">
              <p className="text-xs font-bold text-blue-400">💳 KPay / Wave (nw)</p>
              <div className="flex items-center gap-2 text-3xs text-muted-foreground flex-wrap">
                <span>Total: <strong className="text-foreground">{summary.nw.total}</strong></span>
                <span>Pending: <strong className="text-amber-400">{summary.nw.pending}</strong></span>
                <span>Approved: <strong className="text-emerald-400">{summary.nw.approved}</strong></span>
              </div>
              <div className="flex items-center gap-2 text-3xs text-muted-foreground flex-wrap">
                <span>🆕 <strong>{summary.nw.newUser}</strong></span>
                <span>💰 <strong>{summary.nw.topup}</strong></span>
                <span>🔄 <strong>{summary.nw.renew}</strong></span>
              </div>
              <div className="flex items-center gap-2 text-3xs">
                <span className="text-emerald-400">💎 Credits: <strong>{summary.nw.totalCredits.toLocaleString()}</strong></span>
                <span className="text-purple-400">🎁 Bonus: <strong>{summary.nw.totalBonus.toLocaleString()}</strong></span>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-500/20">
            <CardContent className="py-3 px-4 space-y-1.5">
              <p className="text-xs font-bold text-amber-400">🏦 Thai Bank (kys)</p>
              <div className="flex items-center gap-2 text-3xs text-muted-foreground flex-wrap">
                <span>Total: <strong className="text-foreground">{summary.kys.total}</strong></span>
                <span>Pending: <strong className="text-amber-400">{summary.kys.pending}</strong></span>
                <span>Approved: <strong className="text-emerald-400">{summary.kys.approved}</strong></span>
              </div>
              <div className="flex items-center gap-2 text-3xs text-muted-foreground flex-wrap">
                <span>🆕 <strong>{summary.kys.newUser}</strong></span>
                <span>💰 <strong>{summary.kys.topup}</strong></span>
                <span>🔄 <strong>{summary.kys.renew}</strong></span>
              </div>
              <div className="flex items-center gap-2 text-3xs">
                <span className="text-emerald-400">💎 Credits: <strong>{summary.kys.totalCredits.toLocaleString()}</strong></span>
                <span className="text-purple-400">🎁 Bonus: <strong>{summary.kys.totalBonus.toLocaleString()}</strong></span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-xs"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={fetchOrders} disabled={loading} className="h-8 text-xs">
          <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Orders List */}
      <div className="space-y-2">
        {filteredOrders.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {loading ? "Loading..." : "No orders found"}
            </CardContent>
          </Card>
        )}

        {filteredOrders.map((order) => (
          <Card key={order.id} className="border-primary/10">
            <CardContent className="py-3 px-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-primary">{order.order_number}</span>
                    {getOrderTypeBadge(order.order_type)}
                    {getStatusBadge(order.status)}
                    <Badge variant="secondary" className="text-3xs">{getPaymentMethodLabel(order.payment_method)}</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>👤 {order.user_email}</span>
                    {order.payment_ref && <span>📋 {order.payment_ref}</span>}
                    {order.referrer_display_id && <span>🔗 Ref: {order.referrer_display_id}</span>}
                  </div>
                  <div className="text-3xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleString()}
                    {order.admin_credit_amount != null && (
                      <span className="ml-2 text-emerald-400">💎 {order.admin_credit_amount} credits</span>
                    )}
                    {order.admin_bonus_amount > 0 && (
                      <span className="ml-2 text-purple-400">🎁 +{order.admin_bonus_amount} bonus</span>
                    )}
                  </div>
                  {order.admin_notes && (
                    <p className="text-3xs text-muted-foreground/80 italic">📝 {order.admin_notes}</p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {order.slip_image_path && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleViewSlip(order.slip_image_path!)}
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-primary" />
                    </Button>
                  )}
                  {order.status === "pending" && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openApproveDialog(order)}
                      >
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleReject(order)}
                      >
                        <XCircle className="w-4 h-4 text-red-400" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Approve Order: {selectedOrder?.order_number}
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-3">
              <div className="bg-secondary/50 rounded-lg p-3 space-y-1">
                <p className="text-xs"><strong>Type:</strong> {selectedOrder.order_type}</p>
                <p className="text-xs"><strong>User:</strong> {selectedOrder.user_email}</p>
                <p className="text-xs"><strong>Payment:</strong> {getPaymentMethodLabel(selectedOrder.payment_method)}</p>
                {selectedOrder.payment_ref && (
                  <p className="text-xs"><strong>Ref:</strong> {selectedOrder.payment_ref}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Credit Amount</Label>
                <Input
                  type="number"
                  value={approvalData.creditAmount}
                  onChange={(e) => setApprovalData(prev => ({ ...prev, creditAmount: Number(e.target.value) }))}
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Bonus Credits</Label>
                <Input
                  type="number"
                  value={approvalData.bonusAmount}
                  onChange={(e) => setApprovalData(prev => ({ ...prev, bonusAmount: Number(e.target.value) }))}
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Referrer ID (optional)</Label>
                <Input
                  value={approvalData.referrerDisplayId}
                  onChange={(e) => setApprovalData(prev => ({ ...prev, referrerDisplayId: e.target.value }))}
                  placeholder="Referrer User ID"
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Admin Notes</Label>
                <Input
                  value={approvalData.adminNotes}
                  onChange={(e) => setApprovalData(prev => ({ ...prev, adminNotes: e.target.value }))}
                  placeholder="မှတ်ချက်"
                  className="h-8 text-sm"
                />
              </div>

              <Button
                onClick={handleApprove}
                disabled={approving}
                className="w-full h-9 text-sm bg-emerald-600 hover:bg-emerald-700"
              >
                {approving ? "Processing..." : "✅ Approve & Process"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Slip View Dialog */}
      <Dialog open={slipDialogOpen} onOpenChange={setSlipDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">Payment Slip</DialogTitle>
          </DialogHeader>
          {slipUrl ? (
            <img src={slipUrl} alt="Payment Slip" className="w-full rounded-lg" />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
          )}
        </DialogContent>
      </Dialog>

      {/* New User Credentials Dialog */}
      <Dialog open={!!newUserResult} onOpenChange={() => setNewUserResult(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">🆕 New User Created</DialogTitle>
          </DialogHeader>
          {newUserResult && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                User အသစ် created ဖြစ်ပါပြီ။ ဒီ credentials တွေကို user ဆီ ပို့ပေးပါ။
              </p>
              <div className="bg-secondary/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">User ID:</span>
                  <div className="flex items-center gap-1">
                    <code className="text-xs text-primary">{newUserResult.userId}</code>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(newUserResult.userId)}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Password:</span>
                  <div className="flex items-center gap-1">
                    <code className="text-xs text-primary break-all">{newUserResult.password}</code>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(newUserResult.password)}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
              <p className="text-3xs text-destructive font-medium">
                ⚠️ Password ကို ယခု copy ယူထားပါ။ ဒီ dialog ပိတ်ပြီးရင် ပြန်ကြည့်၍ မရတော့ပါ။
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminOrdersTab;
