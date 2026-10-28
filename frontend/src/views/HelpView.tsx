/** User guide, one step per screen in the order of the work, and the About page. */
import { useState } from "react";
import pkg from "../../package.json";
import type { Standards } from "../core/standards";

type Tab = "guide" | "about";

interface Step {
  id: string;
  title: string;
  /** what the screen is for, in one sentence */
  lede: string;
  items: string[];
}

const GUIDE: Step[] = [
  {
    id: "import",
    title: "Nhập dữ liệu",
    lede: "Nạp file đo của kỳ cơ sở và của lần đo cần đánh giá, mỗi bên một khung.",
    items: [
      "Khung 1 nhận file baseline (kỳ cơ sở), khung 2 nhận file lần đo cần đánh giá: kéo thả hoặc bấm Chọn file, Chọn thư mục. Khung đã nạp quyết định vai trò của file, kể cả khi baseline có ngày đo muộn hơn.",
      "Định dạng đọc được: FRA Data v2.0 (.csv), Doble SFRA (.sfra), Megger FRAX (.frax và .csv xuất từ phần mềm FRAX, nhiều phép đo trong một file), CSV khác (ánh xạ cột một lần, app nhớ cho các file cùng dòng tiêu đề).",
      "File không đọc được ngày đo hiện ô nhập ngày ngay trong khung. Ngày sai thì bấm Sửa ngày; mọi màn hình cập nhật theo ngày mới.",
      "Khung 3 Chọn cặp đo để so sánh: kiểm tra số chế tạo (sửa để gộp các file của cùng một máy), chọn kỳ baseline và lần đo, rồi xem bảng ghép cặp theo STT và ký hiệu phép đo. Chọn lại file ở từng dòng nếu ghép sai; sửa STT, ký hiệu, cấu hình của file trong Danh sách file đã nạp.",
      "Bấm Xác nhận và tính để sang Kết quả kỳ đo, hoặc Vẽ giản đồ ở một dòng để xem ngay phép đo đó.",
      "Lưu nhóm (.zip) lưu file gốc cùng mọi chỉnh sửa của một máy; Mở nhóm đã lưu để làm tiếp ở máy khác hoặc phiên khác.",
    ],
  },
  {
    id: "results",
    title: "Kết quả kỳ đo",
    lede: "Bảng mọi cặp đo của máy: hệ số tương quan và mức đánh giá.",
    items: [
      "RLF, RMF, RHF tính theo DL/T 911-2004 Phụ lục A trên ba dải 1–100 kHz, 100–600 kHz, 600 kHz–1 MHz; giá trị dưới ngưỡng tô đỏ.",
      "Mức độ theo DL/T 911-2004 Bảng A.1: Bình thường, Biến dạng nhẹ, Biến dạng rõ rệt, Biến dạng nghiêm trọng. Hành động gợi ý là ngưỡng nội bộ, sửa được ở Cấu hình.",
      "Cột Đối chiếu IEEE C57.149 tóm tắt vùng tần số thay đổi và dạng hư hỏng phù hợp (tham khảo).",
      "Bấm một dòng để mở Chi tiết phép đo.",
    ],
  },
  {
    id: "detail",
    title: "Chi tiết phép đo",
    lede: "Giản đồ và các phân tích của một cặp đo.",
    items: [
      "So sánh giản đồ Bode: biên độ và góc pha chung trục tần số, hiệu số ΔdB bên dưới. Cài đặt đồ thị ở cột trái: phân vùng tần số theo tài liệu, trục log hoặc tuyến tính, độ dày nét, zoom vùng, đánh dấu đỉnh/hố, màu từng đường. Cột phải ghi ảnh hưởng của vùng tần số đang trỏ chuột (IEC 60076-18 B.3).",
      "Zoom: bấm một vùng (LF, MF, HF…) hoặc nhập dải kHz; kéo chọn trên giản đồ cũng được, hai giản đồ zoom theo nhau. Nháy đúp hoặc Toàn dải để về toàn bộ; Vừa khung đặt lại mọi trục.",
      "Hệ số DL/T 911: Rxy từng dải tô màu theo mức Bảng A.1 và bảng tính trung gian.",
      "Đối chiếu dạng hư hỏng: vùng tần số nào thay đổi và các dạng hư hỏng của IEEE C57.149 6.5 phù hợp với thay đổi đó, kèm lý do và khuyến nghị. Là gợi ý tham khảo; phép đo xuyên cuộn không đối chiếu.",
      "Đỉnh cộng hưởng: đỉnh, hố của hai đường được ghép cặp, độ dịch tần và số đỉnh mới, mất theo từng dải.",
      "Chỉ số CIGRE TB 812: các chỉ số bổ sung (CC, ASLE, SD…), chỉ để tham khảo, không có ngưỡng kết luận.",
      "Thêm đường của kỳ khác hoặc pha khác lên giản đồ ở cuối trang.",
    ],
  },
  {
    id: "trend",
    title: "Xu hướng",
    lede: "Rxy của mỗi kỳ đo so với baseline, khi máy có từ ba kỳ đo.",
    items: [
      "Bảng và đồ thị RLF, RMF, RHF theo thời gian cho từng phép đo; cảnh báo khi RMF hoặc RHF giảm quá ngưỡng nội bộ so với kỳ đầu.",
    ],
  },
  {
    id: "compare",
    title: "So sánh tham khảo",
    lede: "Khi chưa có baseline: so giữa các pha trong cùng kỳ đo hoặc với máy cùng kiểu.",
    items: [
      "Chọn cặp pha cần so; app hiện giản đồ, Rxy và chỉ số TB 812 nhưng không xếp mức theo Bảng A.1.",
    ],
  },
  {
    id: "report",
    title: "Báo cáo",
    lede: "Xuất báo cáo Word của kỳ đo.",
    items: [
      "Kiểm tra thông tin chung (điền sẵn từ file đo), rồi bấm Xuất báo cáo .docx. Ngày đo cơ sở và hiện tại lấy theo kỳ đang chọn.",
    ],
  },
  {
    id: "training",
    title: "Huấn luyện",
    lede: "Học nền tảng lý thuyết, thử hàm truyền trực quan, giả lập hư hỏng và làm bài tập chẩn đoán. Mở từ phần Huấn luyện ở đầu menu bên trái.",
    items: [
      "Lý thuyết: đi từ cơ bản (miền thời gian và miền tần số, hàm truyền, vì sao phân tích trong miền tần số, decibel và thang logarit) tới mạch tương đương của cuộn dây, phép đo hở mạch, ngắn mạch, dấu hiệu thay đổi và cách chia dải. Mỗi câu ghi nguồn; mục lục ở đầu trang, danh mục Tài liệu tham khảo ở cuối.",
      "Lab hàm truyền: chọn mạch (R–L đơn giản, cuộn dây hở mạch hoặc ngắn mạch), chọn tần số bằng thanh trượt, nút Quét, nút ◀ Cộng hưởng / Cộng hưởng ▶ hoặc bấm thẳng lên đồ thị biên độ, pha.",
      "Trong Lab, sóng Vin và Vout chạy trên cùng trục, mũi tên chỉ thời gian trễ giữa hai đỉnh; véc-tơ pha, các ô số liệu và hai ô giải thích biên độ, pha cập nhật theo tần số đang chọn. Vout được phóng to cho dễ nhìn; tích Vẽ Vout đúng tỉ lệ với Vin để thấy độ lớn thật. App nhớ mạch và tần số khi chuyển tab.",
      "Cấu hình đo: sơ đồ đấu dây của bốn kiểu đo (đầu – cuối hở mạch, đầu – cuối ngắn mạch, điện dung và cảm ứng giữa các cuộn dây) và danh mục kiểm tra trước khi đo.",
      "Giả lập hư hỏng: chọn dạng hư hỏng, mức độ, vị trí, phép đo hở mạch hoặc ngắn mạch, xem giản đồ thay đổi trên mô hình mạch hình thang cùng phân tích của app. Lab và Giả lập dùng mô hình minh họa xu hướng, không phải số liệu máy thật, không dùng để chẩn đoán.",
      "Soạn bài (giảng viên): nạp file đo, tạo từng bài với đáp án và giải thích, lưu gói bài tập .zip trên máy.",
      "Bài tập (học viên): mở gói, trả lời dạng hư hỏng, dải tần, tần số cộng hưởng dịch nhiều nhất và khuyến nghị; app chấm điểm, giải thích, xuất phiếu kết quả .docx.",
    ],
  },
  {
    id: "standards",
    title: "Cấu hình",
    lede: "Bộ quy tắc đánh giá và các hồ sơ ánh xạ cột CSV. Mở bằng biểu tượng Cấu hình ở góc phải thanh tiêu đề.",
    items: [
      "Xem dải tần, ngưỡng Rxy, bảng phân loại và nguồn của từng ngưỡng. Ngưỡng nội bộ có nhãn riêng và sửa được; sửa xong app tính lại toàn bộ.",
    ],
  },
  {
    id: "storage",
    title: "Lưu trữ và bảo mật",
    lede: "Dữ liệu chỉ nằm trên máy đang dùng.",
    items: [
      "File được đọc và tính toán ngay trong trình duyệt, không gửi lên máy chủ; app lưu file đo và chỉnh sửa trong bộ nhớ của trình duyệt này.",
      "Xóa dữ liệu trình duyệt sẽ mất dữ liệu đã nạp: sao lưu định kỳ ở Thiết bị (Sao lưu .zip) hoặc Lưu nhóm ở Nhập dữ liệu.",
      "Gói bài tập và file sao lưu chứa số liệu thiết bị: chỉ lưu và chia sẻ theo quy định của đơn vị.",
    ],
  },
  {
    id: "ui",
    title: "Giao diện",
    lede: "Thanh tiêu đề và menu.",
    items: [
      "Menu bên trái có hai phần: Huấn luyện ở trên, Thí nghiệm ở dưới gồm Thiết bị và các bước làm việc với số liệu đo theo thứ tự.",
      "Thanh tiêu đề luôn ở trên cùng: nút ẩn/hiện menu, màn hình đang xem, máy đang làm việc với kỳ so sánh và mức đánh giá.",
      "Góc phải thanh tiêu đề có ba biểu tượng: Hướng dẫn sử dụng, Giới thiệu, Cấu hình; trỏ chuột vào biểu tượng để xem tên.",
      "Ẩn menu để giản đồ rộng hết màn hình; app nhớ lựa chọn này.",
    ],
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Đã nạp hai kỳ đo nhưng không so sánh được",
    a: "Hai kỳ phải cùng số chế tạo và khác ngày đo. Kiểm tra số chế tạo ở khung 3 (sửa để gộp), ngày đo ở khung 1 và khung 2 (Sửa ngày), và ký hiệu phép đo trong Danh sách file đã nạp.",
  },
  {
    q: "Rxy bình thường nhưng đồ thị khác ở tần số thấp",
    a: "Các dải Rxy của DL/T 911 bắt đầu từ 1 kHz. Thay đổi dưới 1 kHz (vùng lõi) cần xem trên giản đồ và tab Đối chiếu dạng hư hỏng; khi đo hở mạch, thay đổi chỉ ở vùng lõi thường do từ dư (IEEE C57.149 6.5.9).",
  },
  {
    q: "Mới làm quen SFRA thì nên học theo thứ tự nào",
    a: "Đọc bốn mục đầu của tab Lý thuyết (miền thời gian và tần số, hàm truyền, vì sao dùng miền tần số, dB), thử ngay trong Lab hàm truyền, rồi tới mạch tương đương, Cấu hình đo, Giả lập hư hỏng và cuối cùng là Bài tập.",
  },
  {
    q: "Chỉ lệch ở trên 1 MHz",
    a: "Thường do cách nối đất dây đo khác giữa hai lần đo (IEC 60076-18 A.4). Kiểm tra lại đấu nối và đo lặp lại trước khi kết luận.",
  },
];

export default function HelpView({ std, initial = "guide" }: { std: Standards; initial?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial);
  return (
    <div className="view">
      <header className="view-head">
        <h1>{tab === "guide" ? "Hướng dẫn sử dụng" : "Giới thiệu"}</h1>
        <p className="lede">
          {tab === "guide"
            ? "Các bước đánh giá biến dạng cuộn dây máy biến áp bằng SFRA, theo thứ tự các màn hình."
            : "SFRA Analyzer: đánh giá biến dạng cuộn dây máy biến áp bằng phân tích đáp ứng tần số quét."}
        </p>
      </header>
      <div className="tabs" role="tablist" aria-label="Hướng dẫn và giới thiệu">
        {(
          [
            ["guide", "Hướng dẫn sử dụng"],
            ["about", "Giới thiệu"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "tab on" : "tab"} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "guide" ? (
        <div className="tab-panel help">
          <nav className="toc" aria-label="Mục lục hướng dẫn">
            {GUIDE.map((s, i) => (
              <a key={s.id} href={`#help-${s.id}`}>
                {i + 1}. {s.title}
              </a>
            ))}
            <a href="#help-faq">Câu hỏi thường gặp</a>
          </nav>
          <ol className="guide-steps">
            {GUIDE.map((s) => (
              <li key={s.id} id={`help-${s.id}`} className="guide-step">
                <h2>{s.title}</h2>
                <p className="lede">{s.lede}</p>
                <ul>
                  {s.items.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <section id="help-faq" className="theory-section">
            <h2>Câu hỏi thường gặp</h2>
            <dl className="faq">
              {FAQ.map((x) => (
                <div key={x.q}>
                  <dt>{x.q}</dt>
                  <dd>{x.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      ) : (
        <div className="tab-panel about">
          <section className="theory-section about-card">
            <h2>Tác giả</h2>
            <dl className="about-facts">
              <dt>Họ tên</dt>
              <dd>Hoàng Trọng</dd>
              <dt>Đơn vị</dt>
              <dd>PTC3</dd>
              <dt>Email</dt>
              <dd>
                <a href="mailto:quantrong77@gmail.com">quantrong77@gmail.com</a>
              </dd>
              <dt>Vai trò</dt>
              <dd>Tổng hợp tiêu chuẩn, tài liệu; phát triển ứng dụng</dd>
            </dl>
          </section>
          <section className="theory-section">
            <h2>Tiêu chuẩn và tài liệu áp dụng</h2>
            <ol className="refs">
              {(std.report?.references as string[] | undefined)?.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
            <p className="muted small">
              Ngưỡng đánh giá lấy theo DL/T 911-2004 Bảng A.1; mọi ngưỡng khác là ngưỡng nội bộ, có nhãn riêng và sửa được ở mục Cấu hình. Mỗi ngưỡng và
              mỗi đoạn nội dung huấn luyện ghi nguồn để tra lại bản gốc.
            </p>
          </section>
          <section className="theory-section">
            <h2>Phiên bản</h2>
            <dl className="about-facts">
              <dt>Ứng dụng</dt>
              <dd>{pkg.version}</dd>
              <dt>Bộ quy tắc</dt>
              <dd>
                {std.ruleset.id} {std.versionTag}
              </dd>
            </dl>
            <p className="muted small">
              Ứng dụng chạy hoàn toàn trong trình duyệt; dữ liệu đo không rời khỏi máy đang dùng. Kết quả đánh giá là công cụ hỗ trợ, quyết định cuối cùng
              thuộc về người phân tích theo quy trình của đơn vị.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
