# Add User Name field to "Add New User"

Admin panel မှာ user အသစ်လုပ်တဲ့အခါ **Name** တစ်ကွက် ထပ်ထည့်ပြီး register လုပ်လို့ရအောင် လုပ်ပါမယ်။ Auto running ID (nw / kys), auto password, credits, referrer logic တွေကို လုံးဝ မထိပါဘူး။

## What changes

1. **Add User dialog (Admin > Users)**
   - "ID Prefix" အောက်၊ User ID အပေါ်မှာ **Full Name** input row အသစ် တစ်ခု ထည့်မယ်။
   - Premium/professional style — ရှိပြီးသား Label + Input class တွေအတိုင်း (`h-8 text-xs`, gold accent) တူညီအောင်။
   - Optional field အဖြစ်ထားမယ် (ထည့်မှသာ သိမ်း၊ မထည့်ရင် အရင်အတိုင်း ID နဲ့ပဲ ပြ)။

2. **Create flow**
   - `displayName` ကို `create_user` request ထဲ ထပ်ပါလွှတ်မယ်။
   - Backend မှာ profile update object ထဲ `display_name` ကို ထည့်သိမ်းမယ် (name ရှိမှသာ)။
   - Dialog ပိတ်တဲ့အခါ reset ထဲ name ပါ ထည့်မယ်။

3. **Display**
   - User list နဲ့ credit detail modal တွေက `display_name || ID` ကို ပြပြီးသားမို့ name ထည့်လိုက်ရင် ချက်ချင်း ပေါ်လာမယ် — အဲဒီ code မပြင်ပါ။

## Technical notes

- `src/components/admin/AdminUsersTab.tsx`: `newUser` state ထဲ `name: ""` ထပ်ထည့်၊ dialog ထဲ input row တစ်ခု၊ `handleCreateUser` ထဲ `displayName: newUser.name.trim() || undefined`, reset object update.
- `supabase/functions/admin-actions/index.ts` → `case 'create_user'`: `params.displayName` ကို ဖတ်ပြီး `updateObj.display_name` သတ်မှတ်၊ ပြီးရင် function redeploy.
- မထိမည့်အရာများ: `getNextRunningUserId` (auto running no), password verification/rollback, referral credits, plan/credit expiry logic.