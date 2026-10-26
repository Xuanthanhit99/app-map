// OpenFreeMap public style uses real OpenStreetMap-derived cartography.
// No incidents, traffic colors, user position, or markers are inferred from tiles.
const DEFAULT_STYLE = "https://tiles.openfreemap.org/styles/dark";

export async function mountDesktopMap(container, options = {}) {
  if (!container) return { status: "UNAVAILABLE", reason: "NO_CONTAINER" };
  const style = options.styleUrl || DEFAULT_STYLE;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const status = container.querySelector("[data-map-status]");
  const setStatus = (message) => { if (status) status.textContent = message; };
  setStatus("Đang tải bản đồ nền…");
  if (!globalThis.maplibregl) {
    setStatus("Không tải được MapLibre. Bản đồ chưa khả dụng.");
    return { status: "ERROR", reason: "LIBRARY_UNAVAILABLE" };
  }
  let map;
  try {
    map = new globalThis.maplibregl.Map({
      container,
      style,
      center: [105.8342, 21.0278], // Hanoi city-level overview; NOT user's location
      zoom: 10.5,
      attributionControl: true,
      interactive: true,
      pitchWithRotate: false,
    });
    const outcome = await new Promise((resolve) => {
      let settled = false;
      const complete = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => complete({ status: "ERROR", reason: "LOAD_TIMEOUT" }), timeoutMs);
      map.once("load", () => complete({ status: "READY" }));
      map.once("error", () => complete({ status: "ERROR", reason: "STYLE_OR_TILE_ERROR" }));
    });
    if (outcome.status !== "READY") {
      map.remove();
      setStatus("Không tải được bản đồ nền. Vui lòng thử lại khi có mạng.");
      return outcome;
    }
    setStatus("Bản đồ nền · Không có dữ liệu sự cố đã xác minh");
    return { status: "READY", map };
  } catch {
    if (map) map.remove();
    setStatus("Bản đồ chưa khả dụng.");
    return { status: "ERROR", reason: "INITIALIZATION_FAILED" };
  }
}
