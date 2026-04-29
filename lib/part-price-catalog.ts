export const partPriceCatalog: Record<string, { danawaQuery: string; gmarketQuery: string }> = {
  "cpu-amd-1": { danawaQuery: "AMD Ryzen 5 5600G", gmarketQuery: "AMD Ryzen 5 5600G" },
  "cpu-2": { danawaQuery: "AMD Ryzen 5 5600G", gmarketQuery: "AMD Ryzen 5 5600G" },
  "cpu-amd-2g": { danawaQuery: "AMD Ryzen 7 5700G", gmarketQuery: "AMD Ryzen 7 5700G" },
  "cpu-3": { danawaQuery: "AMD Ryzen 7 5700G", gmarketQuery: "AMD Ryzen 7 5700G" },
  "ram-1": { danawaQuery: "DDR4 8GB 3200", gmarketQuery: "DDR4 8GB 3200" },
  "ram-2": { danawaQuery: "DDR4 16GB 3200", gmarketQuery: "DDR4 16GB 3200" },
  "ram-3": { danawaQuery: "DDR4 32GB 3200", gmarketQuery: "DDR4 32GB 3200" },
  "ssd-1": { danawaQuery: "NVMe SSD 256GB", gmarketQuery: "NVMe SSD 256GB" },
  "ssd-2": { danawaQuery: "NVMe SSD 512GB", gmarketQuery: "NVMe SSD 512GB" },
  "ssd-3": { danawaQuery: "NVMe SSD 1TB", gmarketQuery: "NVMe SSD 1TB" },
  "mb-1": { danawaQuery: "A520M 메인보드", gmarketQuery: "A520M 메인보드" },
  "mb-2": { danawaQuery: "B550M 메인보드", gmarketQuery: "B550M 메인보드" },
  "pwr-1": { danawaQuery: "정격 500W 파워", gmarketQuery: "정격 500W 파워" },
  "pwr-2": { danawaQuery: "750W 80PLUS Gold 파워", gmarketQuery: "750W 80PLUS Gold 파워" },
  "gpu-1": { danawaQuery: "Radeon Graphics", gmarketQuery: "Radeon Graphics" },
  "gpu-2": { danawaQuery: "NVIDIA RTX 4060", gmarketQuery: "NVIDIA RTX 4060" },
  "gpu-3": { danawaQuery: "NVIDIA RTX 4080", gmarketQuery: "NVIDIA RTX 4080" },
  "case-1": { danawaQuery: "미니 타워 PC 케이스", gmarketQuery: "미니 타워 PC 케이스" },
  "case-2": { danawaQuery: "미들 타워 PC 케이스", gmarketQuery: "미들 타워 PC 케이스" },
  "mon-1": { danawaQuery: "24인치 FHD 75Hz 모니터", gmarketQuery: "24인치 FHD 75Hz 모니터" },
  "mon-2": { danawaQuery: "27인치 QHD 144Hz 모니터", gmarketQuery: "27인치 QHD 144Hz 모니터" },
  "kb-1": { danawaQuery: "무소음 무선 키보드", gmarketQuery: "무소음 무선 키보드" },
  "kb-2": { danawaQuery: "기계식 갈축 키보드", gmarketQuery: "기계식 갈축 키보드" },
  "ms-1": { danawaQuery: "무선 광마우스", gmarketQuery: "무선 광마우스" },
  "ms-2": { danawaQuery: "버티컬 인체공학 마우스", gmarketQuery: "버티컬 인체공학 마우스" },
  "cb-1": { danawaQuery: "HDMI 케이블 2m", gmarketQuery: "HDMI 케이블 2m" },
  "cb-2": { danawaQuery: "USB-C 멀티 허브 7 in 1", gmarketQuery: "USB-C 멀티 허브 7 in 1" },
  "con-1": { danawaQuery: "A4 복사용지 1BOX", gmarketQuery: "A4 복사용지 1BOX" },
  "con-2": { danawaQuery: "HP 검정 토너 카트리지", gmarketQuery: "HP 검정 토너 카트리지" }
};

export function resolveDanawaQuery(partId: string, fallbackName: string) {
  return partPriceCatalog[partId]?.danawaQuery ?? fallbackName;
}

export function resolveGmarketQuery(partId: string, fallbackName: string) {
  return partPriceCatalog[partId]?.gmarketQuery ?? fallbackName;
}

export function buildDanawaSearchUrl(query: string) {
  return `https://search.danawa.com/dsearch.php?query=${encodeURIComponent(query)}`;
}

export function buildGmarketSearchUrl(query: string) {
  return `https://browse.gmarket.co.kr/search?keyword=${encodeURIComponent(query)}`;
}
