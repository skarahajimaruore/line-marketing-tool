import { messagingApi } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';

const { MessagingApiClient } = messagingApi;

// 1. Supabase クライアントの初期化
// ※ サーバーサイドなので SERVICE_ROLE_KEY を使うことで、RLSをバイパスして安全に操作できます
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '' 
);

/**
 * 💡 共通関数: 特定の店舗(channel)のコンテキストでイベントを処理する
 */
async function processEventPerChannel(channel: any, event: any) {
  const userId = event.source?.userId;
  if (!userId) return;

  // DBから取得したその店舗専用のアクセストークンでクライアントを初期化
  const client = new MessagingApiClient({
    channelAccessToken: channel.access_token,
  });

  // 環境変数からリッチメニューIDを取得
 
  const homeMenuId = channel.home_menu_id;
  const reserveMenuId = channel.reserve_menu_id;

  try {
    let label = "";
    let actionData = "";
    let targetMenuId = "";

    // 友だち追加時の処理
    if (event.type === 'follow') {
      targetMenuId = homeMenuId || '';
      label = "初期HOMEメニュー";
      actionData = "event=follow";
    } 
    // ポストバック（ボタン操作）時の処理
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
      // LINE側のメニュー切り替え
      await client.linkRichMenuIdToUser(userId, targetMenuId);
      
      // 履歴ログの保存（どの店舗のログか channel_id を紐付ける）
      await supabase.from('interaction_logs').insert({
        channel_id: channel.channel_id, 
        line_user_id: userId,
        action_type: 'menu_switch',
        action_detail: actionData,
      });

      // ユーザー名簿の更新（店舗IDとユーザーIDの組み合わせで一意に管理）
      await supabase.from('users').upsert({
        channel_id: channel.channel_id,
        line_user_id: userId,
        current_menu: actionData,
        updated_at: new Date().toISOString()
      }, { onConflict: 'channel_id,line_user_id' }); 
      
      console.log(`✅ [${channel.name}] 処理完了: ${label}`);
    }
  } catch (err) {
    console.error(`❌ [${channel.name}] 処理エラー:`, err);
  }
}

/**
 * 📩 Webhook エントリポイント
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const destination = body.destination; // LINEから届く「宛先ID」
    const events = body.events || [];

    console.log("---------------------------------------");
    console.log(`📩 Webhook受信 (Destination: ${destination})`);

    // 検証（Verify）などのイベントがない場合は200を返して終了
    if (!destination || events.length === 0) {
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    }

    // 🔑 宛先IDをキーに、DBから店舗の「鍵（トークン）」を検索
    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .select('*')
      .eq('channel_id', destination)
      .single();

    // DBに登録されていないボットからのリクエストは拒否（堅牢性）
    if (channelError || !channel) {
      console.error("❌ 未登録の店舗からのアクセスです:", destination);
      return new Response(JSON.stringify({ error: "Channel Not Found" }), { status: 404 });
    }

    // 届いた全イベントを、その店舗の権限で並列処理
    await Promise.all(events.map((event: any) => processEventPerChannel(channel, event)));

    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });

  } catch (error: any) {
    console.error("❌ サーバーエラー:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}