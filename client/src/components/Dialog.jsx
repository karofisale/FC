import React, { useEffect, useId, useRef } from 'react';

/**
 * KHUNG HỘP THOẠI DÙNG CHUNG (Rà soát 4 app, Đợt 2 mục 1) — mọi modal của FC đều đi qua đây.
 *
 *  - role="dialog" + aria-modal; tên lấy từ tiêu đề h1–h3 đầu tiên bên trong (hoặc prop `label`).
 *  - Esc đóng — chỉ hộp NẰM TRÊN CÙNG mới nhận Esc (hộp mở chồng không đóng cùng lúc).
 *  - Enter đồng ý (prop `onEnter`), trừ khi con trỏ đang ở ô nhiều dòng / nút / danh sách chọn.
 *  - Tự đặt focus khi mở (ô nhập đầu tiên, hoặc phần tử có data-autofocus), Tab xoay vòng trong hộp,
 *    đóng thì TRẢ focus về chỗ đã bấm.
 *  - Bấm nền để đóng — TRỪ khi đang có chữ đã gõ hoặc `busy` (đang lưu): tránh mất bài đang soạn vì
 *    lỡ tay bấm ra ngoài. "Có chữ đã gõ" tự phát hiện (người dùng đã gõ vào một ô chữ/ô nhiều dòng và
 *    ô đó còn nội dung), không cần từng hộp tự theo dõi; `dirty` là cách ép tay cho trường hợp đặc biệt.
 *    Phải nhấn xuống VÀ nhả ra trên nền, nên kéo chọn chữ trong ô rồi nhả chuột ra ngoài không đóng hộp.
 *  - `className` là lớp của khung hộp (mặc định thẻ trắng max-w-md); `as="form"` để hộp chính là biểu mẫu.
 */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Ngăn xếp các hộp đang mở — phần tử cuối là hộp trên cùng.
const ngan = [];

export const KHUNG_MAC_DINH = 'bg-white rounded-xl shadow-2xl w-full max-w-md text-slate-900';
const NEN_MAC_DINH = 'fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50';

export default function Dialog({
  onClose, dirty = false, busy = false, onEnter, label, as: Tag = 'div',
  className = KHUNG_MAC_DINH, overlayClassName = NEN_MAC_DINH, onInput, children, ...rest
}) {
  const id = useId();
  const khung = useRef(null);
  const nhanNen = useRef(false);
  const daGoChu = useRef(false);
  // Giữ props mới nhất cho trình nghe phím mà không đăng ký lại mỗi lần vẽ.
  const moi = useRef({ onClose, busy });
  useEffect(() => { moi.current = { onClose, busy }; });

  useEffect(() => {
    const truoc = document.activeElement;
    ngan.push(id);

    const el = khung.current;
    if (el) {
      // Tên cho trình đọc màn hình: tiêu đề đầu tiên trong hộp.
      const tieuDe = el.querySelector('h1,h2,h3');
      if (tieuDe) {
        if (!tieuDe.id) tieuDe.id = id + '-tieu-de';
        el.setAttribute('aria-labelledby', tieuDe.id);
      }
      // Focus: tôn trọng ô đã tự focus bên trong; không thì data-autofocus > ô nhập đầu > nút gửi > mục đầu.
      if (!el.contains(document.activeElement)) {
        const dich = el.querySelector('[data-autofocus]')
          || el.querySelector('input:not([disabled]):not([readonly]):not([type="hidden"]):not([type="file"]):not([type="checkbox"]),textarea:not([disabled]):not([readonly]),select:not([disabled])')
          || el.querySelector('button[type="submit"]:not([disabled])')
          || el.querySelector(FOCUSABLE);
        (dich || el).focus?.();
      }
    }

    const onKeyDown = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (ngan[ngan.length - 1] !== id) return;
      if (moi.current.busy) return;
      e.preventDefault();
      moi.current.onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const i = ngan.lastIndexOf(id);
      if (i >= 0) ngan.splice(i, 1);
      // Trả focus về chỗ đã bấm (nếu chỗ đó còn trên trang).
      if (truoc && typeof truoc.focus === 'function' && document.contains(truoc)) truoc.focus();
    };
  }, [id]);

  // Đã gõ chữ vào ô nào đó VÀ ô đó còn nội dung -> bấm nền không được đóng.
  const dangCoChu = () => daGoChu.current && khung.current
    && [...khung.current.querySelectorAll('textarea,input')].some((x) => (
      x.tagName === 'TEXTAREA' || !['checkbox', 'radio', 'file', 'button', 'submit', 'hidden'].includes(x.type)
    ) && !x.readOnly && !x.disabled && String(x.value).trim() !== '');

  const onKeyDownKhung = (e) => {
    if (e.key === 'Tab') {
      // Xoay vòng focus trong hộp.
      const ds = [...khung.current.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
      if (!ds.length) { e.preventDefault(); return; }
      const dau = ds[0];
      const cuoi = ds[ds.length - 1];
      if (e.shiftKey && (document.activeElement === dau || document.activeElement === khung.current)) { e.preventDefault(); cuoi.focus(); }
      else if (!e.shiftKey && document.activeElement === cuoi) { e.preventDefault(); dau.focus(); }
      return;
    }
    if (e.key === 'Enter' && onEnter && !e.shiftKey && !e.defaultPrevented
      && !['TEXTAREA', 'BUTTON', 'A', 'SELECT'].includes(e.target.tagName)) {
      e.preventDefault();
      onEnter();
    }
  };

  return (
    <div
      className={overlayClassName}
      onMouseDown={(e) => { nhanNen.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        const bamNen = nhanNen.current && e.target === e.currentTarget;
        nhanNen.current = false;
        if (bamNen && !dirty && !busy && !dangCoChu()) onClose?.();
      }}
    >
      <Tag
        ref={khung}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={className + ' outline-none'}
        onKeyDown={onKeyDownKhung}
        onInput={(e) => {
          if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') daGoChu.current = true;
          onInput?.(e);
        }}
        {...rest}
      >
        {children}
      </Tag>
    </div>
  );
}
