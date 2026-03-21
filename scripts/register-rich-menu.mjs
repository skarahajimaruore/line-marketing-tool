import { Client } from '@line/bot-sdk';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 1. LINEクライアントの設定
// .env.local を確実に読み込む（実行場所がプロジェクト直下でない場合も対応）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const envLocalPath = path.join(projectRoot, '.env.local');
const envPath = fs.existsSync(envLocalPath) ? envLocalPath : path.join(projectRoot, '.env');
dotenv.config({ path: envPath });

if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
  throw new Error('LINE_CHANNEL_ACCESS_TOKEN が未設定です（.env.local を読み込めているか確認してください）');
}
if (!process.env.LINE_CHANNEL_SECRET) {
  throw new Error('LINE_CHANNEL_SECRET が未設定です（.env.local を読み込めているか確認してください）');
}

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

// 2. リッチメニューの「枠」の設定（共通レイアウト）
const createMenuObject = (name) => ({
  size: { width: 2500, height: 1686 },
  selected: true,
  name: name,
  chatBarText: "メニューを切り替える",
  areas: [
    {
      bounds: { x: 0, y: 0, width: 1250, height: 1686 }, // 左半分：ホーム
      action: { type: "postback", data: "action=switch-home", displayText: "ホーム" }
    },
    {
      bounds: { x: 1250, y: 0, width: 1250, height: 1686 }, // 右半分：予約
      action: { type: "postback", data: "action=switch-reserve", displayText: "予約" }
    }
  ]
});

async function register() {
  try {
    console.log("🚀 リッチメニューの登録を開始します...");

    // A. ホーム用メニューの作成
    console.log("Home Menu を作成中...");
    const homeMenuId = await client.createRichMenu(createMenuObject("Home Menu"));
    const homeImagePath = path.join(projectRoot, 'public', 'menu-home.JPG');
    const homeImage = fs.readFileSync(homeImagePath);
    console.log("Home Menu の画像を設定中...");
    await client.setRichMenuImage(homeMenuId, homeImage, "image/jpeg");
    console.log(`✅ ホーム用登録完了！ ID: ${homeMenuId}`);

    // B. 予約用メニューの作成
    console.log("Reserve Menu を作成中...");
    const reserveMenuId = await client.createRichMenu(createMenuObject("Reserve Menu"));
    const reserveImagePath = path.join(projectRoot, 'public', 'menu-reserve.JPG');
    const reserveImage = fs.readFileSync(reserveImagePath);
    console.log("Reserve Menu の画像を設定中...");
    await client.setRichMenuImage(reserveMenuId, reserveImage, "image/jpeg");
    console.log(`✅ 予約用登録完了！ ID: ${reserveMenuId}`);

    console.log("\n--- 重要：メモしてください ---");
    console.log(`HOME_RICH_MENU_ID=${homeMenuId}`);
    console.log(`RESERVE_RICH_MENU_ID=${reserveMenuId}`);
    console.log("------------------------------");
    console.log("このIDを .env.local に追記してください。");

  } catch (error) {
    const originalError = error?.originalError;
    const status =
      error?.statusCode ??
      error?.response?.status ??
      originalError?.response?.status ??
      error?.status;
    const data =
      error?.body ??
      error?.response?.data ??
      originalError?.response?.data;

    console.error("❌ エラーが発生しました:", error?.message ?? error);
    if (error?.stack) console.error("Stack:", error.stack);
    if (status) console.error("HTTP status:", status);
    if (data) {
      console.error(
        "Response data:",
        typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      );
    }
  }
}

register();