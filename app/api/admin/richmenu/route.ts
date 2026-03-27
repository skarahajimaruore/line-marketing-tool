import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      channel_id, 
      access_token, 
      channel_secret, 
      name, 
      tab1_image_url, 
      tab2_image_url, 
      tab3_image_url, 
      tab_count 
    } = body;

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

    // メニュー作成と画像アップロードを担う関数
    async function createMenu(url: string, index: number, total: number) {
      if (!url || url.startsWith('blob:')) return null;
      
      const imgRes = await fetch(url);
      const buffer = await imgRes.arrayBuffer();

      // タブの数（total）に応じて、タップ判定の幅を動的に計算
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
        headers: { 
          'Authorization': `Bearer ${access_token}`, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          size: { width: 2500, height: 1686 },
          selected: index === 1,
          name: `${name}_tab${index}`,
          chatBarText: "メニュー",
          areas: areas
        }),
      });

      const resJson = await cRes.json();
      if (!cRes.ok) throw new Error(`LINE API Error: ${resJson.message}`);
      
      const richMenuId = resJson.richMenuId;

      await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${access_token}`, 
          'Content-Type': 'image/png' 
        },
        body: Buffer.from(buffer),
      });

      return richMenuId;
    }

    // フロントから届いた tab_count を数値化（デフォルト3）
    const n = Number(tab_count) || 3; 

    // 各タブを作成（nを渡して座標を計算させる）
    const t1Id = await createMenu(tab1_image_url, 1, n);
    const t2Id = await createMenu(tab2_image_url, 2, n);
    const t3Id = await createMenu(tab3_image_url, 3, n);

    // Tab1 をこのチャネルのデフォルトメニューに設定
    if (t1Id) {
      await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${t1Id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${access_token}` },
      });
    }

    // DBへ最新の情報を上書き保存
    const { error } = await supabase.from('channels').upsert({
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
      updated_at: new Date().toISOString()
    }, { onConflict: 'channel_id' });

    if (error) throw error;
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("❌ Admin Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}