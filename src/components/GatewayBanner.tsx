export function GatewayBanner() {
  return (
    <div className="premium-banner mb-6 animate-fade-in py-5">
      <h2 className="text-center text-3xl font-black tracking-[0.25em] uppercase">
        <span
          className="bg-clip-text text-transparent"
          style={{
            backgroundImage:
              "linear-gradient(135deg, hsl(45 90% 60%), hsl(38 100% 50%), hsl(30 90% 45%))",
            filter: "drop-shadow(0 0 18px hsl(45 100% 60% / 0.5))",
          }}
        >
          Automation
        </span>{" "}
        <span
          className="bg-clip-text text-transparent"
          style={{
            backgroundImage:
              "linear-gradient(135deg, hsl(245 72% 58%), hsl(220 80% 55%), hsl(190 90% 50%))",
            filter: "drop-shadow(0 0 22px hsl(230 90% 65% / 0.6))",
          }}
        >
          Nova
        </span>{" "}
        <span
          className="bg-clip-text text-transparent"
          style={{
            backgroundImage:
              "linear-gradient(135deg, hsl(190 90% 50%), hsl(200 95% 55%), hsl(245 72% 58%))",
            filter: "drop-shadow(0 0 22px hsl(200 95% 60% / 0.5))",
          }}
        >
          AI
        </span>
      </h2>
    </div>
  );
}
