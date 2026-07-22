# Validation Strategies Reference

**Target audience**: Claude (AI), for designing validation approaches during "guided validation" and "run+verify" phases.

**Core principles**:
- **Sample data is for inferring rules, not for copying verbatim**: Users provide "input → output" examples; Claude must infer the underlying transformation rules (which columns changed, how they changed) and write validations that generalize to arbitrary inputs, rather than hardcoding cell-by-cell comparisons against the sample. Otherwise scripts only work for the sample data and fail on new data.
- **Validation must be executable**: Convert to `assert` or boolean checks that can run and return pass/fail.

---

## 1. Inferring Rules from Samples

### 1.1 Inference Process

**Steps**:

1. **Compare input vs output**, identify change types column by column:
   - Deletion: present in input, absent in output
   - Addition: absent in input, present in output
   - Aggregation: multiple rows become one, usually with groupby
   - Transformation: column exists but values change (rename, type conversion, derived computation)
   - Unchanged: column name and values identical (possibly only order differs)

2. **For each change, construct generalized assertions**:
   - Deletion/Addition: check `set(df.columns)` matches expectations
   - Aggregation: check `len(df)` and conservation of aggregated values (e.g., `sum()` unchanged)
   - Transformation: check statistical conservation (sum, unique count) or type assertions
   - Unchanged: check `df.equals()` or equality after sorting

3. **Avoid hardcoding sample values**:
   - ❌ Wrong: `assert df.loc[0, 'name'] == 'Alice'`
   - ✅ Right: `assert 'name' in df.columns` (column existence)

### 1.2 Complete Example

**Input sample** `raw.csv`:
```
id,name,age,city,score
1,Alice,25,BJ,85
2,Bob,30,SH,90
3,Carol,25,BJ,88
```

**Output sample** `processed.csv`:
```
city,avg_score,people_count
BJ,86.5,2
SH,90.0,1
```

**Inference process**:

| Change type | Specific change | Generalized assertion |
|-------------|-----------------|----------------------|
| Deletion | `age` column removed | `assert 'age' not in df.columns` |
| Deletion | `id`, `name` removed | `assert {'id', 'name'}.isdisjoint(set(df.columns))` |
| Aggregation | grouped by `city`, rows 3→2 | `assert df['city'].nunique() == raw['city'].nunique()` |
| Aggregation | `avg_score` is mean of `score` | `recomputed = raw.groupby('city')['score'].mean(); recomputed.equals(df.set_index('city')['avg_score'])` |
| Conservation | total count 3 unchanged | `assert df['people_count'].sum() == len(raw)` |
| Sorting | unspecified order | (no assertion if order not guaranteed) |

**Generated validation code**:
```python
# Validate column structure
assert set(df.columns) == {'city', 'avg_score', 'people_count'}

# Validate aggregation conservation
assert df['people_count'].sum() == len(raw), "total count conservation"

# Validate avg_score by recomputing from raw
recomputed = raw.groupby('city')['score'].mean()
assert recomputed.equals(df.set_index('city')['avg_score']), "avg_score matches recomputed mean"

# Validate key uniqueness
assert df['city'].is_unique, "city is unique key"
```

---

## 2. Handling Three Validation Input Types

### 2.1 Expected Output Sample

**Strategy**: Compare input vs output, identify changes (refer to 1.1), construct generalized assertions.

**Generalization priority**:

1. **Column-level assertions**: check if column sets match
2. **Statistical-level assertions**: check sum, mean, unique count, quantiles, etc.
3. **Row-level assertions** (only when necessary and controllable): check exact equality after sorting (e.g., when only order changed)

**Avoid**:
- ❌ Cell-by-cell comparison against sample values
- ❌ Hardcoding sample row indices

**Example**:
```python
# Input has 5 columns, output has 3
assert len(df.columns) == 3
assert set(df.columns).issubset(set(raw.columns))  # output columns subset of input (deletion scenario)

# Group aggregation: validate aggregated sum conservation
assert df.groupby('category')['amount'].sum().sum() == raw['amount'].sum()
```

### 2.2 Rules/Assertions

**Strategy**: Directly translate natural language to pandas check expressions (refer to Section 3 reference table).

**Example**:
```
User input: "no duplicate rows"
→ assert df.duplicated().sum() == 0

User input: "amount column all positive"
→ assert (df['amount'] > 0).all()
```

### 2.3 Pure Natural Language Description

**Strategy**:
1. **Prefer translation** to pandas checks (use Section 3 reference table)
2. **When untranslatable**: mark in notebook as `"Requires manual verification: [original description]"`, never pretend to have verified

**Example**:
```python
# Translatable
"data sorted by date" → assert df['date'].is_monotonic_increasing

# Not translatable
"data looks reasonable" → Requires manual verification: data looks reasonable
"no obvious outliers" → Requires manual verification: no obvious outliers
```

---

## 3. Natural Language → pandas Check Reference Table

### 3.1 Nulls and Duplicates

| Natural language | pandas check |
|-----------------|--------------|
| No nulls | `df.isna().sum().sum() == 0` |
| No nulls in column | `df['col'].isna().sum() == 0` |
| Deduplicated | `df.duplicated().sum() == 0` |
| Column unique | `df['col'].is_unique` |
| No duplicate IDs | `df['id'].duplicated().sum() == 0` |

### 3.2 Numeric Range and Sign

| Natural language | pandas check |
|-----------------|--------------|
| No negative numbers | `(df.select_dtypes(include='number') >= 0).all().all()` |
| No negatives in column | `(df['col'] >= 0).all()` |
| Column in [a, b] range | `df['col'].between(a, b).all()` |
| Column all integers | `(df['col'] % 1 == 0).all()` |
| Percentage between 0-100 | `df['percentage'].between(0, 100).all()` |

### 3.3 Count Conservation

| Natural language | pandas check |
|-----------------|--------------|
| Row count unchanged | `len(df) == len(raw)` |
| Two tables same row count | `len(df1) == len(df2)` |
| Column sum unchanged | `df['amount'].sum() == raw['amount'].sum()` |
| Group count equals X | `df.groupby('key').ngroups == X` |
| Row count decreased after dedup | `len(df) < len(raw)` |
| Total count conserved | `df['count'].sum() == len(raw)` |

### 3.4 Sorting

| Natural language | pandas check |
|-----------------|--------------|
| Sorted by date ascending | `df['date'].is_monotonic_increasing` |
| Sorted by score descending | `df['score'].is_monotonic_decreasing` |
| Sorted by multiple columns | `df.sort_values(['col1', 'col2'], ascending=[True, False]).equals(df)` |

### 3.5 Types

| Natural language | pandas check |
|-----------------|--------------|
| Column is integer type | `pd.api.types.is_integer_dtype(df['col'])` |
| Column is date type | `pd.api.types.is_datetime64_any_dtype(df['col'])` |
| Column is string type | `pd.api.types.is_string_dtype(df['col'])` |
| All numeric columns are float | `all(pd.api.types.is_float_dtype(df[col]) for col in df.select_dtypes(include='number').columns)` |

### 3.6 Cross-table/Cross-column Consistency

| Natural language | pandas check |
|-----------------|--------------|
| Two tables have same keys | `set(df1['id']) == set(df2['id'])` |
| Table A is subset of B | `set(df1['id']).issubset(set(df2['id']))` |
| start < end | `(df['start'] < df['end']).all()` |
| Start not earlier than end | `(df['start_time'] <= df['end_time']).all()` |

### 3.7 Business Rules

| Natural language | pandas check |
|-----------------|--------------|
| Age between 18-65 | `df['age'].between(18, 65).all()` |
| Gender only M/F | `df['gender'].isin(['M', 'F']).all()` |
| Status only enum values | `df['status'].isin(['pending', 'approved', 'rejected']).all()` |
| Each user has at least one record | `df.groupby('user_id').size().min() >= 1` |
| No future dates | `df['date'].le(pd.Timestamp.now()).all()` |

### 3.8 Aggregation Statistics

| Natural language | pandas check |
|-----------------|--------------|
| Mean in range | `df['value'].mean().between(a, b)` |
| Unique value count equals X | `df['col'].nunique() == X` |
| Each group at least N rows | `df.groupby('key').size().min() >= N` |
| Max value not exceeding threshold | `df['value'].max() <= threshold` |

---

## 4. Common Validation Dimensions

### 4.1 Count Conservation

- **Row count**: `len(df) == len(raw)` (filtering scenario)
- **Sum conservation**: `df['amount'].sum() == raw['amount'].sum()` (aggregation scenario)
- **Group conservation**: `df.groupby('key').ngroups == raw['key'].nunique()` (deduplication scenario)

### 4.2 Key Uniqueness

- **Primary key unique**: `df['id'].is_unique`
- **Composite key unique**: `df.duplicated(subset=['col1', 'col2']).sum() == 0`

### 4.3 Value Domain

- **Enum constraint**: `df['status'].isin(['A', 'B', 'C']).all()`
- **Range constraint**: `df['age'].between(0, 120).all()`
- **Non-negative constraint**: `(df['value'] >= 0).all()`

### 4.4 Nulls

- **No nulls globally**: `df.isna().sum().sum() == 0`
- **Key column no nulls**: `df['id'].isna().sum() == 0`
- **Allowed null positions**: `df['optional_col'].isna().sum() >= 0` (descriptive only, no assert)

### 4.5 Types

- **Numeric type**: `pd.api.types.is_numeric_dtype(df['col'])`
- **Date type**: `pd.api.types.is_datetime64_any_dtype(df['col'])`
- **String type**: `pd.api.types.is_string_dtype(df['col'])`

### 4.6 Cross-table/Cross-column Consistency

- **Cross-table key consistency**: `set(df1['id']) == set(df2['id'])`
- **Cross-column logic**: `(df['start'] < df['end']).all()`
- **Parent-child constraint**: `set(df_child['parent_id']).issubset(set(df_parent['id']))`

### 4.7 Business Rules

- **Conditional constraint**: `((df['type'] != 'premium') | (df['feature'] == 'advanced')).all()`
- **Time window**: `(df['end'] - df['start']).dt.days <= 30`
- **Ratio constraint**: `(df['part'] / df['total'] <= 0.1).all()`

---

## 5. Validation Presentation in Notebook

### 5.1 Standard Format

```markdown
## Validation: [check target]

[One-sentence description of what is being validated]
```

```python
# Executable assertion
assert df['id'].is_unique, "ID uniqueness check failed"
```

### 5.2 Examples

```markdown
## Validation: Deduplication Result

Check if data has been deduplicated, ensuring no duplicate rows
```

```python
assert df.duplicated().sum() == 0, f"Still have {df.duplicated().sum()} duplicates"
print(f"Deduplication successful, current data volume: {len(df)} rows")
```

```markdown
## Validation: Aggregation Conservation

Check if total amount is conserved after group aggregation
```

```python
original_sum = raw['amount'].sum()
aggregated_sum = df['amount'].sum()
assert original_sum == aggregated_sum, f"Total amount mismatch: original={original_sum}, aggregated={aggregated_sum}"
print(f"Total amount conserved: {original_sum}")
```

```markdown
## Validation: Data Types

Ensure date column is datetime type
```

```python
assert pd.api.types.is_datetime64_any_dtype(df['date']), "date column is not datetime type"
print(f"Date type correct: {df['date'].dtype}")
```

### 5.3 Non-automatable Verification Markers

```markdown
## Validation: Data Reasonableness (Requires Manual Verification)

Please check if the data meets business common sense:
- Extreme values exist
- Distribution is reasonable
```

```python
# Print statistics for manual inspection
print(df.describe())
```

---

## 6. Quick Checklist

When designing validations, self-check:

- [ ] Are rules inferred from samples, not hardcoding sample values?
- [ ] Are all assertions executable (can produce pass/fail)?
- [ ] Are core dimensions covered (count conservation, key uniqueness, value domain)?
- [ ] Are non-automatable checks explicitly marked "Requires manual verification"?
- [ ] Is notebook presentation clear (description + assertion)?
