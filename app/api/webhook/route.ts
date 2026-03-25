import { messagingApi } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const { MessagingApiClient } = messagingApi;

// Supabaseクライアントの初期化
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

  console.log("📍 アクセス中のURL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log("📍 検索キー (destination):", destination);

  // ① チャンネル情報の取得（BotのUser ID または 主キーで検索）
  const { data: channel, error: fetchError } = await supabase
    .from('channels')
    .select('*')
    .or(`channel_id.eq.${destination},id.eq.${destination}`)
    .single();

  if (fetchError || !channel) {
    console.error("❌ チャンネルが見つかりません:", destination);
    return NextResponse.json({ message: 'Unknown channel' });
  }

  const client = new MessagingApiClient({
    channelAccessToken: channel.access_token,
  });

  const userId = event.source?.userId;
  if (!userId) return NextResponse.json({ message: 'No userId' });

  // =========================================
  // ② リッチメニューIDがなければ「枠」を自動作成
  // =========================================
  if (!channel.tab1_menu_id) {
    console.log("🚀 リッチメニュー未作成を検知 → 自動発行を開始します");

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
        console.log(`✅ Tab${i} 作成成功: ${richMenuId}`);
      }

      // 💾 DBにIDを書き込み
      const { error: updateError } = await supabase
        .from('channels')
        .update(newIds)
        .eq('id', channel.id);

      if (updateError) {
        console.error("❌ DB書き込み失敗:", updateError.message);
      } else {
        console.log("✅ SupabaseにリッチメニューIDを保存しました");
        Object.assign(channel, newIds);
      }
    } catch (err: any) {
      console.error("❌ LINE API エラー:", err.message);
    }
  }

  // =========================================
  // ③ タブ判定 & 画像同期 & 紐付け
  // =========================================
  const currentTab = event.type === 'postback'
      ? (new URLSearchParams(event.postback.data).get('tab') || "1")
      : "1";

  const targetMenuId = channel[`tab${currentTab}_menu_id`];
  const targetImageUrl = channel[`tab${currentTab}_image_url`];

  if (targetMenuId && userId) {
    try {
      // 🖼️ 画像があればアップロード（これを待たないと link でエラーになる）
      if (targetImageUrl) {
        await syncImage(client, targetMenuId, targetImageUrl);
      }
      
      // ユーザーにメニューを表示
      await client.linkRichMenuIdToUser(userId, targetMenuId);
      console.log(`📱 User:${userId} に Tab:${currentTab} を表示完了`);
    } catch (err: any) {
      console.error("❌ 最終処理でのエラー:", err.message);
      // 詳細なエラー内容（LINEからのレスポンス）をログに出す
      if (err.body) console.error("❌ エラー詳細:", err.body);
    }
  }

  return NextResponse.json({ message: 'OK' });
}

// 🖼 画像同期関数
async function syncImage(client: any, menuId: string, url: string) {
  try {
    console.log(`📥 画像取得開始: ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch status: ${res.status}`);
    
    // Blobとして取得し、LINEに送信
    const blob = await res.blob();
    await client.setRichMenuImage(menuId, blob);
    console.log(`✅ 画像アップロード成功: ${menuId}`);
  } catch (err: any) {
    console.error("❌ 画像アップロード失敗:", err.message);
    throw err; // 上位の処理で検知できるように再スロー
  }
}

// 📐 タブエリア計算
function createTabAreas(count: number) {
  const areas = [];
  const tabWidth = Math.floor(2500 / count);
  for (let i = 0; i < count; i++) {
    areas.push({
      bounds: { x: i * tabWidth, y: 0, width: tabWidth, height: 300 },
      action: { type: "postback", data: `action=switch&tab=${i + 1}` },
    });
  }
  areas.push({
    bounds: { x: 0, y: 300, width: 2500, height: 1386 },
    action: { type: "postback", data: "action=main" },
  });
  return areas;
}