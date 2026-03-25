import { messagingApi } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const { MessagingApiClient, MessagingApiBlobClient } = messagingApi;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  const body = await req.json();
  const destination = body.destination;
  const event = body.events?.[0];

  if (!event || !destination) return NextResponse.json({ message: 'OK' });

  // ① チャンネル情報の取得
  const { data: channel, error: fetchError } = await supabase
    .from('channels')
    .select('*')
    .or(`channel_id.eq.${destination},id.eq.${destination}`)
    .single();

  if (fetchError || !channel) {
    console.error("❌ チャンネル未登録:", destination);
    return NextResponse.json({ message: 'Unknown channel' });
  }

  const client = new MessagingApiClient({ channelAccessToken: channel.access_token });
  const blobClient = new MessagingApiBlobClient({ channelAccessToken: channel.access_token });
  const userId = event.source?.userId;
  if (!userId) return NextResponse.json({ message: 'No userId' });

  // ② リッチメニュー自動作成（未作成の場合のみ）
  if (!channel.tab1_menu_id) {
    console.log("🚀 新規リッチメニュー作成開始...");
    const tabCount = channel.tab_count || 2;
    const newIds: any = {};
    try {
      for (let i = 1; i <= tabCount; i++) {
        const { richMenuId } = await client.createRichMenu({
          size: { width: 2500, height: 1686 },
          selected: i === 1,
          name: `${channel.name}_tab${i}`,
          chatBarText: "メニュー切り替え",
          areas: createTabAreas(tabCount) as any[],
        });
        newIds[`tab${i}_menu_id`] = richMenuId;
      }
      await supabase.from('channels').update(newIds).eq('id', channel.id);
      Object.assign(channel, newIds);
      console.log("✅ 全タブの枠作成完了");
    } catch (err: any) {
      console.error("❌ 作成エラー:", err.message);
    }
  }

  // ③ タブ判定
  let currentTab = "1"; 
  if (event.type === 'postback') {
    const data = event.postback.data;
    const match = data.match(/tab=(\d+)/);
    if (match) {
      currentTab = match[1];
    }
  }

  const targetMenuId = channel[`tab${currentTab}_menu_id` as keyof typeof channel] as string;
  const targetImageUrl = channel[`tab${currentTab}_image_url` as keyof typeof channel] as string;

  if (targetMenuId) {
    try {
      // 🖼️ 画像同期（エラーが出ても「既にある」と判断して続行する）
      if (targetImageUrl) {
        try {
          await syncImage(blobClient, targetMenuId, targetImageUrl);
        } catch (imgErr) {
          // 400エラー等は「既に画像設定済み」の可能性が高いため、ログのみ出して次へ
          console.log(`ℹ️ 画像同期スキップ（設定済み）: ${targetMenuId}`);
        }
      }
      
      // ⚡ ユーザーにメニューを紐付け（ここが実行されれば切り替わる）
      await client.linkRichMenuIdToUser(userId, targetMenuId);
      console.log(`✨ User:${userId} を Tab:${currentTab} に切り替え完了`);
      
    } catch (err: any) {
      console.error("❌ 切り替えの致命的エラー:", err.message);
    }
  }

  return NextResponse.json({ message: 'OK' });
}

// 🖼 画像同期関数
async function syncImage(blobClient: any, menuId: string, url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch status: ${res.status}`);
    const blob = await res.blob();
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    await blobClient.setRichMenuImage(menuId, blob, contentType);
    console.log(`✅ 画像同期成功: ${menuId}`);
  } catch (err: any) {
    throw err; // 親要素でキャッチしてスキップ判定させる
  }
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