import React from 'react';
import { Calendar, Clock, CheckCircle2, Factory, Users, FileText } from 'lucide-react';

export default function WorkflowGuide() {
  return (
    <div className="space-y-6">
      
      {/* Title */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-600" />
          BẢNG 5: QUY TRÌNH & LỊCH TRÌNH LẬP SALES FORECAST
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Quy chuẩn thời gian phối hợp giữa Tác nghiệp kinh doanh, Tài chính và Nhà máy Karofi.
        </p>
      </div>

      {/* Monthly Timeline Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wide border-b border-slate-200 pb-2 flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600" />
          1. QUY TRÌNH LẬP BẢN FORECAST THÁNG (BẢNG 0 - 04 THÁNG TIẾP THEO)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="bg-blue-600 text-white font-bold text-xs px-2.5 py-0.5 rounded-full">BƯỚC 1</span>
                <span className="text-xs font-bold text-blue-900 font-mono">NGÀY 22 / N</span>
              </div>
              <h4 className="font-bold text-slate-900 text-sm mb-1">Lập Sales Forecast 04 Tháng</h4>
              <p className="text-xs text-slate-600">Sale Forecast cho 04 tháng tiếp theo: N+1, N+2, N+3, N+4 theo từng SKU và Đơn vị.</p>
            </div>
            <div className="mt-4 pt-2 border-t border-blue-200 flex items-center text-xs font-semibold text-blue-800">
              <Users className="w-3.5 h-3.5 mr-1.5" /> Bộ phận: Tác nghiệp kinh doanh
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="bg-amber-600 text-white font-bold text-xs px-2.5 py-0.5 rounded-full">BƯỚC 2</span>
                <span className="text-xs font-bold text-amber-900 font-mono">NGÀY 23 / N</span>
              </div>
              <h4 className="font-bold text-slate-900 text-sm mb-1">Thẩm định thông tin FC</h4>
              <p className="text-xs text-slate-600">Thẩm định đối chiếu với thực tế cùng kỳ (YoY) và xu hướng 3 tháng gần nhất.</p>
            </div>
            <div className="mt-4 pt-2 border-t border-amber-200 flex items-center text-xs font-semibold text-amber-800">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Bộ phận: Tài chính
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="bg-emerald-600 text-white font-bold text-xs px-2.5 py-0.5 rounded-full">BƯỚC 3</span>
                <span className="text-xs font-bold text-emerald-900 font-mono">NGÀY 24 / N</span>
              </div>
              <h4 className="font-bold text-slate-900 text-sm mb-1">Gửi thông tin FC cho Nhà máy</h4>
              <p className="text-xs text-slate-600">Khóa số liệu tháng và chuyển kế hoạch sản lượng duyệt cho Nhà máy chuẩn bị vật tư.</p>
            </div>
            <div className="mt-4 pt-2 border-t border-emerald-200 flex items-center text-xs font-semibold text-emerald-800">
              <Factory className="w-3.5 h-3.5 mr-1.5" /> Bộ phận: Tác nghiệp kinh doanh
            </div>
          </div>

        </div>
      </div>

      {/* Weekly Timeline Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h3 className="text-sm font-bold text-cyan-900 uppercase tracking-wide border-b border-slate-200 pb-2 flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-600" />
          2. QUY TRÌNH LẬP BẢN FORECAST TUẦN (BẢNG 1 - TUẦN & MIỀN CHO THÁNG 1)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="bg-slate-700 text-white font-bold text-xs px-2.5 py-0.5 rounded-full">BƯỚC 1</span>
                <span className="text-xs font-bold text-slate-900 font-mono">CHIỀU THỨ 3</span>
              </div>
              <h4 className="font-bold text-slate-900 text-sm mb-1">Lập FC Tuần & Miền</h4>
              <p className="text-xs text-slate-600">Cập nhật sản lượng các tuần còn lại (W1..W5) phân bổ Miền Bắc & Miền Nam.</p>
            </div>
            <div className="mt-4 pt-2 border-t border-slate-200 flex items-center text-xs font-semibold text-slate-700">
              <Users className="w-3.5 h-3.5 mr-1.5" /> Bộ phận: Tác nghiệp kinh doanh
            </div>
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="bg-purple-600 text-white font-bold text-xs px-2.5 py-0.5 rounded-full">BƯỚC 2</span>
                <span className="text-xs font-bold text-purple-900 font-mono">THỨ 4 (SÁNG)</span>
              </div>
              <h4 className="font-bold text-slate-900 text-sm mb-1">Thẩm định FC Tuần</h4>
              <p className="text-xs text-slate-600">Kiểm tra điều kiện khớp số tổng tuần/miền với tổng tháng 1 và tiến độ giao hàng.</p>
            </div>
            <div className="mt-4 pt-2 border-t border-purple-200 flex items-center text-xs font-semibold text-purple-800">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Bộ phận: Tài chính
            </div>
          </div>

          <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="bg-teal-600 text-white font-bold text-xs px-2.5 py-0.5 rounded-full">BƯỚC 3</span>
                <span className="text-xs font-bold text-teal-900 font-mono">THỨ 4 (CHIỀU)</span>
              </div>
              <h4 className="font-bold text-slate-900 text-sm mb-1">Chuyển FC cho Nhà máy</h4>
              <p className="text-xs text-slate-600">Gửi lịch điều độ sản xuất tuần được phê duyệt cho Nhà máy thực hiện.</p>
            </div>
            <div className="mt-4 pt-2 border-t border-teal-200 flex items-center text-xs font-semibold text-teal-800">
              <Factory className="w-3.5 h-3.5 mr-1.5" /> Bộ phận: Tác nghiệp kinh doanh
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
