"use client";

/**
 * 自定义全局错误边界。Next 会预渲染内部 /_global-error 页；提供一个自包含、不依赖任何
 * Context/Provider 的实现，替代内置默认页，避免其预渲染时的 useContext 崩溃。
 * global-error 必须自带 <html>/<body>（它替换根 layout）。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#0b0f1a",
          color: "#e5e7eb",
        }}
      >
        <div style={{ textAlign: "center", padding: 24, maxWidth: 480 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>页面出错了</h1>
          <p style={{ fontSize: 14, opacity: 0.7, margin: "0 0 16px" }}>
            {error?.message || "发生未知错误，请重试。"}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #334155",
              background: "#1e293b",
              color: "#e5e7eb",
              cursor: "pointer",
            }}
          >
            重试
          </button>
        </div>
      </body>
    </html>
  );
}
