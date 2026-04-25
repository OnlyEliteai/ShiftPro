import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

type ShiftRow = {
  id: string;
  date: string;
  start_time: string;
};

function response(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return response({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { token, shiftId } = await req.json();

    if (!token || !shiftId) {
      return response({ success: false, error: "Token and shiftId required" }, 400);
    }

    const { data: chatter, error: chatterError } = await supabase
      .from("chatters")
      .select("id")
      .eq("token", token)
      .eq("active", true)
      .single();

    if (chatterError || !chatter) {
      return response({ success: false, error: "Invalid token" }, 401);
    }

    const { data: completedShifts, error: completedError } = await supabase
      .from("shifts")
      .select("id, date, start_time")
      .eq("chatter_id", chatter.id)
      .eq("status", "completed")
      .order("date", { ascending: false })
      .order("start_time", { ascending: false })
      .limit(25);

    if (completedError) throw completedError;

    if (completedShifts && completedShifts.length > 0) {
      const { data: existingSummaries, error: summariesError } = await supabase
        .from("daily_summaries")
        .select("shift_id")
        .eq("chatter_id", chatter.id);

      if (summariesError) throw summariesError;

      const summarizedIds = new Set(
        (existingSummaries || []).map((summary: { shift_id: string | null }) => summary.shift_id)
      );
      const groups = new Map<string, ShiftRow[]>();

      for (const shift of completedShifts as ShiftRow[]) {
        const key = `${shift.date}|${shift.start_time}`;
        const group = groups.get(key) ?? [];
        group.push(shift);
        groups.set(key, group);
      }

      for (const group of groups.values()) {
        const hasSummary = group.some((shift) => summarizedIds.has(shift.id));
        if (!hasSummary) {
          const debtShift = group[0];
          return response(
            {
              success: false,
              error: "SUMMARY_DEBT",
              debt_shift_id: debtShift.id,
              debt_shift_date: debtShift.date,
              debt_shift_start_time: debtShift.start_time,
              message: `יש לך סיכום משמרת חסר מתאריך ${debtShift.date}. נא למלא את הסיכום לפני כניסה למשמרת חדשה.`,
            },
            403
          );
        }
      }
    }

    const { data: requestedShift, error: shiftError } = await supabase
      .from("shifts")
      .select("id, date, start_time")
      .eq("id", shiftId)
      .eq("chatter_id", chatter.id)
      .single();

    if (shiftError || !requestedShift) {
      return response({ success: false, error: "Shift not found or not in scheduled status" }, 400);
    }

    const { data: siblingShifts, error: siblingsError } = await supabase
      .from("shifts")
      .select("id")
      .eq("chatter_id", chatter.id)
      .eq("date", requestedShift.date)
      .eq("start_time", requestedShift.start_time)
      .eq("status", "scheduled");

    if (siblingsError) throw siblingsError;

    const siblingIds = (siblingShifts || []).map((shift: { id: string }) => shift.id);
    if (siblingIds.length === 0) {
      return response({ success: false, error: "Shift not found or not in scheduled status" }, 400);
    }

    const now = new Date().toISOString();
    const { data: updatedShifts, error: updateError } = await supabase
      .from("shifts")
      .update({ clocked_in: now, status: "active", updated_at: now })
      .in("id", siblingIds)
      .select();

    if (updateError) throw updateError;

    const activityRows = siblingIds.map((id: string) => ({
      shift_id: id,
      chatter_id: chatter.id,
      action: "clock_in",
      metadata: { clocked_in_at: now, group_size: siblingIds.length },
    }));
    const { error: activityError } = await supabase.from("activity_log").insert(activityRows);
    if (activityError) console.error("[clock-in] activity_log insert failed", activityError);

    const updated = (updatedShifts || []) as Array<Record<string, unknown> & { id: string }>;
    const requestedUpdated = updated.find((shift) => shift.id === shiftId) ?? updated[0];

    return response(
      { success: true, data: { ...requestedUpdated, sibling_count: siblingIds.length } },
      200
    );
  } catch (error) {
    console.error("[clock-in]", error);
    return response(
      {
        success: false,
        error: (error as Error).message,
        function: "clock-in",
        timestamp: new Date().toISOString(),
      },
      500
    );
  }
});
