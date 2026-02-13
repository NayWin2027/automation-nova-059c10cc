import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Coins, Calendar, Hash, Smartphone, Globe, Shield } from 'lucide-react';

interface DeviceInfo {
  id: string;
  device_fingerprint: string;
  device_info: Record<string, any> | null;
  last_used_at: string;
  created_at: string;
}

const AccountInfoCard: React.FC = () => {
  const { user, profile, isAuthenticated } = useAuth();
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [ipAddress, setIpAddress] = useState<string | null>(null);
  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      // Fetch profile created_at
      const { data: profileData } = await supabase.
      from('profiles').
      select('created_at').
      eq('user_id', user.id).
      maybeSingle();

      if (profileData?.created_at) {
        setAccountCreatedAt(profileData.created_at);
      }

      // Fetch devices
      const { data: deviceData } = await supabase.
      from('user_devices').
      select('*').
      eq('user_id', user.id).
      order('last_used_at', { ascending: false });

      if (deviceData) {
        setDevices(deviceData as DeviceInfo[]);
      }

      // Fetch real IP address with fallbacks
      const ipApis = [
      { url: 'https://api.ipify.org?format=json', key: 'ip' },
      { url: 'https://api.my-ip.io/v2/ip.json', key: 'ip' },
      { url: 'https://ipinfo.io/json', key: 'ip' }];

      let ipFound = false;
      for (const api of ipApis) {
        try {
          const res = await fetch(api.url, { signal: AbortSignal.timeout(5000) });
          const json = await res.json();
          if (json[api.key]) {
            setIpAddress(json[api.key]);
            ipFound = true;
            break;
          }
        } catch {
          continue;
        }
      }
      if (!ipFound) setIpAddress('N/A');

      setLoading(false);
    };

    fetchData();
  }, [isAuthenticated, user]);

  if (!isAuthenticated || !profile) return null;

  if (loading) {
    return (
      <div className="p-3 rounded-xl border border-border/30 bg-card/50 animate-pulse">
        <div className="h-4 bg-muted/30 rounded w-1/3 mb-3" />
        <div className="space-y-2">
          <div className="h-3 bg-muted/20 rounded w-2/3" />
          <div className="h-3 bg-muted/20 rounded w-1/2" />
        </div>
      </div>);

  }

  const createdDate = accountCreatedAt ?
  new Date(accountCreatedAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }) :
  'N/A';

  const shortId = profile.id?.slice(0, 8).toUpperCase() || 'N/A';

  const parseDeviceName = (info: Record<string, any> | null): string => {
    if (!info) return 'Unknown Device';
    return info.model || info.device_model || info.browser || info.userAgent?.slice(0, 30) || 'Unknown Device';
  };

  return (
    <div className="space-y-2">
      <h3 className="font-bold text-foreground flex items-center gap-1.5 text-sm">
        <Shield className="w-3.5 h-3.5 text-primary" />
        Account Information
      </h3>

      <div className="p-3 rounded-xl border border-border/30 bg-card/50 space-y-2.5">
        {/* ID */}
        <div className="flex items-center gap-2">
          <Hash className="w-3.5 h-3.5 text-primary/70" />
          <div>
            <p className="text-3xs text-muted-foreground text-sm">ID No</p>
            <p className="font-mono font-semibold text-foreground text-sm">{shortId}</p>
          </div>
        </div>

        {/* Start Date */}
        <div className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-primary/70" />
          <div>
            <p className="text-3xs text-muted-foreground text-sm">Start Date</p>
            <p className="font-semibold text-foreground text-sm">{createdDate}</p>
          </div>
        </div>

        {/* Credit Balance */}
        <div className="flex items-center gap-2">
          <Coins className="w-3.5 h-3.5 text-primary" />
          <div>
            <p className="text-3xs text-muted-foreground text-sm">Credit Balance</p>
            <p className="font-bold text-primary text-sm">{profile.credits ?? 0} credits</p>
          </div>
        </div>

        {/* IP Address */}
        <div className="flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-primary/70" />
          <div>
            <p className="text-3xs text-muted-foreground text-sm">IP Address</p>
            <p className="font-mono font-semibold text-foreground text-sm">{ipAddress || '...'}</p>
          </div>
        </div>

        {/* Devices */}
        {devices.length > 0 &&
        <div className="pt-1 border-t border-border/20">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Smartphone className="w-3.5 h-3.5 text-primary/70" />
              <p className="text-3xs text-muted-foreground">Devices ({devices.length})</p>
            </div>
            <div className="space-y-1">
              {devices.map((d) =>
            <div
              key={d.id}
              className="flex items-center justify-between px-2 py-1 rounded-md bg-muted/10 border border-border/10">

                  <span className="text-3xs text-foreground truncate max-w-[60%]">
                    {parseDeviceName(d.device_info)}
                  </span>
                  <span className="text-3xs text-muted-foreground">
                    {new Date(d.last_used_at).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short'
                })}
                  </span>
                </div>
            )}
            </div>
          </div>
        }
      </div>
    </div>);

};

export default AccountInfoCard;