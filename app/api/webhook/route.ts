import { messagingApi } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';

const { MessagingApiClient } = messagingApi;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * 💡 店舗ごとのリッチメニューを「動的」に切り替える処理
 */
async function processEventPerChannel(channel: any, event: any) {
  const userId = event.source?.userId;
  if (!userId) return;

  const client = new MessagingApiClient({
    channelAccessToken: channel.access_token,
  });

  try {
    let targetMenuId = "";
    let actionData = "";

    // 1. 宛先に応じて「DBに保存したURL」を使い分ける
    if (event.type === 'follow' || (event.type === 'postback' && event.postback.data === 'action=switch-home')) {
      // 🏠 ホームメニューへの切り替え
      targetMenuId = channel.home_menu_id; // ここもDBから取得
      actionData = "home";
    } else if (event.type === 'postback' && event.postback.data === 'action=switch-reserve') {
      // 📅 予約メニューへの切り替え
      targetMenuId = channel.reserve_menu_id; // ここもDBから取得
      actionData = "reserve";
    }

    if (targetMenuId) {
      // LINEのユーザーにメニューを紐付け
      await client.linkRichMenuIdToUser(userId, targetMenuId);
      
      // DBにログを残す（マルチテナント対応）
      await supabase.from('interaction_logs').insert({
        channel_id: channel.channel_id,
        line_user_id: userId,
        action_type: 'menu_switch',
        action_detail: actionData,
      });

      console.log(`✅ [${channel.name}] メニュー切り替え完了: ${actionData}`);
    }
  } catch (err) {
    console.error(`❌ [${channel.name}] エラー:`, err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const destination = body.destination;
    const events = body.events || [];

    // 🔑 宛先IDでDBから店舗情報を引く（ここがプラットフォームの心臓部）
    const { data: channel, error } = await supabase
      .from('channels')
      .select('*')
      .eq('channel_id', destination)
      .single();

    if (error || !channel) {
      console.error("❌ 未登録の店舗:", destination);
      return new Response("Not Found", { status: 404 });
    }

    for (const event of events) {
      await processEventPerChannel(channel, event);
    }

    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
  } catch (err) {
    console.error("❌ サーバーエラー:", err);
    return new Response("Error", { status: 500 });
  }
}