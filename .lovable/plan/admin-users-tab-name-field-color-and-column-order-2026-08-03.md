# Admin Users Tab: Name field color and column order

Admin > Users tab မှာ နာမည် input က မမြင်ရအောင် ဖြစ်နေတဲ့ အတွက် အဖြူရောင်သွင်းပြီး၊ user list က ID/Name စီရင်ပုံကို ပြန်ချိန်ညှိပေးမယ်။

## What changes

1. **Add User dialog — Full Name input text color**
   - `AdminUsersTab.tsx` ထဲက Name input `className` မှာ `text-white` (သို့မဟုတ် theme-consistent foreground class) ထည့်ပေးမယ်။
   - placeholder နှင့် entered text နှစ်ခုလုံး အဖြူရောင်မှာ ဖတ်လို့ရအောင်။

2. **User list column — ID on top, Name below**
   - လက်ရှိ user list ရဲ့ ပထမကOLUMN (name cell) မှာ name က အပေါ်မှာ၊ ID (nw0209 စတဲ့ internal user ID) က အောက်မှာ ပြနေတယ်။
   - အဲဒါကို ပြောင်းပြီး ID က အပေါ်မှာ၊ Name က အောက်မှာ ပြမယ်။
   - Name မရှိရင် အရင်လိုပဲ ID တစ်ခုတည်းပြမယ်။

## Technical notes

- `src/components/admin/AdminUsersTab.tsx`:
  - Full Name input: `className="h-8 text-xs bg-secondary/30 border-border/30 mb-3"` → `text-white` (သို့မဟုတ် `text-foreground`) ပေါင်းထည့်။
  - User list cell (lines ~570–588): ပထမ `<p>` မှာ `profile.display_name || getUserDisplayId(profile.email)` ပြပြီး၊ ဒုတိယ `<p>` မှာ ID ပြထားတာ။ ဒီနှစ်ခုကို အစီအစဉ် ပြောင်း။ ပထမ `<p>` မှာ ID၊ ဒုတိယ `<p>` မှာ name (name ရှိမှ) ပြမယ်။

## Out of scope

- Auto running ID, password generation, plan/credit logic, referral logic, admin roles, or any other AdminUsersTab behavior — unchanged.
