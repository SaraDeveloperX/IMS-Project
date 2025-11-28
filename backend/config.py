import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")

MODEL_PATH = os.path.join(MODELS_DIR, "ims_ts_transformer_best.keras")
MEAN_PATH = os.path.join(MODELS_DIR, "mean.npy")
STD_PATH  = os.path.join(MODELS_DIR, "std.npy")

WINDOW = 8

LABELS = [
    "lbl_wind_up_12kt_1h",
    "lbl_gusts_ge_25kt",
    "lbl_temp_drop_3c_1h",
    "lbl_precip_start_1h",
    "lbl_recommend_reduce_speed",
    "lbl_abrupt_turn",
    "lbl_abrupt_speed",
    "lbl_dense_traffic",
]

FEATS = [
    "lat",
    "lon",
    "sog",
    "cog",
    "heading",
    "ws_t",
    "wg_t",
    "temp_t",
    "prec_t",
    "ws_t1",
    "wg_t1",
    "temp_t1",
    "prec_t1",
    "d_ws_1h",
    "d_temp_1h",
    "dcog",
    "dsog",
    "hour_of_day",
    "weekday",
]
