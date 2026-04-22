import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, User, ArrowLeft, Loader2 } from "lucide-react";
import CreditUsageRecords from "@/components/CreditUsageRecords";

interface ProfileLite {
  user_id: string;
  email: string;
  display_name: string | null;
  plan: string;
}

const AdminUsageRecordsTab: React.FC = () => {
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ProfileLite | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("user_id,email,display_name,plan")
        .order("created_at", { ascending: false })
        .limit(2000);
      setProfiles((data || []) as ProfileLite[]);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        p.email?.toLowerCase().includes(q) ||
        p.display_name?.toLowerCase().includes(q) ||
        p.user_id?.toLowerCase().includes(q)
    );
  }, [profiles, search]);

  if (selected) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => setSelected(null)}
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to users
          </Button>
          <div className="text-right">
            <p className="text-2xs text-muted-foreground">Viewing</p>
            <p className="text-xs font-bold text-foreground">
              {selected.display_name || selected.email}
            </p>
          </div>
        </div>
        <CreditUsageRecords targetUserId={selected.user_id} compact />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by email, name, or user ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-7 h-8 text-xs"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          <span className="text-xs">Loading users...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-xs text-muted-foreground">No users found</div>
      ) : (
        <div className="space-y-1 max-h-[70vh] overflow-y-auto">
          {filtered.map((p) => (
            <Card
              key={p.user_id}
              className="p-2.5 bg-card/50 border-border/30 hover:border-primary/40 cursor-pointer transition-colors"
              onClick={() => setSelected(p)}
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <User className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {p.display_name || p.email}
                  </p>
                  <p className="text-3xs text-muted-foreground truncate">{p.email}</p>
                </div>
                <span
                  className={`text-3xs px-1.5 py-0.5 rounded-full uppercase font-bold ${
                    p.plan === "premium"
                      ? "bg-amber-500/20 text-amber-500"
                      : p.plan === "pro"
                      ? "bg-blue-500/20 text-blue-500"
                      : "bg-muted/40 text-muted-foreground"
                  }`}
                >
                  {p.plan}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminUsageRecordsTab;
