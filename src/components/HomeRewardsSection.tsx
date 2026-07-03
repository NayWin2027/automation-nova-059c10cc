import React from "react";
import RewardsCard from "./RewardsCard";
import MyRecapsCard from "./MyRecapsCard";
import { Sparkles } from "lucide-react";

const HomeRewardsSection: React.FC = () => {
  return (
    <section className="mb-4">
      <div className="flex items-center gap-1.5 mb-2 px-0.5">
        <Sparkles className="w-3.5 h-3.5 text-gold" />
        <h2 className="text-xs font-bold tracking-wide text-gold uppercase">
          Your Rewards & Recaps
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <RewardsCard />
        <MyRecapsCard />
      </div>
    </section>
  );
};

export default HomeRewardsSection;