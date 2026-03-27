"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function AdminPage() {
  const [loading, setLoading] = useState(false);
  const [tabCount, setTabCount] = useState(3);
  const [formData, setFormData] = useState({
    channel_id: '',
    access_token: '',
    channel_secret: '',
    name: '',
    tab1_image_url: '',
    tab2_image_url: '',
    tab3_image_url: '',
  });

  const [status, setStatus] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const fetchChannelData = async (id: string) => {
    if (id.length < 5) return;
    const { data } = await supabase.from('channels').select('*').eq('channel_id', id).maybeSingle();
    if (data) {
      setFormData(prev => ({ ...prev, ...data }));
      setStatus('✅ 既存データを読み込みました');
    }
  };

  useEffect(() => { fetchChannelData(formData.channel_id); }, [formData.channel_id]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, tab: string) => {
    const file = e.target.files?.[0];
    if (!file || !formData.channel_id) return;

    const localUrl = URL.createObjectURL(file);
    setFormData(prev => ({ ...prev, [`${tab}_image_url`]: localUrl }));
    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${formData.channel_id}/${tab}_${Date.now()}.${fileExt}`;
      const { error } = await supabase.storage.from('rich-menu-images').upload(fileName, file);
      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from('rich-menu-images').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, [`${tab}_image_url`]: publicUrl }));
      setStatus(`✅ ${tab} アップロード完了`);
    } catch (err: any) {
      setStatus(`❌ 失敗: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleBulkUpdate = async () => {
    if (!formData.channel_id) return setStatus('❌ IDを入力してください');
    setStatus('🚀 LINEへ一括発行中...');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/richmenu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, tab_count: tabCount }),
      });
      if (res.ok) setStatus('🎉 全メニューの更新とDB集約が完了！');
      else setStatus('❌ 発行エラーが発生しました');
    } catch (e) {
      setStatus('❌ 通信エラー');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-gray-900">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex justify-between items-center border-b-4 border-green-600 pb-4">
          <h1 className="text-3xl font-black">Rich Menu Admin</h1>
          <button 
            onClick={handleBulkUpdate} 
            disabled={isUploading || loading} 
            className="bg-green-600 text-white px-8 py-3 rounded-xl font-black shadow-lg hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? '発行中...' : '🚀 全タブを一括反映'}
          </button>
        </header>

        <div className="bg-white rounded-3xl shadow-lg p-8 grid grid-cols-1 md:grid-cols-2 gap-6 border">
          <div className="space-y-4">
            {/* 🟢 ここを分かりやすく修正 */}
            <input type="text" placeholder="LINE Channel ID (10桁の数字)" className="w-full p-3 bg-yellow-50 border rounded-xl font-mono text-lg" value={formData.channel_id} onChange={(e) => setFormData({...formData, channel_id: e.target.value})} />
            <input type="text" placeholder="Project Name" className="w-full p-3 bg-gray-50 border rounded-xl" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
            
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
              <label className="font-bold text-blue-700">タブの分割数</label>
              <input type="number" value={tabCount} min="2" max="5" onChange={(e) => setTabCount(Number(e.target.value))} className="w-16 p-1 text-center border rounded-lg font-black" />
            </div>
          </div>
          <div className="space-y-4">
            <input type="password" placeholder="Access Token" className="w-full p-3 bg-gray-50 border rounded-xl text-xs font-mono" value={formData.access_token} onChange={(e) => setFormData({...formData, access_token: e.target.value})} />
            <input type="password" placeholder="Channel Secret" className="w-full p-3 bg-gray-50 border rounded-xl text-xs font-mono" value={formData.channel_secret} onChange={(e) => setFormData({...formData, channel_secret: e.target.value})} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {['tab1', 'tab2', 'tab3'].map((tab) => (
            <div key={tab} className="bg-white p-6 rounded-3xl shadow-md border space-y-4">
              <h2 className="font-black text-blue-600 uppercase">{tab} PREVIEW</h2>
              <div className="relative aspect-[2500/1686] border-4 border-dashed border-gray-100 rounded-2xl overflow-hidden bg-gray-50">
                <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onChange={(e) => handleFileUpload(e, tab)} />
                {formData[`${tab}_image_url` as keyof typeof formData] ? (
                  <img src={formData[`${tab}_image_url` as keyof typeof formData]} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-300 font-bold tracking-tighter text-center px-4">CLICK TO UPLOAD</div>
                )}
              </div>
              <input type="text" placeholder="Image URL (Auto-filled)" className="w-full p-2 text-[10px] bg-gray-100 border rounded-lg font-mono" value={formData[`${tab}_image_url` as keyof typeof formData] || ''} readOnly />
            </div>
          ))}
        </div>

        <p className="text-center font-bold text-green-600 text-xl">{status}</p>
      </div>
    </div>
  );
}