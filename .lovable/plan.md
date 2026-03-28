

## Problem
Passwords are stored as one-way hashes — impossible to retrieve. You need to verify your user list is correct by cross-checking passwords.

## Solution
Create a `user_passwords` table that stores the plain password when admin creates a user. Only Master Admins can view it. Display the password next to each user in the Admin Users tab.

### Step 1: Database Migration
Create `user_passwords` table with strict admin-only RLS:
```sql
CREATE TABLE public.user_passwords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  password_plain text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.user_passwords ENABLE ROW LEVEL SECURITY;

-- Only admins can read
CREATE POLICY "Admins can view passwords"
  ON public.user_passwords FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

-- Only via service role (edge function) can insert
CREATE POLICY "Service role insert only"
  ON public.user_passwords FOR INSERT
  WITH CHECK (false);
```

### Step 2: Edge Function — `admin-actions/index.ts` (surgical edit)
In the `create_user` case (around line 127-135), after creating the user, also insert the plain password into `user_passwords`:
```typescript
await supabaseAdmin
  .from('user_passwords')
  .upsert({ user_id: newUser.user.id, password_plain: password });
```

Also in the `reset_password` case, update the stored password.

In the `get_profiles` case, join `user_passwords` to include the password in the response.

### Step 3: AdminUsersTab.tsx (surgical edit)
- Add a "PW" column to the user table grid (change `grid-cols-6` to `grid-cols-7`)
- Show the password (masked by default, click to reveal) next to each user
- Only show for Master Admins (`isMasterAdmin`)

### What will NOT be touched
- No changes to video/audio sync, upload logic, protected blocks
- No changes to auth flow, credit logic, or any tool pages
- Only 3 files: migration SQL, edge function, AdminUsersTab

### Security Note
- The `user_passwords` table uses RLS so only admins can SELECT
- INSERT is blocked at RLS level — only service role (edge function) can write
- Sub Admins will not see the PW column (controlled by `isMasterAdmin` check in UI)
- Existing users created before this change won't have stored passwords (will show "—")

