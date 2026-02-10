export function GatewayBanner() {
  return (
    <div className="premium-banner mb-6 animate-fade-in py-4">
      <h2 className="text-center text-lg font-black tracking-[0.2em] uppercase">
        <span className="bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 bg-clip-text text-transparent drop-shadow-[0_0_16px_hsl(45,100%,60%)]">
          Automation
        </span>{" "}
        <span className="bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500 bg-clip-text text-transparent drop-shadow-[0_0_16px_hsl(200,100%,60%)]">
          Nova
        </span>{" "}
        <span className="bg-gradient-to-r from-rose-400 via-pink-500 to-purple-500 bg-clip-text text-transparent drop-shadow-[0_0_18px_hsl(330,100%,60%)]">
          AI
        </span>
      </h2>
    </div>
  );
}
