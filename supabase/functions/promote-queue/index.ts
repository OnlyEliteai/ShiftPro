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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { shiftId } = await req.json();
    if (!shiftId) {
      return new Response(
        JSON.stringify({ success: false, error: "shiftId required" }),
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Get the cancelled shift details for context
    const { data: cancelledShift } = await supabase
      .from("shifts")
      .select("date, start_time, end_time, model, platform, model_id")
      .eq("id", shiftId)
      .single();

    // Find the first waiting person in queue
    const { data: nextInQueue } = await supabase
      .from("shift_queue")
      .select("id, chatter_id, position")
      .eq("shift_id", shiftId)
      .eq("status", "waiting")
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!nextInQueue) {
      return new Response(
        JSON.stringify({ success: true, promoted: false, message: "Queue empty" }),
        { headers: CORS_HEADERS },
      );
    }

    // Get chatter details for WhatsApp notification
    const { data: chatter } = await supabase
      .from("chatters")
      .select("name, phone")
      .eq("id", nextInQueue.chatter_id)
      .single();

    if (!chatter) {
      return new Response(
        JSON.stringify({ success: false, error: "Chatter not found" }),
        { status: 404, headers: CORS_HEADERS },
      );
    }

    // Create a new pending shift for the promoted chatter
    const shiftType = cancelledShift
      ? Number(cancelledShift.start_time?.slice(0, 2)) < 19 ? "בוקר" : "ערב"
      : "";

    const { error: insertError } = await supabase.from("shifts").insert({
      chatter_id: nextInQueue.chatter_id,
      date: cancelledShift?.date,
      start_time: cancelledShift?.start_time,
      end_time: cancelledShift?.end_time,
      model: cancelledShift?.model,
      model_id: cancelledShift?.model_id,
      platform: cancelledShift?.platform,
      status: "pending",
    });

    if (insertError) {
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        { status: 500, headers: CORS_HEADERS },
      );
    }

    // Mark queue entry as promoted
    await supabase
      .from("shift_queue")
      .update({ status: "promoted" })
      .eq("id", nextInQueue.id);

    // Send WhatsApp notification via WhatsAble API
    const whatsableKey = Deno.env.get("WHATSABLE_API_KEY");
    if (whatsableKey && chatter.phone) {
      const dateStr = cancelledShift?.date ?? "";
      const message = `${chatter.name}, התפנה מקום במשמרת ב-${dateStr} (${shiftType})! אשר/י בהקדם.`;

      await fetch(
        "https://dashboard.whatsable.app/api/whatsapp/messages/v2.0.0/send",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: whatsableKey,
          },
          body: JSON.stringify({ to: chatter.phone, text: message }),
        },
      ).catch((err) => {
        console.error("[promote-queue] WhatsApp send failed:", err);
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        promoted: true,
        chatter_name: chatter.name,
      }),
      { headers: CORS_HEADERS },
    );
  } catch (error) {
    console.error("[promote-queue]", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message,
      }),
      { status: 500, headers: CORS_HEADERS },
    );
  }
});
