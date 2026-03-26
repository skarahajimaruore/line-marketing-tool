import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // 🟢 bodyから tab_count を受け取る
    const { channel_id, access_token, name, tab1_image_url, tab2_image_url, tab3_image_url, tab_count } = body;

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

    async function createMenu(url: string, index: number, total: number) {
      if (!url || url.startsWith('blob:')) return null;
      const imgRes = await fetch(url);
      const buffer = await imgRes.arrayBuffer();

      // 📏 送られてきた total (tab_count) で幅を計算
      const tabWidth = Math.floor(2500 / total);
      const areas = [];
      for (let i = 0; i < total; i++) {
        areas.push({
          bounds: { 
            x: i * tabWidth, 
            y: 0, 
            width: (i === total - 1) ? (2500 - (i * tabWidth)) : tabWidth, 
            height: 350 
          },
          action: { type: "postback", data: `action=switch&tab=${i + 1}` }
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
      const resJson = await cRes.json();
      if (!cRes.ok) throw new Error(resJson.message);
      
      const richMenuId = resJson.richMenuId;

      await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'image/png' },
        body: Buffer.from(buffer),
      });

      return richMenuId;
    }

    // 🟢 ここが重要：管理画面からの tab_count を n に代入して使う
    const n = Number(tab_count) || 3; 
    const t1Id = await createMenu(tab1_image_url, 1, n);
    const t2Id = await createMenu(tab2_image_url, 2, n);
    const t3Id = await createMenu(tab3_image_url, 3, n);

    if (t1Id) {
      await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${t1Id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${access_token}` },
      });
    }

    const { error } = await supabase.from('channels').upsert({
      channel_id,
      name,
      access_token,
      tab1_image_url,
      tab2_image_url,
      tab3_image_url,
      tab1_menu_id: t1Id,
      tab2_menu_id: t2Id,
      tab3_menu_id: t3Id,
      updated_at: new Date().toISOString()
    }, { onConflict: 'channel_id' });

    if (error) throw error;
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("❌ Admin Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}