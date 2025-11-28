import numpy as np
import tensorflow as tf

from .config import MODEL_PATH, MEAN_PATH, STD_PATH, FEATS, LABELS, WINDOW

_model = None
_mean = None
_std = None

def load_artifacts():
    global _model, _mean, _std
    if _model is None:
        _model = tf.keras.models.load_model(MODEL_PATH)
        _mean = np.load(MEAN_PATH)
        _std = np.load(STD_PATH)
    return _model, _mean, _std

def predict_window(window_steps):
    model, mean, std = load_artifacts()

    x = np.array(window_steps, dtype="float32")
    expected_shape = (WINDOW, len(FEATS))
    if x.shape != expected_shape:
        raise ValueError(f"Invalid window shape: expected {expected_shape}, got {x.shape}")

    x = np.nan_to_num(x, nan=0.0, posinf=0.0, neginf=0.0)
    x = (x - mean) / std
    x = x.reshape(1, WINDOW, len(FEATS))

    pred = model.predict(x)[0]

    probs = {LABELS[i]: float(pred[i]) for i in range(len(LABELS))}
    return probs
