export function GatewayBanner() {
  return (
    <div className="premium-banner mb-6 animate-fade-in py-5 relative">
      {/* Glow aura behind text */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        aria-hidden="true"
      >
        <div
          className="w-64 h-16 rounded-full blur-3xl opacity-40"
          style={{
            background:
              "radial-gradient(ellipse, hsl(230 80% 60% / 0.6) 0%, hsl(245 70% 50% / 0.3) 50%, transparent 80%)",
          }}
        />
      </div>
      <h2 className="relative text-center text-4xl font-black tracking-[0.2em] uppercase">
        <span
          className="bg-clip-text text-transparent"
          style={{
            backgroundImage:
              "linear-gradient(135deg, hsl(0 0% 85%), hsl(220 20% 75%), hsl(245 60% 65%), hsl(230 70% 58%))",
            filter: "drop-shadow(0 0 20px hsl(235 80% 65% / 0.4))",
          }}
        >
          Automation Nova AI
        </span>
      </h2>
    </div>
  );
}
