# Pandas Code Patterns Reference

## Reading and Writing Data

### Excel Reading

```python
# Read specific sheet with header row, column types, and NA markers
df = pd.read_excel(
    'data.xlsx',
    sheet_name='Sheet1',        # sheet name or index (0-based)
    header=0,                   # header row index, default 0
    dtype={'col1': str, 'col2': int},  # specify column types
    converters={'date_col': pd.to_datetime},  # column conversion functions
    na_values=['NA', 'N/A', 'null'],  # values to recognize as NaN
    skiprows=1,                 # number of rows to skip at top
    thousands=',',              # thousands separator
)

# Read multiple sheets into dictionary
sheets = pd.read_excel('data.xlsx', sheet_name=['Sheet1', 'Sheet2'])
```

### CSV/JSON Reading

```python
# CSV common parameters
df = pd.read_csv(
    'data.csv',
    sep=',',                    # separator
    encoding='utf-8',           # encoding
    quotechar='"',              # quote character
    escapechar='\\',            # escape character
    parse_dates=['date_col'],   # auto-parse date columns
    dayfirst=True,              # DD/MM format priority for dates
)

# JSON reading (auto-detect structure)
df = pd.read_json('data.json', orient='records')  # records for row object arrays
```

### Data Output

```python
# Write single sheet
df.to_excel('output.xlsx', index=False, sheet_name='Data')

# Multi-sheet write (requires ExcelWriter)
with pd.ExcelWriter('output.xlsx') as writer:
    df1.to_excel(writer, sheet_name='Sheet1', index=False)
    df2.to_excel(writer, sheet_name='Sheet2', index=False)

# CSV output
df.to_csv('output.csv', index=False, encoding='utf-8-sig')  # utf-8-sig Excel-compatible
```

## Data Exploration

```python
# Data overview
df.shape          # (row_count, column_count)
df.dtypes         # data types per column
df.info()         # full info (type, non-null count, memory)
df.describe()     # numerical column stats (mean, std, quantiles)

# Quick preview
df.head(3)        # first 3 rows
df.tail(3)        # last 3 rows
df.sample(5)      # random 5 rows

# Missing and duplicates
df.isna().sum()           # missing count per column
df.isnull().mean()        # missing ratio per column
df.duplicated().sum()      # duplicate row count
df['col'].duplicated()    # duplicate check per column

# Unique value statistics
df['col'].value_counts()              # counts, descending
df['col'].value_counts(dropna=False)  # include NaN
df['col'].nunique()                    # unique value count
df.nunique()                           # unique counts for all columns

# Memory usage
df.memory_usage(deep=True)             # memory per column (bytes)
```

## Data Cleaning

```python
# Deduplication
df.drop_duplicates()                    # drop if all columns identical
df.drop_duplicates(subset=['col1'])     # deduplicate by specific columns
df.drop_duplicates(keep='last')        # keep last occurrence

# Missing value handling
df.dropna()                              # drop rows containing NaN
df.dropna(axis=1)                        # drop columns containing NaN
df.dropna(subset=['col1', 'col2'])       # check specific columns
df.fillna(0)                             # fill with fixed value
df.fillna({'col1': 0, 'col2': 'unknown'})  # fill per column
df.interpolate()                          # linear interpolation

# Type conversion
df['col'].astype('int32')                # convert type (save memory)
df['col'].astype('category')             # convert to category (low cardinality)
pd.to_datetime(df['date_col'])            # convert to datetime
pd.to_numeric(df['num_col'], errors='coerce')  # convert to numeric, errors become NaN

# String operations (vectorized, prefer these)
df['col'].str.lower()                    # lowercase
df['col'].str.strip()                    # trim whitespace
df['col'].str.replace('old', 'new')      # replace
df['col'].str.extract(r'(\d+)')          # regex extract
df['col'].str.split(',', expand=True)    # split into multiple columns
df['col'].str.contains('keyword')         # contains check
df['col'].str.match(r'^pattern$')        # regex match

# Value replacement and mapping
df.replace({'old': 'new'})               # global replacement
df['col'].map({'A': 1, 'B': 2})         # dict mapping
df['col'].map(lambda x: x * 2)          # function mapping (avoid if vectorizable)
```

## Filtering and Sorting

```python
# Positional selection
df.loc[2]                 # row with index label 2
df.loc[1:3, ['col1', 'col2']]  # label slice + column selection
df.iloc[0]                # row at position 0
df.iloc[0:2, 0:3]         # positional slice

# Boolean indexing
df[df['col'] > 5]                         # single condition
df[(df['col1'] > 5) & (df['col2'] == 'A')]  # multi-condition AND
df[(df['col1'] > 5) | (df['col2'] == 'A')]  # multi-condition OR
df[~df['col'].isna()]                     # not NA

# query method (better readability)
df.query('col > 5 and col2 == "A"')
df.query('col not in @exclude_list')     # reference external variable

# Membership testing
df[df['col'].isin(['A', 'B', 'C'])]      # contains
df[~df['col'].isin(['A', 'B'])]          # not contains

# Sorting
df.sort_values('col')                     # single column ascending
df.sort_values(['col1', 'col2'], ascending=[True, False])  # multi-column mixed
df.sort_index()                           # sort by index

# Top N
df.nlargest(5, 'col')                     # 5 largest rows
df.nsmallest(5, 'col')                    # 5 smallest rows
```

## Grouping and Aggregation

```python
# Basic aggregation
df.groupby('col')['target'].sum()         # single group, single aggregation
df.groupby(['col1', 'col2'])['val'].mean()  # multiple groups

# Multiple aggregations (agg)
df.groupby('col').agg({
    'val1': ['sum', 'mean'],
    'val2': ['max', 'min'],
    'id': 'nunique'                       # deduplicated count
})
# Column renaming
df.groupby('col').agg(
    total=('val', 'sum'),
    avg=('val', 'mean'),
    count=('id', 'count')
)

# transform (preserve original row count)
df.groupby('col')['val'].transform('sum')           # group-wise sum
df.groupby('col')['val'].transform(lambda x: (x - x.mean()) / x.std())  # standardization

# filter (filter groups)
df.groupby('col').filter(lambda x: len(x) >= 3)     # keep groups with sample count >= 3
df.groupby('col').filter(lambda x: x['val'].mean() > 10)  # keep groups with mean > 10

# Pivot table
pd.pivot_table(df, values='val', index='row_col', columns='col_col', aggfunc='mean', fill_value=0)

# Wide to long (melt)
pd.melt(df, id_vars=['id'], value_vars=['col1', 'col2'], var_name='metric', value_name='value')

# Long to wide (pivot)
df.pivot(index='id', columns='metric', values='value')
```

## Data Merging

```python
# merge (SQL-like JOIN)
pd.merge(df1, df2, on='key')                    # inner join (default)
pd.merge(df1, df2, on='key', how='left')        # left join (keep all df1 rows)
pd.merge(df1, df2, on='key', how='right')       # right join (keep all df2 rows)
pd.merge(df1, df2, on='key', how='outer')       # full join (keep all rows)

# Different column names
pd.merge(df1, df2, left_on='key1', right_on='key2')

# Multi-key join
pd.merge(df1, df2, on=['key1', 'key2'])

# Index join
pd.merge(df1, df2, left_index=True, right_index=True)

# concat (stacking)
pd.concat([df1, df2])                           # vertical stack (columns must align)
pd.concat([df1, df2], axis=1)                   # horizontal stack (merge by columns)
pd.concat([df1, df2], keys=['A', 'B'])         # create multi-level index to distinguish sources

# join (index join, more concise)
df1.join(df2, on='key')                         # df1 index with df2 key column
```

## Function Application

```python
# Element-wise operations (prefer vectorization)
df['col'] + 1                   # scalar operation
df['col1'] + df['col2']        # column-wise operation
df['col'] * df['factor']       # multiplication
np.log(df['col'])              # NumPy functions (vectorized)

# map (Series, element-wise)
df['col'].map({'A': 1, 'B': 2})              # dict mapping
df['col'].map(lambda x: x * 2 if x > 0 else 0)  # conditional function

# apply (Series, element-wise; DataFrame, row/column)
df['col'].apply(lambda x: x.split(',')[0])   # Series apply (can replace map)
df.apply(lambda row: row['a'] + row['b'], axis=1)  # row-wise apply
df.apply(lambda col: col.max(), axis=0)      # column-wise apply

# Performance priority: vectorization > map > apply > Python loop
# ❌ Avoid: for idx, row in df.iterrows(): ...
# ✅ Prefer: df['new'] = df['col'].str.upper()
```
