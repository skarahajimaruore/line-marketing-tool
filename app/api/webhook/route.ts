import { Client, WebhookEvent } from '@line/bot-sdk';
import { NextResponse } from 'next/server';

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
};

const client = new Client(config);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const events: WebhookEvent[] = body.events;

    await Promise.all(
      events.map(async (event) => {
        // 1. 友達追加（フォロー）されたときに「ホーム」メニューを表示
        if (event.type === 'follow') {
          const userId = event.source.userId;
          if (userId && process.env.HOME_RICH_MENU_ID) {
            await client.linkRichMenuToUser(userId, process.env.HOME_RICH_MENU_ID);
            console.log(`✅ User ${userId} にホームメニューを紐付けました`);
          }
        }

        // 2. ボタン（ポストバック）が押されたときの「切り替え」処理
        if (event.type === 'postback') {
          const userId = event.source.userId;
          const data = event.postback.data;
          
          if (!userId) return;

          if (data === 'action=switch-reserve') {
            // 「予約」タブへ切り替え
            await client.linkRichMenuToUser(userId, process.env.RESERVE_RICH_MENU_ID!);
            console.log(`🔄 User ${userId} が「予約」に切り替えました`);
          } else if (data === 'action=switch-home') {
            // 「ホーム」タブへ戻す
            await client.linkRichMenuToUser(userId, process.env.HOME_RICH_MENU_ID!);
            console.log(`🔄 User ${userId} が「ホーム」に戻りました`);
          }
        }
      })
    );

    return NextResponse.json({ message: 'OK' });
  } catch (error) {
    console.error('❌ Webhook Error:', error);
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  }
}