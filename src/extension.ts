import * as vscode from 'vscode';
import { NvidiaMonitorService } from './nvidiaMonitor';
import { NvidiaPanelProvider } from './nvidiaPanel';

let monitorService: NvidiaMonitorService | null = null;

export function activate(context: vscode.ExtensionContext) {
  console.log('NVIDIA GPU Monitor 扩展已激活');

  // 初始化监控服务
  monitorService = new NvidiaMonitorService(context);
  monitorService.start();

  // 注册面板提供程序
  const panelProvider = new NvidiaPanelProvider(context.extensionUri);
  
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      NvidiaPanelProvider.viewType,
      panelProvider
    )
  );

  // 监听配置变化，重启定时刷新
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('nvidiaMonitor.refreshInterval')) {
      if (monitorService) {
        monitorService.stop();
        monitorService.start();
      }
    }
  });

  // 暴露获取 GPU 信息的方法供面板调用
  vscode.commands.registerCommand('nvidiaMonitor.getGpuInfos', () => {
    return monitorService ? monitorService.getGpuInfos() : [];
  });

  // 暴露获取能耗数据的方法
  vscode.commands.registerCommand('nvidiaMonitor.getEnergyData', (index: number) => {
    return monitorService ? monitorService.getEnergyData(index) : undefined;
  });

  // 通过命令切换面板
  context.subscriptions.push(
    vscode.commands.registerCommand('nvidiaMonitor.togglePanel', () => {
      vscode.commands.executeCommand('workbench.view.extension.nvidia-monitor');
    })
  );

  vscode.window.showInformationMessage('NVIDIA GPU Monitor 已就绪，请在状态栏查看 GPU 信息');
}

export function deactivate() {
  if (monitorService) {
    monitorService.stop();
    console.log('NVIDIA GPU Monitor 扩展已停用');
  }
}
