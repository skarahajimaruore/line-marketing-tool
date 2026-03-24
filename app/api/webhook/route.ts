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
  const event = body.events[0];

  if (!event || !destination) return NextResponse.json({ message: 'OK' });

  // 1. DBから店舗情報を取得
  const { data: channel } = await supabase.from('channels').select('*').eq('channel_id', destination).single();
  if (!channel) return NextResponse.json({ message: 'Unknown Channel' });

  const client = new MessagingApiClient({ channelAccessToken: channel.access_token });
  const userId = event.source.userId;

  // 2. ⚡️【自動発行】tab1_menu_id が Null かつ tab1_image_url がある場合
  if (!channel.tab1_menu_id && channel.tab1_image_url) {
    console.log(`🚀 ${channel.name} のメニュー自動生成を開始（カラム名修正済）`);
    const newIds = await initializeRichMenus(client, channel);
    
    Object.assign(channel, newIds);

    if (userId) {
      await client.linkRichMenuIdToUser(userId, channel.tab1_menu_id);
    }
  }

  // 3. メニューの紐付け（初回メッセージ時など）
  if (channel.tab1_menu_id && userId && event.type !== 'postback') {
    await client.linkRichMenuIdToUser(userId, channel.tab1_menu_id);
  }

  // 4. タブ切り替え処理
  if (event.type === 'postback') {
    const params = new URLSearchParams(event.postback.data);
    const tabNum = params.get('tab');

    if (tabNum && userId) {
      const menuId = channel[`tab${tabNum}_menu_id`];
      const imageUrl = channel[`tab${tabNum}_image_url`];

      if (menuId) {
        if (imageUrl) await syncImage(client, menuId, imageUrl);
        await client.linkRichMenuIdToUser(userId, menuId);
        console.log(`✅ Tab${tabNum} 切り替え完了`);
      }
    }
  }

  return NextResponse.json({ message: 'OK' });
}

// --- 🛠️ 補助関数 ---

async function initializeRichMenus(client: any, channel: any) {
  const count = channel.tab_count || 2;
  const newIds: any = {};

  for (let i = 1; i <= count; i++) {
    const richMenu = {
      size: { width: 2500, height: 1686 },
      selected: (i === 1),
      name: `${channel.name}_tab${i}`,
      chatBarText: "メニュー",
      areas: createTabAreas(count)
    };

    const { richMenuId } = await client.createRichMenu(richMenu);
    newIds[`tab${i}_menu_id`] = richMenuId; // 👈 修正：tabX_menu_id
    
    const imageUrl = channel[`tab${i}_image_url`]; // 👈 修正：tabX_image_url
    if (imageUrl) {
      await syncImage(client, richMenuId, imageUrl);
    }
  }

  await supabase.from('channels').update(newIds).eq('id', channel.id);
  return newIds;
}

async function syncImage(client: any, menuId: string, url: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    await client.setRichMenuImage(menuId, blob);
  } catch (err) {
    console.error(`❌ 画像同期エラー:`, err);
  }
}

function createTabAreas(count: number) {
  const areas = [];
  const tabWidth = Math.floor(2500 / count);
  for (let i = 0; i < count; i++) {
    areas.push({
      bounds: { x: i * tabWidth, y: 0, width: tabWidth, height: 300 },
      action: { type: "postback", data: `action=switch&tab=${i + 1}` }
    });
  }
  areas.push({
    bounds: { x: 0, y: 300, width: 2500, height: 1386 },
    action: { type: "postback", data: "action=main_click" }
  });
  return areas;
}