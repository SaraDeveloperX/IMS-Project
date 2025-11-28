import os
import json
import joblib
import numpy as np
import tensorflow as tf
from typing import Optional, List, Dict, Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

HERE = os.path.dirname(__file__)
MODEL_DIR = os.path.join(HERE, "models")

MODEL_NAME = "ims_multi_output_balanced_final.keras"
SCALER_NAME = "scaler.joblib"
THRESHOLDS_NAME = "thresholds.json"

LABELS: List[str] = [
    "lbl_wind_up_12kt_1h",
    "lbl_gusts_ge_25kt",
    "lbl_temp_drop_3c_1h",
    "lbl_precip_start_1h",
    "lbl_recommend_reduce_speed",
]

FEATS: List[str] = [
    "sog",
    "ws_t", "wg_t", "temp_t", "prec_t",
    "ws_t1", "wg_t1", "temp_t1", "prec_t1",
    "d_ws_1h", "d_temp_1h",
    "hour_of_day", "weekday",
    "lat", "lon",
    "dcog",
]

class FeatureRow(BaseModel):
    sog: float = Field(..., ge=0, description="Speed over ground (kt)")

    ws_t: float
    wg_t: float
    temp_t: float
    prec_t: float

    ws_t1: float
    wg_t1: float
    temp_t1: float
    prec_t1: float

    d_ws_1h: float
    d_temp_1h: float

    hour_of_day: int = Field(..., ge=0, le=23)
    weekday: int = Field(..., ge=0, le=6)
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    dcog: float

    nav_status: Optional[int] = None
    windDeg: Optional[float] = Field(None, ge=0, le=360)

class BatchRequest(BaseModel):
    rows: List[FeatureRow]

def _safe_load_model(path: str) -> tf.keras.Model:
    return tf.keras.models.load_model(path, compile=False)

def _safe_load_scaler(path: str):
    try:
        return joblib.load(path)
    except Exception:
        return None

def _safe_load_thresholds(path: str) -> Dict[str, float]:
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception:
        return {label: 0.5 for label in LABELS}

model_path = os.path.join(MODEL_DIR, MODEL_NAME)
scaler_path = os.path.join(MODEL_DIR, SCALER_NAME)
th_path = os.path.join(MODEL_DIR, THRESHOLDS_NAME)

model = _safe_load_model(model_path)
scaler = _safe_load_scaler(scaler_path)
TH = _safe_load_thresholds(th_path)

app = FastAPI(title="IMS Recommendation Service", version="1.0.0")

def _wrap180(x: Optional[float]) -> Optional[float]:
    if x is None:
        return None
    return (x + 180.0) % 360.0 - 180.0

def _headwind_component(ws: Optional[float], cog_deg: Optional[float], wind_deg: Optional[float]) -> Optional[float]:
    if ws is None or cog_deg is None or wind_deg is None:
        return None
    import math
    delta_wrapped = _wrap180(wind_deg - cog_deg)
    if delta_wrapped is None:
        return None
    comp = ws * math.cos(math.radians(abs(delta_wrapped)))
    return max(0.0, comp)

def _ensure_2d(x: np.ndarray) -> np.ndarray:
    x = np.asarray(x, dtype=np.float32)
    if x.ndim == 1:
        x = x[None, :]
    return x

def _apply_scaler_if_any(x: np.ndarray) -> np.ndarray:
    if scaler is None:
        return x
    try:
        if hasattr(scaler, "n_features_in_") and scaler.n_features_in_ != x.shape[1]:
            return x
        return scaler.transform(x)
    except Exception:
        return x

def _predict_proba(xs: np.ndarray) -> np.ndarray:
    y: Any = model.predict(xs, verbose=0)

    if isinstance(y, (list, tuple)):
        parts = []
        for out in y:
            arr = np.asarray(out)
            arr = arr.reshape(arr.shape[0], -1)
            parts.append(arr)
        y = np.concatenate(parts, axis=1)
    else:
        y = np.asarray(y)
        y = y.reshape(y.shape[0], -1)

    if y.shape[0] != 1:
        raise RuntimeError(f"Unexpected batch size {y.shape[0]} in prediction.")
    if y.shape[1] != len(LABELS):
        raise RuntimeError(f"Model outputs {y.shape[1]} labels, expected {len(LABELS)}.")

    return y[0]

def smart_text_en(row: FeatureRow, probs: Dict[str, float]) -> str:
    wind_rise = row.ws_t1 - row.ws_t
    temp_drop = row.temp_t - row.temp_t1
    gust_max = max(row.wg_t, row.wg_t1)

    wind_flag = (probs["lbl_wind_up_12kt_1h"] >= 0.60) and (wind_rise >= 12.0)
    gust_flag = (probs["lbl_gusts_ge_25kt"] >= 0.60) and (gust_max >= 25.0)
    temp_flag = (probs["lbl_temp_drop_3c_1h"] >= 0.60) and (temp_drop >= 3.0)
    rain_flag = (probs["lbl_precip_start_1h"] >= 0.60)

    if temp_drop >= 7.0 and not (wind_flag or gust_flag or rain_flag):
        temp_flag = False

    headwind_now = _headwind_component(row.ws_t, row.dcog, row.windDeg)
    headwind_next = _headwind_component(row.ws_t1, row.dcog, row.windDeg)
    headwind_risky = False
    if headwind_now is not None and headwind_next is not None:
        headwind_risky = (max(headwind_now, headwind_next) >= 15.0)

    parts: List[str] = []

    if wind_flag:
        parts.append("Wind is expected to strengthen within the next hour.")
    if gust_flag:
        parts.append("Strong gusts may develop soon, reaching hazardous levels.")
    if temp_flag:
        parts.append("Air temperature is expected to drop within the next hour.")
    if rain_flag:
        parts.append("Rain is likely to begin within the next hour.")

    reduce_ok = (probs["lbl_recommend_reduce_speed"] >= 0.60)
    hazard = wind_flag or gust_flag or rain_flag or (temp_flag and (wind_flag or gust_flag))
    not_moored = (row.nav_status not in (1, 5)) if (row.nav_status is not None) else True
    moving = (row.sog >= 5.0)

    if reduce_ok and hazard and moving and not_moored:
        if headwind_risky:
            parts.insert(0, "Reduce speed. Headwinds and unstable weather expected within 60 minutes.")
        else:
            parts.insert(0, "Reduce speed. Developing weather hazards expected within 60 minutes.")

    if not parts:
        return "Conditions remain stable. No significant changes expected within 60 minutes."
    return " ".join(parts)

def _row_to_features(row: FeatureRow) -> np.ndarray:
    return np.array([[getattr(row, f) for f in FEATS]], dtype=np.float32)

def _probs_and_bins_for_row(row: FeatureRow) -> Dict[str, Any]:
    x = _row_to_features(row)
    xs = _apply_scaler_if_any(_ensure_2d(x))
    p_vec = _predict_proba(xs)

    probs = {label: float(prob) for label, prob in zip(LABELS, p_vec)}
    bins = {label: int(probs[label] >= TH.get(label, 0.5)) for label in LABELS}
    text = smart_text_en(row, probs)
    return {"probs": probs, "bins": bins, "text": text}

@app.get("/reco/health")
def health():
    return {
        "ok": True,
        "model": MODEL_NAME,
        "labels": LABELS,
        "feats": FEATS,
        "has_scaler": bool(scaler is not None),
        "thresholds_loaded": bool(TH),
    }

@app.post("/reco/predict")
def predict(row: FeatureRow):
    return _probs_and_bins_for_row(row)

@app.post("/reco/predict/batch")
def predict_batch(req: BatchRequest):
    outputs = []
    for r in req.rows:
        outputs.append(_probs_and_bins_for_row(r))
    return {"results": outputs}
