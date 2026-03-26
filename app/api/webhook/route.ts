import { messagingApi } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const { MessagingApiClient } = messagingApi;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { destination, events } = body;
    const event = events?.[0];

    if (!event || event.type !== 'postback') return NextResponse.json({ message: 'OK' });

    // ✨ 修正ポイント：更新日時が新しい順に並べて、一番上の1件だけを取る
    const { data: channel, error } = await supabase
      .from('channels')
      .select('*')
      .eq('channel_id', destination)
      .order('updated_at', { ascending: false }) // 📅 最新順
      .limit(1) // ☝️ 1件のみ
      .maybeSingle();

    if (error || !channel) {
      console.error("⚠️ Channel Not Found for:", destination);
      return NextResponse.json({ message: 'OK' });
    }

    const client = new MessagingApiClient({ channelAccessToken: channel.access_token });
    const userId = event.source?.userId;
    const data = event.postback.data;

    // 切り替え先の決定
    let targetMenuId = null;
    if (data.includes('tab=1')) targetMenuId = channel.tab1_menu_id;
    else if (data.includes('tab=2')) targetMenuId = channel.tab2_menu_id;
    else if (data.includes('tab=3')) targetMenuId = channel.tab3_menu_id;

    if (targetMenuId && userId) {
      await client.linkRichMenuIdToUser(userId, targetMenuId);
      console.log(`🎯 切り替え成功: Tab ${data} -> ${targetMenuId}`);
    }

    return NextResponse.json({ message: 'OK' });

  } catch (err: any) {
    console.error("🔥 Webhook Error:", err.message);
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  }
}