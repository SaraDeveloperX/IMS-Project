from typing import Dict, List, Tuple

from .config import LABELS

THRESHOLDS = {
    "lbl_wind_up_12kt_1h": 0.5,
    "lbl_gusts_ge_25kt": 0.4,
    "lbl_temp_drop_3c_1h": 0.5,
    "lbl_precip_start_1h": 0.5,
    "lbl_recommend_reduce_speed": 0.4,
    "lbl_abrupt_turn": 0.4,
    "lbl_abrupt_speed": 0.4,
    "lbl_dense_traffic": 0.4,
}

def generate_recommendations(probs: Dict[str, float]) -> Tuple[Dict[str, int], List[str]]:
    alerts: Dict[str, int] = {}
    recs: List[str] = []

    for lbl in LABELS:
        p = probs.get(lbl, 0.0)
        thr = THRESHOLDS.get(lbl, 0.5)
        alerts[lbl] = 1 if p >= thr else 0

    if alerts.get("lbl_recommend_reduce_speed") == 1:
        recs.append("Model suggests reducing speed due to upcoming weather/traffic changes.")
    if alerts.get("lbl_wind_up_12kt_1h") == 1:
        recs.append("Wind speed is likely to increase noticeably within the next hour on current track.")
    if alerts.get("lbl_gusts_ge_25kt") == 1:
        recs.append("Strong gusts above 25 kt are likely; consider securing deck and reviewing course.")
    if alerts.get("lbl_precip_start_1h") == 1:
        recs.append("Precipitation is likely to start within the next hour along the current route.")
    if alerts.get("lbl_abrupt_turn") == 1:
        recs.append("Model flags potential abrupt course change; monitor steering and traffic around.")
    if alerts.get("lbl_abrupt_speed") == 1:
        recs.append("Model flags potential abrupt speed change; review engine orders and surrounding traffic.")
    if alerts.get("lbl_dense_traffic") == 1:
        recs.append("Model indicates possible dense traffic region ahead; increase lookout and monitoring.")

    recs = list(dict.fromkeys(recs))

    return alerts, recs
