import { messagingApi } from '@line/bot-sdk';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const { MessagingApiClient, MessagingApiBlobClient } = messagingApi;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ⚡ 画像がアップロード済みかをメモリで保持（Vercelのインスタンスが生きている間のみ有効）
// これにより、同じインスタンス内での無駄なチェックを減らします
const uploadedMenus = new Set<string>();

export async function POST(req: Request) {
  const body = await req.json();
  const destination = body.destination;
  const event = body.events?.[0];

  if (!event || !destination) return NextResponse.json({ message: 'OK' });

  // ① チャンネル情報の取得
  const { data: channel, error: fetchError } = await supabase
    .from('channels')
    .select('*')
    .or(`channel_id.eq.${destination},id.eq.${destination}`)
    .single();

  if (fetchError || !channel) return NextResponse.json({ message: 'Unknown' });

  const client = new MessagingApiClient({ channelAccessToken: channel.access_token });
  const blobClient = new MessagingApiBlobClient({ channelAccessToken: channel.access_token });
  const userId = event.source?.userId;
  if (!userId) return NextResponse.json({ message: 'No userId' });

  // ② リッチメニュー自動作成（略：変更なし）
  if (!channel.tab1_menu_id) {
    const tabCount = channel.tab_count || 2;
    const newIds: any = {};
    try {
      for (let i = 1; i <= tabCount; i++) {
        const { richMenuId } = await client.createRichMenu({
          size: { width: 2500, height: 1686 },
          selected: i === 1,
          name: `${channel.name}_tab${i}`,
          chatBarText: "メニュー切り替え",
          areas: createTabAreas(tabCount) as any[],
        });
        newIds[`tab${i}_menu_id`] = richMenuId;
      }
      await supabase.from('channels').update(newIds).eq('id', channel.id);
      Object.assign(channel, newIds);
    } catch (err) { console.error("作成エラー"); }
  }

  // ③ タブ判定
  let currentTab = "1"; 
  if (event.type === 'postback') {
    const match = event.postback.data.match(/tab=(\d+)/);
    if (match) currentTab = match[1];
  }

  const targetMenuId = channel[`tab${currentTab}_menu_id` as keyof typeof channel] as string;
  const targetImageUrl = channel[`tab${currentTab}_image_url` as keyof typeof channel] as string;

  if (targetMenuId) {
    try {
      // 🚀 【爆速化の核心】
      // すでに画像がセットされている（メモリにある）場合は、画像処理を完全にスルー！
      if (targetImageUrl && !uploadedMenus.has(targetMenuId)) {
        try {
          await syncImage(blobClient, targetMenuId, targetImageUrl);
          uploadedMenus.add(targetMenuId); // 成功したら記録
        } catch (imgErr: any) {
          // 400エラー（既にある）なら記録して続行
          if (imgErr.message.includes("400")) uploadedMenus.add(targetMenuId);
        }
      }
      
      // ⚡ link（紐付け）のみ実行。これが最速。
      await client.linkRichMenuIdToUser(userId, targetMenuId);
      console.log(`✨ User:${userId} -> Tab:${currentTab} (Fast Link)`);
      
    } catch (err: any) {
      console.error("切り替えエラー", err.message);
    }
  }

  return NextResponse.json({ message: 'OK' });
}

// 🖼 画像同期関数（変更なし）
async function syncImage(blobClient: any, menuId: string, url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Fetch failed");
  const blob = await res.blob();
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  await blobClient.setRichMenuImage(menuId, blob, contentType);
}

// 📐 タブエリア計算（変更なし）
function createTabAreas(count: number) {
  const areas = [];
  const tabWidth = Math.floor(2500 / count);
  for (let i = 0; i < count; i++) {
    areas.push({
      bounds: { x: i * tabWidth, y: 0, width: tabWidth, height: 350 },
      action: { type: "postback", data: `action=switch&tab=${i + 1}` }
    });
  }
  areas.push({
    bounds: { x: 0, y: 350, width: 2500, height: 1336 },
    action: { type: "postback", data: "action=main" }
  });
  return areas;
}