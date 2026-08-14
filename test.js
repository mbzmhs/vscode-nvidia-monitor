const { execFile } = require('child_process');

async function test() {
  console.log('=== NVIDIA GPU Monitor 测试 ===\n');

  try {
    const result = await new Promise((resolve, reject) => {
      execFile(
        'nvidia-smi',
        ['--query-gpu=index,name,temperature.gpu,power.draw,power.limit,memory.used,memory.total,utilization.gpu,fan.speed', '--format=csv,noheader,nounits'],
        { timeout: 5000 },
        (error, stdout) => {
          if (error) reject(error);
          else resolve(stdout);
        }
      );
    });

    const lines = result.trim().split('\n').filter(l => l.trim());
    console.log(`检测到 ${lines.length} 块 GPU:\n`);

    for (const line of lines) {
      const values = line.split(',').map(v => v.trim());
      const memoryUsed = parseInt(values[5]) || 0;
      const memoryTotal = parseInt(values[6]) || 1;

      const gpu = {
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
      };

      console.log(`GPU #${gpu.index}: ${gpu.name}`);
      console.log(`  温度:     ${gpu.temperature}°C`);
      console.log(`  功耗:     ${gpu.powerUsage.toFixed(1)}W / ${gpu.powerLimit.toFixed(1)}W (${(gpu.powerUsage/gpu.powerLimit*100).toFixed(1)}%)`);
      console.log(`  显存:     ${gpu.memoryUsed}MB / ${gpu.memoryTotal}MB (${gpu.memoryPercent.toFixed(1)}%)`);
      console.log(`  GPU利用率: ${gpu.gpuUtilization.toFixed(1)}%`);
      console.log(`  风扇:     ${gpu.fanSpeed.toFixed(0)}%\n`);
    }

    // 测试状态栏格式化
    const format = '{gpu}: {temp}°C | {memUsed}/{memTotal}MB | {power}W';
    for (const line of lines) {
      const values = line.split(',').map(v => v.trim());
      const memoryUsed = parseInt(values[5]) || 0;
      const memoryTotal = parseInt(values[6]) || 1;
      const gpu = {
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
      };

      const displayText = format
        .replace('{gpu}', `${gpu.name} (#${gpu.index})`)
        .replace('{temp}', gpu.temperature.toString())
        .replace('{memUsed}', gpu.memoryUsed.toString())
        .replace('{memTotal}', gpu.memoryTotal.toString())
        .replace('{power}', gpu.powerUsage.toFixed(1));

      console.log(`状态栏: ${displayText}`);
    }

    console.log('\n=== 测试通过 ===');
  } catch (error) {
    console.error('测试失败:', error.message);
  }
}

test();
