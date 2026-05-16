export const HUMANIZE_RULES = [
  '과한 bullet point(•, -, *)를 자연스러운 문장으로 풀어쓰세요',
  '"결론적으로", "요약하면", "정리하면" 같은 AI식 결론체를 삭제하세요',
  '"~입니다", "~됩니다" 반복을 피하고, "~거든요", "~이죠", "~인데요" 등 구어체를 섞으세요',
  '동일한 표현이 3회 이상 반복되면 다른 표현으로 바꾸세요',
  '"첫째, 둘째, 셋째" 같은 AI식 나열을 자연스러운 흐름으로 바꾸세요',
  '질문형 문장을 1-2개 포함하여 대화 느낌을 주세요',
  '해당 업계에서 실제로 쓰는 용어와 표현을 사용하세요',
  '문장 길이를 섞으세요 — 짧은 문장과 긴 문장을 번갈아 사용',
];

export function buildHumanizeSystemPrompt(brandVoice?: BrandVoiceProfile): string {
  const rules = HUMANIZE_RULES.map((r, i) => `${i + 1}. ${r}`).join('\n');
  const brand = brandVoice
    ? `\n\n[Brand Voice]\n` +
      `톤: ${brandVoice.tone}\n` +
      `스타일: ${brandVoice.style}\n` +
      `금지 패턴: ${brandVoice.forbiddenPatterns.join(', ')}\n` +
      `선호 표현: ${brandVoice.preferredPhrases.join(', ')}\n` +
      `업계 맥락: ${brandVoice.industryContext}`
    : '';

  return `당신은 한국어 마케팅 콘텐츠 리라이터입니다.
아래 규칙에 따라 AI가 생성한 초안을 사람이 직접 쓴 것처럼 다시 작성하세요.
원래 의미와 팩트는 반드시 유지하세요.
다시 작성된 텍스트만 출력하세요.

[Humanize 규칙]\n${rules}${brand}`;
}

export interface BrandVoiceProfile {
  id: string;
  name: string;
  tone: string;
  style: string;
  avoid: string[];
  preferredPhrases: string[];
  forbiddenPatterns: string[];
  industryContext: string;
}
