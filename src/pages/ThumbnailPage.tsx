
import React, { useState, useRef, useEffect } from 'react';
import { generateThumbnail } from './geminiService';
import { ViewType } from './types';

type Position = 'UPON LEFT' | 'UPON RIGHT' | 'BUTTON LEFT' | 'BUTTON RIGHT' | 'CENTER';
type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
type FontEffect = 'CLASSIC' | 'STICKER_POP' | '3D_OFFSET' | 'CHROME_GLOW' | 'NEON_STROKE' | 'DARK_PLATE' | 'HOLLOW';

interface TextStyle {
  id: string;
  label: string;
  fill: string;
  stroke: string;
  glow: string;
  secondary?: string;
}

const PREMIUM_COLORS: TextStyle[] = [
  { id: 'GOLD', label: 'LUXURY GOLD', fill: '#FFD700', stroke: '#4a3701', glow: 'rgba(251, 191, 36, 0.8)', secondary: '#f59e0b' },
  { id: 'CYAN', label: 'ELECTRIC CYAN', fill: '#00FFFF', stroke: '#003333', glow: 'rgba(0, 255, 255, 0.9)', secondary: '#0891b2' },
  { id: 'RUBY', label: 'VIVID RUBY', fill: '#FF003F', stroke: '#33000d', glow: 'rgba(255, 0, 63, 0.7)', secondary: '#be123c' },
  { id: 'LIME', label: 'TOXIC LIME', fill: '#32CD32', stroke: '#0a290a', glow: 'rgba(50, 205, 50, 0.8)', secondary: '#15803d' },
  { id: 'PURPLE', label: 'ROYAL PURPLE', fill: '#BF40BF', stroke: '#2e0a2e', glow: 'rgba(191, 64, 191, 0.8)', secondary: '#7e22ce' },
  { id: 'PINK', label: 'NEON PINK', fill: '#FF1493', stroke: '#33001a', glow: 'rgba(255, 20, 147, 1)', secondary: '#db2777' },
  { id: 'EMERALD', label: 'DEEP EMERALD', fill: '#50C878', stroke: '#064e3b', glow: 'rgba(16, 185, 129, 0.6)', secondary: '#047857' },
  { id: 'ORANGE', label: 'PUNCHY ORANGE', fill: '#FF4500', stroke: '#451a03', glow: 'rgba(255, 69, 0, 0.7)', secondary: '#ea580c' },
  { id: 'WHITE', label: 'CLEAN WHITE', fill: '#FFFFFF', stroke: '#000000', glow: 'rgba(255, 255, 255, 0.5)', secondary: '#f8fafc' },
  { id: 'LEMON', label: 'BRIGHT LEMON', fill: '#FFF700', stroke: '#4a4a00', glow: 'rgba(255, 247, 0, 0.8)', secondary: '#ca8a04' },
  { id: 'VIOLET', label: 'NEON VIOLET', fill: '#8A2BE2', stroke: '#1a0033', glow: 'rgba(138, 43, 226, 0.8)', secondary: '#6d28d9' },
  { id: 'MINT', label: 'MINT FRESH', fill: '#a7f3d0', stroke: '#064e3b', glow: 'rgba(167, 243, 208, 0.7)', secondary: '#059669' },
  { id: 'STEEL', label: 'STEEL GREY', fill: '#71717a', stroke: '#18181b', glow: 'rgba(113, 113, 122, 0.4)', secondary: '#3f3f46' },
  { id: 'CREAM', label: 'WARM CREAM', fill: '#fef3c7', stroke: '#78350f', glow: 'rgba(254, 243, 199, 0.6)', secondary: '#d97706' },
  { id: 'ICE', label: 'ICE BLUE', fill: '#e0f2fe', stroke: '#0c4a6e', glow: 'rgba(186, 230, 253, 0.8)', secondary: '#0284c7' },
  { id: 'ROSE', label: 'SOFT ROSE', fill: '#ffe4e6', stroke: '#881337', glow: 'rgba(251, 113, 133, 0.5)', secondary: '#e11d48' },
  { id: 'BLACK', label: 'VOID BLACK', fill: '#000000', stroke: '#FFFFFF', glow: 'rgba(0,0,0,0.5)', secondary: '#1e293b' },
  { id: 'CRIMSON', label: 'DARK CRIMSON', fill: '#800000', stroke: '#000000', glow: 'rgba(128, 0, 0, 0.6)', secondary: '#450a0a' },
  { id: 'TEAL', label: 'AQUA TEAL', fill: '#008080', stroke: '#002020', glow: 'rgba(0, 128, 128, 0.7)', secondary: '#0d9488' },
  { id: 'PLUM', label: 'PLUM DEEP', fill: '#673147', stroke: '#2e0a2e', glow: 'rgba(103, 49, 71, 0.6)', secondary: '#4c1d37' }
];

const FONTS = [
  { id: 'Anton', label: 'ANTON' },
  { id: 'Bebas Neue', label: 'BEBAS' },
  { id: 'Montserrat', label: 'MONTSERRAT' },
  { id: 'Archivo Black', label: 'ARCHIVO (TAUNGGYI)' },
  { id: 'Kanit', label: 'KANIT (NGU WAH)' },
  { id: 'Padauk', label: 'PADAUK (PAUK TAUK)' },
  { id: 'Righteous', label: 'RIGHTEOUS' },
  { id: 'Russo One', label: 'RUSSO' },
  { id: 'Passion One', label: 'PASSION' },
  { id: 'Rubik Glitch', label: 'GLITCH (GUTCH)' },
  { id: 'Pattaya', label: 'PATTAYA (SCRIPT)' },
  { id: 'Impact', label: 'IMPACT' },
  { id: 'Myanmar Sans Pro', label: 'MYANMAR DISPLAY' },
  { id: 'Tahoma', label: 'TAHOMA' },
  { id: 'Arial Black', label: 'ARIAL BLACK' }
];

const PositionBtn: React.FC<{ pos: Position; current: Position; set: (p: Position) => void; color: string }> = ({ pos, current, set, color }) => (
  <button
    onClick={() => set(pos)}
    className={`py-1.5 px-1 rounded-lg text-[6px] font-black uppercase border transition-all ${current === pos ? `bg-${color}-600 text-white border-transparent shadow-lg` : 'bg-slate-90