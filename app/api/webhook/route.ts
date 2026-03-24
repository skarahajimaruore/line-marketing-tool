import { messagingApi } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';

const { MessagingApiClient } = messagingApi;

// Supabase クライアントの初期化
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '' 
);

/**
 * 💡 各店舗(channel)ごとの処理
 */
async function processEventPerChannel(channel: any, event: any) {
  const userId = event.source?.userId;
  if (!userId) return;

  const client = new MessagingApiClient({
    channelAccessToken: channel.access_token,
  });

  const homeMenuId = process.env.HOME_RICH_MENU_ID;
  const reserveMenuId = process.env.RESERVE_RICH_MENU_ID;

  try {
    let label = "";
    let actionData = "";
    let targetMenuId = "";

    if (event.type === 'follow') {
      targetMenuId = homeMenuId || '';
      label = "初期HOMEメニュー";
      actionData = "event=follow";
    } 
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
      await client.linkRichMenuIdToUser(userId, targetMenuId);
      
      // ログ保存
      await supabase.from('interaction_logs').insert({
        channel_id: channel.channel_id,
        line_user_id: userId,
        action_type: 'menu_switch',
        action_detail: actionData,
      });

      // 名簿更新
      await supabase.from('users').upsert({
        channel_id: channel.channel_id,
        line_user_id: userId,
        current_menu: actionData,
        updated_at: new Date().toISOString()
      }, { onConflict: 'channel_id,line_user_id' });
      
      console.log(`✅ [${channel.name}] 処理完了`);
    }
  } catch (err) {
    console.error(`❌ [${channel.name}] 処理エラー:`, err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const destination = body.destination; // 📩 これが探しているID
    const events = body.events || [];

    // ---------------------------------------------------------
    // 🔍 【デバッグ用】IDが判明するまで、検証画面にIDを強制表示させる
    // ---------------------------------------------------------
    if (events.length === 0) {
      return new Response(JSON.stringify({ 
        message: `あなたのボットのIDは [${destination}] です。これをSupabaseのchannel_idに入れてください。` 
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 🔑 DBから店舗情報を取得
    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .select('*')
      .eq('channel_id', destination)
      .single();

    // 店舗未登録時のガード
    if (channelError || !channel) {
      console.error("❌ 未登録の店舗:", destination);
      return new Response(JSON.stringify({ error: "Channel Not Found" }), { status: 404 });
    }

    // 各イベントの実行
    for (const event of events) {
      await processEventPerChannel(channel, event);
    }

    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });

  } catch (error: any) {
    console.error("❌ サーバーエラー:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}