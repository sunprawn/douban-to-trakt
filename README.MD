## 同步豆瓣观影记录到 Trakt

### 创建`.env`

1. 复制`.env.template` 到 `.env`

2. 修改`.env`,填入 Trakt 申请的`client id` and `client secret`

3. 填入豆瓣用户名到`DOUBAN_USERNAME`

### 第一次运行

#### 获取 Trakt token

`npm run server`

#### 第一次运行

`npm run start`

### 同步

`npm run sync`
