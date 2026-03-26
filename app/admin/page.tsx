"use client";

import { useState } from 'react';

export default function AdminPage() {
  const [loading, setLoading] = useState(false);
  const [tabCount, setTabCount] = useState(3); // 🔢 タブ数（初期値3）
  const [formData, setFormData] = useState({
    channel_id: '',
    access_token: '',
    channel_secret: '',
    name: '',
    tab1_image_url: '',
    tab2_image_url: '',
    tab3_image_url: '',
  });

  const handleUpdate = async () => {
    if (!formData.channel_id || !formData.access_token) {
      alert('⚠️ IDとトークンを入力してください');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/admin/richmenu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...formData, 
          tab_count: tabCount // 📐 API側に数値を渡す
        }),
      });

      if (res.ok) {
        alert('✅ 成功：メニューを発行しDBを更新しました');
      } else {
        const errData = await res.json();
        alert(`❌ エラー: ${errData.error || '発行失敗'}`);
      }
    } catch (e) {
      alert('🔥 通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h2>店舗メニュー管理パネル</h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input 
          placeholder="LINE Channel ID" 
          onChange={e => setFormData({...formData, channel_id: e.target.value})} 
          style={inputStyle}
        />
        <input 
          placeholder="Access Token" 
          onChange={e => setFormData({...formData, access_token: e.target.value})} 
          style={inputStyle}
        />
        <input 
          placeholder="店舗名" 
          onChange={e => setFormData({...formData, name: e.target.value})} 
          style={inputStyle}
        />

        {/* 🟢 タブ数入力欄：ここが座標計算の鍵になります */}
        <div style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '5px' }}>
          <label style={{ marginRight: '10px' }}>タブの分割数：</label>
          <input 
            type="number" 
            value={tabCount} 
            min="2" max="5"
            onChange={e => setTabCount(Number(e.target.value))} 
            style={{ width: '50px', padding: '5px' }}
          />
        </div>

        <input 
          placeholder="Tab1 画像URL" 
          onChange={e => setFormData({...formData, tab1_image_url: e.target.value})} 
          style={inputStyle}
        />
        <input 
          placeholder="Tab2 画像URL" 
          onChange={e => setFormData({...formData, tab2_image_url: e.target.value})} 
          style={inputStyle}
        />
        <input 
          placeholder="Tab3 画像URL" 
          onChange={e => setFormData({...formData, tab3_image_url: e.target.value})} 
          style={inputStyle}
        />

        <button 
          onClick={handleUpdate} 
          disabled={loading}
          style={{ 
            padding: '15px', 
            background: '#00b900', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '5px', 
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          {loading ? '反映中...' : '🚀 全タブを一括反映'}
        </button>
      </div>
    </div>
  );
}

const inputStyle = {
  padding: '10px',
  width: '100%',
  boxSizing: 'border-box' as const
};