import { AppLogo } from "./AppLogo";

export function GatewayBanner() {
  return (
    <div className="premium-banner mb-6 animate-fade-in py-5 relative">
      {/* Premium glow aura behind text */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        aria-hidden="true">

        <div
          className="w-72 h-20 rounded-full blur-3xl opacity-40"
          style={{
            background:
            "radial-gradient(ellipse, hsl(230 80% 60% / 0.6) 0%, hsl(245 70% 50% / 0.3) 50%, transparent 80%)"
          }} />

      </div>

      {/* Animated 3D Logo */}
      <div className="flex justify-center mb-2 relative z-10">
        <AppLogo size={72} />
      </div>

      <h2 className="relative text-center text-4xl font-black tracking-[0.12em]">
        <span
          className="bg-clip-text text-transparent text-5xl"
          style={{
            fontFamily: "'Caveat', cursive",
            backgroundImage:
            "linear-gradient(135deg, hsl(0 0% 92%), hsl(220 30% 80%), hsl(245 80% 72%), hsl(200 100% 70%))",
            filter: "drop-shadow(0 0 24px hsl(200 100% 65% / 0.6))",
            textShadow: "0 0 30px hsl(200,100%,70%,0.4)",
            fontSize: "2.5rem",
            lineHeight: "1.2"
          }}>

          Automation Nova AI
        </span>
      </h2>
    </div>);

}