// app/api/webhook/route.ts
import { Client, WebhookEvent } from '@line/bot-sdk';
import { NextResponse } from 'next/server';

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
};

const client = new Client(config);

export async function POST(req: Request) {
  const body = await req.json();
  const events: WebhookEvent[] = body.events;

  // 全てのイベント（メッセージ送信、ボタンタップなど）を処理
  await Promise.all(
    events.map(async (event) => {
      if (event.type === 'postback') {
        // ここで「どのタブが押されたか」を判定して切り替えるロジックを書く
        const data = event.postback.data; // 例: "action=switch_tab&tab=B"
        const userId = event.source.userId;

        if (userId && data.includes('tab=B')) {
          // リッチメニューをBに切り替えるAPIを叩く
          // await client.linkRichMenuToUser(userId, 'RICH_MENU_ID_B');
          console.log(`User ${userId} switched to Tab B`);
        }
      }
    })
  );

  return NextResponse.json({ message: 'OK' });
}