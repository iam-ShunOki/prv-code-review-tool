// backend/scripts/setup-font-dirs.js
const fs = require("fs");
const path = require("path");

// 必要なディレクトリパス
const fontsDirPath = path.join(__dirname, "../src/assets/fonts");

// ディレクトリが存在しない場合は作成
if (!fs.existsSync(fontsDirPath)) {
  fs.mkdirSync(fontsDirPath, { recursive: true });
  console.log(`Created fonts directory: ${fontsDirPath}`);
}

// README ファイルの作成（フォントの入手方法を説明）
const readmePath = path.join(fontsDirPath, "README.md");
const readmeContent = `# フォントファイル

このディレクトリには、PDFレポート生成に必要なフォントファイルを配置します。

## 必要なフォント

- ipagp.ttf: IPAゴシックフォント

## フォントの入手方法

1. [IPA Font ダウンロードページ](https://moji.or.jp/ipafont/ipafontdownload/) からIPAフォントをダウンロードできます。
2. ダウンロードしたZIPファイルを解凍し、「ipagp.ttf」をこのディレクトリに配置してください。

## 利用上の注意

IPAフォントは、IPA（情報処理推進機構）によって提供されている日本語フォントです。
利用に際しては、IPAフォントライセンスに従ってください。
`;

fs.writeFileSync(readmePath, readmeContent);
console.log(`Created README file: ${readmePath}`);

console.log("Font directory setup completed.");
