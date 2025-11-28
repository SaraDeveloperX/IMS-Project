from typing import List, Dict

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .config import FEATS, WINDOW
from .model_loader import predict_window, load_artifacts
from .recommendations import generate_recommendations

app = FastAPI(title="IMS Time-Series Transformer API")


class TimeStep(BaseModel):
    lat: float
    lon: float
    sog: float
    cog: float
    heading: float
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
    dcog: float
    dsog: float
    hour_of_day: int
    weekday: int


class WindowRequest(BaseModel):
    steps: List[TimeStep] = Field(..., description=f"List of {WINDOW} time steps")


class PredictionResponse(BaseModel):
    probabilities: Dict[str, float]
    alerts: Dict[str, int]
    recommendations: List[str]


@app.on_event("startup")
def startup_event():
    print("[backend] loading artifacts ...")
    load_artifacts()
    print("[backend] artifacts loaded.")


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/predict-window", response_model=PredictionResponse)
def predict_window_endpoint(payload: WindowRequest):
    if len(payload.steps) != WINDOW:
        raise HTTPException(
            status_code=400,
            detail=f"Expected exactly {WINDOW} steps, got {len(payload.steps)}",
        )

    window_steps = []
    for step in payload.steps:
        row = [getattr(step, f) for f in FEATS]
        window_steps.append(row)

    try:
        probs = predict_window(window_steps)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    alerts, recs = generate_recommendations(probs)

    return PredictionResponse(
        probabilities=probs,
        alerts=alerts,
        recommendations=recs,
    )
