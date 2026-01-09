import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
  try {
    const now = new Date().toISOString();
    const idsToDelete: string[] = [];

    const { data: viewOnceMessages, error: viewOnceError } = await supabaseAdmin
      .from("messages")
      .select("id")
      .eq("is_view_once", true)
      .eq("is_viewed", true)
      .or("is_saved.is.null,is_saved.eq.false");

    if (!viewOnceError && viewOnceMessages) {
      idsToDelete.push(...viewOnceMessages.map(m => m.id));
    }

    const { data: expiredMessages, error: expiredError } = await supabaseAdmin
      .from("messages")
      .select("id")
      .not("expires_at", "is", null)
      .lt("expires_at", now)
      .or("is_saved.is.null,is_saved.eq.false");

    if (!expiredError && expiredMessages) {
      idsToDelete.push(...expiredMessages.map(m => m.id));
    }

    const uniqueIds = [...new Set(idsToDelete)];

    if (uniqueIds.length === 0) {
      return NextResponse.json({ message: "No messages to delete", deleted: 0 });
    }

    const { error: deleteError } = await supabaseAdmin
      .from("messages")
      .delete()
      .in("id", uniqueIds);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      message: "Messages cleaned up", 
      deleted: uniqueIds.length 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
