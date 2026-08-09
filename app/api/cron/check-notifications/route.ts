// app/api/cron/check-notifications/route.ts
// Automated Notification Checker (Cron Job Endpoint)
// ============================================================
// Purpose: This endpoint is called by a cron job (e.g., cron-job.org)
// to check for various alerts and send email notifications.
//
// Checks performed:
//   1. Medical certificates expiring within 30 days → 🟡 Warning
//   2. Medical certificates already expired → 🔴 Alert
//   3. Maintenance due within 7 days → 🟡 Warning
//   4. Maintenance overdue → 🔴 Alert
//
// Each alert sends an email to all active admin/super_admin users
// via Resend API and logs to the notification_log table.
//
// URL: /api/cron/check-notifications
// Schedule: Daily at 6:00 AM (0 6 * * *)
// ============================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// ============================================================
// INITIALIZE SERVICES
// ============================================================
// Supabase client for database queries
var supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// Resend client for sending emails (uses server-side API key)
var resend = new Resend(process.env.RESEND_API_KEY || '');

// ============================================================
// MAIN GET HANDLER
// ============================================================
export async function GET(request: Request) {
  // Array to collect all notification messages for the response
  var notifications: string[] = [];
  
  // Get today's date at midnight for comparison
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Get the request URL for building dynamic dashboard links
  var requestUrl = request.url;

  try {
    // ============================================================
    // PRE-LOAD AIRCRAFT DATA FOR REGISTRATION LOOKUP
    // ============================================================
    // Load all aircraft once so we can look up registration numbers
    // for maintenance alerts (avoids foreign key join issues)
    // ============================================================
    var aircraftResult = await supabase
      .from('aircraft')
      .select('id, registration');
    
    var aircraftMap: Record<string, string> = {};
    if (aircraftResult.data) {
      for (var a = 0; a < aircraftResult.data.length; a++) {
        var ac = aircraftResult.data[a];
        aircraftMap[String(ac.id)] = ac.registration;
      }
    }

    // ============================================================
    // 1. CHECK MEDICAL EXPIRY (30 days warning)
    // ============================================================
    // Find all active students whose medical expires within 30 days
    // ============================================================
    var thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    var medicalResult = await supabase
      .from('students')
      .select('*')
      .eq('status', 'ACTIVE')
      .gte('medical_expiry', today.toISOString().split('T')[0])
      .lte('medical_expiry', thirtyDaysFromNow.toISOString().split('T')[0]);

    if (medicalResult.data) {
      for (var i = 0; i < medicalResult.data.length; i++) {
        var student = medicalResult.data[i];
        var daysLeft = Math.ceil(
          (new Date(student.medical_expiry).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        // Add to response notifications
        notifications.push(
          '🟡 ' + student.name + ': Medical expiring in ' + daysLeft + ' days (' + student.medical_expiry + ')'
        );
        
        // Send email to admins
        await sendAdminAlert(
          'Medical Certificate Expiring',
          student.name + ' (' + student.initials + ') medical certificate expires in ' + 
          daysLeft + ' days on ' + student.medical_expiry + '. Please ensure renewal is scheduled.',
          requestUrl
        );
      }
    }

    // ============================================================
    // 2. CHECK MEDICAL EXPIRED
    // ============================================================
    // Find all active students whose medical has already expired
    // ============================================================
    var expiredResult = await supabase
      .from('students')
      .select('*')
      .eq('status', 'ACTIVE')
      .lt('medical_expiry', today.toISOString().split('T')[0]);

    if (expiredResult.data) {
      for (var j = 0; j < expiredResult.data.length; j++) {
        var expiredStudent = expiredResult.data[j];
        
        notifications.push(
          '🔴 ' + expiredStudent.name + ': Medical EXPIRED (' + expiredStudent.medical_expiry + ')'
        );
        
        await sendAdminAlert(
          '🚨 Medical Certificate EXPIRED',
          expiredStudent.name + ' (' + expiredStudent.initials + ') medical certificate EXPIRED on ' + 
          expiredStudent.medical_expiry + '. Student is GROUNDED until renewed.',
          requestUrl
        );
      }
    }

    // ============================================================
    // 3. CHECK MAINTENANCE DUE (7 days warning)
    // ============================================================
    // Find all scheduled maintenance due within the next 7 days
    // ============================================================
    var sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    var dueMxResult = await supabase
      .from('maintenance_records')
      .select('*')
      .eq('status', 'SCHEDULED')
      .gte('scheduled_date', today.toISOString().split('T')[0])
      .lte('scheduled_date', sevenDaysFromNow.toISOString().split('T')[0]);

    if (dueMxResult.data) {
      for (var k = 0; k < dueMxResult.data.length; k++) {
        var mxRecord = dueMxResult.data[k];
        var dueAcReg = aircraftMap[String(mxRecord.aircraft_id)] || 'Unknown';
        
        notifications.push(
          '🟡 ' + dueAcReg + ': ' + mxRecord.maintenance_type + ' due on ' + mxRecord.scheduled_date
        );
        
        await sendAdminAlert(
          'Maintenance Due Soon',
          'Aircraft ' + dueAcReg + ': ' + mxRecord.maintenance_type + 
          ' is scheduled for ' + mxRecord.scheduled_date + ' (within 7 days). Please prepare for maintenance.',
          requestUrl
        );
      }
    }

    // ============================================================
    // 4. CHECK MAINTENANCE OVERDUE
    // ============================================================
    // Find all maintenance that was scheduled before today but not completed
    // ============================================================
    var overdueMxResult = await supabase
      .from('maintenance_records')
      .select('*')
      .in('status', ['SCHEDULED', 'IN_PROGRESS'])
      .lt('scheduled_date', today.toISOString().split('T')[0]);

    if (overdueMxResult.data) {
      for (var m = 0; m < overdueMxResult.data.length; m++) {
        var overdueRecord = overdueMxResult.data[m];
        var overdueAcReg = aircraftMap[String(overdueRecord.aircraft_id)] || 'Unknown';
        
        notifications.push(
          '🔴 ' + overdueAcReg + ': ' + overdueRecord.maintenance_type + 
          ' OVERDUE (was due ' + overdueRecord.scheduled_date + ')'
        );
        
        await sendAdminAlert(
          '🚨 Maintenance OVERDUE',
          'Aircraft ' + overdueAcReg + ': ' + overdueRecord.maintenance_type + 
          ' was scheduled for ' + overdueRecord.scheduled_date + 
          ' and is now OVERDUE. Immediate action required.',
          requestUrl
        );
      }
    }

    // ============================================================
    // LOG TO DATABASE
    // ============================================================
    // Record all notifications in the notification_log table for audit
    // ============================================================
    if (notifications.length > 0) {
      for (var n = 0; n < notifications.length; n++) {
        await supabase.from('notification_log').insert({
          type: 'ALERT',
          subject: 'Automated Alert',
          message: notifications[n],
          sent_to: 'admin@flightpro.com',
        });
      }
    }

    // ============================================================
    // RETURN RESPONSE
    // ============================================================
    return NextResponse.json({
      success: true,
      checked: new Date().toISOString(),
      notifications: notifications.length > 0 ? notifications : ['✅ All clear - no alerts found'],
    });
    
  } catch (error) {
    // Log the actual error to the server console for debugging
    console.error('Notification check error:', error);
    
    // Return a generic error to the client (don't expose internal details)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================
// SEND ADMIN ALERT EMAIL
// ============================================================
// Sends an email notification to all active admin and super_admin users
// Includes a link to the dashboard for quick action
// The dashboard URL is dynamically built from the request
//
// Parameters:
//   subject    - Email subject line
//   message    - Email body message
//   requestUrl - The original request URL (used to build dashboard link)
// ============================================================
async function sendAdminAlert(subject: string, message: string, requestUrl?: string) {
  try {
    // ============================================================
    // BUILD DYNAMIC DASHBOARD URL
    // ============================================================
    // Works for both localhost (http://localhost:3000) and 
    // production (https://flightplanner-xi.vercel.app)
    // ============================================================
    var dashboardUrl = 'http://localhost:3000/dashboard';
    if (requestUrl) {
      var url = new URL(requestUrl);
      dashboardUrl = url.protocol + '//' + url.host + '/dashboard';
    }

    // ============================================================
    // GET ADMIN EMAILS FROM DATABASE
    // ============================================================
    var result = await supabase
      .from('users')
      .select('email')
      .in('role', ['admin', 'super_admin'])
      .eq('is_active', true);

    // If no admins found, skip sending
    if (!result.data || result.data.length === 0) {
      console.log('No admin users found to send alert to');
      return;
    }

    // ============================================================
    // SEND EMAIL TO EACH ADMIN
    // ============================================================
    for (var i = 0; i < result.data.length; i++) {
      var admin = result.data[i];
      
      // Build email subject line
      var emailSubject = 'FlightPro Alert: ' + subject;
      
      // Build clean HTML email body with inline styles
      var emailHtml = 
        '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">' +
          
          // Header with logo
          '<div style="text-align: center; margin-bottom: 20px;">' +
            '<h1 style="color: #1e40af; margin: 0;">✈️ FlightPro Manager</h1>' +
            '<p style="color: #64748b; font-size: 12px;">Automated Alert Notification</p>' +
          '</div>' +
          
          // Alert content box
          '<div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 20px;">' +
            '<h2 style="color: #1e293b; margin-top: 0;">' + subject + '</h2>' +
            '<p style="color: #334155; font-size: 16px; line-height: 1.5;">' + message + '</p>' +
          '</div>' +
          
          // Dashboard button
          '<div style="text-align: center; margin: 25px 0;">' +
            '<a href="' + dashboardUrl + '" style="background: #2563eb; color: white; padding: 12px 30px; ' +
            'text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">' +
              'Go to Dashboard →' +
            '</a>' +
          '</div>' +
          
          // Footer
          '<div style="border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 20px;">' +
            '<p style="color: #94a3b8; font-size: 12px; margin: 0;">' +
              'This is an automated notification from FlightPro Manager. ' +
              'Please do not reply to this email.' +
            '</p>' +
          '</div>' +
          
        '</div>';

      // Send via Resend API
      await resend.emails.send({
        from: 'FlightPro Manager <noreply@pushpak.mahesho.com>',
        to: admin.email,
        subject: emailSubject,
        html: emailHtml,
      });
      
      console.log('✅ Alert email sent to:', admin.email);
    }
  } catch (err) {
    // Log error but don't crash the entire notification check
    console.error('Failed to send admin alert:', err);
  }
}