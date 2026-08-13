// app/dashboard/admin/setup/SettingsTab.tsx
// Manage FTO Settings (school name, airport code, timezone, time slots, buffer, logo)
// These settings affect the entire application
// Logo is uploaded to Supabase Storage bucket 'fto-logos'

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';

// ============================================================
// TYPE DEFINITIONS
// ============================================================
interface FTOSetting {
  id: number;
  setting_key: string;
  setting_value: string;
  description: string;
}

// ============================================================
// TIMEZONE OPTIONS
// ============================================================
const TIMEZONE_OPTIONS = [
  { value: 'Asia/Kolkata', label: 'IST - India (UTC+5:30)' },
  { value: 'Asia/Dubai', label: 'GST - Dubai (UTC+4)' },
  { value: 'Asia/Singapore', label: 'SGT - Singapore (UTC+8)' },
  { value: 'Europe/London', label: 'GMT - London (UTC+0)' },
  { value: 'America/New_York', label: 'EST - New York (UTC-5)' },
  { value: 'America/Chicago', label: 'CST - Chicago (UTC-6)' },
  { value: 'America/Denver', label: 'MST - Denver (UTC-7)' },
  { value: 'America/Los_Angeles', label: 'PST - Los Angeles (UTC-8)' },
];

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function SettingsTab() {
  // ----- State -----
  const [settings, setSettings] = useState<FTOSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  // ----- Load settings on mount -----
  useEffect(() => {
    loadSettings();
  }, []);

  /**
   * Load all FTO settings from the database
   * Builds a form values object for easy access
   */
  const loadSettings = async () => {
    setLoading(true);
    console.log('📋 Fetching FTO settings...');

    const { data, error } = await supabase
      .from('fto_settings')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.error('❌ Error loading settings:', error.message);
    } else {
      console.log('✅ Loaded settings:', data?.length, 'items');
      setSettings(data || []);

      // Build a key-value map for easy form access
      const values: Record<string, string> = {};
      (data || []).forEach(s => {
        values[s.setting_key] = s.setting_value;
      });
      setFormValues(values);
    }
    setLoading(false);
  };

  // ============================================================
  // SETTING HELPERS
  // ============================================================

  /** Get a setting value by its key */
  const getValue = (key: string): string => {
    return formValues[key] || '';
  };

  /** Update a setting value in the form state */
  const setValue = (key: string, value: string) => {
    setFormValues(prev => ({ ...prev, [key]: value }));
  };

  // ============================================================
  // SAVE ALL SETTINGS
  // ============================================================

  /**
   * Save all changed settings to the database
   * Only updates settings whose values have actually changed
   */
  const handleSave = async () => {
    setSaving(true);
    setSuccessMessage('');

    try {
      let updatedCount = 0;

      // Union of settings already in the DB and any keys present in the form
      // (e.g. a newly-added field like location_name that has no DB row yet
      // for schools that were set up before it existed). Existing rows are
      // updated by id; brand-new keys are inserted.
      const allKeys = new Set([...settings.map(s => s.setting_key), ...Object.keys(formValues)]);

      for (const key of allKeys) {
        const newValue = formValues[key] || '';
        const existing = settings.find(s => s.setting_key === key);

        if (existing) {
          if (newValue !== existing.setting_value) {
            const { error } = await supabase
              .from('fto_settings')
              .update({ setting_value: newValue })
              .eq('id', existing.id);

            if (error) {
              console.error(`❌ Error saving ${key}:`, error.message);
            } else {
              updatedCount++;
            }
          }
        } else if (newValue !== '') {
          const { error } = await supabase
            .from('fto_settings')
            .insert({ setting_key: key, setting_value: newValue });

          if (error) {
            console.error(`❌ Error creating ${key}:`, error.message);
          } else {
            updatedCount++;
          }
        }
      }

      setSuccessMessage(`✅ ${updatedCount} settings saved successfully!`);
      setTimeout(() => setSuccessMessage(''), 3000);
      loadSettings(); // Reload to reflect changes
    } catch (err) {
      console.error('❌ Error saving settings:', err);
      setSuccessMessage('❌ Error saving settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // LOGO UPLOAD HANDLER
  // ============================================================

  /**
   * Handle logo file upload to Supabase Storage
   * Validates file type and size before uploading
   * Saves the public URL to fto_settings after successful upload
   */
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ----- Client-side validation (backup to bucket-level restrictions) -----
    // Check file size (max 500KB)
    if (file.size > 500 * 1024) {
      alert('❌ File size must be less than 500KB. Please resize your logo.');
      return;
    }

    // Check file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      alert('❌ Only PNG, JPG, and SVG files are allowed.');
      return;
    }

    setUploading(true);
    setSuccessMessage('');

    try {
      // Generate a unique filename with timestamp
      const fileExtension = file.name.split('.').pop();
      const fileName = `logo-${Date.now()}.${fileExtension}`;

      console.log('📤 Uploading logo:', fileName);

      // Upload to Supabase Storage bucket 'fto-logos'
      const { data, error } = await supabase.storage
        .from('fto-logos')
        .upload(fileName, file, {
          cacheControl: '3600',     // Cache for 1 hour
          upsert: true,             // Overwrite if same filename exists
        });

      if (error) {
        console.error('❌ Upload error:', error.message);
        alert('❌ Failed to upload logo: ' + error.message);
        setUploading(false);
        return;
      }

      console.log('✅ Logo uploaded successfully');

      // Get the public URL for the uploaded file
      const { data: urlData } = supabase.storage
        .from('fto-logos')
        .getPublicUrl(fileName);

      const publicUrl = urlData.publicUrl;
      console.log('🔗 Public URL:', publicUrl);

      // Save the URL to form state
      setValue('logo_url', publicUrl);
      setValue('show_logo', 'true');

      // Also save directly to database immediately
      await supabase
        .from('fto_settings')
        .update({ setting_value: publicUrl })
        .eq('setting_key', 'logo_url');

      await supabase
        .from('fto_settings')
        .update({ setting_value: 'true' })
        .eq('setting_key', 'show_logo');

      setSuccessMessage('✅ Logo uploaded successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);

      // Reload settings to reflect the new logo
      loadSettings();

    } catch (err) {
      console.error('❌ Unexpected upload error:', err);
      alert('❌ An unexpected error occurred. Please try again.');
    } finally {
      setUploading(false);
      // Reset the file input so the same file can be re-uploaded if needed
      e.target.value = '';
    }
  };

  /**
   * Remove the current logo
   * Clears the URL and disables logo display
   */
  const handleRemoveLogo = async () => {
    if (!window.confirm('Remove the current logo? The default logo will be used instead.')) return;

    setValue('logo_url', '');
    setValue('show_logo', 'false');

    // Save immediately to database
    await supabase
      .from('fto_settings')
      .update({ setting_value: '' })
      .eq('setting_key', 'logo_url');

    await supabase
      .from('fto_settings')
      .update({ setting_value: 'false' })
      .eq('setting_key', 'show_logo');

    setSuccessMessage('🗑️ Logo removed. Default logo will be used.');
    setTimeout(() => setSuccessMessage(''), 3000);
    loadSettings();
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">⚙️ FTO Settings</h2>
      <p className="text-sm text-slate-400 mb-6">
        Configure your Flight Training Organization settings. These values are used throughout the application.
      </p>

      {loading ? (
        <p className="text-slate-400 text-center py-8">Loading settings...</p>
      ) : (
        <div className="space-y-6">

          {/* ============================================================ */}
          {/* SCHOOL INFORMATION */}
          {/* ============================================================ */}
          <div className="bg-slate-700/50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-white mb-4">🏫 School Information</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* School Name */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">School Name</label>
                <input
                  type="text"
                  value={getValue('school_name')}
                  onChange={e => setValue('school_name', e.target.value)}
                  placeholder="e.g., Horizon Flight Training Academy"
                  className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">Displayed in the header and all reports</p>
              </div>

              {/* Location Name */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Location Name</label>
                <input
                  type="text"
                  value={getValue('location_name')}
                  onChange={e => setValue('location_name', e.target.value)}
                  placeholder="e.g., Chennai or ABC Farm Airstrip"
                  className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">City or airstrip name, shown in the header next to the airport code (or alone if you have no ICAO code)</p>
              </div>

              {/* Airport Code */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Primary Airport (ICAO) — optional</label>
                <input
                  type="text"
                  value={getValue('airport_code')}
                  onChange={e => setValue('airport_code', e.target.value.toUpperCase())}
                  placeholder="e.g., VOBL"
                  maxLength={4}
                  className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  4-letter ICAO code, used for live aviation weather (METAR/TAF). If your field has no ICAO
                  code, leave this blank and enter the code of the nearest reporting station instead — its
                  weather will be shown as a reference. If you have neither, set Latitude/Longitude below for
                  general (non-aviation) weather instead.
                </p>
              </div>

              {/* Latitude / Longitude — fallback weather source when there's no
                  ICAO code and no nearby reference station. Stored as two
                  separate free-text fields so partial/invalid entries don't
                  block saving the rest of the form. */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Latitude — optional</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getValue('latitude')}
                  onChange={e => setValue('latitude', e.target.value)}
                  placeholder="e.g., 13.0827"
                  className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Only used when the airport code above is blank. Shows general weather (temperature, wind,
                  cloud cover) for these coordinates — not official aviation METAR/TAF data.
                </p>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Longitude — optional</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={getValue('longitude')}
                  onChange={e => setValue('longitude', e.target.value)}
                  placeholder="e.g., 80.2707"
                  className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">Used together with Latitude above.</p>
              </div>
            </div>

            {/* ============================================================ */}
            {/* LOGO UPLOAD SECTION */}
            {/* ============================================================ */}
            <div className="border-t border-slate-600 pt-4 mt-4">
              <h4 className="text-sm font-medium text-white mb-3">🖼️ School Logo</h4>
              <p className="text-xs text-slate-400 mb-4">
                Upload your FTO logo to customize the header. Recommended size: 200×50px. Max file size: 500KB.
                Supported formats: PNG, JPG, SVG.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* ----- Upload Area ----- */}
                <div>
                  {/* File Input */}
                  <label className="block text-xs text-slate-400 mb-2">
                    {uploading ? '⏳ Uploading...' : '📁 Choose Logo File'}
                  </label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    onChange={handleLogoUpload}
                    disabled={uploading}
                    className="w-full text-sm text-slate-400 
                      file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 
                      file:text-sm file:font-medium file:bg-blue-500 file:text-white 
                      hover:file:bg-blue-600 file:cursor-pointer
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  />

                  {/* Manual URL Input */}
                  <div className="mt-4">
                    <label className="block text-xs text-slate-400 mb-1">Or enter logo URL manually</label>
                    <input
                      type="text"
                      value={getValue('logo_url')}
                      onChange={e => setValue('logo_url', e.target.value)}
                      placeholder="https://example.com/logo.png"
                      className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Paste a URL to an externally hosted logo image
                    </p>
                  </div>

                  {/* Show Logo Toggle */}
                  <div className="flex items-center space-x-2 mt-4">
                    <input
                      type="checkbox"
                      checked={getValue('show_logo') === 'true'}
                      onChange={e => setValue('show_logo', e.target.checked ? 'true' : 'false')}
                      className="w-4 h-4"
                    />
                    <label className="text-sm text-slate-300">Show logo in application header</label>
                  </div>
                </div>

                {/* ----- Preview Area ----- */}
                <div className="flex flex-col items-center justify-center">
                  <p className="text-xs text-slate-400 mb-3">Logo Preview</p>

                  {getValue('logo_url') ? (
                    <div className="bg-slate-900 rounded-lg p-6 flex items-center justify-center w-full" style={{ minHeight: '120px' }}>
                      <img
                        src={getValue('logo_url')}
                        alt="School Logo"
                        className="max-h-16 max-w-full object-contain"
                        onError={(e) => {
                          // Hide broken image and show fallback
                          (e.target as HTMLImageElement).style.display = 'none';
                          const fallback = document.getElementById('logo-fallback');
                          if (fallback) fallback.style.display = 'block';
                        }}
                      />
                      <div id="logo-fallback" style={{ display: 'none' }} className="text-center">
                        <span className="text-4xl">✈️</span>
                        <p className="text-xs text-red-400 mt-2">Failed to load image</p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-900 rounded-lg p-6 flex items-center justify-center w-full" style={{ minHeight: '120px' }}>
                      <div className="text-center">
                        <span className="text-4xl">✈️</span>
                        <p className="text-xs text-slate-400 mt-2">No custom logo</p>
                        <p className="text-xs text-slate-500">Default logo will be used</p>
                      </div>
                    </div>
                  )}

                  {/* Remove Logo Button */}
                  {getValue('logo_url') && (
                    <button
                      onClick={handleRemoveLogo}
                      className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition"
                    >
                      🗑️ Remove Logo
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

            {/* ============================================================ */}
            {/* TIME & SCHEDULING */}
            {/* ============================================================ */}
            <div className="bg-slate-700/50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-white mb-4">🕐 Time & Scheduling</h3>

            {/* ===== Timezone & Buffer ===== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Timezone */}
                <div>
                <label className="block text-xs text-slate-400 mb-1">Timezone</label>
                <select
                    value={getValue('timezone')}
                    onChange={e => setValue('timezone', e.target.value)}
                    className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                    {TIMEZONE_OPTIONS.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">Used for all time displays and scheduling</p>
                </div>

                {/* Buffer Minutes */}
                <div>
                <label className="block text-xs text-slate-400 mb-1">Buffer Between Flights</label>
                <select
                    value={getValue('buffer_minutes')}
                    onChange={e => setValue('buffer_minutes', e.target.value)}
                    className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                    <option value="0">No buffer</option>
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="45">45 minutes</option>
                    <option value="60">1 hour</option>
                    <option value="90">1.5 hours</option>
                    <option value="120">2 hours</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">Required gap between consecutive bookings on same aircraft</p>
                </div>
            </div>

            {/* ===== Time Slots ===== */}
            <div className="border-t border-slate-600 pt-4 mt-2">
                <h4 className="text-xs font-medium text-slate-400 mb-3">📅 Daily Time Slots</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Earliest Booking Time */}
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Earliest Booking Time</label>
                    <select
                    value={getValue('time_slot_start')}
                    onChange={e => setValue('time_slot_start', e.target.value)}
                    className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    >
                    <option value="05:00">05:00</option>
                    <option value="05:30">05:30</option>
                    <option value="06:00">06:00</option>
                    <option value="06:30">06:30</option>
                    <option value="07:00">07:00</option>
                    <option value="07:30">07:30</option>
                    <option value="08:00">08:00</option>
                    <option value="08:30">08:30</option>
                    <option value="09:00">09:00</option>
                    </select>
                    <p className="text-xs text-slate-500 mt-1">First available slot of the day</p>
                </div>

                {/* Latest Booking Time */}
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Latest Booking Time</label>
                    <select
                    value={getValue('time_slot_end')}
                    onChange={e => setValue('time_slot_end', e.target.value)}
                    className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    >
                    <option value="17:00">17:00</option>
                    <option value="17:30">17:30</option>
                    <option value="18:00">18:00</option>
                    <option value="18:30">18:30</option>
                    <option value="19:00">19:00</option>
                    <option value="19:30">19:30</option>
                    <option value="20:00">20:00</option>
                    <option value="20:30">20:30</option>
                    <option value="21:00">21:00</option>
                    <option value="21:30">21:30</option>
                    <option value="22:00">22:00</option>
                    <option value="22:30">22:30</option>
                    <option value="23:00">23:00</option>
                    </select>
                    <p className="text-xs text-slate-500 mt-1">Last available slot of the day</p>
                </div>

                {/* Time Slot Interval */}
                <div>
                    <label className="block text-xs text-slate-400 mb-1">Time Slot Interval</label>
                    <select
                    value={getValue('time_slot_interval')}
                    onChange={e => setValue('time_slot_interval', e.target.value)}
                    className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    >
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="60">1 hour</option>
                    </select>
                    <p className="text-xs text-slate-500 mt-1">Time increments for booking slots</p>
                </div>
                </div>
            </div>
            </div>
          {/* ============================================================ */}
          {/* SAVE BUTTON */}
          {/* ============================================================ */}
          <div className="flex items-center space-x-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition cursor-pointer font-medium disabled:opacity-50"
            >
              {saving ? '💾 Saving...' : '💾 Save All Settings'}
            </button>
            {successMessage && (
              <span className={`text-sm ${successMessage.includes('✅') ? 'text-green-400' : 'text-red-400'}`}>
                {successMessage}
              </span>
            )}
          </div>

          {/* ============================================================ */}
          {/* CURRENT CONFIGURATION SUMMARY */}
          {/* ============================================================ */}
          <div className="bg-slate-700/50 rounded-lg p-4 mt-4">
            <h3 className="text-sm font-medium text-white mb-3">📋 Current Configuration Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              {settings.map(setting => (
                <div key={setting.id} className="flex justify-between py-1 border-b border-slate-600/30">
                  <span className="text-slate-400">{setting.description || setting.setting_key}:</span>
                  <span className="text-white font-medium truncate ml-2 max-w-[200px]">
                    {setting.setting_key === 'logo_url' && setting.setting_value
                      ? '✅ Custom logo set'
                      : setting.setting_value || '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}