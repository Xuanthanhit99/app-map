/** Decorative topographic contours (Hồ Hoàn Kiếm–like closed loops). Pure SVG, no data meaning. */
export function Contours() {
  const loops = Array.from({ length: 9 }, (_, i) => {
    const r = 70 + i * 46;
    const wob = (k: number) => (Math.sin(i * 1.7 + k) * 0.08 + 1) * r;
    const pts = Array.from({ length: 12 }, (_, k) => {
      const a = (k / 12) * Math.PI * 2;
      return [880 + Math.cos(a) * wob(k) * 1.35, 230 + Math.sin(a) * wob(k + 3) * 0.82] as const;
    });
    const d = pts.map(([x, y], k) => {
      const [nx, ny] = pts[(k + 1) % pts.length]!;
      return `${k === 0 ? `M${x.toFixed(1)},${y.toFixed(1)} ` : ""}Q${x.toFixed(1)},${y.toFixed(1)} ${((x + nx) / 2).toFixed(1)},${((y + ny) / 2).toFixed(1)}`;
    }).join(" ") + "Z";
    return <path key={i} d={d} fill="none" stroke="#5FA197" strokeWidth={i % 3 === 0 ? 1.3 : 0.7} opacity={0.75 - i * 0.06} />;
  });
  return <svg className="contours" viewBox="0 0 1200 520" preserveAspectRatio="xMidYMid slice" aria-hidden>{loops}</svg>;
}
