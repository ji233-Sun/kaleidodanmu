/**
 * Next.js 服务端启动钩子：进程启动时初始化 DataSource。
 * better-sqlite3 只能在 Node 运行时加载，必须用 NEXT_RUNTIME 守卫排除 Edge。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initDataSource } = await import('@/server/database/data-source')
    await initDataSource()
  }
}
