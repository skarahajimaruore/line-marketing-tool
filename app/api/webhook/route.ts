import { messagingApi } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const { MessagingApiClient } = messagingApi;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export async function POST(req: Request) {
  try {
    const { destination, events } = await req.json();
    const event = events?.[0];
    if (event?.type !== 'postback') return NextResponse.json({ message: 'OK' });

    // ⚡️ DBにある「確定済みID」を爆速で取得
    const { data: ch } = await supabase
      .from('channels')
      .select('access_token, tab1_menu_id, tab2_menu_id, tab3_menu_id')
      .eq('channel_id', destination)
      .single();

    if (!ch) return NextResponse.json({ message: 'No Data' });

    const data = event.postback.data;
    const userId = event.source.userId;
    let targetId = null;

    // アルゴリズム：DBの値を割り当てるだけ
    if (data.includes('tab=1')) targetId = ch.tab1_menu_id;
    else if (data.includes('tab=2')) targetId = ch.tab2_menu_id;
    else if (data.includes('tab=3')) targetId = ch.tab3_menu_id;

    if (targetId && userId) {
      const client = new MessagingApiClient({ channelAccessToken: ch.access_token });
      await client.linkRichMenuIdToUser(userId, targetId);
    }

    return NextResponse.json({ message: 'OK' });
  } catch (err) {
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  }
}