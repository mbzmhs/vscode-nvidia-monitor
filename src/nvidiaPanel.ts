import * as vscode from 'vscode';
import { GpuInfo, EnergyData } from './nvidiaMonitor';

export class NvidiaPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'nvidiaMonitor.panel';

  private view?: vscode.WebviewView;
  private gpuInfos: GpuInfo[] = [];
  private energyData: Map<number, EnergyData> = new Map();
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(private readonly extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlForWebview();

    webviewView.webview.onDidReceiveMessage(async message => {
      if (message.type === 'refresh') {
        await vscode.commands.executeCommand('nvidiaMonitor.refresh');
        await this.collectData();
      } else if (message.type === 'openSettings') {
        vscode.commands.executeCommand('nvidiaMonitor.openSettings');
      }
    });

    // 初始收集数据
    setTimeout(() => this.collectData(), 500);

    const interval = vscode.workspace.getConfiguration('nvidiaMonitor').get<number>('refreshInterval', 3000);
    this.refreshTimer = setInterval(() => {
      this.collectData();
    }, interval);

    webviewView.onDidDispose(() => {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
      }
    });
  }

  private async collectData(): Promise<void> {
    if (!this.view) return;

    try {
      const result = await vscode.commands.executeCommand<any>('nvidiaMonitor.getGpuInfos');
      if (result && Array.isArray(result) && result.length > 0) {
        this.gpuInfos = result;
        
        for (const gpu of result) {
          const energy: EnergyData | undefined = await vscode.commands.executeCommand<any>('nvidiaMonitor.getEnergyData', gpu.index);
          if (energy) {
            this.energyData.set(gpu.index, energy);
          }
        }
        
        this.sendUpdate();
      }
    } catch (error) {
      // Silently fail
    }
  }

  private sendUpdate(): void {
    if (!this.view) return;

    const data: any = { type: 'gpuUpdate', gpuInfos: this.gpuInfos };
    const energyArr: any[] = [];
    this.energyData.forEach((v, k) => energyArr.push({ index: k, ...v }));
    data.energyData = energyArr;
    
    this.view.webview.postMessage(data);
  }

  private formatGB(mb: number): string {
    return (mb / 1024).toFixed(1) + 'GB';
  }

  private getHtmlForWebview(): string {
    const refreshInterval = vscode.workspace.getConfiguration('nvidiaMonitor').get<number>('refreshInterval', 3000);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:8px;background-color:var(--vscode-editor-background);color:var(--vscode-foreground);font-size:11px}
h1{font-size:13px;margin-bottom:8px;color:var(--vscode-titleBar-activeForeground);display:flex;align-items:center;gap:6px}
.gpu-card{background-color:var(--vscode-editor-inactiveSelectionBackground);border:1px solid var(--vscode-panel-border);border-radius:4px;padding:8px;margin-bottom:8px}
.gpu-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid var(--vscode-panel-border)}
.gpu-name{font-weight:600;font-size:12px;color:var(--vscode-titleBar-activeForeground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%}
.gpu-index{background-color:var(--vscode-badge-background);color:var(--vscode-badge-foreground);padding:1px 6px;border-radius:8px;font-size:9px}
.metrics{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.metric{display:flex;flex-direction:column;gap:2px}
.metric-label{font-size:9px;color:var(--vscode-descriptionForeground);text-transform:uppercase}
.metric-value{font-size:14px;font-weight:600;color:var(--vscode-charts-green)}
.metric-value.warning{color:var(--vscode-charts-orange)}
.metric-value.danger{color:var(--vscode-charts-red)}
.progress-bar{width:100%;height:4px;background-color:var(--vscode-input-background);border-radius:2px;overflow:hidden;margin-top:2px}
.progress-fill{height:100%;border-radius:2px;transition:width 0.3s ease}
.progress-fill.green{background-color:var(--vscode-charts-green)}
.progress-fill.orange{background-color:var(--vscode-charts-orange)}
.progress-fill.red{background-color:var(--vscode-charts-red)}
.no-gpu{text-align:center;padding:24px 12px;color:var(--vscode-descriptionForeground);font-size:11px}
.status-indicator{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:4px}
.status-indicator.active{background-color:var(--vscode-charts-green)}
.status-indicator.inactive{background-color:var(--vscode-charts-red)}
.energy-section{grid-column:1/-1;background-color:var(--vscode-editor-inactiveSelectionBackground);border:1px solid var(--vscode-panel-border);border-radius:3px;padding:6px 8px;margin-top:4px}
.energy-row{display:flex;justify-content:space-between;align-items:center;font-size:10px}
.energy-label{color:var(--vscode-descriptionForeground)}
.energy-value{font-weight:600;color:var(--vscode-charts-yellow)}
</style>
</head>
<body>
<h1><span class="status-indicator" id="statusIndicator"></span>NVIDIA GPU</h1>
<div id="gpuContainer">
<div class="no-gpu">⏳ 检测中...</div>
</div>
<script>
const vscode=acquireVsCodeApi();let gpuInfos=[],energyMap={};
function fmtGB(mb){return(mb/1024).toFixed(1)+'GB'}
function tempClass(t){if(t>=85)return'danger';if(t>=70)return'warning';return''}
function memColor(p){if(p>=90)return'red';if(p>=70)return'orange';return'green'}
function render(){
const c=document.getElementById('gpuContainer'),i=document.getElementById('statusIndicator');
if(!gpuInfos||!gpuInfos.length){i.className='status-indicator inactive';c.innerHTML='<div class="no-gpu">⚠️ 未检测到 GPU</div>';return}
i.className='status-indicator active';let h='';
for(const g of gpuInfos){
const tc=tempClass(g.temperature),mc=memColor(g.memoryPercent);
const energy=energyMap[g.index];
h+='<div class="gpu-card"><div class="gpu-header"><span class="gpu-name">'+g.name+'</span><span class="gpu-index">#'+g.index+'</span></div><div class="metrics">';
h+='<div class="metric"><span class="metric-label">温度</span><span class="metric-value '+tc+'">'+g.temperature+'°C</span></div>';
h+='<div class="metric"><span class="metric-label">功耗</span><span class="metric-value">'+g.powerUsage.toFixed(1)+'W</span></div>';
h+='<div class="metric"><span class="metric-label">显存</span><span class="metric-value">'+fmtGB(g.memoryUsed)+'/'+fmtGB(g.memoryTotal)+'</span><div class="progress-bar"><div class="progress-fill '+mc+'" style="width:'+g.memoryPercent+'%"></div></div></div>';
h+='<div class="metric"><span class="metric-label">GPU</span><span class="metric-value">'+g.gpuUtilization.toFixed(1)+'%</span><div class="progress-bar"><div class="progress-fill green" style="width:'+g.gpuUtilization+'%"></div></div></div>';
if(energy){
h+='<div class="energy-section"><div class="energy-row"><span class="energy-label">⚡ 累计耗电</span><span class="energy-value">'+energy.totalWh.toFixed(5)+'Wh</span></div>';
h+='<div class="energy-row" style="margin-top:3px"><span class="energy-label">💰 预估电费</span><span class="energy-value">¥'+energy.costCNY.toFixed(2)+'</span></div></div>'}
h+='</div></div>'}
c.innerHTML=h}
window.addEventListener('message',e=>{if(e.data.type==='gpuUpdate'){gpuInfos=e.data.gpuInfos;energyMap={};(e.data.energyData||[]).forEach(ed=>{energyMap[ed.index]=ed});render()}});
</script>
</body>
</html>`;
  }
}
