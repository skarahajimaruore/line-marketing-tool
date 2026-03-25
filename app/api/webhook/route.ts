import { messagingApi } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const { MessagingApiClient } = messagingApi;

// 1. クライアントの初期化
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ⚡【キャッシュ用のメモリ】関数の外に置くことで、リクエスト間でデータを共有
const channelCache: Record<string, { 
  token: string, 
  tab1: string, 
  tab2: string,
  id: string 
}> = {};

export async function POST(req: Request) {
  const body = await req.json();
  const destination = body.destination;
  const event = body.events?.[0];

  if (!event || !destination) return NextResponse.json({ message: 'OK' });

  // 2. 🚀【キャッシュ・ファースト】メモリにあればDBは見ない！
  let channel = channelCache[destination];

  if (!channel) {
    console.log("🔍 キャッシュなし：Supabaseから取得します");
    const { data, error } = await supabase
      .from('channels')
      .select('id, access_token, tab1_menu_id, tab2_menu_id')
      .eq('channel_id', destination)
      .single();

    if (error || !data) return NextResponse.json({ message: 'OK' });

    // キャッシュに保存
    channel = {
      id: data.id,
      token: data.access_token,
      tab1: data.tab1_menu_id,
      tab2: data.tab2_menu_id
    };
    channelCache[destination] = channel;
  } else {
    console.log("⚡ キャッシュHit！DB通信をスキップしました");
  }

  const userId = event.source?.userId;
  if (!userId) return NextResponse.json({ message: 'OK' });

  // 3. タブ判定
  let targetMenuId = channel.tab1;
  if (event.type === 'postback') {
    const data = event.postback.data;
    if (data.includes('tab=2')) targetMenuId = channel.tab2;
  }

  // 4. 紐付け実行（画像同期は完全に無視してLinkのみに特化）
  if (targetMenuId) {
    const client = new MessagingApiClient({ channelAccessToken: channel.token });
    try {
      await client.linkRichMenuIdToUser(userId, targetMenuId);
    } catch (err) {
      console.error("Link failed");
    }
  }

  return NextResponse.json({ message: 'OK' });
}