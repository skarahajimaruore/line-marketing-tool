"use client";
import { useState } from 'react';

export default function AdminPage() {
  const [loading, setLoading] = useState(false);
  const [tabCount, setTabCount] = useState(3); // デフォルト3分割
  const [formData, setFormData] = useState({
    channel_id: '',
    access_token: '',
    name: '',
    tab1_image_url: '',
    tab2_image_url: '',
    tab3_image_url: '',
  });

  const handleUpdate = async () => {
    // バリデーション
    if (!formData.channel_id || !formData.access_token) {
      alert('⚠️ Channel IDとAccess Tokenは必須です');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/admin/richmenu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...formData, 
          tab_count: tabCount // 📐 ここで分割数をAPIに飛ばします
        }),
      });

      const result = await res.json();

      if (res.ok) {
        alert('✅ 成功：最新メニューを発行し、DBを更新しました！');
      } else {
        alert(`❌ 発行エラー: ${result.error || '不明なエラー'}`);
      }
    } catch (e) {
      console.error(e);
      alert('🔥 通信エラーが発生しました。Vercelのログを確認してください。');
    } finally {
      setLoading(false);
    }
  };

  // 入力変更時の共通ハンドラ
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div style={{ padding: '40px 20px', maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2 style={{ borderBottom: '2px solid #00b900', paddingBottom: '10px' }}>
        店舗メニュー管理パネル (v2: 分離設計版)
      </h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
        
        <section>
          <label style={{ fontWeight: 'bold' }}>1. 基本情報</label>
          <input name="channel_id" placeholder="LINE Channel ID (Ub883...)" style={inputStyle} onChange={handleChange} />
          <input name="access_token" placeholder="Messaging API Access Token" style={inputStyle} onChange={handleChange} />
          <input name="name" placeholder="管理用：店舗名" style={inputStyle} onChange={handleChange} />
        </section>

        <section style={{ background: '#f9f9f9', padding: '15px', borderRadius: '8px', border: '1px solid #ddd' }}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>
            2. タブの分割設定 (2〜5枚)
          </label>
          <p style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
            ※ 画像内のタブの数に合わせて入力してください。タップ範囲を自動計算します。
          </p>
          <input 
            type="number" 
            value={tabCount} 
            min="2" max="5" 
            onChange={e => setTabCount(Number(e.target.value))}
            style={{ ...inputStyle, width: '80px', fontSize: '18px', textAlign: 'center' }}
          />
        </section>

        <section>
          <label style={{ fontWeight: 'bold' }}>3. 各タブの画像URL (Supabase Storage等)</label>
          <input name="tab1_image_url" placeholder="Tab 1 画像URL (必須)" style={inputStyle} onChange={handleChange} />
          <input name="tab2_image_url" placeholder="Tab 2 画像URL" style={inputStyle} onChange={handleChange} />
          <input name="tab3_image_url" placeholder="Tab 3 画像URL" style={inputStyle} onChange={handleChange} />
        </section>
        
        <button 
          onClick={handleUpdate} 
          disabled={loading}
          style={{ 
            padding: '15px', 
            background: loading ? '#ccc' : '#00b900', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '8px', 
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '16px',
            fontWeight: 'bold',
            marginTop: '10px'
          }}
        >
          {loading ? 'LINE APIに発行中...' : '🚀 最新設定を保存して一括反映'}
        </button>

        <p style={{ fontSize: '11px', color: '#999', textAlign: 'center' }}>
          ※ 反映後、スマホのメニューが変わらない場合は一度トーク画面を開き直してください。
        </p>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '12px',
  borderRadius: '5px',
  border: '1px solid #ccc',
  marginTop: '5px',
  boxSizing: 'border-box' as const
};