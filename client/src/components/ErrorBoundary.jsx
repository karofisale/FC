import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Chặn lỗi render ở một điểm duy nhất, thay vì để React tháo cả cây và
 * để lại màn hình trắng không rõ nguyên nhân. Bọc quanh toàn bộ app ở
 * App.jsx — mọi lỗi bất ngờ từ dữ liệu thật (thiếu trường, kiểu dữ liệu
 * lạ từ Sheet...) đều hiện được thông báo và nút thử lại thay vì crash
 * câm lặng.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Lỗi giao diện chưa xử lý:', error, info);
  }

  handleReset = () => {
    this.setState({ error: null });
    if (this.props.onReset) this.props.onReset();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-[50vh] flex items-center justify-center p-6 font-sans">
        <div className="bg-white border border-rose-200 rounded-xl p-6 max-w-md w-full text-center space-y-3 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="font-bold text-slate-900 text-sm">Đã xảy ra lỗi khi hiển thị trang này</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            {this.state.error?.message || 'Lỗi không xác định.'}
          </p>
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-lg"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Thử lại
          </button>
        </div>
      </div>
    );
  }
}
