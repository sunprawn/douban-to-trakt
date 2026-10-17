## 同步豆瓣观影记录到 Trakt

### 创建`.env`

1. 复制`.env.template` 到 `.env`

2. 修改`.env`,填入 Trakt 申请的`client id` and `client secret`

3. 填入豆瓣用户名到`DOUBAN_USERNAME`

### 第一次运行

#### 获取 Trakt token

`npm run server`

浏览器打开 `http://localhost:3000` 完成授权，token 会写入 `movies.db`。

#### 第一次运行

`npm run start`

### 同步

`npm run sync`

### 常驻运行（Docker）

镜像内置一个循环：每隔 `SYNC_INTERVAL_HOURS`（默认 24）小时跑一次同步，失败只记录日志、下一轮重试。
电影记录和 Trakt token 都存在 `/data/movies.db`，需要挂载到宿主机目录。

Trakt 的 OAuth 回调需要浏览器，所以先在本机完成「获取 Trakt token」，再把生成的 `movies.db`
放到挂载目录里作为初始状态；之后 token 到期会由容器自动刷新并写回同一个文件。

```bash
docker build -t douban-sync .
```

```bash
docker run -d --name douban-sync --restart unless-stopped \
  --env-file .env -v ./data:/data douban-sync
```

docker compose 示例：

```yaml
services:
  douban-sync:
    build: ./douban-to-trakt
    restart: unless-stopped
    env_file: ./douban-to-trakt/.env
    volumes:
      - ./docker-data/douban-to-trakt:/data
```

查看日志：

```bash
docker compose logs -f douban-sync
```
