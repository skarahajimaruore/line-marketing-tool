import { messagingApi } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';

const { MessagingApiClient } = messagingApi;

// LINE クライアントの初期化
const client = new MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

// Supabase クライアントの初期化（関数外で1回定義するのがスマートです）
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// 💡 共通関数: LINE紐付け、ログ保存(Insert)、名簿更新(Upsert)をセットで行う
async function linkMenuAndLog(userId: string, menuId: string, label: string, actionData: string) {
  try {
    // 1. LINE側のメニューを物理的に切り替える
    await client.linkRichMenuIdToUser(userId, menuId);
    console.log(`✅ LINE側: ${label} の紐付けに成功しました！`);

    // 2. 【履歴】interaction_logs テーブルに「追加(Insert)」する
    const { error: logError } = await supabase
      .from('interaction_logs')
      .insert({
        line_user_id: userId,
        action_type: 'menu_switch',
        action_detail: actionData,
      });

    // 3. ★【名簿】users テーブルを「更新(Upsert)」する
    const { error: userError } = await supabase
      .from('users')
      .upsert({
        line_user_id: userId,
        current_menu: actionData, // 最新の状態を上書き
        updated_at: new Date()
      }, { onConflict: 'line_user_id' }); // IDが重複したら「更新」せよという命令

    if (logError) console.error('❌ ログ保存失敗:', logError.message);
    if (userError) console.error('❌ 名簿更新失敗:', userError.message);
    
    if (!logError && !userError) {
      console.log(`✅ DB側: ${label} のログ保存と名簿更新を完了しました！`);
    }

  } catch (err) {
    console.error(`❌ ${label} 処理中の致命的エラー:`, err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const events = body.events || [];

    console.log("---------------------------------------");
    console.log("📩 Webhookを受信しました。イベント数:", events.length);

    if (events.length === 0) {
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    }

    const homeMenuId = process.env.HOME_RICH_MENU_ID || process.env.NEXT_PUBLIC_RICH_MENU_HOME_ID;
    const reserveMenuId = process.env.RESERVE_RICH_MENU_ID || process.env.NEXT_PUBLIC_RICH_MENU_RESERVE_ID;

    for (const event of events) {
      const userId = event.source?.userId;
      if (!userId) continue;

      // 1. 友だち追加時
      if (event.type === 'follow') {
        if (homeMenuId) {
          await linkMenuAndLog(userId, homeMenuId, "初期HOMEメニュー", "event=follow");
        }
        continue;
      }

      // 2. ボタン操作時
      if (event.type === 'postback') {
        const action = event.postback?.data;
        if (action === 'action=switch-home') {
          if (homeMenuId) await linkMenuAndLog(userId, homeMenuId, "HOMEメニュー", action);
        } else if (action === 'action=switch-reserve') {
          if (reserveMenuId) await linkMenuAndLog(userId, reserveMenuId, "RESERVEメニュー", action);
        }
      }
    }

    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });

  } catch (error: unknown) {
    console.error("❌ 処理エラー:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}