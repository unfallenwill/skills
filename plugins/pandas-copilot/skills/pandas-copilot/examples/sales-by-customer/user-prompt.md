# User Task Description

## Objective
Process the sales data in `input.csv` to generate a customer-level summary.

## Requirements
1. Group the data by `customer`
2. For each customer, calculate:
   - `total_amount`: sum of all order amounts
   - `order_count`: number of orders
3. Save the result to `sales-by-customer.csv`

## Validation Rules
- The total amount across all customers must equal the total amount in the input (conservation check)
- The output must contain exactly 3 columns: `customer`, `total_amount`, `order_count`
- No null values should be present in the result
- Output should be sorted by `customer` name alphabetically

## Reference Output
See `expected-output.csv` for the expected result format and sample data.
