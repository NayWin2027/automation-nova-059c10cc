import React from "react";
import PlansView from "@/components/PlansView";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const PlansPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> နောက်သို့
        </Button>
        <PlansView />
      </div>
    </div>
  );
};

export default PlansPage;
