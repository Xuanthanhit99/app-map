/** Place categories (derived from OpenStreetMap tags) with Vietnamese labels and decision keywords. */
export type PlaceCategory = {
  id: string;
  label: string;
  /** OSM tag selectors used by the ingestion adapter: key=value. */
  osm: string[];
  /** Folded (accent-free, lowercase) keywords that map a free-text intent to this category. */
  keywords: string[];
  /** Typical visit length used only to check "fits my available time" — labelled as an assumption. */
  typicalVisitMinutes: number;
  indoor: boolean;
};

export const PLACE_CATEGORIES: PlaceCategory[] = [
  { id: "cafe", label: "Quán cà phê", osm: ["amenity=cafe"], keywords: ["ca phe", "cafe", "coffee", "tra sua", "uong", "ngoi lam viec"], typicalVisitMinutes: 60, indoor: true },
  { id: "restaurant", label: "Nhà hàng", osm: ["amenity=restaurant"], keywords: ["an", "nha hang", "an toi", "an trua", "com", "pho", "bun", "lau", "food", "eat"], typicalVisitMinutes: 75, indoor: true },
  { id: "fast_food", label: "Đồ ăn nhanh", osm: ["amenity=fast_food"], keywords: ["an nhanh", "banh mi", "fast food"], typicalVisitMinutes: 25, indoor: true },
  { id: "bar", label: "Quán bar / bia", osm: ["amenity=bar", "amenity=pub"], keywords: ["bia", "bar", "nhau", "pub"], typicalVisitMinutes: 90, indoor: true },
  { id: "park", label: "Công viên", osm: ["leisure=park"], keywords: ["cong vien", "di dao", "park", "tap the duc", "chay bo", "thu gian", "ngoai troi"], typicalVisitMinutes: 60, indoor: false },
  { id: "museum", label: "Bảo tàng", osm: ["tourism=museum"], keywords: ["bao tang", "museum", "lich su", "trien lam"], typicalVisitMinutes: 90, indoor: true },
  { id: "attraction", label: "Điểm tham quan", osm: ["tourism=attraction"], keywords: ["tham quan", "du lich", "check in", "di choi", "kham pha"], typicalVisitMinutes: 60, indoor: false },
  { id: "viewpoint", label: "Điểm ngắm cảnh", osm: ["tourism=viewpoint"], keywords: ["ngam canh", "hoang hon", "view", "chup anh"], typicalVisitMinutes: 30, indoor: false },
  { id: "worship", label: "Đền / chùa / nhà thờ", osm: ["amenity=place_of_worship"], keywords: ["chua", "den", "nha tho", "le", "tam linh"], typicalVisitMinutes: 45, indoor: false },
  { id: "market", label: "Chợ", osm: ["amenity=marketplace"], keywords: ["cho", "mua sam", "market"], typicalVisitMinutes: 60, indoor: false },
  { id: "mall", label: "Trung tâm thương mại", osm: ["shop=mall"], keywords: ["trung tam thuong mai", "mall", "mua sam", "tranh mua", "dieu hoa"], typicalVisitMinutes: 120, indoor: true },
  { id: "cinema", label: "Rạp chiếu phim", osm: ["amenity=cinema"], keywords: ["xem phim", "rap", "cinema"], typicalVisitMinutes: 140, indoor: true },
  { id: "library", label: "Thư viện", osm: ["amenity=library"], keywords: ["thu vien", "doc sach", "hoc", "yen tinh"], typicalVisitMinutes: 120, indoor: true },
  { id: "playground", label: "Sân chơi", osm: ["leisure=playground"], keywords: ["tre em", "con nho", "san choi", "be"], typicalVisitMinutes: 45, indoor: false },
  { id: "sports", label: "Thể thao", osm: ["leisure=sports_centre", "leisure=fitness_centre"], keywords: ["the thao", "gym", "boi", "cau long", "tap"], typicalVisitMinutes: 90, indoor: true },
  { id: "hospital", label: "Bệnh viện", osm: ["amenity=hospital"], keywords: ["benh vien", "cap cuu", "kham benh"], typicalVisitMinutes: 120, indoor: true },
  { id: "pharmacy", label: "Nhà thuốc", osm: ["amenity=pharmacy"], keywords: ["nha thuoc", "thuoc", "pharmacy"], typicalVisitMinutes: 10, indoor: true },
  { id: "parking", label: "Bãi đỗ xe", osm: ["amenity=parking"], keywords: ["gui xe", "do xe", "bai xe", "parking"], typicalVisitMinutes: 5, indoor: false },
  { id: "fuel", label: "Cây xăng", osm: ["amenity=fuel"], keywords: ["xang", "do xang", "fuel"], typicalVisitMinutes: 10, indoor: false },
  { id: "hotel", label: "Khách sạn", osm: ["tourism=hotel"], keywords: ["khach san", "nghi", "hotel", "luu tru"], typicalVisitMinutes: 600, indoor: true },
];

export const CATEGORY_BY_ID = new Map(PLACE_CATEGORIES.map((c) => [c.id, c]));

export function foldText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/\s+/g, " ").trim();
}

export function categoryForOsmTags(tags: Record<string, string>): string | null {
  for (const c of PLACE_CATEGORIES) {
    for (const sel of c.osm) {
      const [k, v] = sel.split("=") as [string, string];
      if (tags[k] === v) return c.id;
    }
  }
  return null;
}
