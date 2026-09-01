import { useState, useEffect, useRef } from "react";
import { AppLogo } from "./AppLogo";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
  size: number;
  life: number;
  maxLife: number;
  type: "spark" | "trail" | "burst";
}

function FireworksCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let particles: Particle[] = [];
    let lastLaunch = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    const W = () => canvas.offsetWidth;
    const H = () => canvas.offsetHeight;

    const launchFirework = () => {
      const cx = W() * (0.15 + Math.random() * 0.7);
      const cy = H() * (0.15 + Math.random() * 0.45);
      const hue = Math.random() * 360;
      const count = 40 + Math.floor(Math.random() * 30);
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
        const speed = 1.5 + Math.random() * 3;
        particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          hue: hue + Math.random() * 60 - 30,
          size: 1.5 + Math.random() * 2,
          life: 1,
          maxLife: 60 + Math.random() * 40,
          type: Math.random() > 0.6 ? "burst" : "spark",
        });
      }
      // Trail particles
      for (let i = 0; i < 8; i++) {
        particles.push({
          x: cx,
          y: H(),
          vx: (Math.random() - 0.5) * 0.5,
          vy: -(H() - cy) / 30 - Math.random(),
          hue,
          size: 2,
          life: 1,
          maxLife: 30,
          type: "trail",
        });
      }
    };

    const animate = (time: number) => {
      ctx.clearRect(0, 0, W(), H());

      if (time - lastLaunch > 600 + Math.random() * 800) {
        launchFirework();
        lastLaunch = time;
      }

      particles = particles.filter((p) => p.life > 0);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.03; // gravity
        p.life -= 1 / p.maxLife;

        const alpha = Math.max(0, p.life);
        if (p.type === "burst") {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * alpha * 2, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${alpha * 0.8})`;
          ctx.shadowColor = `hsla(${p.hue}, 100%, 60%, ${alpha})`;
          ctx.shadowBlur = 12;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (p.type === "trail") {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${p.hue}, 80%, 80%, ${alpha * 0.6})`;
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${p.hue}, 100%, 75%, ${alpha})`;
          ctx.shadowColor = `hsla(${p.hue}, 100%, 65%, ${alpha * 0.7})`;
          ctx.shadowBlur = 8;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      animId = requestAnimationFrame(animate);
    };

    // Launch initial fireworks
    setTimeout(() => launchFirework(), 200);
    setTimeout(() => launchFirework(), 600);
    setTimeout(() => launchFirework(), 1000);

    animId = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }} />;
}

export function WelcomeSplash({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"visible" | "fading">("visible");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("fading"), 6200);
    const t2 = setTimeout(() => onDone(), 7000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        background: "linear-gradient(160deg, hsl(230 30% 4%) 0%, hsl(260 40% 8%) 40%, hsl(220 35% 6%) 100%)",
        opacity: phase === "fading" ? 0 : 1,
        transition: "opacity 0.8s ease-out",
      }}
    >
      {/* Fireworks background */}
      <FireworksCanvas />

      {/* Radial ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, hsl(270 80% 50% / 0.12) 0%, transparent 60%), " +
            "radial-gradient(ellipse at 30% 70%, hsl(200 100% 50% / 0.08) 0%, transparent 50%), " +
            "radial-gradient(ellipse at 70% 60%, hsl(340 80% 50% / 0.08) 0%, transparent 50%)",
        }}
      />

      {/* Content */}
      <div
        className="relative z-10 flex flex-col items-center justify-center px-6 w-full h-full text-center"
        style={{
          animation: "splashFadeUp 1.2s ease-out both",
        }}
      >
        {/* Logo */}
        <div className="mb-4" style={{ filter: "drop-shadow(0 0 30px hsl(200 100% 60% / 0.6))" }}>
          <AppLogo size={80} />
        </div>

        {/* Title - matching GatewayBanner style */}
        <h1 className="mb-6">
          <span
            className="bg-clip-text text-transparent"
            style={{
              fontFamily: "'Caveat', cursive",
              backgroundImage:
                "linear-gradient(135deg, hsl(0 0% 92%), hsl(220 30% 80%), hsl(245 80% 72%), hsl(200 100% 70%))",
              filter: "drop-shadow(0 0 24px hsl(200 100% 65% / 0.6))",
              textShadow: "0 0 30px hsl(200,100%,70%,0.4)",
              fontSize: "2.2rem",
              lineHeight: "1.2",
            }}
          >
            Automation Nova AI
          </span>
        </h1>

        {/* Welcome message */}
        <div
          className="rounded-2xl p-5 mb-4"
          style={{
            background: "hsl(230 30% 10% / 0.7)",
            border: "1px solid hsl(200 100% 60% / 0.15)",
            backdropFilter: "blur(20px)",
            boxShadow: "0 0 40px hsl(200 100% 60% / 0.08), inset 0 1px 0 hsl(0 0% 100% / 0.05)",
            animation: "splashTextIn 1.5s ease-out 0.4s both",
          }}
        >
          <p
            className="text-sm leading-relaxed mb-3"
            style={{
              color: "hsl(200 80% 85%)",
              textShadow: "0 0 12px hsl(200 100% 70% / 0.2)",
            }}
          >
            မဂ်လာပါ...Automation Nova AI မှ ကြိုဆိုပါတယ်ခင်ဗျာ။
          </p>
          <p className="text-xs leading-relaxed mb-3" style={{ color: "hsl(220 20% 75%)" }}>
            📱 Automation Nova Web App အသုံးပြုရန် လိုအပ်ချက်များ 🟣 ဖုန်း (Android) - အနည်းဆုံး Snapdragon7Gen (သို့)
            Dimensity 8000 Series မှစ၍ အဆင်ပြေချောမွေ့ စွာ သုံးနိုင်ပြီး၊ Flagship (Snapdragon 8 Gen / Dimensity 9000
            Series) များဆိုလျှင် အရည်အသွေးမြင့် Recap Video များကို 100% အဆင်ပြေချောမွေ့စွာဖြင့်
            စိတ်ကြိုက်အကောင်းဆုံးလုပ်ဆောင်နိုင်တာကြောင့် အကောင်းဆုံး Result/အကောင်းဆုံးအရည်အသွေးမြင့် Output Recap
            Videos များကို ရရှိနိုင်ပါတယ်။ 🟣 ကွန်ပျူတာ - အနည်းဆုံး Intel Core i5 သို့မဟုတ် Ryzen 5 လိုအပ်ပြီး၊ i7
            သို့မဟုတ် Ryzen 7, i9 or Ryzen 9 ဆိုလျှင်လည်း အရည်အသွေးမြင့် Recap Video များကို 100%
            အဆင်ပြေချောမွေ့စွာဖြင့် စိတ်ကြိုက်အကောင်းဆုံးလုပ်ဆောင်နိုင်တာကြောင့် အကောင်းဆုံး
            Result/အကောင်းဆုံးအရည်အသွေးမြင့် Output Recap Videos များကို ရရှိနိုင်ပါတယ်။ 🟣 ကန့်သတ်ချက် - အထက်ပါ
            Specsထက်နိမ့်သော ဖုန်း/ကွန်ပျူတာများနှင့် Apple Device များတွင် လက်ရှိ အသုံးပြု၍ မရသေးပါ။
            🟣မိမိဖုန်းနဲ့ကွန်ပျူတာများရဲ့ CPU၊ GPU၊ RAM Specifications များကို မသိပါကလည်း Page Messenger or Viber No
            -09967793288 ကနေ အချိန်မရွေးလာရောက်မေးမြန်းနိုင်ပါတယ်။ ။
          </p>
          <p className="text-xs leading-relaxed" style={{ color: "hsl(220 20% 75%)" }}>
            ပိုမိုကောင်းမွန်သော၀န်ဆောင်မှုများကို ပေးအပ်နိုင်ဖို့ ဆက်လက်ကြိုးစားသွားပါမယ်။
          </p>
        </div>

        {/* Admin team */}
        <div
          style={{
            animation: "splashTextIn 1.5s ease-out 0.8s both",
          }}
        >
          <p
            className="text-xs font-semibold tracking-widest uppercase mb-1"
            style={{
              backgroundImage: "linear-gradient(90deg, hsl(45 90% 65%), hsl(35 85% 55%))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 8px hsl(45 90% 55% / 0.4))",
            }}
          >
            Automation Nova AI Admin Team
          </p>
          <p
            className="text-xs"
            style={{
              color: "hsl(200 60% 75%)",
              textShadow: "0 0 10px hsl(200 100% 60% / 0.3)",
            }}
          >
            Ko Ye Swan &nbsp;&nbsp;•&nbsp;&nbsp; Ko Nay Win
          </p>
        </div>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes splashFadeUp {
          0% { opacity: 0; transform: translateY(30px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes splashTextIn {
          0% { opacity: 0; transform: translateY(15px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
