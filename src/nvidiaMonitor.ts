import * as vscode from 'vscode';
import { execFile } from 'child_process';

export interface GpuInfo {
  index: number;
  name: string;
  temperature: number;
  powerUsage: number;
  powerLimit: number;
  memoryUsed: number;
  memoryTotal: number;
  memoryPercent: number;
  gpuUtilization: number;
  fanSpeed: number;
}

export interface EnergyData {
  totalWh: number;
  costCNY: number;
}

export class NvidiaMonitorService {
  private context: vscode.ExtensionContext;
  private refreshTimer: NodeJS.Timeout | null = null;
  private gpuInfos: GpuInfo[] = [];
  private energyData: Map<number, EnergyData> = new Map();
  private lastPowerReadings: Map<number, { power: number; time: number }> = new Map();
  private statusBar: vscode.StatusBarItem | null = null;
  private outputChannel: vscode.OutputChannel;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.outputChannel = vscode.window.createOutputChannel('NVIDIA GPU Monitor');
  }

  public start(): void {
    const interval = vscode.workspace.getConfiguration('nvidiaMonitor').get<number>('refreshInterval', 3000);
    
    this.refresh();
    this.refreshTimer = setInterval(() => {
      this.refresh();
    }, interval);

    this.context.subscriptions.push(
      vscode.commands.registerCommand('nvidiaMonitor.refresh', () => {
        this.refresh();
        vscode.window.showInformationMessage('GPU 状态已刷新');
      }),
      vscode.commands.registerCommand('nvidiaMonitor.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'nvidiaMonitor');
      })
    );

    this.outputChannel.appendLine('NVIDIA GPU Monitor 已启动');
  }

  public stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.outputChannel.appendLine('NVIDIA GPU Monitor 已停止');
  }

  public async refresh(): Promise<void> {
    try {
      const newGpus = await this.getGpuInfo();
      
      // 计算能耗增量
      const now = Date.now();
      for (const gpu of newGpus) {
        const last = this.lastPowerReadings.get(gpu.index);
        if (last) {
          const dt = (now - last.time) / 3600000; // 小时
          const whIncrement = last.power * dt; // 瓦时 = 瓦 × 小时
          
          const pricePerKwh = vscode.workspace.getConfiguration('nvidiaMonitor').get<number>('pricePerKwh', 0.55);
          const prev = this.energyData.get(gpu.index) || { totalWh: 0, costCNY: 0 };
          const newTotalWh = prev.totalWh + whIncrement; // 累计 Wh（高精度）
          this.energyData.set(gpu.index, {
            totalWh: newTotalWh,
            costCNY: (newTotalWh / 1000) * pricePerKwh, // kWh × 单价 = 元
          });
        }
        this.lastPowerReadings.set(gpu.index, { power: gpu.powerUsage, time: now });
      }

      this.gpuInfos = newGpus;
      this.updateStatusBar();
      this.broadcastUpdate();
    } catch (error) {
      this.outputChannel.appendLine(`刷新失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getGpuInfo(): Promise<GpuInfo[]> {
    const nvsmiPath = vscode.workspace.getConfiguration('nvidiaMonitor').get<string>('nvsmiPath', '');
    
    return new Promise((resolve, reject) => {
      execFile(
        nvsmiPath || 'nvidia-smi',
        ['--query-gpu=index,name,temperature.gpu,power.draw,power.limit,memory.used,memory.total,utilization.gpu,fan.speed', '--format=csv,noheader,nounits'],
        { timeout: 5000 },
        (error, stdout) => {
          if (error) {
            reject(new Error('无法执行 nvidia-smi，请确认已安装 NVIDIA 驱动'));
            return;
          }

          const lines = stdout.trim().split('\n').filter(line => line.trim());
          const gpus: GpuInfo[] = [];

          for (const line of lines) {
            const values = line.split(',').map(v => v.trim());
            if (values.length >= 9) {
              const memoryUsed = parseInt(values[5]) || 0;
              const memoryTotal = parseInt(values[6]) || 1;
              gpus.push({
                index: parseInt(values[0]),
                name: values[1],
                temperature: parseFloat(values[2]) || 0,
                powerUsage: parseFloat(values[3]) || 0,
                powerLimit: parseFloat(values[4]) || 0,
                memoryUsed: memoryUsed,
                memoryTotal: memoryTotal,
                memoryPercent: memoryTotal > 0 ? (memoryUsed / memoryTotal * 100) : 0,
                gpuUtilization: parseFloat(values[7]) || 0,
                fanSpeed: parseFloat(values[8]) || 0,
              });
            }
          }

          if (gpus.length === 0) {
            reject(new Error('未检测到 NVIDIA GPU'));
            return;
          }

          resolve(gpus);
        }
      );
    });
  }

  private updateStatusBar(): void {
    const showInBar = vscode.workspace.getConfiguration('nvidiaMonitor').get<boolean>('showInStatusBar', true);
    const format = vscode.workspace.getConfiguration('nvidiaMonitor').get<string>('statusBarFormat', '{gpu}: {temp}°C | {memGB} | {power}W');

    if (!showInBar) {
      if (this.statusBar) {
        this.statusBar.hide();
      }
      return;
    }

    if (this.gpuInfos.length === 0) {
      if (this.statusBar) {
        this.statusBar.text = '$(error) GPU';
        this.statusBar.tooltip = '未检测到 GPU';
        this.statusBar.show();
      }
      return;
    }

    const displayText = this.gpuInfos.map(gpu => this.formatString(format, gpu)).join('  ');
    
    if (!this.statusBar) {
      this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
      this.statusBar.command = 'nvidiaMonitor.togglePanel';
      this.context.subscriptions.push(this.statusBar);
    }

    this.statusBar.text = '$(device-desktop) ' + displayText;
    this.statusBar.tooltip = this.generateTooltip();
    this.statusBar.show();
  }

  private formatGB(mb: number): string {
    return (mb / 1024).toFixed(1) + 'GB';
  }

  private formatString(format: string, gpu: GpuInfo): string {
    const memGB = this.formatGB(gpu.memoryUsed) + '/' + this.formatGB(gpu.memoryTotal);
    return format
      .replace('{gpu}', `${gpu.name} (#${gpu.index})`)
      .replace('{temp}', gpu.temperature.toString())
      .replace('{memGB}', memGB)
      .replace('{power}', gpu.powerUsage.toFixed(1))
      .replace('{memPercent}', gpu.memoryPercent.toFixed(1))
      .replace('{utilization}', gpu.gpuUtilization.toFixed(1));
  }

  private generateTooltip(): string {
    if (this.gpuInfos.length === 0) {
      return '未检测到 GPU';
    }

    let tooltip = '## NVIDIA GPU 状态\n\n';
    
    for (const gpu of this.gpuInfos) {
      const energy = this.energyData.get(gpu.index);
      tooltip += `### ${gpu.name} (#${gpu.index})\n\n`;
      tooltip += `- **温度**: ${gpu.temperature}°C\n`;
      tooltip += `- **功耗**: ${gpu.powerUsage.toFixed(1)}W\n`;
      tooltip += `- **显存**: ${this.formatGB(gpu.memoryUsed)}/${this.formatGB(gpu.memoryTotal)} (${gpu.memoryPercent.toFixed(1)}%)\n`;
      tooltip += `- **GPU 利用率**: ${gpu.gpuUtilization.toFixed(1)}%\n`;
      if (energy) {
        const pricePerKwh = vscode.workspace.getConfiguration('nvidiaMonitor').get<number>('pricePerKwh', 0.55);
        tooltip += `- **累计耗电**: ${(energy.totalWh / 1000).toFixed(2)}kWh\n`;
        tooltip += `- **预估电费**: ¥${energy.costCNY.toFixed(2)}\n`;
      }
      tooltip += `\n`;
    }

    return tooltip;
  }

  public getGpuInfos(): GpuInfo[] {
    return this.gpuInfos;
  }

  public getEnergyData(index: number): EnergyData | undefined {
    return this.energyData.get(index);
  }

  private broadcastUpdate(): void {
    vscode.commands.executeCommand('setContext', 'nvidiaMonitor.hasData', this.gpuInfos.length > 0);
  }

  public getOutputChannel(): vscode.OutputChannel {
    return this.outputChannel;
  }
}
