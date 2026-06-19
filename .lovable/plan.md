## Goal
Google Compute Engine VM ပေါ်မှာ render-worker server ကို external access ရအောင် ၃ ချက်တည်းကို surgical fix လုပ်မယ်။ တခြားဘာ logic မှ မထိ။

## Files to modify
**`render-worker/server.js`** — ၃ နေရာတည်း ပြောင်းမယ်

### Change 1 — PORT default to 5000
```js
const PORT = process.env.PORT || 8080;
```
→
```js
const PORT = process.env.PORT || 5000;
```

### Change 2 — CORS for all origins
`app.use(express.json(...))` အောက်မှာ minimal CORS middleware ထည့်မယ် (extra npm dep မလို):
```js
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, X-Api-Secret, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
```

### Change 3 — Bind explicitly to 0.0.0.0
```js
app.listen(PORT, () => console.log(`Worker listening on ${PORT}`));
```
→
```js
app.listen(PORT, "0.0.0.0", () => console.log(`Worker listening on 0.0.0.0:${PORT}`));
```

## Untouched (protected)
- `/render-segment`, `/render`, `/status/:jobId` logic
- `requireSecret`, ffmpeg pipeline, GCS upload, parallel batch orchestration
- Frontend, browser-rendering code, RecapVideoNVPage protected blocks — **ဘာမှ မထိ**
- `package.json` — dependency အသစ် မထည့်

## GitHub push
Lovable မှာ GitHub two-way sync ဖွင့်ထားရင် save လုပ်ပြီးတာနဲ့ repo ကို auto-push ဖြစ်တယ်။ Lovable က manual `git push` မလုပ်နိုင်ဘူး — sync က handle လုပ်တယ်။ Sync မဖွင့်ရသေးရင် Plus (+) → GitHub → Connect project ကနေ ချိတ်ပေးပါ။

## Note
Compute Engine VM ရဲ့ **firewall rule** မှာ TCP port 5000 ကို allow ထားဖို့ လိုတယ် (VPC → Firewall rules → `tcp:5000`, source `0.0.0.0/0` သို့မဟုတ် သင်ဖွင့်ချင်တဲ့ range)။ ဒါက code မဟုတ်ဘဲ GCP console က setting။
