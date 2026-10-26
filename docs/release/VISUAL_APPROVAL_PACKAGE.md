# Gói duyệt hình ảnh — Night Chart (chưa được duyệt)

**Trạng thái: CHƯA DUYỆT.** Cổng G7 vẫn BLOCKED. Tài liệu này không phải master đã phê duyệt.

Ngày chụp: 2026-10-26, khoảng 14:56–15:05 Asia/Bangkok. Nhánh `feat/reality-v2-completion`, bản triển khai `b136268`. Môi trường: Web production build trên `http://127.0.0.1:3000`, API `APP_ENV=qa` tại `127.0.0.1:3011`, PostGIS, dữ liệu OSM/Open-Meteo thật trong bbox Hoàn Kiếm. Không có TomTom. Không có simulator hay thiết bị native.

## Bạn cần quyết

1. Duyệt hoặc bác Night Chart (navy + amber/gold) làm ngôn ngữ hình ảnh của Web và Mobile.
2. Gửi các master còn thiếu nếu chúng khác bản dựng này: Responsive Production Master, Journey G01 Visual Master V1, Product V2 bốn panel, State Matrix V2.
3. Chọn nền bản đồ: raster OpenStreetMap sáng (đang dùng) hoặc style vector tối (cần nhà cung cấp tile và khoá).

Khi bạn duyệt, ghi rõ “duyệt Night Chart” hoặc liệt kê màn cần sửa. Trước câu đó, không có cổng hình ảnh nào được đánh PASS.

## So với thiết kế đã có

Trong repo và artefact hiện có không có master đã duyệt. `docs/release/VISUAL_FIDELITY.md` ghi cùng kết luận từ CHECKPOINT-02. Bộ ảnh cũ (`docs/release/evidence/local/`, commit `4678f78`) là bản dựng đề xuất, và nền bản đồ khi đó không tải được. Bộ mới bên dưới thay ảnh đó cho các màn đã chụp lại: tile OSM tải được, địa điểm và thời tiết lấy từ QA local.

Palette một nguồn: `src/theme/navy-amber.ts`. Web và Mobile dùng chung token. `tests/theme-parity.test.ts` giữ tương phản chữ và trạng thái từ 4.5:1.

## Ảnh Web

Thư mục: `docs/release/evidence/local/qa05/`. 24 ảnh, bốn khung: desktop 1536×960, tablet 820×1180, mobile 390×844, landscape 844×390.

| Màn | Tệp |
|---|---|
| Trang chủ | `*-home.png` |
| Bản đồ | `*-map.png` |
| Địa điểm (186 Coffee Roasters, ODbL) | `*-place.png` |
| Đi đâu | `*-decide.png` |
| Quyền riêng tư | `*-privacy.png` |
| Đăng nhập | `*-login.png` |

`capture.json` ghi font đã tải và các request prefetch `_rsc` bị huỷ khi chuyển trang. Đó không phải lỗi tile hay API.

Quan sát để bạn xem, không phải lỗi đã giấu:

- Tiếng Việt render bằng Be Vietnam Pro (subset vietnamese + latin). Sáu tệp woff2 được preload; latin-ext không nằm trong preload.
- Bản đồ desktop/tablet/mobile hiện tile OSM, cụm địa điểm, thời tiết “Mưa phùn” từ Open-Meteo, attribution OSM.
- Landscape 844×390 của bản đồ được chụp lại sau khi sửa: thanh dưới không còn che gần hết bản đồ; rail bên trái, bản đồ chiếm phần còn lại. Chip danh mục trong rail hẹp bị cắt và cuộn ngang.
- Ảnh native Mobile không có. Không có simulator, thiết bị, hoặc bộ công cụ Android/iOS trong môi trường này. Export Expo không được dùng làm ảnh thiết bị.

## Việc không được coi là duyệt

Ảnh này là ứng viên tái dựng để bạn đối chiếu. G7, G11 và khuyến nghị phát hành vẫn là chưa sẵn sàng.
