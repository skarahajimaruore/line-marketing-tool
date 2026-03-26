import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { channel_id, access_token, name, tab1_image_url, tab2_image_url, tab3_image_url } = body;

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

    // 🏗️ LINE側にメニューを新規作成する関数
    async function createAndUpload(url: string, index: number) {
      if (!url || url.startsWith('blob:')) return null;
      const imgRes = await fetch(url);
      const buffer = await imgRes.arrayBuffer();

      const tabWidth = 833; // 2500 / 3
      const areas = [1, 2, 3].map((num) => ({
        bounds: { x: (num - 1) * tabWidth, y: 0, width: tabWidth, height: 350 },
        action: { type: "postback", data: `action=switch&tab=${num}` }
      }));
      areas.push({ bounds: { x: 0, y: 350, width: 2500, height: 1336 }, action: { type: "postback", data: "action=main" } });

      const cRes = await fetch('https://api.line.me/v2/bot/richmenu', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          size: { width: 2500, height: 1686 },
          selected: index === 1,
          name: `${name}_tab${index}`,
          chatBarText: "メニュー",
          areas
        }),
      });
      const { richMenuId } = await cRes.json();

      await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'image/png' },
        body: Buffer.from(buffer),
      });
      return richMenuId;
    }

    // 3枚分を新規発行
    const [t1Id, t2Id, t3Id] = await Promise.all([
      createAndUpload(tab1_image_url, 1),
      createAndUpload(tab2_image_url, 2),
      createAndUpload(tab3_image_url, 3)
    ]);

    // 💾 DBに「最新の正解」を書き込む（既存は上書き）
    const { error } = await supabase.from('channels').upsert({
      channel_id,
      access_token,
      tab1_menu_id: t1Id,
      tab2_menu_id: t2Id,
      tab3_menu_id: t3Id,
      updated_at: new Date().toISOString()
    }, { onConflict: 'channel_id' });

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}