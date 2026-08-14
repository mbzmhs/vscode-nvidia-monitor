# NVIDIA GPU Monitor for VSCode

实时显示 NVIDIA 显卡的功耗、温度、显存占用情况。

## 功能特性

- **状态栏实时监控**：在 VSCode 底部状态栏显示 GPU 关键信息
- **侧边面板**：精简的 GPU 监控面板，支持多卡显示
- **能耗预估**：根据功耗积分累计耗电（Wh）和预估电费（¥）
- **可配置刷新间隔**：自定义数据刷新频率（1秒-60秒）
- **多显卡支持**：自动检测并显示所有 NVIDIA GPU
- **颜色警示**：温度/显存过高时自动变色提醒

## 监控指标

| 指标 | 说明 |
|------|------|
| 温度 | GPU 核心温度 (°C) |
| 功耗 | 当前功耗 (W) |
| 显存使用 | 已用显存 / 总显存 (GB) |
| GPU 利用率 | GPU 计算单元使用率 (%) |
| 累计耗电 | 积分累计耗电量 (Wh) |
| 预估电费 | 根据电价计算的累计费用 (¥) |

## 安装

1. 将项目导入 VSCode
2. 运行 `npm install` 安装依赖
3. 按 F5 打开扩展开发主机窗口
4. 或打包为 `.vsix` 文件安装：`npx vsce package`，然后在 VSCode 中从 VSIX 安装

## 配置

在 VSCode 设置中搜索 "NVIDIA GPU Monitor" 进行配置：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `nvidiaMonitor.refreshInterval` | 3000 | 刷新间隔（毫秒） |
| `nvidiaMonitor.nvsmiPath` | (空) | nvidia-smi 可执行文件路径 |
| `nvidiaMonitor.showInStatusBar` | true | 是否在状态栏显示 |
| `nvidiaMonitor.statusBarFormat` | `{gpu}: {temp}°C \| {memGB} \| {power}W` | 状态栏格式 |
| `nvidiaMonitor.pricePerKwh` | 0.55 | 每度电价格（元），用于预估电费 |

### 状态栏格式变量

- `{gpu}` - GPU 名称和编号
- `{temp}` - 温度
- `{memGB}` - 显存使用/总显存 (GB)，如 `22.6/24.0GB`
- `{power}` - 功耗 (W)

## 命令

| 命令 | 说明 |
|------|------|
| `NVIDIA Monitor: 刷新 GPU 状态` | 立即刷新 GPU 数据 |
| `NVIDIA Monitor: 切换 GPU 监控面板` | 显示/隐藏侧边面板 |
| `NVIDIA Monitor: 打开 NVIDIA Monitor 设置` | 打开配置页面 |

## 依赖要求

- Windows / Linux / macOS
- NVIDIA 显卡及已安装的驱动程序
- nvidia-smi 可在系统 PATH 中找到

## 开发

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 监听模式（自动重新编译）
npm run watch

# 打包为 vsix
npx vsce package
```

## 许可证

MIT
