import { Client } from '@line/bot-sdk';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 1. LINEクライアントの設定
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const envLocalPath = path.join(projectRoot, '.env.local');
const envPath = fs.existsSync(envLocalPath) ? envLocalPath : path.join(projectRoot, '.env');
dotenv.config({ path: envPath });

if (!process.env.LINE_CHANNEL_ACCESS_TOKEN || !process.env.LINE_CHANNEL_SECRET) {
  throw new Error('LINEの認証情報が未設定です。.env.localを確認してください。');
}

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

// 2. リッチメニューのレイアウト設定
// 上部 1/10 (約168px) をタブ切り替えエリアに設定
const TAB_HEIGHT = 168; 

const createMenuObject = (name) => ({
  size: { width: 2500, height: 1686 },
  selected: true,
  name: name,
  chatBarText: "メニュー",
  areas: [
    {
      // 左上タブ：ホーム切り替え
      bounds: { x: 0, y: 0, width: 1250, height: TAB_HEIGHT },
      action: { type: "postback", data: "action=switch-home", displayText: "ホームへ" }
    },
    {
      // 右上タブ：予約切り替え
      bounds: { x: 1250, y: 0, width: 1250, height: TAB_HEIGHT },
      action: { type: "postback", data: "action=switch-reserve", displayText: "予約へ" }
    },
    {
      // メインコンテンツエリア（タブより下の全領域）
      // ここをさらに細かく分けることも可能です
      bounds: { x: 0, y: TAB_HEIGHT, width: 2500, height: 1686 - TAB_HEIGHT },
      action: { type: "postback", data: "action=main-content", displayText: "メインコンテンツ" }
    }
  ]
});

async function register() {
  try {
    console.log("🚀 タブ切り替え対応リッチメニューの登録を開始します...");

    // A. ホーム用メニューの作成
    console.log("Home Menu (ID作成中...)");
    const homeMenuId = await client.createRichMenu(createMenuObject("Home Tab Menu"));
    const homeImagePath = path.join(projectRoot, 'public', 'menu-home.JPG');
    const homeImage = fs.readFileSync(homeImagePath);
    await client.setRichMenuImage(homeMenuId, homeImage, "image/jpeg");
    console.log(`✅ ホーム用登録完了！ ID: ${homeMenuId}`);

    // B. 予約用メニューの作成
    console.log("Reserve Menu (ID作成中...)");
    const reserveMenuId = await client.createRichMenu(createMenuObject("Reserve Tab Menu"));
    const reserveImagePath = path.join(projectRoot, 'public', 'menu-reserve.JPG');
    const reserveImage = fs.readFileSync(reserveImagePath);
    await client.setRichMenuImage(reserveMenuId, reserveImage, "image/jpeg");
    console.log(`✅ 予約用登録完了！ ID: ${reserveMenuId}`);

    console.log("\n--- 📋 .env.local に貼り付けてください（Webhookは下の2つを推奨） ---");
    console.log(`HOME_RICH_MENU_ID=${homeMenuId}`);
    console.log(`RESERVE_RICH_MENU_ID=${reserveMenuId}`);
    console.log("# フロント用に必要なら併記:");
    console.log(`# NEXT_PUBLIC_RICH_MENU_HOME_ID=${homeMenuId}`);
    console.log(`# NEXT_PUBLIC_RICH_MENU_RESERVE_ID=${reserveMenuId}`);
    console.log("------------------------------------------");

  } catch (error) {
    console.error("❌ エラーが発生しました:", error.message);
    if (error.response?.data) {
      console.error("Details:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

register();