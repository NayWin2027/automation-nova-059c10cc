
# Plan: Fix API Access Control + Remove Sub Gen/Downloader Tools

## ပြဿနာ အကျဉ်းချုပ်

1. **Sub Gen နဲ့ Downloader** - Home page မှ ခေတ္တဖယ်ရှားရန်
2. **Free users App API block** - Video Recap နှင့် အခြား tools (Story, Creator, Novel) များတွင် effect မဖြစ်ပါ

## Root Cause Analysis

VoicePage, TranscribePage, TranslatePage2, ThumbnailPage များတွင် `useApiAccess` hook ကို သုံးပြီး API access ကို စစ်ဆေးသော်လည်း:

- **RecapVideoPage.tsx** - `useApiAccess` hook မသုံးပါ
- **StoryCreatorPage.tsx** - `useApiAccess` hook မသုံးပါ  
- **CreatorPage.tsx** - `useApiAccess` hook မသုံးပါ
- **NovelTransPage.tsx** - `useApiAccess` hook မသုံးပါ

ထိုကြောင့် Free users များ App API ပိတ်ထားသော်လည်း ထို tools များတွင် effect မဖြစ်ပါ။

---

## ပြင်ဆင်ရန် အဆင့်များ

### 1. Index.tsx - Sub Gen နှင့် Downloader ဖယ်ရှားခြင်း

`defaultTools` array မှ `subgen` နှင့် `downloader` ကို ဖယ်ရှားမည်။

### 2. RecapVideoPage.tsx - API Access Control ထည့်သွင်းခြင်း

```typescript
// Add import
import { useApiAccess } from '@/hooks/useApiAccess';

// Add hook usage
const { appApiAllowed, ownApiAllowed, defaultApiMode, isLoading: accessLoading } = useApiAccess();

// Initialize apiType based on access control
useEffect(() => {
  if (!accessLoading) {
    setApiType(defaultApiMode);
  }
}, [accessLoading, defaultApiMode]);

// Update UI to show lock icons and disable buttons when not allowed
```

### 3. StoryCreatorPage.tsx - API Access Control ထည့်သွင်းခြင်း

```typescript
import { useApiAccess } from '@/hooks/useApiAccess';

// Add hook and sync defaultApiMode
const { appApiAllowed, ownApiAllowed, defaultApiMode, isLoading: accessLoading } = useApiAccess();
```

### 4. CreatorPage.tsx - API Access Control ထည့်သွင်းခြင်း

```typescript
import { useApiAccess } from '@/hooks/useApiAccess';

// Add hook and sync defaultApiMode
const { appApiAllowed, ownApiAllowed, defaultApiMode, isLoading: accessLoading } = useApiAccess();
```

### 5. NovelTransPage.tsx - API Access Control ထည့်သွင်းခြင်း

```typescript
import { useApiAccess } from '@/hooks/useApiAccess';

// Add hook and sync defaultApiMode
const { appApiAllowed, ownApiAllowed, defaultApiMode, isLoading: accessLoading } = useApiAccess();
```

---

## Technical Details

### ပြင်ဆင်မည့် Files

| File | ပြင်ဆင်ချက် |
|------|-------------|
| `src/pages/Index.tsx` | `subgen` နှင့် `downloader` tools ဖယ်ရှား |
| `src/pages/RecapVideoPage.tsx` | `useApiAccess` hook ထည့်၊ API switcher UI update |
| `src/pages/StoryCreatorPage.tsx` | `useApiAccess` hook ထည့်၊ lock UI ထည့် |
| `src/pages/CreatorPage.tsx` | `useApiAccess` hook ထည့်၊ lock UI ထည့် |
| `src/pages/NovelTransPage.tsx` | `useApiAccess` hook ထည့်၊ lock UI ထည့် |

### API Switcher UI Pattern (VoicePage ကို Reference)

```tsx
{/* API Switcher */}
<div className="flex bg-white/5 p-1 rounded-[18px] border border-white/10">
  <button 
    onClick={() => appApiAllowed && setApiType('app')} 
    disabled={!appApiAllowed}
    className={`... ${!appApiAllowed ? 'opacity-40 cursor-not-allowed' : ''}`}
  >
    {!appApiAllowed && <Lock className="w-3 h-3" />}
    APP API
  </button>
  <button 
    onClick={() => ownApiAllowed && setApiType('own')} 
    disabled={!ownApiAllowed}
    className={`... ${!ownApiAllowed ? 'opacity-40 cursor-not-allowed' : ''}`}
  >
    {!ownApiAllowed && <Lock className="w-3 h-3" />}
    OWN API
  </button>
</div>
```

---

## မထိရန် Logic

- Core tool functionality (video processing, AI generation) မထိပါ
- Edge functions မထိပါ
- Database RPC မထိပါ
- ရှိပြီးသား VoicePage pattern အတိုင်း copy ပြီး adapt လုပ်မည်

---

## ရလဒ်

1. Sub Gen နှင့် Downloader tools - Home page မှ ပျောက်သွားမည်
2. Free users App API block - Video Recap, Story, Creator, Novel tools အားလုံးတွင် effect ဖြစ်မည်
3. Lock icon နှင့် 40% opacity ဖြင့် ပိတ်ထားသော API mode ကို ပြသမည်
4. Default API mode - allowed mode ကို အလိုအလျောက် select လုပ်မည်
