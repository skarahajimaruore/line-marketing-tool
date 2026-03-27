import { messagingApi } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const { MessagingApiClient } = messagingApi;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export async function POST(req: Request) {
  try {
    // 🌟 魔法の仕掛け：Webhook URLの "?shop=10桁の数字" から店舗IDを抜き取る
    const url = new URL(req.url);
    const shopChannelId = url.searchParams.get('shop');

    const body = await req.json();
    const events = body.events;

    // LINEからの死活監視や空イベントには即座にOKを返す
    if (!events || events.length === 0) return NextResponse.json({ message: 'OK' });
    
    const event = events[0];
    if (event.type !== 'postback') return NextResponse.json({ message: 'OK' });

    // ⚡️ 動的取得：今、手元でボタンを押した人の「生のID」を拾う
    const currentUserId = event.source.userId;
    const actionData = event.postback.data; 

    if (!shopChannelId) {
      console.error("❌ Webhook URLに ?shop= が設定されていません");
      return NextResponse.json({ message: 'No Shop ID' });
    }

    // 🔍 10桁の数字（shopChannelId）を使ってDBを検索
    const { data: channel } = await supabase
      .from('channels')
      .select('access_token, tab1_menu_id, tab2_menu_id, tab3_menu_id')
      .eq('channel_id', shopChannelId)
      .single();

    if (!channel || !currentUserId) {
      console.log(`❌ DBに店舗[${shopChannelId}]が見つからないか、ユーザーIDがありません`);
      return NextResponse.json({ message: 'No Data' });
    }

    // アクションに応じて切り替え先メニューIDを決定
    let targetMenuId = null;
    if (actionData.includes('tab=1')) targetMenuId = channel.tab1_menu_id;
    else if (actionData.includes('tab=2')) targetMenuId = channel.tab2_menu_id;
    else if (actionData.includes('tab=3')) targetMenuId = channel.tab3_menu_id;

    // 特定した「生のユーザーID」にメニューを紐付け
    if (targetMenuId) {
      const client = new MessagingApiClient({ channelAccessToken: channel.access_token });
      await client.linkRichMenuIdToUser(currentUserId, targetMenuId);
      console.log(`🎯 切替成功: 店舗[${shopChannelId}] ユーザー[${currentUserId}] -> メニュー[${targetMenuId}]`);
    }

    return NextResponse.json({ message: 'OK' });
  } catch (err: any) {
    console.error("🔥 Webhook Error:", err.message);
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  }
}