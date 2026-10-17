# Sa bàn Kịch bản

Nền tảng phân tích không gian **Finance × Behavior**. Mỗi ô không gian có hai chỉ số: **F** (nền tảng) và **B** (hành vi đầu cơ). Hai chỉ số được làm mượt theo láng giềng (lan tỏa không gian), sau đó xếp vào ma trận 2×2 kịch bản. Monte Carlo biến kết quả thành xác suất cho từng ô và cho toàn vùng.

Có thể chỉnh trọng số, thêm tham số, thêm chỉ tiêu phái sinh hoặc viết công thức tự do, rồi xem bản đồ và biểu đồ cập nhật ngay.

## Chạy bằng Docker

```bash
cp .env.example .env          # tùy chọn: đổi cổng
docker compose up -d --build  # http://localhost:8765
```

Chế độ phát triển (sửa file trong `platform/` rồi F5 là thấy, không cần build lại):

```bash
docker compose --profile dev up dev   # http://localhost:8766
```

Triển khai sang máy khác: copy repo rồi chạy lại lệnh trên. Hoặc dùng image có sẵn:

```bash
docker save saban-kich-ban:latest | gzip > saban.tar.gz   # máy nguồn
docker load < saban.tar.gz && docker run -d -p 8765:80 saban-kich-ban:latest   # máy đích
```

## Cấu trúc

```
platform/
  index.html   giao diện, style
  engine.js    mô hình: chuẩn hóa, chỉ số, lan tỏa không gian, Monte Carlo, Moran/LISA, độ nhạy, bộ phân tích công thức
  app.js       bản đồ SVG, biểu đồ, bàn điều khiển, nhập GeoJSON, xuất CSV
docker/nginx.conf
Dockerfile, docker-compose.yml
```

## Dữ liệu

Dữ liệu mặc định là **giả lập**, chỉ để minh họa. Để dùng dữ liệu thật, nhập một file GeoJSON `FeatureCollection`:
- Polygon/MultiPolygon → ô phân tích; mọi thuộc tính số → chỉ tiêu
- LineString → lớp tham chiếu (tuyến đường, quy hoạch)
