// قناة أحداث للتنبيهات (rules + model)
type CountPayload = { count: number; ts?: number };

// مفاتيح للتخزين المؤقت (اختياري)
const K_RULE = "ims:lastRuleAlertCount";
const K_MODEL = "ims:lastModelAlertCount";

// ======== emitters ========
export function emitRuleAlertCount(count: number) {
  try {
    sessionStorage.setItem(K_RULE, String(count));
    window.dispatchEvent(new CustomEvent<CountPayload>("ims:ruleAlertCount", { detail: { count, ts: Date.now() } }));
    // تجميعي (اختياري): يبث مجموع الاثنين لتسهيل الاستماع بجهة واحدة
    window.dispatchEvent(new CustomEvent<CountPayload>("ims:alertCount", { detail: { count: getCombined(), ts: Date.now() } }));
  } catch {}
}

export function emitModelAlertCount(count: number) {
  try {
    sessionStorage.setItem(K_MODEL, String(count));
    window.dispatchEvent(new CustomEvent<CountPayload>("ims:modelAlertCount", { detail: { count, ts: Date.now() } }));
    window.dispatchEvent(new CustomEvent<CountPayload>("ims:alertCount", { detail: { count: getCombined(), ts: Date.now() } }));
  } catch {}
}

// ======== getters ========
export function getRuleCached(): number {
  const v = sessionStorage.getItem(K_RULE);
  return v ? Number(v) || 0 : 0;
}
export function getModelCached(): number {
  const v = sessionStorage.getItem(K_MODEL);
  return v ? Number(v) || 0 : 0;
}
export function getCombined(): number {
  return getRuleCached() + getModelCached();
}