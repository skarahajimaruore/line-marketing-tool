import { messagingApi } from '@line/bot-sdk';
// 1. 先ほど作成した Supabase クライアントをインポート
import { createClient } from '@supabase/supabase-js';

const { MessagingApiClient } = messagingApi;

// LINE クライアントの初期化
const client = new MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

// 💡 共通関数: LINEへのメニュー紐付けと、DBへのログ記録をセットで行う
async function linkMenuAndLog(userId: string, menuId: string, label: string, actionData: string) {
  try {
    // A. LINE側のメニューを物理的に切り替える
    await client.linkRichMenuIdToUser(userId, menuId);
    console.log(`✅ LINE側: ${label} の紐付けに成功しました！`);

    // B. ★Supabase側: 「いつ、誰が、何を」の行動ログを保存(Insert)する
    const { error: dbError } = await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
      .from('interaction_logs') // 事前に作った「行動ログ」テーブル
      .insert({
        line_user_id: userId,
        action_type: 'menu_switch',
        action_detail: actionData, // 'action=switch-home' など
      });

    if (dbError) {
      console.error('❌ Supabase保存失敗:', dbError.message);
    } else {
      console.log(`✅ DB側: ${label} への切り替えログを保存しました。`);
    }
  } catch (err) {
    console.error(`❌ ${label} 処理中のエラー:`, err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const events = body.events || [];

    console.log("---------------------------------------");
    console.log("📩 Webhookを受信しました。イベント数:", events.length);

    if (events.length === 0) {
      console.log("✅ LINEからの検証用通信を確認しました（疎通OK）");
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    }

    const homeMenuId = process.env.HOME_RICH_MENU_ID || process.env.NEXT_PUBLIC_RICH_MENU_HOME_ID;
    const reserveMenuId = process.env.RESERVE_RICH_MENU_ID || process.env.NEXT_PUBLIC_RICH_MENU_RESERVE_ID;

    for (const event of events) {
      console.log("👉 イベントタイプ:", event.type);
      const userId = event.source?.userId;
      if (!userId) continue;

      // 1. 友だち追加時
      if (event.type === 'follow') {
        if (homeMenuId) {
          await linkMenuAndLog(userId, homeMenuId, "初期HOMEメニュー", "event=follow");
        }
        continue;
      }

      // 2. ボタン操作（リッチメニュー切り替え）時
      if (event.type === 'postback') {
        const action = event.postback?.data;
        console.log("📨 postback data:", action);

        if (action === 'action=switch-home') {
          if (homeMenuId) {
            await linkMenuAndLog(userId, homeMenuId, "HOMEメニュー", action);
          }
        } else if (action === 'action=switch-reserve') {
          if (reserveMenuId) {
            await linkMenuAndLog(userId, reserveMenuId, "RESERVEメニュー", action);
          }
        } else {
          console.log("ℹ️ 未対応のpostbackです。");
        }
      }
    }

    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ 処理エラー詳細:", message);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}