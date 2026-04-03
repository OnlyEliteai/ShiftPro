import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── FIX #6: All time math in Asia/Jerusalem (DST-safe via IANA) ──
    const now = new Date();
    const ilParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);

    const todayIL = `${ilParts.find(p => p.type === "year")!.value}-${ilParts.find(p => p.type === "month")!.value}-${ilParts.find(p => p.type === "day")!.value}`;
    const nowH = Number(ilParts.find(p => p.type === "hour")!.value);
    const nowM = Number(ilParts.find(p => p.type === "minute")!.value);
    const nowTotalMinutes = nowH * 60 + nowM;

    // ── FIX #5: Query today + tomorrow to handle near-midnight shifts ──
    const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowIL = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(tomorrowDate);

    // ── FIX #4: Only scheduled shifts | FIX #2: inner join on chatters ──
    const { data: shifts, error: shiftsError } = await supabase
      .from("shifts")
      .select(`
        id,
        date,
        start_time,
        end_time,
        model,
        status,
        chatter_id,
        chatters!inner(id, name, phone, active)
      `)
      .in("date", [todayIL, tomorrowIL])
      .eq("status", "scheduled");

    if (shiftsError) throw shiftsError;

    // ── FIX #10: Clean empty array on no shifts ──
    if (!shifts || shifts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, data: [] }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // ── FIX #2: Filter inactive chatters | FIX #3: Skip null/empty phone ──
    const activeShifts = shifts.filter((s: any) => {
      const c = s.chatters;
      return c && c.active === true && c.phone && c.phone.trim() !== "";
    });

    if (activeShifts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, data: [] }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // ── FIX #1: Deduplicate via reminder_log ──
    const shiftIds = activeShifts.map((s: any) => s.id);
    const { data: sentReminders } = await supabase
      .from("reminder_log")
      .select("shift_id, reminder_type")
      .in("shift_id", shiftIds);

    const sentSet = new Set(
      (sentReminders || []).map((r: any) => `${r.shift_id}_${r.reminder_type}`)
    );

    // ── Build reminders ──
    const reminders: any[] = [];

    for (const shift of activeShifts) {
      const s = shift as any;
      const [startH, startM] = s.start_time.split(":").map(Number);

      // ── FIX #5 + #6: Proper minutes-until accounting for date boundary ──
      let shiftStartTotalMinutes = startH * 60 + startM;
      if (s.date === tomorrowIL) {
        // Tomorrow's shift: offset by 24h
        shiftStartTotalMinutes += 24 * 60;
      }

      const diffMinutes = shiftStartTotalMinutes - nowTotalMinutes;

      // Skip shifts already in the past (handles midnight-crossing correctly)
      if (diffMinutes < 0) continue;

      const chatter = s.chatters;

      // ── FIX #7: Window ranges (55–65 for 60min, 10–20 for 15min) ──

      if (diffMinutes >= 55 && diffMinutes <= 65) {
        const key = `${s.id}_60min`;
        if (!sentSet.has(key)) {
          // ── FIX #8: Consistent return structure ──
          reminders.push({
            shift_id: s.id,
            chatter_id: s.chatter_id,
            chatter_name: chatter.name,
            phone: chatter.phone,
            start_time: s.start_time.slice(0, 5),
            model: s.model || null,
            reminder_type: "60min",
          });
        }
      }

      if (diffMinutes >= 10 && diffMinutes <= 20) {
        const key = `${s.id}_15min`;
        if (!sentSet.has(key)) {
          reminders.push({
            shift_id: s.id,
            chatter_id: s.chatter_id,
            chatter_name: chatter.name,
            phone: chatter.phone,
            start_time: s.start_time.slice(0, 5),
            model: s.model || null,
            reminder_type: "15min",
          });
        }
      }
    }

    // ── FIX #10: Always return { success, data } ──
    return new Response(
      JSON.stringify({ success: true, data: reminders }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("[upcoming-shifts]", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message,
        function: "upcoming-shifts",
        timestamp: new Date().toISOString(),
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
});
