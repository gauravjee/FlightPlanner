// app/api/cron/check-notifications/route.ts
// Automated notification checker
// ============================================================
// This endpoint is called by a cron job (e.g., cron-job.org)
// It checks for:
//   1. Medical certificates expiring within 30 days
//   2. Medical certificates already expired
//   3. Maintenance due within 7 days
//   4. Maintenance overdue
//
// For each alert, it sends an email via Resend and logs to the database
// ============================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Initialize Supabase and Resend
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY || '');

export async function GET() {
  const notifications: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    // ============================================================
    // 1. CHECK MEDICAL EXPIRY (30 days warning)
    // ============================================================
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const { data: expiringMedical } = await supabase
      .from('students')
      .select('*')
      .eq('status', 'ACTIVE')
      .gte('medical_expiry', today.toISOString().split('T')[0])
      .lte('medical_expiry', thirtyDaysFromNow.toISOString().split('T')[0]);

    if (expiringMedical) {
      for (const student of expiringMedical) {
        const daysLeft = Math.ceil(
          (new Date(student.medical_expiry).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        notifications.push('🟡 ' + student.name + ': Medical expiring in ' + daysLeft + ' days (' + student.medical_expiry + ')');
        
        // Send email to admin
        await sendAdminAlert(
          'Medical Certificate Expiring',
          `${student.name} (${student.initials}) medical certificate expires in ${daysLeft} days on ${student.medical_expiry}.`
        );
      }
    }

    // ============================================================
    // 2. CHECK MEDICAL EXPIRED
    // ============================================================
    const { data: expiredMedical } = await supabase
      .from('students')
      .select('*')
      .eq('status', 'ACTIVE')
      .lt('medical_expiry', today.toISOString().split('T')[0]);

    if (expiredMedical) {
      for (const student of expiredMedical) {
        notifications.push(`🔴 ${student.name}: Medical EXPIRED (${student.medical_expiry})`);
        
        await sendAdminAlert(
          '🚨 Medical Certificate EXPIRED',
          `${student.name} (${student.initials}) medical certificate EXPIRED on ${student.medical_expiry}. Student is GROUNDED until renewed.`
        );
      }
    }

    // ============================================================
    // 3. CHECK MAINTENANCE DUE (7 days warning)
    // ============================================================
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const { data: dueMaintenance } = await supabase
      .from('maintenance_records')
      .select('*, aircraft(registration)')
      .eq('status', 'SCHEDULED')
      .gte('scheduled_date', today.toISOString().split('T')[0])
      .lte('scheduled_date', sevenDaysFromNow.toISOString().split('T')[0]);

    if (dueMaintenance) {
      for (const record of dueMaintenance) {
        const acReg = record.aircraft?.registration || 'Unknown';
        notifications.push(`🟡 ${acReg}: ${record.maintenance_type} due on ${record.scheduled_date}`);
        
        await sendAdminAlert(
          'Maintenance Due Soon',
          `Aircraft ${acReg}: ${record.maintenance_type} is scheduled for ${record.scheduled_date} (within 7 days).`
        );
      }
    }

    // ============================================================
    // 4. CHECK MAINTENANCE OVERDUE
    // ============================================================
    const { data: overdueMaintenance } = await supabase
      .from('maintenance_records')
      .select('*, aircraft(registration)')
      .in('status', ['SCHEDULED', 'IN_PROGRESS'])
      .lt('scheduled_date', today.toISOString().split('T')[0]);

    if (overdueMaintenance) {
      for (const record of overdueMaintenance) {
        const acReg = record.aircraft?.registration || 'Unknown';
        notifications.push(`🔴 ${acReg}: ${record.maintenance_type} OVERDUE (was due ${record.scheduled_date})`);
        
        await sendAdminAlert(
          '🚨 Maintenance OVERDUE',
          `Aircraft ${acReg}: ${record.maintenance_type} was scheduled for ${record.scheduled_date} and is now OVERDUE.`
        );
      }
    }

    return NextResponse.json({
      success: true,
      checked: new Date().toISOString(),
      notifications: notifications.length > 0 ? notifications : ['✅ All clear - no alerts'],
    });
  } catch (error: any) {
    console.error('Notification check error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Send admin alert email
 */
async function sendAdminAlert(subject: string, message: string) {
  try {
    // Get admin emails from users table
    const { data: admins } = await supabase
      .from('users')
      .select('email')
      .in('role', ['admin', 'super_admin'])
      .eq('is_active', true);

    if (admins && admins.length > 0) {
      for (const admin of admins) {
        await resend.emails.send({
          from: 'FlightPro Manager <noreply@pushpak.mahesho.com>',
          to: admin.email,
          subject: `FlightPro Alert: ${subject}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #1e40af;">✈️ FlightPro Manager</h1>
              <h2>${subject}</h2>
              <p>${message}</p>
              <p style="color: #64748b; margin-top: 20px;">
                /**
 * Send admin alert email with dynamic dashboard URL
 * The URL automatically adapts to the environment (localhost or production)
 */
    async function sendAdminAlert(subject: string, message: string, requestUrl?: string) {
      try {
        // Build dynamic dashboard URL from the request
        var dashboardUrl = 'http://localhost:3000/dashboard'; // Default fallback
        
        if (requestUrl) {
          var url = new URL(requestUrl);
          dashboardUrl = url.protocol + '//' + url.host + '/dashboard';
        }

        // Get admin emails from users table
        var result = await supabase
          .from('users')
          .select('email')
          .in('role', ['admin', 'super_admin'])
          .eq('is_active', true);

        if (result.data && result.data.length > 0) {
          for (var i = 0; i < result.data.length; i++) {
            var admin = result.data[i];
            var emailSubject = 'FlightPro Alert: ' + subject;
            var emailHtml = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">' +
              '<h1 style="color: #1e40af;">✈️ FlightPro Manager</h1>' +
              '<h2>' + subject + '</h2>' +
              '<p>' + message + '</p>' +
              '<p style="color: #64748b; margin-top: 20px;">' +
              '<a href="' + dashboardUrl + '" style="color: #2563eb;">Go to Dashboard →</a>' +
              '</p>' +
              '<p style="color: #94a3b8; font-size: 12px; margin-top: 30px;">' +
              'This is an automated notification from FlightPro Manager.' +
              '</p>' +
              '</div>';

            await resend.emails.send({
              from: 'FlightPro Manager <noreply@pushpak.mahesho.com>',
              to: admin.email,
              subject: emailSubject,
              html: emailHtml,
            });
          }
        }
      } catch (err) {
        console.error('Failed to send admin alert:', err);
      }
    }
                  Go to Dashboard →
                </a>
              </p>
              <p style="color: #94a3b8; font-size: 12px; margin-top: 30px;">
                This is an automated notification from FlightPro Manager.
              </p>
            </div>
          `,
        });
      }
    }
  } catch (err) {
    console.error('Failed to send admin alert:', err);
  }
}