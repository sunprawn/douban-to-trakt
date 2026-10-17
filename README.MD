## 同步豆瓣观影记录到 Trakt

### 创建`.env`

1. 复制`.env.template` 到 `.env`

2. 在 [Trakt API apps](https://app.trakt.tv/settings/apps/api) 新建 app（需要绑定 GitHub 账号），把 `client id` 填入 `TRAKT_CLIENT_ID`。
   新 app 不再发放 client secret，本项目用设备码流程授权，只需要 client id。

3. 填入豆瓣用户名到`DOUBAN_USERNAME`

### 第一次运行

#### 授权 Trakt

`npm run auth`

终端会打印一个网址和 8 位码，在任意设备打开网址输入即可。token 写入 `movies.db`，
access token 有效期 7 天，之后由程序自动刷新（refresh token 单次有效，每次刷新都会写回）。

#### 第一次运行

`npm run start`

### 同步

`npm run sync`

### 常驻运行（Docker）

镜像内置一个循环：每隔 `SYNC_INTERVAL_HOURS`（默认 24）小时跑一次同步，失败只记录日志、下一轮重试。
电影记录和 Trakt token 都存在 `/data/movies.db`，需要挂载到宿主机目录。

首次部署时在容器里完成 Trakt 授权，token 直接写进挂载目录里的数据库；之后到期由容器自动刷新。
如果已有本机爬好的 `movies.db`，先把它放进挂载目录再授权，可以省掉全量重爬。

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

授权（一次性）：

```bash
docker compose run --rm douban-sync node dist/auth.js
```

查看日志：

```bash
docker compose logs -f douban-sync
```
