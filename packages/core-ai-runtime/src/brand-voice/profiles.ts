import type { BrandVoiceProfile } from '../humanize/rules';

export const TAI_VOICE: BrandVoiceProfile = {
  id: 'tai',
  name: 'TAI Engineering',
  tone: '전문적이고 신뢰감 있는 실무 톤. 과장 없이 사실 중심.',
  style: '안전관리 실무자가 동료에게 설명하는 느낌. 딱딱하지 않지만 가볍지도 않음.',
  avoid: [
    '과장된 마케팅 표현 ("혁신적인", "획기적인", "놀라운")',
    '감정 호소 ("꼭 알아야 할", "충격적인")',
    '근거 없는 단정 ("반드시", "무조건")',
    'AI식 나열 ("첫째... 둘째... 셋째...")',
  ],
  preferredPhrases: [
    '실무적으로 보면',
    '현장에서는',
    '법령 기준으로',
    '실제 사례를 보면',
    '참고하시면 좋을 점은',
  ],
  forbiddenPatterns: [
    '결론적으로',
    '요약하면',
    '정리하면',
    '아래와 같습니다',
    '다음과 같습니다',
  ],
  industryContext: '산업안전보건, 중대재해처벌법, 안전관리자 선임, 위험성평가, 과태료/행정처분 분야',
};

export const NEUTRAL_VOICE: BrandVoiceProfile = {
  id: 'neutral',
  name: 'Neutral',
  tone: '중립적이고 정보 전달 중심.',
  style: '블로그 글 느낌. 읽기 쉽고 자연스러운 한국어.',
  avoid: ['과장', '감정 호소'],
  preferredPhrases: [],
  forbiddenPatterns: ['결론적으로', '요약하면'],
  industryContext: '일반',
};

export const PROFESSIONAL_VOICE: BrandVoiceProfile = {
  id: 'professional',
  name: 'Professional',
  tone: '격식체. 보고서/제안서 느낌.',
  style: '비즈니스 문서 톤. 존댓말 위주.',
  avoid: ['구어체', '이모지', '약어'],
  preferredPhrases: ['검토 결과', '분석에 따르면'],
  forbiddenPatterns: ['ㅋㅋ', '!!', '~~'],
  industryContext: '비즈니스 일반',
};

const PROFILES: Record<string, BrandVoiceProfile> = { tai: TAI_VOICE, neutral: NEUTRAL_VOICE, professional: PROFESSIONAL_VOICE };

export function getBrandVoice(id: string): BrandVoiceProfile {
  return PROFILES[id] ?? TAI_VOICE;
}
