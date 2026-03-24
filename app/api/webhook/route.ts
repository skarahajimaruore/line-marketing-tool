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
  if (!channel) return NextResponse.json({ message: 'Unknown' });

  const client = new MessagingApiClient({ channelAccessToken: channel.access_token });

  // 2. ⚡️【魔法】IDがなければその場で作るロジック
  // 例としてtab1_idがない場合に、設定されたtab_count分だけ一気に作成
  if (!channel.tab1_id && channel.tab1_url) {
    await initializeRichMenus(client, channel);
  }

  // 3. タブ切り替え処理
  if (event.type === 'postback') {
    const params = new URLSearchParams(event.postback.data);
    const tabNum = params.get('tab'); // "1", "2", "3", "4"

    if (tabNum) {
      const menuId = channel[`tab${tabNum}_id`];
      const imageUrl = channel[`tab${tabNum}_url`];

      // 画像が未アップロードなら同期
      if (menuId && imageUrl) {
        await syncImage(client, menuId, imageUrl);
      }
      // メニューを切り替え
      await client.linkRichMenuIdToUser(event.source.userId!, menuId);
    }
  }

  return NextResponse.json({ message: 'OK' });
}

// 🛠️ リッチメニューを自動生成する関数
async function initializeRichMenus(client: any, channel: any) {
  const count = channel.tab_count || 2;
  const newIds: any = {};

  for (let i = 1; i <= count; i++) {
    // タブ数に合わせたボタン配置（簡易版：上部にタブボタンを並べる設計）
    const richMenu = {
      size: { width: 2500, height: 1686 },
      selected: false,
      name: `${channel.name}_tab${i}`,
      chatBarText: "メニュー",
      areas: createTabAreas(count) // タブ数に応じてクリックエリアを自動生成
    };

    const { richMenuId } = await client.createRichMenu(richMenu);
    newIds[`tab${i}_id`] = richMenuId;
    
    // 初回画像アップロード
    if (channel[`tab${i}_url`]) {
      await syncImage(client, richMenuId, channel[`tab${i}_url`]);
    }
  }

  // 発行したIDをDBに保存（次からはこれを使う）
  await supabase.from('channels').update(newIds).eq('id', channel.id);
}

// 🖼️ 画像同期
async function syncImage(client: any, menuId: string, url: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  await client.setRichMenuImage(menuId, blob);
}

// 📐 タブ数に応じてクリックエリア（ボタン）の座標を計算する関数
function createTabAreas(count: number) {
  const areas = [];
  const width = 2500 / count;
  for (let i = 0; i < count; i++) {
    areas.push({
      bounds: { x: Math.floor(i * width), y: 0, width: Math.floor(width), height: 300 }, // 上部300pxをタブ領域とする
      action: { type: "postback", data: `action=switch&tab=${i + 1}` }
    });
  }
  // 下部はメインコンテンツエリア（例として全体）
  areas.push({
    bounds: { x: 0, y: 300, width: 2500, height: 1386 },
    action: { type: "uri", uri: "https://google.com" } // ここを予約URLなどに変える
  });
  return areas;
}