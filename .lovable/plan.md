

# Update Gemini API Keys (Secrets Only)

API key အသစ် ၂ ခုကို existing secrets မှာ update လုပ်ပေးပါမယ်။ Code ဘာမှ မပြင်ပါ။

## What Changes

### Secrets Update Only
- **GEMINI_API_KEY_2** → `AIzaSyC1gOapwyWl02k2YL_H5_mJ1_hO_CwupDQ` (new project key)
- **GEMINI_API_KEY_3** → `AIzaSyD2GQKn96aP3Bh7U2K05VuDaL-Mrm94U2s` (new project key)

### What will NOT be touched
- `gemini-tts/index.ts` — already has multi-key rotation logic, no changes needed
- All other edge functions, client-side code, protected blocks
- Upload, subtitle sync, video/audio sync, admin panel

### Expected Result
- 3 keys from 3 different Google projects = 3 separate quota pools
- 429 rate limit errors will significantly decrease
- Rotation logic already in place will automatically use these new keys

