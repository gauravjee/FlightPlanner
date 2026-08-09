// components/dashboard/NotificationWidget.tsx
// Shows recent alerts and notifications on the dashboard
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';

interface Notification {
  id: number;
  type: string;
  subject: string;
  message: string;
  sent_at: string;
}

export default function NotificationWidget() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    const { data } = await supabase
      .from('notification_log')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(5);
    setNotifications(data || []);
    setLoading(false);
  };

  if (loading) return null;
  if (notifications.length === 0) return null;

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">🔔 Recent Alerts</h2>
      <div className="space-y-2">
        {notifications.map(n => (
          <div key={n.id} className="bg-slate-900/50 rounded-lg p-3 text-xs">
            <p className="text-white font-medium">{n.subject}</p>
            <p className="text-slate-400 mt-1">{n.message}</p>
            <p className="text-slate-500 mt-1">
              {new Date(n.sent_at).toLocaleString('en-IN')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}