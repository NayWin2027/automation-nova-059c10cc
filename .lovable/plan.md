# Story Mode AV Sync — Exact Segment Lock (Surgical)

## စစ်ဆေးတွေ့ရှိချက် (code ထဲက အတည်ပြုပြီး)

`src/pages/RecapVideoNVPage.tsx` render loop ထဲမှာ တိကျမှုကို ဖျက်နေတဲ့ ၃ ချက် တွေ့တယ်။

1. **Proportional re-scale override** — segment တစ်ခုစီအတွက် exact `vStart/vEnd` ရှိပါလျက်၊ `_needsScale` က "last segment vStart < source duration ရဲ့ ၅၅%" ဆိုတာနဲ့ video position ကို audio percentage နဲ့ ပြန်တွက်ပစ်တယ် (`(audioTs.start / audioDur) * videoDur`)။ ၅ မိနစ် source နဲ့ Story mode မှာ ဒီ condition က မကြာခဏ မှားပြီး ဖမ်းမိတယ် — ဒါကြောင့် TTS က ဇာတ်လမ်းထဲရောက်နေချိန် video က မသက်ဆိုင်တဲ့ scene ပြနေတာ။
2. **`seekPendingRef` watchdog မရှိ** — hook phase seek နဲ့ segment hard-cut seek နှစ်ခုလုံးက `seekPendingRef = true` ထားပြီး `seeked` event ကိုပဲ စောင့်တယ်။ `seeked` မလာရင် (decode stall) နောက် segment cut အားလုံး `!seekPendingRef.current` guard ကြောင့် ကျော်သွားပြီး video က hook scene မှာပဲ ကြာကြာ ကျန်နေတယ်။ hook phase ကုန်တဲ့အခါ flag ကို force-clear လုပ်တဲ့ code မရှိဘူး။
3. **Hook clock နှစ်မျိုး မတူ** — hook overlay က wall clock (`performance.now()`) 4s၊ hook video override က audio clock 4s။ recorder start နဲ့ audio start ကြားက delay ရှိရင် နှစ်ခု လွဲပြီး hook scene က audio ရှေ့ရောက်နေတယ်။

## လုပ်မယ့် Surgical Fix (`RecapVideoNVPage.tsx` တစ်ဖိုင်တည်း)

1. **Exact segment lock** — `_needsScale` heuristic ကို ဖယ်ပြီး segment ရဲ့ တကယ့် `vStart` / `vEnd` ကိုသာ သုံးမယ်။ Script timecode တွေ တကယ် invalid ဖြစ်တဲ့အခါမှသာ (segment အားလုံး vStart = 0 သို့မဟုတ် တိုးမလာတဲ့အခါ) proportional fallback ဝင်မယ်။ ဒါဆို TTS segment n ↔ source scene n ကွက်တိ ဖြစ်မယ်။
2. **Seek watchdog** — `seekPendingRef` ကို 600ms အတွင်း `seeked` မလာရင် auto-clear လုပ်မယ် (timeout ref တစ်ခု၊ `seeked` လာရင် clear)။ hook phase ကနေ ထွက်တာနဲ့လည်း `seekPendingRef = false` force-reset လုပ်မယ်။ ဒါက hook scene ၂၀ စက္ကန့် ကျန်နေတာကို ရပ်စေမယ်။
3. **Hook clock ညှိ** — hook overlay ကို audio clock (`audioRef.current.currentTime`) နဲ့ တွက်ပြီး video hook override နဲ့ တစ်ထပ်တည်း ကုန်စေမယ် (၄ စက္ကန့် တန်ဖိုး မပြောင်း)။

## လုံးဝ မထိတဲ့ အပိုင်း

`AV-SYNC-9000-SMOOTH-v4` · `RECORD-PIPELINE-AUTO-v1` · `VOICE-GEN-PIPELINE-v2` · `AUTO-PIPELINE-v2` · hard-cut seek algorithm ကိုယ်တိုင် · output resolution/codec · hook UI ဒီဇိုင်း · script generator (70% length) · TTS function · subtitle style · credits / upload logic။ Mode သီးသန့် logic အသစ် မထည့်ပါ — fix က mode ၃ ခုလုံးအတွက် တူညီစွာ အလုပ်လုပ်မယ်။

## စစ်ဆေးခြင်း

- Type/build check။
- Story mode render တစ်ခုမှာ segment cut တိုင်း seek clear ဖြစ်/မဖြစ် log နဲ့ စစ်မယ်။
- Hook က ၄ စက္ကန့်မှာ ကုန်ပြီး segment 0 ကို ချက်ချင်း cut ဖြစ်ကြောင်း စစ်မယ်။