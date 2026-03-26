import { messagingApi } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const { MessagingApiClient, MessagingApiBlobClient } = messagingApi;

// Vercelでの動作を安定させるための設定
export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const channelCache: Record<string, any> = {};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { destination, events } = body;
    const event = events?.[0];

    if (!event || !destination) return NextResponse.json({ message: 'OK' });

    // 1. キャッシュまたはDBから店舗情報を取得
    let channel = channelCache[destination];
    if (!channel) {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('channel_id', destination)
        .single();

      if (error || !data) return NextResponse.json({ message: 'Channel Not Found' });
      channel = data;
      channelCache[destination] = data;
    }

    const client = new MessagingApiClient({ channelAccessToken: channel.access_token });
    const userId = event.source?.userId;
    if (!userId) return NextResponse.json({ message: 'OK' });

    // =========================================
    // 🚀 【初回のみ】IDがなければ自動作成
    // =========================================
    if (!channel.tab1_menu_id || !channel.tab2_menu_id) {
      console.log("🛠️ ID未発行を検知：自動作成を開始します");
      const success = await createAndSaveRichMenu(channel, client);
      if (!success) return NextResponse.json({ message: 'Creation Failed' });
      
      // DB更新後の最新データを再取得してキャッシュ更新
      const { data: updated } = await supabase.from('channels').select('*').eq('id', channel.id).single();
      channel = updated;
      channelCache[destination] = updated;
    }

    // =========================================
    // ⚡ 【運用】爆速タブ切り替え（IDがある前提）
    // =========================================
    if (event.type === 'postback') {
      const isTab2 = event.postback.data.includes('tab=2');
      const targetMenuId = isTab2 ? channel.tab2_menu_id : channel.tab1_menu_id;

      if (targetMenuId) {
        // 🚀 A店・B店ともに、ここを通る時は「紐付け」だけの最短ルート
        await client.linkRichMenuIdToUser(userId, targetMenuId);
        console.log(`🎯 Tab ${isTab2 ? 2 : 1} へ切り替え完了`);
      }
    }

    return NextResponse.json({ message: 'OK' });

  } catch (err: any) {
    console.error("🔥 全体エラー:", err.message);
    return NextResponse.json({ message: 'Error' });
  }
}

// =========================================
// 📦 【共通関数】ID発行・画像UP・DB保存
// =========================================
async function createAndSaveRichMenu(channel: any, client: any) {
  try {
    const blobClient = new MessagingApiBlobClient({ channelAccessToken: channel.access_token });
    const tabCount = channel.tab_count || 2;
    const newIds: any = {};

    for (let i = 1; i <= tabCount; i++) {
      const { richMenuId } = await client.createRichMenu({
        size: { width: 2500, height: 1686 },
        selected: i === 1,
        name: `${channel.name}_tab${i}`,
        chatBarText: "メニュー",
        areas: createTabAreas(tabCount)
      });
      
      const imageUrl = channel[`tab${i}_image_url`];
      if (imageUrl) {
        const res = await fetch(imageUrl);
        if (!res.ok) throw new Error(`画像取得失敗: ${imageUrl}`);
        
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 🔥 ここが修正ポイント！引数を2つにするだけ
        await blobClient.setRichMenuImage(richMenuId, buffer as any);
        
        console.log(`📸 画像UP完了: Tab ${i}`);
      }
      newIds[`tab${i}_menu_id`] = richMenuId;
    }

    await supabase.from('channels').update(newIds).eq('id', channel.id);
    return true;
  } catch (err: any) {
    console.error("❌ 作成エラー:", err.message);
    return false;
  }
}
   

// 📐 タブエリア計算（クリック範囲の定義）
function createTabAreas(count: number): any[] {
  const areas = [];
  const tabWidth = Math.floor(2500 / count);
  for (let i = 0; i < count; i++) {
    areas.push({
      bounds: { x: i * tabWidth, y: 0, width: tabWidth, height: 350 },
      action: { type: "postback", data: `action=switch&tab=${i + 1}` }
    });
  }
  areas.push({
    bounds: { x: 0, y: 350, width: 2500, height: 1336 },
    action: { type: "postback", data: "action=main" }
  });
  return areas;
}