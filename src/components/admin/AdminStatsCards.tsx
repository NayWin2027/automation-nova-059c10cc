import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Crown, Ban, Coins } from "lucide-react";

interface Stats {
  totalUsers: number;
  freeUsers: number;
  proUsers: number;
  premiumUsers: number;
  bannedUsers: number;
}

interface AdminStatsCardsProps {
  stats: Stats | null;
}

const AdminStatsCards: React.FC<AdminStatsCardsProps> = ({ stats }) => {
  const statCards = [
    {
      title: "Total Users",
      value: stats?.totalUsers || 0,
      icon: Users,
      gradient: "from-cyan-500 to-blue-600",
    },
    {
      title: "Free Plan",
      value: stats?.freeUsers || 0,
      icon: Users,
      gradient: "from-slate-500 to-slate-600",
    },
    {
      title: "Pro Plan",
      value: stats?.proUsers || 0,
      icon: Crown,
      gradient: "from-amber-500 to-orange-600",
    },
    {
      title: "Premium Plan",
      value: stats?.premiumUsers || 0,
      icon: Crown,
      gradient: "from-purple-500 to-pink-600",
    },
    {
      title: "Banned Users",
      value: stats?.bannedUsers || 0,
      icon: Ban,
      gradient: "from-red-500 to-rose-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {statCards.map((stat) => (
        <Card key={stat.title} className="border-border/50 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${stat.gradient} flex items-center justify-center`}>
                <stat.icon className="w-4 h-4 text-white" />
              </div>
              {stat.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stat.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default AdminStatsCards;
