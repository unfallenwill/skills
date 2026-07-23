"""Processing pipeline for the sales-by-customer example.

This is what `.pandas-copilot/pipeline.py` looks like at the end of Stage 4:
`load` owns the defensive read, `transform` is pure, validation lives only in
`checks.py`. (Example is in English; real runs use the user's language.)
"""
import pandas as pd


def load(path):
    """Read the raw sales orders (CSV here; Excel would carry dtype/na_values guards)."""
    return pd.read_csv(path)


def transform(raw):
    """Aggregate orders to one row per customer: total amount + order count."""
    return (
        raw.groupby("customer", as_index=False)
           .agg(total_amount=("amount", "sum"), order_count=("order_id", "count"))
           .sort_values("customer")
           .reset_index(drop=True)
    )
