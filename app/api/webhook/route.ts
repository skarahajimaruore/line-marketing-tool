import { messagingApi } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';

const { MessagingApiClient } = messagingApi;

// 1. Supabaseの初期化
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '' // サーバー側なのでService Roleを使用
);

/**
 * 💡 店舗ごとの個別処理（メニュー切り替えとログ記録）
 */
async function processEventPerChannel(channel: any, event: any) {
  const userId = event.source?.userId;
  if (!userId) return;

  // DBから取得したその店舗専用のアクセストークンでLINEクライアントを作成
  const client = new MessagingApiClient({
    channelAccessToken: channel.access_token,
  });

  try {
    let targetMenuId = "";
    let actionLabel = "";

    // 2. イベントに応じたメニューIDの選択（DBから取得したIDを使用）
    if (event.type === 'follow' || (event.type === 'postback' && event.postback?.data === 'action=switch-home')) {
      targetMenuId = channel.home_menu_id; // DBの home_menu_id カラムを参照
      actionLabel = "home";
    } else if (event.type === 'postback' && event.postback?.data === 'action=switch-reserve') {
      targetMenuId = channel.reserve_menu_id; // DBの reserve_menu_id カラムを参照
      actionLabel = "reserve";
    }

    // 3. LINEユーザーへのメニュー紐付け実行
    if (targetMenuId) {
      await client.linkRichMenuIdToUser(userId, targetMenuId);
      
      // 4. インタラクションログの保存
      await supabase.from('interaction_logs').insert({
        channel_id: channel.channel_id,
        line_user_id: userId,
        action_type: 'menu_switch',
        action_detail: actionLabel,
      });

      // 5. ユーザー状態の更新（名簿管理）
      await supabase.from('users').upsert({
        channel_id: channel.channel_id,
        line_user_id: userId,
        current_menu: actionLabel,
        updated_at: new Date().toISOString()
      }, { onConflict: 'channel_id,line_user_id' });

      console.log(`✅ [${channel.name}] 完了: ${actionLabel}`);
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
    const destination = body.destination; // LINE公式アカウント固有のID
    const events = body.events || [];

    // 検証用リクエスト（イベント空）のハンドリング
    if (events.length === 0) {
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    }

    // 🔑 宛先ID（destination）をキーに、DBから店舗の「全設定」を1発で取得
    const { data: channel, error } = await supabase
      .from('channels')
      .select('*')
      .eq('channel_id', destination)
      .single();

    if (error || !channel) {
      console.error("❌ 未登録の店舗からのアクセス:", destination);
      return new Response("Channel Not Found", { status: 404 });
    }

    // 届いたイベント（メッセージやボタン押し）を順番に処理
    for (const event of events) {
      await processEventPerChannel(channel, event);
    }

    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
  } catch (err) {
    console.error("❌ サーバーエラー:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}