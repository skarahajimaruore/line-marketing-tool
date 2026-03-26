"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function RichMenuAdmin() {
  const [formData, setFormData] = useState({
    name: '',
    channel_id: '',
    access_token: '',
    channel_secret: '',
    tab1_image_url: '',
    tab2_image_url: '',
    tab3_image_url: '',
  });

  const [status, setStatus] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // DBから既存データを読み込む（channel_id が一致する1行だけを取得）
  const fetchChannelData = async (id: string) => {
    if (id.length < 5) return;
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('channel_id', id)
      .maybeSingle(); // 複数あっても1枚だけ取る

    if (data) {
      setFormData(prev => ({ ...prev, ...data }));
      setStatus('✅ 保存済みのデータを読み込みました');
    }
  };

  useEffect(() => { fetchChannelData(formData.channel_id); }, [formData.channel_id]);

  // 📸 画像アップロード（プレビュー表示のみ即時反映）
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, tab: string) => {
    const file = e.target.files?.[0];
    if (!file || !formData.channel_id) return;

    // 1. まずは画面にプレビューを表示
    const localUrl = URL.createObjectURL(file);
    setFormData(prev => ({ ...prev, [`${tab}_image_url`]: localUrl }));

    setIsUploading(true);
    setStatus(`⏳ ${tab} をクラウドに保存中...`);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${formData.channel_id}/${tab}_${Date.now()}.${fileExt}`;
      const { error } = await supabase.storage.from('rich-menu-images').upload(fileName, file);
      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage.from('rich-menu-images').getPublicUrl(fileName);
      
      // 2. クラウドのURLをセット（まだLINEには送らない）
      setFormData(prev => ({ ...prev, [`${tab}_image_url`]: publicUrl }));
      setStatus(`✅ ${tab} の準備完了`);
    } catch (err: any) {
      setStatus(`❌ アップロード失敗: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  // 🚀 【メイン機能】全データを一括でLINEとDBに送る
  const handleBulkUpdate = async () => {
    if (!formData.channel_id || !formData.access_token) {
      setStatus('❌ IDとトークンを入力してください');
      return;
    }

    setStatus('🚀 全タブの設定をLINEへ一括送信中...');
    try {
      const res = await fetch('/api/admin/richmenu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData), // すべてのURLをまとめて送る
      });
      const result = await res.json();
      if (res.ok) setStatus('🎉 全てのメニューが正常に更新されました！');
      else setStatus(`❌ エラー: ${result.error}`);
    } catch (e) { setStatus('❌ 通信エラー'); }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-gray-900">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex justify-between items-center">
          <h1 className="text-3xl font-black text-green-700">Rich Menu Master</h1>
          <button 
            onClick={handleBulkUpdate} 
            disabled={isUploading}
            className="bg-green-600 text-white px-10 py-4 rounded-2xl font-black text-xl hover:bg-green-700 shadow-xl transition-all disabled:opacity-50"
          >
            🚀 全タブを一括反映
          </button>
        </header>

        {/* 設定エリア（共通） */}
        <div className="bg-white rounded-3xl shadow-lg p-8 grid grid-cols-1 md:grid-cols-2 gap-6 border">
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400">LINE Channel ID (このIDで1行に集約されます)</label>
              <input type="text" className="w-full p-3 bg-yellow-50 border rounded-xl outline-none font-mono" value={formData.channel_id} onChange={(e) => setFormData({...formData, channel_id: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400">Project Name</label>
              <input type="text" className="w-full p-3 bg-gray-50 border rounded-xl outline-none" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
            </div>
          </div>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-400">Access Token / Secret</label>
              <input type="password" placeholder="Access Token" className="w-full p-3 bg-gray-50 border rounded-xl outline-none text-xs font-mono mb-2" value={formData.access_token} onChange={(e) => setFormData({...formData, access_token: e.target.value})} />
              <input type="password" placeholder="Channel Secret" className="w-full p-3 bg-gray-50 border rounded-xl outline-none text-xs font-mono" value={formData.channel_secret} onChange={(e) => setFormData({...formData, channel_secret: e.target.value})} />
            </div>
          </div>
        </div>

        {/* プレビュー並列エリア */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {['tab1', 'tab2', 'tab3'].map((tab) => (
            <div key={tab} className="bg-white p-6 rounded-3xl shadow-md border space-y-4">
              <h2 className="font-black text-blue-600 uppercase">{tab} PREVIEW</h2>
              <div className="relative aspect-[2500/1686] border-4 border-dashed border-gray-100 rounded-2xl overflow-hidden bg-gray-50 group hover:border-blue-400 transition-all">
                <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" onChange={(e) => handleFileUpload(e, tab)} />
                {formData[`${tab}_image_url` as keyof typeof formData] ? (
                  <img src={formData[`${tab}_image_url` as keyof typeof formData]} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-300 font-bold">CLICK TO SET {tab}</div>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="text-center font-bold text-green-600 text-lg">{status}</p>
      </div>
    </div>
  );
}