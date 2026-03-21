import { messagingApi } from '@line/bot-sdk';

const { MessagingApiClient } = messagingApi;

// クライアントの初期化（環境変数からトークンを取得）
const client = new MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

async function linkMenuToUser(userId: string, menuId: string, label: string) {
  await client.linkRichMenuIdToUser(userId, menuId);
  console.log(`✅ ${label} の紐付けに成功しました！`);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // 💡 ポイント1: body.events が存在しない（検証ボタン用）場合でも空配列にする
    const events = body.events || [];

    console.log("---------------------------------------");
    console.log("📩 Webhookを受信しました。イベント数:", events.length);

    // 💡 ポイント2: イベントが0個（検証ボタンのテスト通信）なら、ここで正常終了(200)を返す
    if (events.length === 0) {
      console.log("✅ LINEからの検証用通信を確認しました（疎通OK）");
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    }

    // 登録スクリプトの出力と .env の揺れに対応（どちらかがあればOK）
    const homeMenuId =
      process.env.HOME_RICH_MENU_ID ||
      process.env.NEXT_PUBLIC_RICH_MENU_HOME_ID;
    const reserveMenuId =
      process.env.RESERVE_RICH_MENU_ID ||
      process.env.NEXT_PUBLIC_RICH_MENU_RESERVE_ID;

    // 全てのイベント（フォロー、postback など）を処理
    for (const event of events) {
      console.log("👉 イベントタイプ:", event.type);
      const userId = event.source?.userId;
      if (!userId) continue;

      // 友だち追加時はホームを初期表示
      if (event.type === 'follow') {
        if (!homeMenuId) {
          console.log("⚠️ HOME_RICH_MENU_ID が未設定です。");
          continue;
        }
        console.log("👤 ユーザーID:", userId);
        console.log("🆔 紐付けるメニューID(HOME):", homeMenuId);
        await linkMenuToUser(userId, homeMenuId, "HOMEメニュー");
        continue;
      }

      // postback からホーム/予約を切り替える
      if (event.type === 'postback') {
        const action = event.postback?.data;
        console.log("📨 postback data:", action);

        if (action === 'action=switch-home') {
          if (!homeMenuId) {
            console.log("⚠️ HOME_RICH_MENU_ID が未設定です。");
            continue;
          }
          await linkMenuToUser(userId, homeMenuId, "HOMEメニュー");
        } else if (action === 'action=switch-reserve') {
          if (!reserveMenuId) {
            console.log("⚠️ RESERVE_RICH_MENU_ID が未設定です。");
            continue;
          }
          await linkMenuToUser(userId, reserveMenuId, "RESERVEメニュー");
        } else {
          console.log("ℹ️ 未対応のpostbackです。");
        }
      }
    }

    // LINEサーバーに対して「受信成功」を返さないとエラー判定される
    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    // エラーが起きた場合はログに出力し、LINEには500を返す
    console.error("❌ 処理エラー詳細:", message);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}