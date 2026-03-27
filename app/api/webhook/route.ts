import { messagingApi } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const { MessagingApiClient } = messagingApi;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export async function POST(req: Request) {
  try {
    const { destination, events } = await req.json();
    
    // イベントがない場合は即座に200 OKを返す（LINEの死活監視対応）
    if (!events || events.length === 0) return NextResponse.json({ message: 'OK' });
    
    const event = events[0];
    if (event.type !== 'postback') return NextResponse.json({ message: 'OK' });

    // ⚡️ ここが最重要：「今、手元でボタンを押した人」の正確なIDをLINEから直接抜き取る
    const currentUserId = event.source.userId;
    const actionData = event.postback.data; // 例: "action=switch&tab=2"

    // データベースから、この店舗（destination）の最新設定を呼び出す
    const { data: channel } = await supabase
      .from('channels')
      .select('access_token, tab1_menu_id, tab2_menu_id, tab3_menu_id')
      .eq('channel_id', destination)
      .single();

    if (!channel || !currentUserId) return NextResponse.json({ message: 'No Data' });

    // 押されたタブに応じて、切り替え先のメニューIDを決定
    let targetMenuId = null;
    if (actionData.includes('tab=1')) targetMenuId = channel.tab1_menu_id;
    else if (actionData.includes('tab=2')) targetMenuId = channel.tab2_menu_id;
    else if (actionData.includes('tab=3')) targetMenuId = channel.tab3_menu_id;

    // 特定した「生のユーザーID」に対して、メニューを紐付ける
    if (targetMenuId) {
      const client = new MessagingApiClient({ channelAccessToken: channel.access_token });
      await client.linkRichMenuIdToUser(currentUserId, targetMenuId);
      console.log(`🎯 切替成功: ユーザー[${currentUserId}] -> メニュー[${targetMenuId}]`);
    }

    return NextResponse.json({ message: 'OK' });
  } catch (err: any) {
    console.error("🔥 Webhook Error:", err.message);
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  }
}