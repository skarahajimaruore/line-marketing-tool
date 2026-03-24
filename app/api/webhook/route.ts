import { messagingApi } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';

const { MessagingApiClient } = messagingApi;

// Supabase クライアントの初期化
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '' // セキュリティのため、サーバー側ではSERVICE_ROLE推奨
);

/**
 * 💡 共通関数: 特定の店舗(channel)のコンテキストで処理を行う
 */
async function processEventPerChannel(channel: any, event: any) {
  const userId = event.source?.userId;
  if (!userId) return;

  // 取得した店舗専用のトークンでクライアントを初期化
  const client = new MessagingApiClient({
    channelAccessToken: channel.access_token,
  });

  // リッチメニューIDの取得（将来的にDBのchannelsテーブルに持たせるとさらにレバレッジが効きます）
  const homeMenuId = process.env.HOME_RICH_MENU_ID;
  const reserveMenuId = process.env.RESERVE_RICH_MENU_ID;

  try {
    let label = "";
    let actionData = "";
    let targetMenuId = "";

    // 1. 友だち追加時
    if (event.type === 'follow') {
      targetMenuId = homeMenuId || '';
      label = "初期HOMEメニュー";
      actionData = "event=follow";
    } 
    // 2. ボタン操作時
    else if (event.type === 'postback') {
      actionData = event.postback?.data;
      if (actionData === 'action=switch-home') {
        targetMenuId = homeMenuId || '';
        label = "HOMEメニュー";
      } else if (actionData === 'action=switch-reserve') {
        targetMenuId = reserveMenuId || '';
        label = "RESERVEメニュー";
      }
    }

    if (targetMenuId) {
      // LINE側切り替え
      await client.linkRichMenuIdToUser(userId, targetMenuId);
      
      // DB保存（channel_id を紐付けるのがポイント！）
      await supabase.from('interaction_logs').insert({
        channel_id: channel.channel_id, // どの店舗のログか
        line_user_id: userId,
        action_type: 'menu_switch',
        action_detail: actionData,
      });

      // ユーザー名簿の更新（ここも channel_id で分離）
      await supabase.from('users').upsert({
        channel_id: channel.channel_id,
        line_user_id: userId,
        current_menu: actionData,
        updated_at: new Date().toISOString()
      }, { onConflict: 'channel_id,line_user_id' }); // 店舗ごと×ユーザーごとの一意性
      
      console.log(`✅ [${channel.name}] 処理完了: ${label}`);
    }
  } catch (err) {
    console.error(`❌ [${channel.name}] 処理エラー:`, err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const events = body.events || [];
    const destination = body.destination;

    return new Response(JSON.stringify({ 
      message: `あなたのボットのIDは [${body.destination}] です` 
    }), { status: 200 });
    // 🔑 宛先IDを使って、DBから店舗の「鍵」を取得（マルチテナントの核心）
    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .select('*')
      .eq('channel_id', destination)
      .single();

    if (channelError || !channel) {
      console.error("❌ 未登録の店舗です:", destination);
      return new Response(JSON.stringify({ error: "Channel Not Found" }), { status: 404 });
    }

    // 各イベントをその店舗の権限で処理
    for (const event of events) {
      await processEventPerChannel(channel, event);
    }

    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });

  } catch (error: any) {
    console.error("❌ サーバーエラー:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}