import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // tab_count（分割数）を管理画面から受け取る
    const { channel_id, access_token, name, tab1_image_url, tab2_image_url, tab3_image_url, tab_count } = body;

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

    async function createAndUpload(url: string, index: number) {
      if (!url || url.startsWith('blob:')) return null;
      const imgRes = await fetch(url);
      const buffer = await imgRes.arrayBuffer();

      const fullWidth = 2500;
      const fullHeight = 1686;
      const tabHeight = 350; // タブ部分の高さ
      
      // ✨ 分割数に基づいて幅を動的に計算
      const n = Number(tab_count) || 3; 
      const tabWidth = Math.floor(fullWidth / n);

      const areas = [];
      // タブ部分の判定を作成
      for (let i = 0; i < n; i++) {
        areas.push({
          bounds: { 
            x: i * tabWidth, 
            y: 0, 
            width: (i === n - 1) ? (fullWidth - (i * tabWidth)) : tabWidth, // 右端の隙間を埋める
            height: tabHeight 
          },
          action: { type: "postback", data: `action=switch&tab=${i + 1}` }
        });
      }
      // メインコンテンツ部分（下半分）の判定
      areas.push({ 
        bounds: { x: 0, y: tabHeight, width: fullWidth, height: fullHeight - tabHeight }, 
        action: { type: "postback", data: "action=main" } 
      });

      const cRes = await fetch('https://api.line.me/v2/bot/richmenu', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          size: { width: fullWidth, height: fullHeight },
          selected: index === 1,
          name: `${name}_tab${index}`,
          chatBarText: "メニュー",
          areas
        }),
      });
      const resJson = await cRes.json();
      if (!cRes.ok) throw new Error(`LINE API Error: ${resJson.message}`);
      
      const richMenuId = resJson.richMenuId;

      await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'image/png' },
        body: Buffer.from(buffer),
      });
      return richMenuId;
    }

    // 3枚分のメニューを新規発行
    const [t1Id, t2Id, t3Id] = await Promise.all([
      createAndUpload(tab1_image_url, 1),
      createAndUpload(tab2_image_url, 2),
      createAndUpload(tab3_image_url, 3)
    ]);

    // 💾 DBに最新の正解IDを保存（channel_idを主キーにして上書き）
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
    console.error("❌ Admin Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}