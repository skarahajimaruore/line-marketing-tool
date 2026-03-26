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

    // 1. DBからチャンネル情報を取得
    const { data: channel, error } = await supabase
      .from('channels')
      .select('*')
      .eq('channel_id', destination)
      .single();

    if (error || !channel) return NextResponse.json({ message: 'Channel Not Found' });

    const client = new MessagingApiClient({ channelAccessToken: channel.access_token });
    const userId = event.source?.userId;
    const data = event.postback.data;

    // 2. A・Bと同じ判定ロジックでターゲットIDを決定
    let targetMenuId = null;
    if (data.includes('tab=1')) targetMenuId = channel.tab1_menu_id;
    else if (data.includes('tab=2')) targetMenuId = channel.tab2_menu_id;
    else if (data.includes('tab=3')) targetMenuId = channel.tab3_menu_id;

    if (targetMenuId && userId) {
      await client.linkRichMenuIdToUser(userId, targetMenuId);
      console.log(`🎯 ${destination}: Tab切り替え完了 -> ${targetMenuId}`);
    }

    return NextResponse.json({ message: 'OK' });

  } catch (err: any) {
    console.error("🔥 Webhook Error:", err.message);
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  }
}