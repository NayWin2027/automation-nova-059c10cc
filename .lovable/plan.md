Plan:

1. `src/pages/RecapVideoNVPage.tsx` ထဲက upload block တစ်နေရာပဲ ပြင်မယ်။
2. `video-recap` ရဲ့ `initUpload` / `uploadChunkBinary` branch ကို upload အဆင့်မှာ မသုံးတော့ဘဲ `get-upload-url` + `upload-chunk` FormData style ကို အမြဲသုံးအောင် ပြန်ထားမယ်။
3. Own API mode ဖြစ်ရင် `apiKey: resolvedOwnKey` ပို့မယ်။ App API mode ဖြစ်ရင် apiKey မပို့ဘဲ backend key fallback ကိုသုံးမယ်။
4. Chunk size `8 * 1024 * 1024`, progress message, `fileUri`, script generation, browser/server rendering, protected blocks တွေကို လုံးဝမထိဘူး။
5. Backend function, database, render-worker, browser rendering logic ဘာမှမပြင်ဘူး။

Technical scope:

```text
Only edit: src/pages/RecapVideoNVPage.tsx lines around upload init/chunk loop
Replace: conditional video-recap upload path
Keep: get-upload-url + upload-chunk path only
```

Approve လုပ်တာနဲ့ ဒီ surgical edit တစ်ခုတည်းလုပ်မယ်။