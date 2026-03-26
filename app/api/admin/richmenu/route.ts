import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { channel_id, access_token, name, channel_secret, tab1_image_url, tab2_image_url, tab3_image_url } = body;

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

    // 🚀 LINEリッチメニュー作成用の共通関数
    async function createLineMenu(url: string | undefined, label: string) {
      // URLが空、または "blob:"（アップロード前の一時URL）の場合はスキップ
      if (!url || url.startsWith('blob:')) {
        console.log(`⚠️ ${label} は画像がないためスキップします`);
        return null;
      }

      console.log(`📸 ${label} の画像を取得中: ${url}`);
      const imgRes = await fetch(url);
      if (!imgRes.ok) {
        console.error(`❌ ${label} の画像取得に失敗しました: ${imgRes.statusText}`);
        return null; 
      }
      const buffer = await imgRes.arrayBuffer();
      
      // 1. 枠作成
      const cRes = await fetch('https://api.line.me/v2/bot/richmenu', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          size: { width: 2500, height: 1686 },
          selected: true,
          name: `${label}_${name}`,
          chatBarText: "メニュー",
          areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 1686 }, action: { type: "message", text: `${label}を表示中` } }]
        }),
      });
      const cData = await cRes.json();
      if (!cRes.ok) throw new Error(`${label}の枠作成失敗: ${cData.message}`);
      const richMenuId = cData.richMenuId;
      
      // 2. 画像アップロード
      const uRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'image/png' },
        body: buffer,
      });
      if (!uRes.ok) throw new Error(`${label}の画像転送失敗`);

      return richMenuId;
    }

    // 各タブを順番に処理（画像があるものだけ）
    const t1Id = await createLineMenu(tab1_image_url, "Tab1");
    const t2Id = await createLineMenu(tab2_image_url, "Tab2");
    const t3Id = await createLineMenu(tab3_image_url, "Tab3");

    // Tab1 が成功していればデフォルトに設定
    if (t1Id) {
      await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${t1Id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${access_token}` },
      });
    }

    // --- DB保存（1行に集約） ---
    const updateData: any = {
      channel_id,
      name,
      access_token,
      channel_secret,
      updated_at: new Date(),
    };

    // 値があるものだけを更新対象にする
    if (tab1_image_url) updateData.tab1_image_url = tab1_image_url;
    if (tab2_image_url) updateData.tab2_image_url = tab2_image_url;
    if (tab3_image_url) updateData.tab3_image_url = tab3_image_url;
    if (t1Id) updateData.tab1_menu_id = t1Id;
    if (t2Id) updateData.tab2_menu_id = t2Id;
    if (t3Id) updateData.tab3_menu_id = t3Id;

    const { error: dbError } = await supabase.from('channels').upsert(updateData);
    if (dbError) throw new Error(`DB保存エラー: ${dbError.message}`);

    return NextResponse.json({ success: true, message: "一括更新が完了しました" });

  } catch (error: any) {
    console.error("❌ 詳細エラー:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}