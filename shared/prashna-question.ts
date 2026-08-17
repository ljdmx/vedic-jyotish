export function validatePrashnaQuestion(value: string): { valid: true; question: string } | { valid: false; error: string } {
  const question = value.trim().replace(/\s+/g, " ");
  if (question.length < 8) return { valid: false, error: "Prashna 请写成一个具体、可观察的单一问题（至少 8 个字）" };
  if ((question.match(/[？?]/g) || []).length > 1) return { valid: false, error: "一张 Prashna 时盘只处理一个问题；请先保留最想确认的那一项" };
  if (/^(?:帮我)?(?:看看|分析)?(?:今天|最近|今年|以后)?(?:运势|人生|性格|命运|感情|事业)(?:怎么样|如何)?[？?。！!]*$/.test(question)) {
    return { valid: false, error: "请把问题改为一个可观察结果，例如“我接受这份 offer 后能否顺利入职？”" };
  }
  if (/^如果/.test(question) && !/(?:能否|能不能|是否|会不会|可否|可以|达到|实现|成功|完成|发生)/.test(question)) {
    return { valid: false, error: "假设题请改成可观察结果，例如“我执行 A，能否达到 B？”" };
  }
  if (!/(?:能否|能不能|是否|会不会|可否|可以|达到|实现|成功|完成|发生|获得|入职|录取|签约|通过|落实|确认|结婚|恢复|联系|见面|批准|胜诉)/.test(question)) {
    return { valid: false, error: "请说明希望确认的可观察结果；当前基础时盘不处理笼统运势或性格提问" };
  }
  return { valid: true, question };
}
