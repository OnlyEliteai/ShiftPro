import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    const body = await req.json();
    const { shiftId, reminderType } = body;
    // Accept both messageId (new) and twilioSid (legacy) for backwards compat
    const messageId = body.messageId ?? body.twilioSid ?? null;

    if (!shiftId || !reminderType) {
      return new Response(
        JSON.stringify({ success: false, error: "shiftId and reminderType required" }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const { error } = await supabase.from("reminder_log").upsert(
      {
        shift_id: shiftId,
        reminder_type: reminderType,
        message_id: messageId,
        delivery_status: "sent",
      },
      { onConflict: "shift_id,reminder_type", ignoreDuplicates: true }
    );

    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true, logged: true }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("[log-reminder]", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message,
        function: "log-reminder",
        timestamp: new Date().toISOString(),
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
});
