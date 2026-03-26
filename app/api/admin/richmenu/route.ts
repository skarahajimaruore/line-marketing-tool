import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { channel_id, access_token, name, channel_secret, tab1_image_url, tab2_image_url, tab3_image_url } = body;

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

    // A・Bと同じ仕様でメニューを作成する関数
    async function createMenu(url: string, index: number, total: number) {
      if (!url || url.startsWith('blob:')) return null;

      const imgRes = await fetch(url);
      const buffer = await imgRes.arrayBuffer();

      const tabWidth = Math.floor(2500 / total);
      const areas = [];
      for (let i = 0; i < total; i++) {
        areas.push({
          bounds: { x: i * tabWidth, y: 0, width: tabWidth, height: 350 },
          action: { 
            type: "postback", 
            data: `action=switch&tab=${i + 1}` // ✨ A・Bが認識する合図
            // displayTextは含めない（A・Bと同じ挙動にする）
          }
        });
      }
      areas.push({
        bounds: { x: 0, y: 350, width: 2500, height: 1336 },
        action: { type: "postback", data: "action=main" }
      });

      const cRes = await fetch('https://api.line.me/v2/bot/richmenu', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          size: { width: 2500, height: 1686 },
          selected: index === 1,
          name: `${name}_tab${index}`,
          chatBarText: "メニュー",
          areas: areas
        }),
      });
      const { richMenuId } = await cRes.json();

      await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'image/png' },
        body: buffer,
      });

      return richMenuId;
    }

    const t1Id = await createMenu(tab1_image_url, 1, 3);
    const t2Id = await createMenu(tab2_image_url, 2, 3);
    const t3Id = await createMenu(tab3_image_url, 3, 3);

    if (t1Id) {
      await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${t1Id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${access_token}` },
      });
    }

    const { error: dbError } = await supabase.from('channels').upsert({
      channel_id,
      name,
      access_token,
      channel_secret,
      tab1_image_url,
      tab2_image_url,
      tab3_image_url,
      tab1_menu_id: t1Id,
      tab2_menu_id: t2Id,
      tab3_menu_id: t3Id,
      updated_at: new Date(),
    });

    if (dbError) throw new Error(dbError.message);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}