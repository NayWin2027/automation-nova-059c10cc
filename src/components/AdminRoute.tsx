import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface AdminRouteProps {
  children: React.ReactNode;
}

const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const [status, setStatus] = useState<'loading' | 'admin' | 'denied'>('loading');

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setStatus('denied');
        return;
      }
      const { data } = await supabase.rpc('has_role', {
        _user_id: session.user.id,
        _role: 'admin',
      });
      setStatus(data === true ? 'admin' : 'denied');
    };
    check();
  }, []);

  if (status === 'loading') return null;
  if (status === 'denied') return <Navigate to="/" replace />;
  return <>{children}</>;
};

export default AdminRoute;
