import React from "react";
import { Tool } from "./types";

export const TOOLS: Tool[] = [
  {
    id: "video_recap",
    name: "Video Recap",
    nameMy: "Video Recap",
    description: "AI-powered transformative video analysis.",
    descriptionMy: "ဗီဒီယို Recap နှင့် အချက်အလက်ဖော်ပြရန်။",
    icon: "video",
    jewelClass: "jewel-cyan",
    pro: true,
  },
  {
    id: "transcribe",
    name: "Transcribe",
    nameMy: "Transcribe",
    description: "Audio to word-for-word transcript.",
    descriptionMy: "အသံဖိုင်မှ စာသားပြောင်းရန်။",
    icon: "mic",
    jewelClass: "jewel-sapphire",
    pro: true,
  },
  {
    id: "story",
    name: "Story Creator",
    nameMy: "Story Creator",
    description: "Epic 300k+ char custom stories.",
    descriptionMy: "ဇာတ်လမ်းရှည်များ ဖန်တီးရန်။",
    icon: "book",
    jewelClass: "jewel-amethyst",
    pro: true,
  },
  {
    id: "thumbnail",
    name: "Thumbnail",
    nameMy: "Thumbnail",
    description: "AI thumbnails with text overlay.",
    descriptionMy: "AI Thumbnail ပုံဖော်ရန်။",
    icon: "image",
    jewelClass: "jewel-gold",
    pro: true,
  },
  {
    id: "translate",
    name: "Translate",
    nameMy: "Translate",
    description: "Multi-language content translation.",
    descriptionMy: "ဘာသာစကားမျိုးစုံ ပြန်ရန်။",
    icon: "languages",
    jewelClass: "jewel-cyan",
    pro: true,
  },
  {
    id: "srt_sub",
    name: "SRT Sub",
    nameMy: "SRT Sub",
    description: "Translate SRT files to Burmese.",
    descriptionMy: "SRT ဖိုင်များကို ဘာသာပြန်ရန်။",
    icon: "file-text",
    jewelClass: "jewel-ruby",
    pro: true,
  },
  {
    id: "novel_trans",
    name: "Novel Trans",
    nameMy: "Novel Trans",
    description: "AI Novel & Story Translation.",
    descriptionMy: "ဝတ္ထုရှည်များ ဘာသာပြန်ရန်။",
    icon: "book-open",
    jewelClass: "jewel-diamond",
    pro: true,
  },
  {
    id: "aivoice",
    name: "AI Voice",
    nameMy: "AI Voice",
    description: "Turn scripts into human voices.",
    descriptionMy: "စာသားမှ အသံထွက်ရန်။",
    icon: "volume-2",
    jewelClass: "jewel-ruby",
    pro: true,
  },
  {
    id: "subgen",
    name: "Sub Gen",
    nameMy: "Sub Gen",
    description: "Create perfectly timed SRT files.",
    descriptionMy: "စာတန်းထိုး ဖန်တီးရန်။",
    icon: "message-square",
    jewelClass: "jewel-cyan",
    pro: true,
  },
  {
    id: "creator",
    name: "Creator",
    nameMy: "Creator",
    description: "Generate viral video scripts.",
    descriptionMy: "ဗိုင်းရပ်ဗီဒီယို စခရစ်များ ဖန်တီးရန်။",
    icon: "edit",
    jewelClass: "jewel-gold",
    pro: true,
  },
  {
    id: "downloader",
    name: "Downloader",
    nameMy: "Downloader",
    description: "Download HD TikTok videos.",
    descriptionMy: "TikTok ဗီဒီယိုများ ဒေါင်းလုဒ်ဆွဲရန်။",
    icon: "download",
    jewelClass: "jewel-sapphire",
    pro: true,
  },
];

export const ICONS: Record<string, React.ReactNode> = {
  video: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m22 8-6 4 6 4V8Z" />
      <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
    </svg>
  ),
  mic: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  ),
  book: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    </svg>
  ),
  "file-text": (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  "book-open": (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
  image: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  ),
  languages: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </svg>
  ),
  "volume-2": (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  ),
  "message-square": (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  edit: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  download: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  ),
  "chevron-right": (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  ),
  lock: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="inline ml-1"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
};
