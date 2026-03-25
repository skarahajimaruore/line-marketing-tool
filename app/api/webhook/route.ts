import { messagingApi } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const { MessagingApiClient, MessagingApiBlobClient } = messagingApi;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ⚡ 爆速化のためのグローバルキャッシュ
const channelCache: Record<string, any> = {};

export async function POST(req: Request) {
  const body = await req.json();
  const { destination, events } = body;
  const event = events?.[0];

  if (!event || !destination) return NextResponse.json({ message: 'OK' });

  // 1. 🚀 キャッシュチェック
  let channel = channelCache[destination];

  if (!channel) {
    console.log("🔍 キャッシュなし：DBから取得します");
    const { data } = await supabase
      .from('channels')
      .select('*')
      .or(`channel_id.eq.${destination},id.eq.${destination}`)
      .single();

    if (!data) return NextResponse.json({ message: 'Unknown' });
    channel = data;
    channelCache[destination] = data; // キャッシュに保存
  }

  const client = new MessagingApiClient({ channelAccessToken: channel.access_token });
  const userId = event.source?.userId;
  if (!userId) return NextResponse.json({ message: 'OK' });

  // 2. ✨ 【新規作成ロジック】IDがなければ作成する（初回のみ重い）
  if (!channel.tab1_menu_id) {
    console.log("🚀 メニュー未作成：自動生成を開始します");
    const tabCount = channel.tab_count || 2;
    const newIds: any = {};
    try {
      for (let i = 1; i <= tabCount; i++) {
        const { richMenuId } = await client.createRichMenu({
          size: { width: 2500, height: 1686 },
          selected: i === 1,
          name: `${channel.name}_tab${i}`,
          chatBarText: "メニュー",
          areas: createTabAreas(tabCount) as any[],
        });
        newIds[`tab${i}_menu_id`] = richMenuId;
      }
      // DB更新
      await supabase.from('channels').update(newIds).eq('id', channel.id);
      // メモリ上のデータも更新して最新にする
      Object.assign(channel, newIds);
      channelCache[destination] = channel;
    } catch (err: any) {
      console.error("作成エラー:", err.message);
    }
  }

  // 3. タブ判定
  let currentTab = "1"; 
  if (event.type === 'postback') {
    const match = event.postback.data.match(/tab=(\d+)/);
    if (match) currentTab = match[1];
  }

  const targetMenuId = channel[`tab${currentTab}_menu_id`];
  const targetImageUrl = channel[`tab${currentTab}_image_url`];

  // 4. ⚡ 紐付け実行（画像同期は、未作成の時やエラー時のみバックグラウンドで）
  if (targetMenuId) {
    try {
      // ユーザーにメニューを紐付け（最優先）
      const linkPromise = client.linkRichMenuIdToUser(userId, targetMenuId);
      
      // 画像がない可能性がある場合のみ、裏で同期を試みる（awaitしないことで爆速化）
      if (targetImageUrl) {
        const blobClient = new MessagingApiBlobClient({ channelAccessToken: channel.access_token });
        syncImage(blobClient, targetMenuId, targetImageUrl).catch(() => {});
      }

      await linkPromise; // 紐付けの完了だけ待ってレスポンス
      console.log(`✨ Switched to Tab:${currentTab} (Cache Hit: ${!!channelCache[destination]})`);
    } catch (err) {
      console.error("Link Error");
    }
  }

  return NextResponse.json({ message: 'OK' });
}

// 🖼 画像同期（400エラー等は無視する設計）
async function syncImage(blobClient: any, menuId: string, url: string) {
  const res = await fetch(url);
  if (!res.ok) return;
  const blob = await res.blob();
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  await blobClient.setRichMenuImage(menuId, blob, contentType);
}

// 📐 タブエリア計算
function createTabAreas(count: number) {
  const areas = [];
  const tabWidth = Math.floor(2500 / count);
  for (let i = 0; i < count; i++) {
    areas.push({
      bounds: { x: i * tabWidth, y: 0, width: tabWidth, height: 350 },
      action: { type: "postback", data: `action=switch&tab=${i + 1}`, displayText: `タブ${i + 1}へ切替` }
    });
  }
  areas.push({
    bounds: { x: 0, y: 350, width: 2500, height: 1336 },
    action: { type: "postback", data: "action=main" }
  });
  return areas;
}
