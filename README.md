# SFRA Analyzer Web

Phần mềm đánh giá SFRA (phân tích đáp ứng tần số quét) cuộn dây máy biến áp theo DL/T 911-2004, tham chiếu
IEC 60076-18:2012, IEEE C57.149-2012, CIGRE TB 342/812/445.

**Tính toán chạy hoàn toàn trong trình duyệt.** File đo được đọc tại máy người dùng, không tải lên máy chủ nào,
kể cả khi dùng bản trên GitHub Pages.

## Tính năng hiện có

- Nhập file: FRA Data v2.0 (.csv), Doble SFRA (.sfra), Megger FRAX (.frax, nhiều sweep trong một file). Kéo thả
  hoặc chọn cả thư mục.
- Ghép cặp baseline / lần đo theo STT + ký hiệu phép đo (đặc tả 4.4); file không có STT thì ghép theo ký hiệu +
  loại phép đo + đầu nối tắt. Nhận diện MBA theo số chế tạo. Chọn được kỳ baseline và từng file.
- Căn lưới tần số A (nguyên bản) / B (theo baseline) / C (log 200 điểm/decade).
- Rxy theo DL/T 911-2004 Phụ lục A cho LF/MF/HF, phân loại theo Bảng A.1, bảng tính trung gian đầy đủ.
- Kiểm tra chất lượng (IEC 60076-18 mục 4.5, DL/T 911 mục 5.4), cảnh báo đảo đầu đo và khác cấu hình.
- Giản đồ Bode biên độ, góc pha, ΔdB xếp chồng; thêm đường của kỳ / pha khác.
- Câu kết luận sinh từ mẫu trong `standards.yaml`, không dùng mô hình ngôn ngữ.
- Lưu file gốc (kèm SHA-256) và chỉnh sửa trong trình duyệt (IndexedDB); sao lưu / khôi phục bằng file .zip.
- Xu hướng nhiều kỳ: Rxy mọi kỳ so với baseline, cùng một chế độ căn lưới; cảnh báo khi RMF/RHF giảm > 20 % (ngưỡng nội bộ).
- Chỉ số CIGRE TB 812 (CC, CCF, LCC, ASLE, SD, CSD, MD) theo dải DL/T 911 và vùng IEC 60076-18; chỉ hiển thị, không ngưỡng.
- Đỉnh/hố cộng hưởng (find_peaks theo prominence, bản TypeScript đối chiếu scipy), ghép cặp ±10 %, dịch tần, đỉnh mất/mới.
- So sánh tham khảo giữa các pha cùng kỳ và giữa hai đường bất kỳ (MBA cùng kiểu); không phân loại.
- CSV hãng khác: tự nhận dạng, màn hình ánh xạ cột, hồ sơ hãng lưu lại; sửa bộ quy tắc trên giao diện (có kiểm tra).
- Xuất báo cáo Word theo đặc tả mục 8: thông tin chung (điền sẵn từ metadata, sửa được), phương pháp, bảng tổng hợp, mỗi phép đo một trang (Bode biên độ, góc pha, bảng trung gian), kết luận, tài liệu tham khảo.

Mọi ngưỡng, dải tần, mẫu câu nằm trong [backend/app/config/standards.yaml](backend/app/config/standards.yaml),
mỗi mục có nguồn trích dẫn; ngưỡng không có trong tiêu chuẩn gắn nhãn "Ngưỡng nội bộ (cấu hình được)".

## Cấu trúc

```
backend/   Python: bản tham chiếu của thuật toán (pytest, golden test 18 cặp)
frontend/  React + TypeScript + Vite + Plotly: webapp tĩnh, cùng thuật toán viết bằng TypeScript (vitest)
.github/workflows/pages.yml  chạy test, build, triển khai GitHub Pages
```

Hai bản cài đặt (Python và TypeScript) dùng chung `standards.yaml` và phải cùng khớp bảng golden (sai số ≤ 1e-4).

## Chạy trên máy

```
cd frontend
npm install
npm run dev        # http://localhost:5173
npm test           # vitest
npm run build      # bản tĩnh trong frontend/dist

cd ../backend
pip install -r requirements.txt
python -m pytest -q
```

## Dữ liệu kiểm thử (không đưa lên repository)

Thông tin thiết bị (số chế tạo, tên trạm, file đo, giá trị đo) **không** đưa lên repository. Test đọc dữ liệu từ
ngoài repository và tự bỏ qua khi không có:

- File đo: `backend/tests/golden/`, biến môi trường `SFRA_GOLDEN_DIR`, hoặc `<thư mục dự án>/data/csv`.
- Giá trị kỳ vọng (Rxy golden, thông tin nhãn máy, câu kết luận, kết quả scipy để đối chiếu):
  biến môi trường `SFRA_EXPECTED` hoặc `<thư mục dự án>/data/golden_expected.json`.

## Lộ trình

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| 1 | Lõi tính toán, golden test | Xong |
| 2 | Webapp: nhập, ghép cặp, kết quả, Bode, bảng trung gian | Xong (GitHub Pages) |
| 3 | Báo cáo Word (.docx) tạo ngay trong trình duyệt | Xong |
| 4 | Lưu trữ trong trình duyệt (IndexedDB), sao lưu/khôi phục .zip, xu hướng nhiều kỳ | Xong |
| 5 | Chỉ số TB 812, đỉnh cộng hưởng, so sánh tham khảo, CSV hãng khác + hồ sơ ánh xạ, sửa bộ quy tắc | Xong; định dạng FRAX đã đối chiếu với phần mềm FRAX |
