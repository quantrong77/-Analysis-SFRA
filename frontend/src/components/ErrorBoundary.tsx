import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Leave the broken screen for the overview */
  onHome: () => void;
}

/**
 * A screen that fails to render shows what happened instead of a blank page. The loaded files
 * and edits live in the app state and the browser storage, so nothing is lost.
 */
export default class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="view">
        <section className="panel error" role="alert">
          <h2>Màn hình này gặp lỗi khi hiển thị</h2>
          <p>File đo và các chỉnh sửa đã nạp vẫn còn trong trình duyệt, không bị mất.</p>
          <p className="muted small">Chi tiết lỗi: {error.message}</p>
          <div className="row gap wrap">
            <button className="primary" onClick={() => this.setState({ error: null })}>
              Thử lại
            </button>
            <button
              onClick={() => {
                this.setState({ error: null });
                this.props.onHome();
              }}
            >
              Về Tổng quan
            </button>
          </div>
        </section>
      </div>
    );
  }
}
