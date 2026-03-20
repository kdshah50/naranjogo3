"""
XGBoost Price Suggestion Model — Training Pipeline
Arch doc §5.2: "XGBoost regression (scikit-learn), retrained monthly on new sold data"

Usage:
    python scripts/train_price_model.py --data sold_listings.csv --output app/models/price_model.joblib

Input CSV columns (export from Supabase):
    category, condition, title_es, estado, photo_count, price_mxn, sold_at

The model predicts log1p(price_mxn) to handle the skewed price distribution.
Inference: np.expm1(model.predict(X))
"""
import argparse
import numpy as np
import pandas as pd
import joblib
from pathlib import Path

from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OrdinalEncoder, OneHotEncoder
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from app.services.price_service import extract_brand, CONDITION_ORDINAL
from app.models.schemas import ItemCondition


# ── Feature engineering ───────────────────────────────────────────────────────

def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Brand NER from title (arch doc §5.2)
    df["brand"] = df["title_es"].fillna("").apply(extract_brand)

    # Condition → ordinal
    condition_map = {c.value: v for c, v in CONDITION_ORDINAL.items()}
    df["condition_ord"] = df["condition"].map(condition_map).fillna(1)

    # Age proxy: extract year from title if present (e.g. "2022 Toyota")
    df["title_year"] = df["title_es"].str.extract(r"\b(20\d{2})\b").astype(float)
    df["item_age"] = 2026 - df["title_year"].fillna(2023)

    return df


# ── Pipeline ──────────────────────────────────────────────────────────────────

CATEGORICAL_FEATURES = ["category", "brand", "estado"]
NUMERIC_FEATURES = ["condition_ord", "photo_count", "item_age"]

preprocessor = ColumnTransformer(
    transformers=[
        (
            "cat",
            OneHotEncoder(handle_unknown="ignore", sparse_output=False),
            CATEGORICAL_FEATURES,
        ),
        (
            "num",
            "passthrough",
            NUMERIC_FEATURES,
        ),
    ]
)

model_pipeline = Pipeline([
    ("preprocessor", preprocessor),
    (
        "regressor",
        XGBRegressor(
            n_estimators=400,
            learning_rate=0.05,
            max_depth=6,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            tree_method="hist",  # fast on Railway CPU
        ),
    ),
])


# ── Training ──────────────────────────────────────────────────────────────────

def train(data_path: str, output_path: str) -> None:
    print(f"Loading data from {data_path}...")
    df = pd.read_csv(data_path)

    required_cols = {"category", "condition", "title_es", "estado", "photo_count", "price_mxn"}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns: {missing}")

    df = engineer_features(df)

    # Drop outliers (top/bottom 1%)
    p1, p99 = df["price_mxn"].quantile([0.01, 0.99])
    df = df[(df["price_mxn"] >= p1) & (df["price_mxn"] <= p99)]

    X = df[CATEGORICAL_FEATURES + NUMERIC_FEATURES]
    y = np.log1p(df["price_mxn"])  # log-transform for XGBoost

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    print(f"Training on {len(X_train):,} examples, testing on {len(X_test):,}...")
    model_pipeline.fit(X_train, y_train)

    # Evaluate
    y_pred = model_pipeline.predict(X_test)
    mae_log = mean_absolute_error(y_test, y_pred)
    mae_mxn = mean_absolute_error(np.expm1(y_test), np.expm1(y_pred))
    print(f"MAE (log scale): {mae_log:.4f}")
    print(f"MAE (MXN):       ${mae_mxn:,.0f}")

    # Save
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model_pipeline, output_path)
    print(f"Model saved to {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data",   required=True, help="Path to sold_listings.csv")
    parser.add_argument("--output", default="app/models/price_model.joblib")
    args = parser.parse_args()
    train(args.data, args.output)
