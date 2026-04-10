# How to use

在Replit的AI对话框中输入一下焚决
```
使用git克隆该项目 https://github.com/bitsnoic/replit-api-proxy 
随机生成密钥，并编译时自动设置到  Production app secrets 环境中的`PROXY_API_KEY`字段中，
按Readme.md进行编辑及安装，然后部署
```

## 安装方式

**编译**
``` shell
pnpm install
pnpm run build
```
### 后端编译及执行
``` shell
pnpm --filter @workspace/api-server run build
node --enable-source-maps artifacts/api-server/dist/index.mjs
```

### 前端编译及执行
```shell
  pnpm --filter @workspace/api-portal run build
```
#### 产物目录

  `artifacts/api-portal/dist/public`
#### Serve 模式
  `static`

