export interface DiagnosisPattern {
  symptom: string;
  keywords: string[];
  diagnosis: string;
  solution: string[];
  module: string;
}

export const diagnosisPatterns: DiagnosisPattern[] = [
  {
    symptom: "모니터 화면이 안 나와요",
    keywords: ["모니터", "화면", "검은색", "안켜짐", "안나와요"],
    diagnosis: "케이블 연결 불량 또는 전원 문제",
    solution: [
      "본체 뒤의 HDMI/DP 케이블을 뺏다가 다시 꽉 꽂아보세요.",
      "모니터 전원 케이블이 멀티탭에 제대로 꽂혀 있는지 확인하세요.",
      "모니터 하단의 전원 버튼을 눌러 켜져 있는지 확인하세요."
    ],
    module: "A/S"
  },
  {
    symptom: "인터넷이 안 돼요",
    keywords: ["인터넷", "네트워크", "와이파이", "연결끊김", "웹사이트"],
    diagnosis: "LAN 케이블 탈착 또는 IP 설정 오류",
    solution: [
      "본체 뒤에 꽂힌 랜선에 불이 들어오는지 확인하고 다시 꽂아보세요.",
      "공유기나 허브의 전원을 껐다가 10초 후 다시 켜보세요.",
      "우측 하단 네트워크 아이콘에서 '문제 해결'을 실행해보세요."
    ],
    module: "A/S"
  },
  {
    symptom: "인쇄가 안 돼요",
    keywords: ["프린터", "인쇄", "출력", "복사기", "안나와"],
    diagnosis: "프린터 드라이버 오류 또는 용지 걸림",
    solution: [
      "프린터 액정 화면에 '용지 걸림' 메시지가 있는지 확인하세요.",
      "제어판의 '장치 및 프린터'에서 기본 프린터로 설정되어 있는지 확인하세요.",
      "프린터 전원을 재부팅한 후 다시 시도해보세요."
    ],
    module: "A/S"
  },
  {
    symptom: "PC가 너무 느려요",
    keywords: ["느려요", "버벅임", "렉", "속도", "렉걸림"],
    diagnosis: "백그라운드 프로그램 과다 또는 디스크 용량 부족",
    solution: [
      "Ctrl+Shift+Esc를 눌러 작업 관리자에서 불필요한 프로그램을 종료하세요.",
      "고라니/알약 등 보안 프로그램의 정밀 검사를 실행해보세요.",
      "최근 설치한 프로그램 중 의심스러운 항목을 삭제하세요."
    ],
    module: "A/S"
  }
];

export const getDiagnosis = (text: string): DiagnosisPattern | null => {
  const normalized = text.toLowerCase().replace(/\s/g, "");
  return diagnosisPatterns.find(p => 
    p.keywords.some(k => normalized.includes(k))
  ) || null;
};
