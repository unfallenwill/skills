# Excel Data Source Pitfalls and Mitigations

## 1. Multiple Sheet Handling

### Symptom
- Reading Excel defaults to first sheet only
- User may not know how many sheets exist
- No clear approach to merge data from multiple sheets

### Cause
`pd.read_excel()` defaults to `sheet_name=0`, reading only the first worksheet.

### Fix

```python
import pandas as pd

# List all sheet names
xlsx = pd.ExcelFile('/path/to/file.xlsx')
sheet_names = xlsx.sheet_names
print(f"Available sheets: {sheet_names}")

# Read by name
df1 = pd.read_excel('/path/to/file.xlsx', sheet_name='Sheet1')

# Read by index (0-based)
df2 = pd.read_excel('/path/to/file.xlsx', sheet_name=1)

# Read all sheets, returns {sheet_name: DataFrame} dict
all_sheets = pd.read_excel('/path/to/file.xlsx', sheet_name=None)

# Merge multiple sheets (same structure)
dfs = []
for sheet in sheet_names:
    df = pd.read_excel('/path/to/file.xlsx', sheet_name=sheet)
    df['_source_sheet'] = sheet  # Track source
    dfs.append(df)
combined = pd.concat(dfs, ignore_index=True)

# Read only specified sheets
selected = pd.read_excel('/path/to/file.xlsx', sheet_name=['Sheet1', 'Sheet3'])
```

---

## 2. Merged Cells

### Symptom
- Values visible in Excel read as `NaN`
- Only top-left of merged region has value, rest are empty
- Data grouping info lost (e.g., multiple rows of same category, only first row has category name)

### Cause
Excel merged cells store value only in top-left cell; pandas reads cell-by-cell, leaving others empty.

### Fix

```python
import pandas as pd

df = pd.read_excel('/path/to/file.xlsx')

# Forward-fill (downward fill NaN)
# Use when merged cells grouped by category, group name only at start
df['category'] = df['category'].ffill()

# Backward-fill (upward fill)
df['category'] = df['category'].bfill()

# Forward-fill specific columns
df[['category', 'region']] = df[['category', 'region']].ffill()

# Limit fill range (avoid cross-group contamination)
df['category'] = df['category'].ffill(limit=5)

# Comprehensive: detect and handle all potentially merged columns
for col in df.columns:
    if df[col].isna().any():
        df[col] = df[col].ffill()

# Advise user: if data structure is complex, manually unmerge cells before reading
# Or use openpyxl to read and get merged region info for intelligent fill
from openpyxl import load_workbook
wb = load_workbook('/path/to/file.xlsx')
ws = wb.active
print(f"Merged regions: {ws.merged_cells.ranges}")
```

---

## 3. Multi-row / Irregular Headers

### Symptom
- Actual data starts from row 3, first two rows are title descriptions
- Header spans two rows: first row is major category, second row is specific metric
- Some column names missing and need custom definition

### Cause
Excel files often have multi-row titles, blank description rows; `read_excel` defaults to `header=0`.

### Fix

```python
import pandas as pd

# Skip first N rows, use row N+1 as header
df = pd.read_excel('/path/to/file.xlsx', header=2)  # Row 3 as header (0-indexed)

# Skip leading non-data rows (no header)
df = pd.read_excel('/path/to/file.xlsx', header=None, skiprows=3)

# Multi-row header (creates MultiIndex column names)
df = pd.read_excel('/path/to/file.xlsx', header=[0, 1])
# Result columns like: ('CategoryA', 'Metric1'), ('CategoryA', 'Metric2')

# Custom column names (ignore original header)
df = pd.read_excel('/path/to/file.xlsx', header=None, skiprows=2, names=['id', 'name', 'value'])

# Multi-row header + partial custom column names
df = pd.read_excel('/path/to/file.xlsx', header=[0, 1], names=None)

# Handle irregular: read without header first, process manually
df_raw = pd.read_excel('/path/to/file.xlsx', header=None, skiprows=2)
# Check which row is the real header (e.g., contains "Total", "Amount" keywords)
for idx, row in df_raw.iterrows():
    if row.astype(str).str.contains('Total|Amount|Quantity').any():
        df = pd.read_excel('/path/to/file.xlsx', header=idx)
        break
```

---

## 4. Dates Read as Excel Serial Numbers

### Symptom
- Date column reads as integers, e.g., `44197`, `44567`
- Date format displays incorrectly

### Cause
Excel stores dates internally as serial numbers (days since 1900-01-01); pandas reads as numbers if not recognized as dates.

### Fix

```python
import pandas as pd

# Method 1: Parse dates on read
df = pd.read_excel('/path/to/file.xlsx', parse_dates=['date_column'])

# Method 2: Convert after read (when serial numbers are expected)
serial = 44197
date = pd.to_datetime(serial, origin='1899-12-30', unit='D')
# Result: Timestamp('2021-01-01 00:00:00')

# Batch convert a column
df['date'] = pd.to_datetime(df['date'], origin='1899-12-30', unit='D')

# Method 3: Read as string first, then convert (avoid mixed type warnings)
df = pd.read_excel('/path/to/file.xlsx', dtype={'date_column': str})
df['date'] = pd.to_datetime(df['date'], errors='coerce')  # Invalid values become NaT

# Handle mixed columns: some serial numbers, some strings
def convert_mixed_date(val):
    if pd.isna(val):
        return val
    if isinstance(val, (int, float)):
        return pd.to_datetime(val, origin='1899-12-30', unit='D')
    return pd.to_datetime(val, errors='coerce')
df['date'] = df['date'].apply(convert_mixed_date)
```

---

## 5. Leading Zeros Lost / Long Numbers Truncated

### Symptom
- ID `000123` reads as `123`
- ID card/bank numbers display in scientific notation `1.23E+11`
- Phone number ends with zeros

### Cause
pandas infers numeric columns by default, dropping leading zeros; long integers convert to float losing precision.

### Fix

```python
import pandas as pd

# Method 1: Specify column types as strings on read
df = pd.read_excel('/path/to/file.xlsx', dtype={'id': str, 'phone': str})

# Method 2: Use converters parameter
df = pd.read_excel('/path/to/file.xlsx', converters={'ID': str, 'IDCard': str})

# Method 3: Read all as strings (when all columns might be codes)
df = pd.read_excel('/path/to/file.xlsx', dtype=str)

# Detect issue: check if column was scientific-notated after read
if df['phone'].dtype == 'float64':
    df['phone'] = df['phone'].astype(str).str.replace(r'\.0$', '', regex=True)

# Restore leading zeros (when fixed length is known)
df['id'] = df['id'].astype(str).str.zfill(6)  # Pad to 6 digits with leading zeros
```

---

## 6. Numeric Strings with Thousand Separator / Percent Sign

### Symptom
- Amount column `"1,234.5"` reads as string, cannot calculate
- Percentage `"12%"` reads as string
- Currency symbols `"$1,234"` block numeric conversion

### Cause
Excel formatted display doesn't affect underlying storage, but if user typed these symbols, pandas reads as strings.

### Fix

```python
import pandas as pd
import re

# Generic cleaning function
def clean_numeric(val):
    if pd.isna(val):
        return val
    if isinstance(val, (int, float)):
        return val
    val = str(val).strip()
    # Remove thousand separators, currency symbols, whitespace
    val = re.sub(r'[,\$¥€£\s]', '', val)
    # Handle percentage
    if val.endswith('%'):
        return float(val.rstrip('%')) / 100
    return float(val) if val else None

# Single column processing
df['amount'] = df['amount'].apply(clean_numeric)

# Batch process multiple columns
cols = ['amount', 'price', 'rate']
for col in cols:
    df[col] = df[col].apply(clean_numeric)

# Short version (thousand separator only)
df['amount'] = df['amount'].astype(str).str.replace(',', '').astype(float)

# Process on read (using converters)
df = pd.read_excel('/path/to/file.xlsx', converters={'amount': clean_numeric})
```

---

## 7. Diverse Null Representations

### Symptom
- Mixed: blank, `N/A`, `-`, `null`, `NA`, `n/a`, `#N/A`
- Inconsistent null representations from user input

### Cause
Excel has no unified null standard; different users use different expressions.

### Fix

```python
import pandas as pd

# Common null markers — extend with locale-specific ones as needed.
# E.g. Chinese Excel files often use '空', '无数据'; adjust to the data you see.
custom_na = ['', 'N/A', 'NA', 'n/a', '#N/A', 'null', 'NULL', 'NaN', 'nan', '-', '--', 'none', 'None', 'missing', 'empty']

# Unified handling on read
df = pd.read_excel('/path/to/file.xlsx', na_values=custom_na)

# Keep original values (distinguish different null types)
df = pd.read_excel('/path/to/file.xlsx', na_values=custom_na, keep_default_na=True)

# Only recognize custom list, no default nulls
df = pd.read_excel('/path/to/file.xlsx', na_values=custom_na, keep_default_na=False)

# Per-column null representations
df = pd.read_excel('/path/to/file.xlsx', na_values={'ColA': ['N/A', '-'], 'ColB': ['null']})

# Post-read supplemental handling
df = df.replace(['-', '--', 'missing', 'empty'], pd.NA)

# Check and report discovered null patterns
for col in df.columns:
    unique_vals = df[col].dropna().unique()
    suspicious = [v for v in unique_vals if isinstance(v, str) and v.strip() in ['N/A', '-', 'null']]
    if suspicious:
        print(f"Column '{col}' has possible null values: {suspicious}")
```

---

## 8. Formula Cells

### Symptom
- Reading gets calculated result, not formula itself
- Some cells read as `None` or null

### Cause
`read_excel` defaults to reading formula calculated results (cached values). `openpyxl` with `data_only=True` also reads result values.

**Gotcha**: If Excel file was never opened (formulas not calculated), `data_only=True` reads formula cells as `None`.

### Fix

```python
import pandas as pd
from openpyxl import load_workbook

# Method 1: Read calculated results (standard approach)
df = pd.read_excel('/path/to/file.xlsx', engine='openpyxl')

# Method 2: Read formula itself (requires openpyxl)
wb = load_workbook('/path/to/file.xlsx', data_only=False)  # data_only=False reads formulas
ws = wb.active
for row in ws.iter_rows(min_row=2, max_row=10):
    for cell in row:
        if cell.data_type == 'f':  # Formula cell
            print(f"Cell {cell.coordinate} formula: {cell.value}")

# Method 3: Open and save file first (trigger formula calculation), then read
import subprocess
# Windows
subprocess.run(['start', '', '/wait', 'path/to/file.xlsx'], shell=True)
# macOS
# subprocess.run(['open', '/path/to/file.xlsx'])
# Then read with pandas

# Exploration phase: detect if file has formula cells
def has_formulas(file_path):
    wb = load_workbook(file_path, data_only=False)
    for sheet in wb:
        for row in sheet.iter_rows():
            for cell in row:
                if cell.data_type == 'f':
                    return True
    return False

# Usage recommendation: if exploration finds formulas, advise user:
# 1. Confirm whether formula results or formulas themselves are needed
# 2. If results needed, open and save in Excel first
# 3. If formulas needed, use openpyxl to extract manually
```

---

## 9. Engine Selection

### Symptom
- Reading `.xlsx` raises `ImportError: xlrd not found`
- Reading old `.xls` raises `Unsupported format` or `xlrd.biffh.XLRDError`
- Large files read extremely slowly

### Cause
- pandas reading Excel requires third-party engines; different engines support different formats
- `xlrd` >= 2.0 no longer supports `.xlsx`, only `.xls`
- Default engine may not be optimal

### Fix

```python
import pandas as pd

# Modern .xlsx files: must use openpyxl
df = pd.read_excel('/path/to/file.xlsx', engine='openpyxl')

# Legacy .xls files: use xlrd (note xlrd>=2.0 required)
df = pd.read_excel('/path/to/file.xls', engine='xlrd')

# xlrd < 2.0 also supports .xlsx (but openpyxl recommended)
# df = pd.read_excel('/path/to/file.xlsx', engine='xlrd')

# Auto-detection (pandas default behavior)
df = pd.read_excel('/path/to/file.xlsx')  # Auto-selects openpyxl (if installed)

# Large file performance optimization
# 1. Specify column range (read only needed columns)
df = pd.read_excel('/path/to/file.xlsx', usecols=['A', 'B', 'C'])

# 2. Chunked reading
chunk_iter = pd.read_excel('/path/to/file.xlsx', chunksize=1000)
for chunk in chunk_iter:
    process(chunk)  # Process by chunk

# 3. Limit row count
df = pd.read_excel('/path/to/file.xlsx', nrows=100)

# Exploration: recommend engine based on file extension
def recommend_engine(path):
    if path.endswith('.xlsx'):
        return 'openpyxl'
    elif path.endswith('.xls'):
        return 'xlrd'
    else:
        raise ValueError(f"Unsupported Excel format: {path}")
```

---

## 10. Hidden Rows/Columns / Format Interference

### Symptom
- More/fewer data rows than expected
- Some key columns hidden in Excel but actually needed
- Formatted display masks true values (e.g., displays `1.23`, actual `1.23456`)

### Cause
pandas reads Excel cell values only, not hidden, format, conditional formatting information.

### Fix

```python
import pandas as pd
from openpyxl import load_workbook

# Exploration: inspect hidden rows/columns/formatting
def inspect_excel_structure(path):
    wb = load_workbook(path)
    report = []
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        hidden_rows = [row for row in ws.row_dimensions if ws.row_dimensions[row].hidden]
        hidden_cols = [col for col in ws.column_dimensions if ws.column_dimensions[col].hidden]
        report.append({
            'sheet': sheet_name,
            'hidden_rows': hidden_rows,
            'hidden_cols': hidden_cols,
            'merged_cells': len(ws.merged_cells.ranges)
        })
    return report

# Usage
structure_info = inspect_excel_structure('/path/to/file.xlsx')
for info in structure_info:
    print(f"Sheet: {info['sheet']}")
    print(f"  Hidden rows: {info['hidden_rows']}")
    print(f"  Hidden columns: {info['hidden_cols']}")
    print(f"  Merged cells count: {info['merged_cells']}")

# Handling: if hidden columns found, ask user if needed
# pandas cannot directly read hidden columns, need openpyxl manual extraction

def read_hidden_columns(path, sheet_name, hidden_cols):
    wb = load_workbook(path, data_only=True)
    ws = wb[sheet_name]
    data = []
    for row in ws.iter_rows(values_only=True):
        row_data = []
        for idx, cell in enumerate(row):
            col_letter = chr(65 + idx)  # A, B, C...
            if col_letter in hidden_cols:
                row_data.append(cell)
        data.append(row_data)
    return pd.DataFrame(data[1:], columns=data[0])

# Recommended exploration workflow:
# 1. First read with pandas, check data shape
# 2. Use openpyxl to check hidden/merge info
# 3. If anomalies found, report to user and ask for handling strategy
```

---

## Quick Health Check Checklist

Execute sequentially during exploration phase:

```python
import pandas as pd
from openpyxl import load_workbook

def excel_health_check(path):
    """Rapid diagnosis of common Excel file issues"""
    issues = []

    # 1. Check sheet count
    xlsx = pd.ExcelFile(path)
    if len(xlsx.sheet_names) > 1:
        issues.append(f"Multi-sheet file: {xlsx.sheet_names}")

    # 2. Test-read first sheet to check data types
    df = pd.read_excel(path, nrows=20)
    for col in df.columns:
        if df[col].dtype == 'object':
            # Check if serial numbers (integer column)
            if df[col].str.match(r'^\d{5}$').all():
                issues.append(f"Column '{col}' may be date serial numbers")
            # Check thousand separators
            if df[col].str.contains(r',\d{3}').any():
                issues.append(f"Column '{col}' contains thousand separators")

    # 3. Check merged cells
    wb = load_workbook(path)
    ws = wb.active
    if ws.merged_cells.ranges:
        issues.append(f"Merged cells exist: {len(ws.merged_cells.ranges)} regions")

    # 4. Check hidden rows/columns
    hidden_rows = [r for r in ws.row_dimensions if ws.row_dimensions[r].hidden]
    hidden_cols = [c for c in ws.column_dimensions if ws.column_dimensions[c].hidden]
    if hidden_rows or hidden_cols:
        issues.append(f"Hidden rows: {hidden_rows}, Hidden columns: {hidden_cols}")

    return issues

# Usage
issues = excel_health_check('/path/to/file.xlsx')
if issues:
    print("Potential issues found:")
    for issue in issues:
        print(f"  - {issue}")
else:
    print("No common issues found, safe to read")
```
