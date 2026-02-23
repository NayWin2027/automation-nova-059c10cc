import React from "react";
import { Users, Crown, Ban, Coins, Sparkles, Shield } from "lucide-react";

interface Stats {
  totalUsers: number;
  totalAdmins: number;
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
    iconBg: "icon-gradient-cyan"
  },
  {
    title: "Total Admin",
    value: stats?.totalAdmins || 0,
    icon: Shield,
    iconBg: "bg-gradient-to-br from-amber-500 to-orange-600"
  },
  {
    title: "Free Plan",
    value: stats?.freeUsers || 0,
    icon: Users,
    iconBg: "bg-muted"
  },
  {
    title: "Pro Plan",
    value: stats?.proUsers || 0,
    icon: Crown,
    iconBg: "icon-gradient-gold"
  },
  {
    title: "Premium",
    value: stats?.premiumUsers || 0,
    icon: Sparkles,
    iconBg: "bg-gradient-to-br from-purple-500 to-pink-600"
  },
  {
    title: "Banned",
    value: stats?.bannedUsers || 0,
    icon: Ban,
    iconBg: "bg-gradient-to-br from-red-600 to-rose-700"
  }];


  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
      {statCards.map((stat) =>
      <div
        key={stat.title}
        className="stat-luxury rounded-xl p-3">

          <div className="flex items-center gap-2 mb-2">
            <div className={`w-6 h-6 rounded-lg ${stat.iconBg} flex items-center justify-center`}>
              <stat.icon className="w-3 h-3 text-foreground" />
            </div>
            <span className="font-medium uppercase tracking-wider text-sm text-neon-cyan">
              {stat.title}
            </span>
          </div>
          <p className="text-xl font-bold text-foreground">{stat.value}</p>
        </div>
      )}
    </div>);

};

export default AdminStatsCards;