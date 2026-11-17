import { useEffect } from 'react';
import { toast } from '@/hooks/use-toast';

// Wrong device clock makes login tokens look expired instantly, causing a refresh storm
// and a login loop. Compare with server time and warn the user once per session.
let checked = false;
export function useClockSkewWarning() {
  useEffect(() => {
    if (checked) return;
    checked = true;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`;
    fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } })
      .then((res) => {
        const d = res.headers.get('date');
        if (!d) return;
        const skewMin = Math.abs(Date.now() - new Date(d).getTime()) / 60000;
        if (skewMin > 5) {
          toast({
            title: '⏰ ဖုန်းရဲ့ အချိန်/ရက်စွဲ မှားနေပါတယ်',
            description: 'Setting → Date & Time → "Automatic" ကို ဖွင့်ပြီး ပြန်ဝင်ပေးပါ။ မဟုတ်ရင် Login ခဏခဏ ပြန်တောင်းပါလိမ့်မယ်။',
            variant: 'destructive',
            duration: 15000,
          });
        }
      })
      .catch(() => {});
  }, []);
}
