import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import * as os from "os";
import { Logger } from "../core/logger";

const execAsync = promisify(exec);

/**
 * System Information Tool
 * Provides comprehensive system information and monitoring
 */
export const systemInfoTool = tool(
  async ({ infoType }) => {
    try {
      Logger.info('🖥️ [SystemInfo Tool] Getting info:', infoType);
      
      switch (infoType) {
        case 'basic':
          const platform = os.platform();
          const arch = os.arch();
          const release = os.release();
          const hostname = os.hostname();
          const uptime = Math.floor(os.uptime() / 3600); // hours
          const totalMem = Math.floor(os.totalmem() / 1024 / 1024 / 1024); // GB
          const freeMem = Math.floor(os.freemem() / 1024 / 1024 / 1024); // GB
          const cpus = os.cpus();
          
          return `🖥️ System Information:
Platform: ${platform} ${arch}
Release: ${release}
Hostname: ${hostname}
Uptime: ${uptime} hours
CPU: ${cpus[0]?.model || 'Unknown'} (${cpus.length} cores)
Memory: ${totalMem - freeMem}GB used / ${totalMem}GB total`;

        case 'processes':
          try {
            const { stdout } = await execAsync('ps aux | head -20');
            return `🔄 Running Processes (top 20):\n\n${stdout}`;
          } catch (error: any) {
            return `❌ Cannot get process info: ${error.message}`;
          }

        case 'memory':
          try {
            if (os.platform() === 'darwin') {
              const { stdout } = await execAsync('vm_stat');
              return `💾 macOS Memory Statistics:\n\n${stdout}`;
            } else {
              const { stdout } = await execAsync('free -h');
              return `💾 Memory Usage:\n\n${stdout}`;
            }
          } catch (error: any) {
            return `❌ Cannot get memory info: ${error.message}`;
          }

        case 'disk':
          try {
            const { stdout } = await execAsync('df -h');
            return `💽 Disk Usage:\n\n${stdout}`;
          } catch (error: any) {
            return `❌ Cannot get disk info: ${error.message}`;
          }

        case 'network':
          try {
            const networkInterfaces = os.networkInterfaces();
            let result = '🌐 Network Interfaces:\n\n';
            
            Object.entries(networkInterfaces).forEach(([name, interfaces]) => {
              if (interfaces) {
                result += `${name}:\n`;
                interfaces.forEach(iface => {
                  if (!iface.internal) {
                    result += `  ${iface.family}: ${iface.address}\n`;
                  }
                });
                result += '\n';
              }
            });
            
            return result;
          } catch (error: any) {
            return `❌ Cannot get network info: ${error.message}`;
          }

        case 'apps':
          try {
            if (os.platform() === 'darwin') {
              const { stdout } = await execAsync('ls /Applications | head -20');
              return `📱 Installed Applications (first 20):\n\n${stdout}`;
            } else {
              return '📱 Application listing is only available on macOS';
            }
          } catch (error: any) {
            return `❌ Cannot get app info: ${error.message}`;
          }

        case 'env':
          const importantEnvs = [
            'USER', 'HOME', 'PATH', 'SHELL', 'LANG', 'NODE_ENV',
            'npm_config_prefix', 'JAVA_HOME', 'PYTHON_PATH'
          ];
          
          let envInfo = '🌍 Environment Variables:\n\n';
          importantEnvs.forEach(envVar => {
            const value = process.env[envVar];
            if (value) {
              envInfo += `${envVar}: ${value}\n`;
            }
          });
          
          return envInfo;

        case 'cpu':
          try {
            if (os.platform() === 'darwin') {
              const { stdout } = await execAsync('top -l 1 -n 5 | grep -E "^CPU|^Processes"');
              return `⚡ CPU Usage:\n\n${stdout}`;
            } else {
              const { stdout } = await execAsync('top -bn1 | grep "Cpu(s)"');
              return `⚡ CPU Usage:\n\n${stdout}`;
            }
          } catch (error: any) {
            return `❌ Cannot get CPU info: ${error.message}`;
          }

        case 'hardware':
          try {
            if (os.platform() === 'darwin') {
              const { stdout } = await execAsync('system_profiler SPHardwareDataType');
              return `🔧 Hardware Information:\n\n${stdout}`;
            } else {
              const { stdout } = await execAsync('lscpu 2>/dev/null || cat /proc/cpuinfo | head -20');
              return `🔧 Hardware Information:\n\n${stdout}`;
            }
          } catch (error: any) {
            return `❌ Cannot get hardware info: ${error.message}`;
          }

        default:
          return `❌ Unknown info type: ${infoType}. Available: basic, processes, memory, disk, network, apps, env, cpu, hardware`;
      }
      
    } catch (error: any) {
      Logger.error('❌ [SystemInfo Tool] Failed to get system info:', error);
      return `❌ System info request failed: ${error.message}`;
    }
  },
  {
    name: "system_info_tool",
    description: `Get comprehensive system information and monitoring data.

Available info types:
- basic: Platform, CPU, memory, uptime overview
- processes: List of running processes
- memory: Detailed memory usage statistics  
- disk: Disk space usage for all mounted drives
- network: Network interfaces and IP addresses
- apps: Installed applications (macOS only)
- env: Important environment variables
- cpu: Current CPU usage and load
- hardware: Detailed hardware specifications

Examples:
- Get system overview: infoType="basic"
- Check running processes: infoType="processes"  
- Monitor memory usage: infoType="memory"
- View disk space: infoType="disk"`,
    schema: z.object({
      infoType: z.enum(['basic', 'processes', 'memory', 'disk', 'network', 'apps', 'env', 'cpu', 'hardware'])
        .describe("Type of system information to retrieve")
    })
  }
);
