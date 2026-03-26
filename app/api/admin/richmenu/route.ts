import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // 🔍 フロントの JSON { tab_count: ... } をここで確実に受け取る
    const { 
      channel_id, 
      access_token, 
      channel_secret, 
      name, 
      tab1_image_url, 
      tab2_image_url, 
      tab3_image_url, 
      tab_count // 👈 ここ！
    } = body;

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

    // 📐 計算ロジック：送られてきた tab_count を数値として使用
    async function createMenu(url: string, index: number, total: number) {
      if (!url || url.startsWith('blob:')) return null;
      
      const imgRes = await fetch(url);
      const buffer = await imgRes.arrayBuffer();

      // 1枚あたりの幅を計算（2500 / 分割数）
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
      
      // 下半分のメインエリア
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
      if (!cRes.ok) throw new Error(`LINE API: ${resJson.message}`);
      
      const richMenuId = resJson.richMenuId;

      // 画像アップロード
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

    // 🟢 紐付け：フロントから来た tab_count を n に入れる（デフォルトは3）
    const n = Number(tab_count) || 3; 

    // 各タブの作成に n (分割数) を渡す
    const t1Id = await createMenu(tab1_image_url, 1, n);
    const t2Id = await createMenu(tab2_image_url, 2, n);
    const t3Id = await createMenu(tab3_image_url, 3, n);

    // デフォルトメニュー設定
    if (t1Id) {
      await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${t1Id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${access_token}` },
      });
    }

    // DB保存
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