import { messagingApi } from '@line/bot-sdk';

const { MessagingApiClient } = messagingApi;

// クライアントの初期化（環境変数からトークンを取得）
const client = new MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

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

    // 全てのイベント（フォロー、メッセージなど）を処理
    for (const event of events) {
      console.log("👉 イベントタイプ:", event.type);

      // 「フォロー（友達追加・ブロック解除）」イベントの時
      if (event.type === 'follow') {
        const userId = event.source?.userId;
        const menuId = process.env.HOME_RICH_MENU_ID;

        console.log("👤 ユーザーID:", userId);
        console.log("🆔 紐付けるメニューID:", menuId);

        if (userId && menuId) {
          // LINEユーザーにリッチメニューを紐付ける
          await client.linkRichMenuIdToUser(userId, menuId);
          console.log("✅ メニューの紐付けに成功しました！");
        } else {
          console.log("⚠️ IDが足りません。 .env.local または環境変数を確認してください。");
        }
      }
    }

    // LINEサーバーに対して「受信成功」を返さないとエラー判定される
    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });

  } catch (error: any) {
    // エラーが起きた場合はログに出力し、LINEには500を返す
    console.error("❌ 処理エラー詳細:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}