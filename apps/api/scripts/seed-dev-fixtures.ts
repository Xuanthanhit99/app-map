import { loadConfig } from "../src/config";
import { createPool } from "../src/db/pool";
import { upsertRegions, parseRegions } from "../src/ingestion/regions";
import { slugify } from "../src/lib/slug";

/**
 * LOCAL DEVELOPMENT FIXTURES ONLY. Refuses to run unless APP_ENV=development and ALLOW_DEV_FIXTURES=true
 * (config also refuses fixtures in qa/production). Rows are attributed to the 'dev-fixture' source so
 * they can never be mistaken for ingested data, and can be removed with --remove.
 */
const config = loadConfig();
if (config.env !== "development" || !config.allowDevFixtures) { console.error("Refusing: requires APP_ENV=development and ALLOW_DEV_FIXTURES=true"); process.exit(2); }
const db = createPool(config.databaseUrl, 1);

// Well-known Hà Nội landmarks with approximate public coordinates (for UI exercise only).
const PLACES: [string, string, number, number, string | null, string | null][] = [
  ["Hồ Hoàn Kiếm", "attraction", 21.0287, 105.8524, "Phố Đinh Tiên Hoàng, Hoàn Kiếm", null],
  ["Đền Ngọc Sơn", "worship", 21.0307, 105.8524, "Phố Đinh Tiên Hoàng, Hoàn Kiếm", "Mo-Su 07:00-18:00"],
  ["Nhà Thờ Lớn Hà Nội", "worship", 21.0287, 105.8489, "40 Phố Nhà Chung, Hoàn Kiếm", null],
  ["Bảo tàng Lịch sử Quốc gia", "museum", 21.0247, 105.8597, "1 Phạm Ngũ Lão, Hoàn Kiếm", "Tu-Su 08:00-17:00"],
  ["Nhà hát Lớn Hà Nội", "attraction", 21.0243, 105.8575, "1 Tràng Tiền, Hoàn Kiếm", null],
  ["Văn Miếu – Quốc Tử Giám", "attraction", 21.0277, 105.8355, "58 Quốc Tử Giám, Đống Đa", "Mo-Su 08:00-17:00"],
  ["Hoàng thành Thăng Long", "attraction", 21.0352, 105.8403, "19C Hoàng Diệu, Ba Đình", "Tu-Su 08:00-17:00"],
  ["Lăng Chủ tịch Hồ Chí Minh", "attraction", 21.0368, 105.8346, "Quảng trường Ba Đình", null],
  ["Chùa Một Cột", "worship", 21.0359, 105.8336, "Phố Chùa Một Cột, Ba Đình", null],
  ["Bảo tàng Dân tộc học Việt Nam", "museum", 21.0405, 105.7987, "Nguyễn Văn Huyên, Cầu Giấy", "Tu-Su 08:30-17:30"],
  ["Công viên Thống Nhất", "park", 21.0153, 105.8445, "Trần Nhân Tông, Hai Bà Trưng", null],
  ["Vườn hoa Lý Thái Tổ", "park", 21.0267, 105.8540, "Đinh Tiên Hoàng, Hoàn Kiếm", null],
  ["Công viên Bách Thảo", "park", 21.0390, 105.8318, "Hoàng Hoa Thám, Ba Đình", null],
  ["Chợ Đồng Xuân", "market", 21.0381, 105.8497, "Đồng Xuân, Hoàn Kiếm", "Mo-Su 06:00-18:00"],
  ["Thư viện Quốc gia Việt Nam", "library", 21.0258, 105.8466, "31 Tràng Thi, Hoàn Kiếm", "Mo-Fr 08:00-17:00"],
  ["Cà phê Giảng", "cafe", 21.0335, 105.8540, "39 Nguyễn Hữu Huân, Hoàn Kiếm", "Mo-Su 07:00-22:00"],
  ["Cộng Cà Phê Nhà Thờ", "cafe", 21.0290, 105.8488, "27 Nhà Thờ, Hoàn Kiếm", "Mo-Su 07:00-23:00"],
  ["Cà phê Đinh", "cafe", 21.0300, 105.8532, "13 Đinh Tiên Hoàng, Hoàn Kiếm", null],
  ["Phở Thìn Bờ Hồ", "restaurant", 21.0325, 105.8530, "61 Đinh Tiên Hoàng, Hoàn Kiếm", null],
  ["Bún chả Hương Liên", "restaurant", 21.0186, 105.8526, "24 Lê Văn Hưu, Hai Bà Trưng", null],
  ["Tràng Tiền Plaza", "mall", 21.0249, 105.8542, "24 Hai Bà Trưng, Hoàn Kiếm", "Mo-Su 09:30-21:30"],
  ["Bãi xe Bờ Hồ", "parking", 21.0279, 105.8536, "Lê Thái Tổ, Hoàn Kiếm", null],
  ["Bãi xe Nhà hát Lớn", "parking", 21.0238, 105.8580, "Tràng Tiền, Hoàn Kiếm", null],
  ["Sân chơi Công viên Thống Nhất", "playground", 21.0160, 105.8430, "Công viên Thống Nhất", null],
];

async function main() {
  if (process.argv.includes("--remove")) {
    await db.query("DELETE FROM places WHERE source_id = 'dev-fixture'");
    await db.query("DELETE FROM source_health WHERE source_id = 'dev-fixture'");
    await db.query("DELETE FROM data_sources WHERE id = 'dev-fixture'");
    console.log("dev fixtures removed");
    return;
  }
  await db.query(`INSERT INTO data_sources (id, name, kind, domains, license, attribution, commercial_use, update_frequency, data_nature, reliability, enabled, notes)
    VALUES ('dev-fixture','Dữ liệu thử nghiệm cục bộ','OPEN_DATA',ARRAY['PLACES'],'Dev only','Dữ liệu thử nghiệm cục bộ — không phải dữ liệu thật','UNVERIFIED','manual','STATIC_REFERENCE',0.1,false,'Local development only. Never present in QA/production.')
    ON CONFLICT (id) DO NOTHING`);
  await db.query("INSERT INTO source_health (source_id) VALUES ('dev-fixture') ON CONFLICT DO NOTHING");
  await upsertRegions(db, parseRegions());
  for (const [name, category, lat, lng, address, hours] of PLACES) {
    await db.query(`INSERT INTO places (slug, name, category, address, geom, area_id, opening_hours, source_id, source_ref)
      VALUES ($1,$2,$3,$4, ST_SetSRID(ST_MakePoint($5,$6),4326)::geography, 'ha-noi', $7, 'dev-fixture', $8)
      ON CONFLICT (source_id, source_ref) DO NOTHING`, [`${slugify(name)}-dev`, name, category, address, lng, lat, hours, `dev/${slugify(name)}`]);
  }
  console.log(`seeded ${PLACES.length} dev fixture places (source=dev-fixture)`);
}
main().finally(() => db.end());
