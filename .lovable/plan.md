

## Problem

"EDIT PAGE & COLORS" button မပေါ်တဲ့ အကြောင်းအရင်းက - PlansView.tsx မှာ admin စစ်တဲ့ logic က `localStorage.getItem("tm_auth_session")` (ဟောင်း auth system) ကိုသုံးထားတယ်။ လက်ရှိ app က Supabase auth နဲ့ `has_role` RPC ကိုသုံးထားတာ ဖြစ်လို့ `currentUser?.role === "ADMIN"` က ဘယ်တော့မှ true မဖြစ်ပါဘူး။

## Fix Plan

**File: `src/components/PlansView.tsx`** (PlansView.tsx ကိုသာ ပြင်မည်)

1. **Admin check logic ကို Supabase auth + `has_role` RPC သုံးအောင်ပြောင်းမည်**
   - `localStorage` ကနေ user ယူတာကို ဖျက်မည်
   - `supabase.auth.getSession()` နဲ့ `supabase.rpc('has_role')` ကိုသုံးပြီး admin စစ်မည်
   - TranscribePage.tsx မှာ သုံးထားတဲ့ pattern အတိုင်းလုပ်မည်

2. **ပြောင်းမည့် code အကျဉ်းချုပ်:**
   - `currentUser` state ကို ဖယ်ပြီး `isAdmin` state (boolean) ထည့်မည်
   - `useEffect` ထဲမှာ Supabase session ယူပြီး `has_role` RPC ခေါ်မည်
   - `const isAdmin = currentUser?.role === "ADMIN"` line ကို ဖယ်မည်

### Technical Details

```typescript
// OLD (broken):
const [currentUser, setCurrentUser] = useState<User | null>(null);
useEffect(() => {
  const savedAuth = localStorage.getItem("tm_auth_session");
  if (savedAuth) setCurrentUser(JSON.parse(savedAuth));
  // ...
}, []);
const isAdmin = currentUser?.role === "ADMIN";

// NEW (working):
const [isAdmin, setIsAdmin] = useState(false);
useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) {
      supabase.rpc("has_role", { _user_id: session.user.id, _role: "admin" })
        .then(({ data }) => setIsAdmin(data === true));
    }
  });
  // ... rest of loadSettings unchanged
}, []);
```

**Scope**: PlansView.tsx ကိုသာ ပြင်မည်။ တခြား files/tools/logic ဘာမှ မထိပါ။
