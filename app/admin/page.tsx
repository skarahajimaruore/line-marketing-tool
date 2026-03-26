"use client";
import { useState } from 'react';

export default function AdminPage() {
  const [loading, setLoading] = useState(false);
  const [tabCount, setTabCount] = useState(3); // デフォルト3
  const [formData, setFormData] = useState({
    channel_id: '',
    access_token: '',
    name: '',
    tab1_image_url: '',
    tab2_image_url: '',
    tab3_image_url: '',
  });

  const handleUpdate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/richmenu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, tab_count: tabCount }),
      });
      if (res.ok) alert('✅ 反映に成功しました');
      else alert('❌ 発行エラーが発生しました');
    } catch (e) {
      alert('🔥 通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px' }}>
      <h2>店舗メニュー管理</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input placeholder="LINE Channel ID" onChange={e => setFormData({...formData, channel_id: e.target.value})} />
        <input placeholder="Access Token" onChange={e => setFormData({...formData, access_token: e.target.value})} />
        <input placeholder="店舗名" onChange={e => setFormData({...formData, name: e.target.value})} />
        
        {/* タブ数設定のみ追加 */}
        <div style={{ padding: '10px', border: '1px solid #ccc' }}>
          <label>タブの分割数：</label>
          <input 
            type="number" 
            value={tabCount} 
            onChange={e => setTabCount(Number(e.target.value))} 
            style={{ width: '50px' }}
          />
        </div>

        <input placeholder="Tab1 画像URL" onChange={e => setFormData({...formData, tab1_image_url: e.target.value})} />
        <input placeholder="Tab2 画像URL" onChange={e => setFormData({...formData, tab2_image_url: e.target.value})} />
        <input placeholder="Tab3 画像URL" onChange={e => setFormData({...formData, tab3_image_url: e.target.value})} />
        
        <button 
          onClick={handleUpdate} 
          disabled={loading}
          style={{ padding: '10px', background: '#00b900', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          {loading ? '反映中...' : '🚀 全タブを一括反映'}
        </button>
      </div>
    </div>
  );
}