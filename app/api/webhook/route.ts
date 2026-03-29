import { messagingApi } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

//const： 一度入れたら最後、中身を入れ替えようとするとエラーになる変数
//let： 後から中身を自由に入れ替えられる変数
//letで記述すると、変数が変更される可能性があり、数値を追う必要がある。constで記述することによってその可能性を排除している
//種類 名前 = 中身;
const { MessagingApiClient } = messagingApi;
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export async function POST(req: Request) {
  try {
    // 1. 【ガード節】 必要な材料（Shop ID）がなければ即座に終了
    const url = new URL(req.url);
    const shopChannelId = url.searchParams.get('shop');
    if (!shopChannelId) return NextResponse.json({ message: 'No Shop ID' }, { status: 400 });

    // 2. 【ガード節】 LINEからのイベントがなければ終了
    const { events } = await req.json();
    if (!events?.length) return NextResponse.json({ message: 'OK' });
    
    const event = events[0];
    if (event.type !== 'postback') return NextResponse.json({ message: 'OK' });

    // 3. 必要な情報を整理（ネストを浅く保つ）
    const currentUserId = event.source.userId;
    const actionData = event.postback.data; 

    // 4. DBから店舗情報を取得
    const { data: channel } = await supabase
      .from('channels')
      .select('access_token, tab1_menu_id, tab2_menu_id, tab3_menu_id')
      .eq('channel_id', shopChannelId)
      .single();

    if (!channel || !currentUserId) return NextResponse.json({ message: 'No Data' });

    // 5. 【改善】 マッピングオブジェクトを使って、どのタブかを判定
    const menuMap: Record<string, string> = {
      'tab=1': channel.tab1_menu_id,
      'tab=2': channel.tab2_menu_id,
      'tab=3': channel.tab3_menu_id,
    };

    // 該当するタブのIDを探す（if-elseを繰り返さない！）
    const targetMenuId = Object.keys(menuMap).find(key => actionData.includes(key)) 
                         ? menuMap[Object.keys(menuMap).find(key => actionData.includes(key))!] 
                         : null;

    if (targetMenuId) {
      const client = new MessagingApiClient({ channelAccessToken: channel.access_token });
      await client.linkRichMenuIdToUser(currentUserId, targetMenuId);
      console.log(`🎯 切替成功: 店[${shopChannelId}] ユーザー[${currentUserId}]`);
    }

    return NextResponse.json({ message: 'OK' });
  } catch (err: any) {
    console.error("🔥 Webhook Error:", err.message);
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  }
}