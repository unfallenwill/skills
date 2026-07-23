"""Validation spec agreed at Gate A for the sales-by-customer example.

This is what `.pandas-copilot/checks.py` looks like: one concern per
`check_*(raw, out)` function, docstring first line is the user-facing
description, assertion messages name the actual values. Checks assert the
*rule*, never sample cell values (SKILL.md Principle 2).
"""

MANUAL_CHECKS = [
    "Spot-check that the top customers' totals look plausible for the business",
]


def check_total_amount_conserved(raw, out):
    """Conservation: total amount before and after aggregation must match"""
    raw_sum, out_sum = raw["amount"].sum(), out["total_amount"].sum()
    assert abs(raw_sum - out_sum) < 0.01, f"amount mismatch: raw={raw_sum}, out={out_sum}"


def check_order_count_conserved(raw, out):
    """Conservation: order counts must sum to the number of input rows"""
    assert out["order_count"].sum() == len(raw), (
        f"order count mismatch: sum={out['order_count'].sum()}, input rows={len(raw)}"
    )


def check_column_structure(raw, out):
    """Output has exactly the agreed columns: customer, total_amount, order_count"""
    expected = {"customer", "total_amount", "order_count"}
    assert set(out.columns) == expected, f"columns: expected {expected}, got {set(out.columns)}"


def check_customer_unique(raw, out):
    """customer is a unique key — one row per customer, none lost"""
    assert out["customer"].is_unique, "duplicate customers in output"
    assert set(out["customer"]) == set(raw["customer"]), "customer set changed during aggregation"


def check_no_nulls(raw, out):
    """No null values anywhere in the output"""
    nulls = out.isna().sum()
    assert nulls.sum() == 0, f"nulls detected: {nulls[nulls > 0].to_dict()}"


def check_sorted_by_customer(raw, out):
    """Output rows are sorted by customer name alphabetically"""
    assert out["customer"].is_monotonic_increasing, "output not sorted by customer"
