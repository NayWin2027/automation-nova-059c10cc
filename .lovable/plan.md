

## Plan: Admin Dashboard — Active/Non-Active User Lists + Message Box

### Summary
Admin Dashboard ထဲမှာ feature ၃ ခု ထပ်ထည့်မယ်:
1. **Most Active Users** — `user_tool_usage` data အရ usage အများဆုံး user list (top-down)
2. **Non-Active Users** — usage record မရှိတဲ့ / usage နည်းဆုံး users list
3. **Message Box** — admin က user တစ်ယောက်ချင်းစီကို reminder/guideline/news message ပို့လို့ရတဲ့ notification system

### Database Changes

**New table: `admin_notifications`**
```sql
CREATE TABLE public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'general',  -- 'reminder', 'guideline', 'news'
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage notifications"
  ON public.admin_notifications FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
  ON public.admin_notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own (mark as read)
CREATE POLICY "Users can update own notifications"
  ON public.admin_notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Frontend Changes

**New file: `src/components/admin/AdminUserInsightsTab.tsx`**
- Two sections side by side (or stacked on mobile):
  - **Most Active Users** — query `user_tool_usage` grouped by `user_id`, sum `usage_count` across all dates, sorted descending. Show rank, user name, total usage count, last active date
  - **Non-Active Users** — profiles that have NO records in `user_tool_usage`, or lowest usage. Show user name, plan, joined date
- Each user row has a "Send Message" button that opens a message dialog

**New file: `src/components/admin/AdminMessageDialog.tsx`**
- Dialog with:
  - Message type selector (Reminder / Guideline / News)
  - Title input
  - Message textarea
  - Send button
- Inserts into `admin_notifications` table
- Premium luxury styling matching existing admin UI

**Modified: `src/pages/AdminDashboardPage.tsx`** (surgical — only add new tab)
- Add a 5th tab "Insights" with a `TrendingUp` icon
- TabsList grid changes from `grid-cols-4` to `grid-cols-5`
- Add `<TabsContent value="insights"><AdminUserInsightsTab /></TabsContent>`

**Optional (user-side notification display):**
- A small notification bell on the main app that queries `admin_notifications` for unread messages and shows them in a popover

### Files NOT touched
- RecapVideoNVPage.tsx (protected blocks)
- Video/audio sync code
- Upload/subtitle sync
- Edge functions (gemini-tts, etc.)
- config.toml, client.ts, types.ts
- Existing AdminUsersTab.tsx (no modifications)
- Existing AdminDailyUsageTab.tsx (no modifications)

### Technical Details
- Active users data: `SELECT user_id, SUM(usage_count) as total FROM user_tool_usage GROUP BY user_id ORDER BY total DESC`
- Non-active: LEFT JOIN profiles with user_tool_usage, WHERE usage is NULL or minimal
- Message insertion: direct `supabase.from('admin_notifications').insert(...)` with admin's `auth.uid()` as sender_id

