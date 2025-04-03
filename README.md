# 四輕丁二烯 Calendar App

一個用於管理請假和加班記錄的應用程序。

## 功能

- 請假記錄管理
- 加班人員安排
- 班表查詢
- MongoDB 數據存儲

## 技術棧

- Next.js 14
- TypeScript
- MongoDB
- Tailwind CSS

## 開發環境設置

1. 克隆倉庫：
```bash
git clone [your-repository-url]
cd calendar
```

2. 安裝依賴：
```bash
npm install
```

3. 設置環境變量：
   - 創建 `.env.local` 文件
   - 添加 MongoDB 連接字符串：
```
MONGODB_URI=your_mongodb_connection_string
```

4. 運行開發服務器：
```bash
npm run dev
```

## 部署

1. 在 Vercel 上部署：
   - 連接 GitHub 倉庫
   - 添加環境變量 `MONGODB_URI`
   - 部署應用

## 注意事項

- 確保 MongoDB 連接字符串安全，不要提交到版本控制
- 在生產環境中設置適當的環境變量
- 定期備份數據庫 