import { messagingApi } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const { MessagingApiClient } = messagingApi;

// 1. Supabaseクライアントの初期化
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  const body = await req.json();
  const destination = body.destination;
  const event = body.events[0];

  // LINEからの正常なリクエストかチェック
  if (!event || !destination) return NextResponse.json({ message: 'OK' });

  // 2. DBから店舗（チャンネル）情報を取得
  const { data: channel, error: dbError } = await supabase
    .from('channels')
    .select('*')
    .eq('channel_id', destination)
    .single();

  if (dbError || !channel) {
    console.error("❌ 未登録のチャンネル:", destination);
    return NextResponse.json({ message: 'Unknown Channel' });
  }

  const client = new MessagingApiClient({ channelAccessToken: channel.access_token });
  const userId = event.source.userId;

  // 3. ⚡️【コア機能】IDが未発行なら、その場でタブ数分作成する
  if (!channel.tab1_id && channel.tab1_url) {
    console.log(`🚀 ${channel.name} のリッチメニューを自動生成します...`);
    const newIds = await initializeRichMenus(client, channel);
    
    // 発行直後の情報を反映
    Object.assign(channel, newIds);

    // 最初に表示するメニュー（Tab1）をユーザーに紐付け
    if (userId) {
      await client.linkRichMenuIdToUser(userId, channel.tab1_id);
    }
  }

  // 4. すでにIDがある場合、初回のメッセージ等でメニューを確実に表示させる
  if (channel.tab1_id && userId && event.type !== 'postback') {
    await client.linkRichMenuIdToUser(userId, channel.tab1_id);
  }

  // 5. タブ切り替え処理（ボタンが押された時）
  if (event.type === 'postback') {
    const params = new URLSearchParams(event.postback.data);
    const tabNum = params.get('tab'); // "1", "2", "3", "4"

    if (tabNum && userId) {
      const menuId = channel[`tab${tabNum}_id`];
      const imageUrl = channel[`tab${tabNum}_url`];

      if (menuId) {
        // 画像がURLとして登録されていれば同期（念のための再同期）
        if (imageUrl) {
          await syncImage(client, menuId, imageUrl);
        }
        // メニューの切り替え実行
        await client.linkRichMenuIdToUser(userId, menuId);
        console.log(`✅ Tab${tabNum} へ切り替え完了`);
      }
    }
  }

  return NextResponse.json({ message: 'OK' });
}

// --- 🛠️ 内部ロジック用補助関数 ---

/**
 * DBの設定（tab_count）に基づいてリッチメニューIDを複数発行し、画像をアップロードする
 */
async function initializeRichMenus(client: any, channel: any) {
  const count = channel.tab_count || 2; // 指定がなければデフォルト2タブ
  const newIds: any = {};

  for (let i = 1; i <= count; i++) {
    // リッチメニューの設計図作成
    const richMenu = {
      size: { width: 2500, height: 1686 },
      selected: (i === 1),
      name: `${channel.name}_tab${i}`,
      chatBarText: "メニュー",
      areas: createTabAreas(count) // タブ数に合わせてボタン位置を自動計算
    };

    // LINEに登録してIDを取得
    const { richMenuId } = await client.createRichMenu(richMenu);
    newIds[`tab${i}_id`] = richMenuId;
    
    // 画像URLがあればアップロード
    const imageUrl = channel[`tab${i}_url`];
    if (imageUrl) {
      await syncImage(client, richMenuId, imageUrl);
    }
  }

  // 発行したすべてのIDをSupabaseに一括保存
  await supabase.from('channels').update(newIds).eq('id', channel.id);
  console.log("✅ 全タブのID発行・保存・画像同期が完了しました");
  
  return newIds;
}

/**
 * 指定したURLから画像をダウンロードし、LINEのリッチメニューIDに紐付ける
 */
async function syncImage(client: any, menuId: string, url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`画像取得失敗: ${res.status}`);
    const blob = await res.blob();
    await client.setRichMenuImage(menuId, blob);
  } catch (err) {
    console.error(`❌ 画像同期エラー (${menuId}):`, err);
  }
}

/**
 * タブ数（1〜4）に応じて、画面上部のタップエリアを均等に分割計算する
 */
function createTabAreas(count: number) {
  const areas = [];
  const tabHeight = 300; // タブボタンの高さ
  const screenWidth = 2500;
  const tabWidth = Math.floor(screenWidth / count);

  for (let i = 0; i < count; i++) {
    areas.push({
      bounds: { 
        x: i * tabWidth, 
        y: 0, 
        width: tabWidth, 
        height: tabHeight 
      },
      action: { 
        type: "postback", 
        data: `action=switch&tab=${i + 1}` 
      }
    });
  }

  // 下部のメインコンテンツエリア（全体）
  areas.push({
    bounds: { x: 0, y: tabHeight, width: screenWidth, height: 1686 - tabHeight },
    action: { type: "postback", data: "action=main_click" }
  });

  return areas;
}