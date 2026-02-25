import { useEffect, useRef } from "react";

export function AppLogo({ size = 64, paused = false }: { size?: number; paused?: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const animIdRef = useRef<number>(0);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (paused) {
      // Cancel any running animation when paused
      if (animIdRef.current) cancelAnimationFrame(animIdRef.current);
      animIdRef.current = 0;
      return;
    }

    let frame = 0;

    const animate = () => {
      frame += 0.5;
      const hue1 = (frame * 1.2) % 360;
      const hue2 = (hue1 + 120) % 360;
      const hue3 = (hue1 + 240) % 360;

      const neonStops = svg.querySelectorAll(".neon-stop");
      if (neonStops[0]) (neonStops[0] as SVGStopElement).style.stopColor = `hsl(${hue1}, 100%, 60%)`;
      if (neonStops[1]) (neonStops[1] as SVGStopElement).style.stopColor = `hsl(${hue2}, 100%, 60%)`;

      const glowPath = svg.querySelector(".glow-path") as SVGPathElement | null;
      if (glowPath) glowPath.style.stroke = `hsl(${hue3}, 100%, 65%)`;

      const sparkles = svg.querySelectorAll(".sparkle");
      sparkles.forEach((s, i) => {
        const opacity = 0.4 + 0.6 * Math.sin((frame + i * 40) * 0.05);
        (s as SVGElement).style.opacity = String(opacity);
      });

      animIdRef.current = requestAnimationFrame(animate);
    };

    animIdRef.current = requestAnimationFrame(animate);
    return () => {
      if (animIdRef.current) cancelAnimationFrame(animIdRef.current);
    };
  }, [paused]);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className="drop-shadow-[0_0_20px_hsl(200,100%,60%,0.5)]"
    >
      <defs>
        <radialGradient id="logoBgGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1a0b2e" />
          <stop offset="100%" stopColor="#050505" />
        </radialGradient>

        <linearGradient id="logoChromeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="20%" stopColor="#a8b2bd" />
          <stop offset="40%" stopColor="#e8eff5" />
          <stop offset="60%" stopColor="#788491" />
          <stop offset="80%" stopColor="#cbd5e0" />
          <stop offset="100%" stopColor="#556270" />
        </linearGradient>

        <linearGradient id="logoNeonGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop className="neon-stop" offset="0%" stopColor="#ff00ff" stopOpacity="0.6" />
          <stop className="neon-stop" offset="100%" stopColor="#00ffff" stopOpacity="0.6" />
        </linearGradient>

        <filter id="logoGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        <filter id="logoSparkleBlur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
        </filter>
      </defs>

      {/* Background */}
      <rect width="512" height="512" rx="80" fill="url(#logoBgGrad)" />

      {/* Glassmorphism */}
      <path
        d="M100 150 Q256 100 412 150 L412 362 Q256 412 100 362 Z"
        fill="url(#logoNeonGrad)"
        opacity="0.1"
        filter="url(#logoGlow)"
      />

      {/* Main Monogram "AN" */}
      <g transform="translate(40, 40) skewX(-10)">
        {/* Shadow/Glow Base */}
        <path
          className="glow-path"
          d="M60 320 C60 320 120 100 180 120 C240 140 150 350 280 320 C350 300 380 180 420 180 M280 320 C320 320 400 250 440 100"
          stroke="#00ffff"
          strokeWidth="28"
          fill="none"
          strokeLinecap="round"
          filter="url(#logoGlow)"
          opacity="0.3"
        />

        {/* Main Chromium Body */}
        <path
          d="M60 320 C60 320 120 100 180 120 C240 140 150 350 280 320 C350 300 380 180 420 180 M280 320 C320 320 400 250 440 100"
          stroke="url(#logoChromeGrad)"
          strokeWidth="24"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Highlight Layer */}
        <path
          d="M65 315 C65 315 125 105 175 125 C225 145 155 345 275 315 C345 295 375 185 415 185"
          stroke="white"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
          opacity="0.4"
        />

        {/* Specular Highlights */}
        <path d="M140 125 Q160 115 180 130" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M280 310 Q310 305 330 280" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M410 110 Q420 100 435 110" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" />
      </g>

      {/* Diamond Dust Sparkles */}
      <g fill="white">
        <circle className="sparkle" cx="180" cy="140" r="2" filter="url(#logoSparkleBlur)" />
        <circle className="sparkle" cx="210" cy="180" r="1.5" />
        <circle className="sparkle" cx="320" cy="340" r="2" filter="url(#logoSparkleBlur)" />
        <circle className="sparkle" cx="350" cy="310" r="1" />
        <circle className="sparkle" cx="440" cy="130" r="2.5" filter="url(#logoSparkleBlur)" />
        <circle className="sparkle" cx="100" cy="340" r="1.5" />

        {/* Cross Sparkles */}
        <g className="sparkle" transform="translate(420, 160)">
          <rect x="-1" y="-6" width="2" height="12" rx="1" />
          <rect x="-6" y="-1" width="12" height="2" rx="1" />
        </g>
        <g className="sparkle" transform="translate(160, 120) scale(0.7)">
          <rect x="-1" y="-6" width="2" height="12" rx="1" />
          <rect x="-6" y="-1" width="12" height="2" rx="1" />
        </g>
      </g>
    </svg>
  );
}
