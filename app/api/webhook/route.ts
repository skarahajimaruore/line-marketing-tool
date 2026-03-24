import { messagingApi } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const { MessagingApiClient } = messagingApi;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  const body = await req.json();
  const destination = body.destination;
  const event = body.events?.[0];

  if (!event || !destination) {
    return NextResponse.json({ message: 'OK' });
  }

  // ① チャンネル取得（Bot User IDで判定）
  const { data: channel } = await supabase
    .from('channels')
    .select('*')
    .eq('channel_id', destination)
    .single();

  if (!channel) {
    return NextResponse.json({ message: 'Unknown channel' });
  }

  const client = new MessagingApiClient({
    channelAccessToken: channel.access_token,
  });

  const userId = event.source?.userId;
  if (!userId) {
    return NextResponse.json({ message: 'No userId' });
  }

  // =========================================
  // ② リッチメニューIDがなければ作成（1回だけ）
  // =========================================
  if (!channel.tab1_menu_id) {
    console.log("🚀 リッチメニュー未作成 → 作成開始");

    const tabCount = channel.tab_count || 2;
    const newIds: any = {};

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

    // DB保存
    await supabase
      .from('channels')
      .update(newIds)
      .eq('id', channel.id);

    Object.assign(channel, newIds);
  }

  // =========================================
  // ③ 現在のタブ判定
  // =========================================
  const currentTab =
    event.type === 'postback'
      ? new URLSearchParams(event.postback.data).get('tab') || "1"
      : "1";

  const targetMenuId = channel[`tab${currentTab}_menu_id`];
  const targetImageUrl = channel[`tab${currentTab}_image_url`];

  // =========================================
  // ④ 画像アップロード（まだなら）
  // =========================================
  if (targetMenuId && targetImageUrl) {
    await syncImage(client, targetMenuId, targetImageUrl);
  }

  // =========================================
  // ⭐ ⑤ ここが超重要：ユーザーに紐付け
  // =========================================
  if (targetMenuId && userId) {
    await client.linkRichMenuIdToUser(userId, targetMenuId);
  }

  return NextResponse.json({ message: 'OK' });
}


// =========================================
// 画像同期
// =========================================
async function syncImage(client: any, menuId: string, url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) return;

    const blob = await res.blob();
    await client.setRichMenuImage(menuId, blob);
  } catch (err) {
    console.error("Image Sync Error:", err);
  }
}


// =========================================
// タブUI
// =========================================
function createTabAreas(count: number) {
  const areas = [];
  const tabWidth = Math.floor(2500 / count);

  for (let i = 0; i < count; i++) {
    areas.push({
      bounds: {
        x: i * tabWidth,
        y: 0,
        width: tabWidth,
        height: 300,
      },
      action: {
        type: "postback",
        data: `action=switch&tab=${i + 1}`,
      },
    });
  }

  areas.push({
    bounds: { x: 0, y: 300, width: 2500, height: 1386 },
    action: { type: "postback", data: "main" },
  });

  return areas;
}