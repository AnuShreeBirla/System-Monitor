import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import os from 'node:os'
import si from 'systeminformation'

function systemMonitorApi() {
  let previousCpu = readCpuTimes()
  let nextEventId = 1
  const logs = []
  const alertState = new Map()

  function readCpuTimes() {
    return os.cpus().reduce((totals, cpu) => {
      totals.idle += cpu.times.idle
      totals.total += Object.values(cpu.times).reduce((sum, value) => sum + value, 0)
      return totals
    }, { idle: 0, total: 0 })
  }

  function recordThresholdEvent(key, active, eventType) {
    if (alertState.get(key) === active) return
    alertState.set(key, active)
    if (!active) return

    logs.unshift({
      id: nextEventId++,
      eventType,
      timestamp: new Date().toLocaleString(),
    })
    logs.splice(20)
  }

  return {
    name: 'system-monitor-api',
    configureServer(server) {
      server.middlewares.use('/api/system-monitor', async (_request, response) => {
        response.setHeader('Cache-Control', 'no-store');
        try {
          const currentCpu = readCpuTimes()
          const totalDiff = currentCpu.total - previousCpu.total
          const idleDiff = currentCpu.idle - previousCpu.idle
          const cpuUsage = totalDiff > 0
            ? Math.round((1 - idleDiff / totalDiff) * 100)
            : 0
          previousCpu = currentCpu

          let memoryUsage
          try {
            const memory = await si.mem()
            const available = Number.isFinite(memory.available) ? memory.available : os.freemem()
            memoryUsage = Math.round((1 - available / memory.total) * 100)
          } catch {
            const totalMemory = os.totalmem()
            memoryUsage = Math.round(((totalMemory - os.freemem()) / totalMemory) * 100)
          }
          let batteryStatus = null
          try {
            const battery = await si.battery()
            batteryStatus = {
              hasBattery: Boolean(battery.hasBattery),
              percent: battery.hasBattery ? Math.round(battery.percent) : null,
              acConnected: Boolean(battery.acConnected),
            }
          } catch (error) {
            console.warn('System Monitor battery read failed:', error.message)
          }

          recordThresholdEvent('cpu-high', cpuUsage >= 90, `High CPU usage: ${cpuUsage}%`)
          recordThresholdEvent('memory-high', memoryUsage >= 80, `High memory usage: ${memoryUsage}%`)
          recordThresholdEvent(
            'battery-low',
            batteryStatus?.hasBattery && batteryStatus.percent <= 20 && !batteryStatus.acConnected,
            `Low battery: ${batteryStatus?.percent ?? 0}%`,
          )

          response.statusCode = 200
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          response.setHeader('Cache-Control', 'no-store')
          response.end(JSON.stringify({
            cpuUsage,
            memoryUsage,
            batteryStatus,
            logs,
          }))
        } catch (error) {
          response.statusCode = 500
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          response.end(JSON.stringify({ error: 'Could not read system metrics' }))
          server.config.logger.error(`System Monitor metrics error: ${error.message}`)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), systemMonitorApi()],
  server: {
    port: 5173,
    strictPort: true,
  },
})
