# Finance Data Model

## Goal

The app model should preserve the current workbook logic while moving it into normalized, importable structures.

The model needs to support:

- historical entries
- current balances
- recurring monthly baselines
- debt tracking
- forecast assumptions
- month-by-month forecast outputs

## Design Principles

- Store `facts` separately from `derived values`.
- Keep manual inputs distinct from calculated forecast results.
- Model monthly planning explicitly instead of hiding it inside copied formulas.
- Make hardcoded workbook constants configurable.

## Core Tables

### `accounts`

Tracks liquid accounts and balance-holding locations.

Fields:

- `id`
- `name`
- `type`
- `institution`
- `currency`
- `is_archived`
- `notes`

Examples:

- giro account
- savings account
- PayPal
- cash

### `account_balance_snapshots`

Historical balance states for liquid accounts.

Fields:

- `id`
- `account_id`
- `snapshot_date`
- `balance`
- `source`
- `notes`

### `wealth_buckets`

Named wealth targets or pools used in planning.

Fields:

- `id`
- `name`
- `kind`
- `target_amount`
- `current_amount`
- `expected_annual_return`
- `is_threshold_bucket`
- `notes`

Examples:

- `safety_bucket`
- `investment_bucket`

### `assets`

Tracked non-liquid assets or value positions.

Fields:

- `id`
- `name`
- `type`
- `current_value`
- `valuation_date`
- `notes`

### `debt_accounts`

One row per loan or private debt relationship.

Fields:

- `id`
- `name`
- `lender`
- `original_amount`
- `current_balance`
- `monthly_payment`
- `interest_rate`
- `start_date`
- `planned_end_date`
- `status`
- `notes`

Examples:

- Auxmoney
- Sparkasse
- Bildungskredit
- debt to mother

### `debt_snapshots`

Historical or planned debt balances over time.

Fields:

- `id`
- `debt_account_id`
- `snapshot_date`
- `balance`
- `source`
- `notes`

### `income_streams`

Defines recurring or strategic income sources.

Fields:

- `id`
- `name`
- `category`
- `default_amount`
- `cadence`
- `is_variable`
- `is_active`
- `notes`

Examples:

- net salary
- music income
- refunds

### `income_entries`

Actual or planned incoming money movements.

Fields:

- `id`
- `income_stream_id`
- `entry_date`
- `amount`
- `kind`
- `is_recurring`
- `is_planned`
- `notes`

Kinds:

- `salary`
- `music`
- `refund`
- `sale`
- `gift`
- `other`

### `expense_categories`

Controlled category list for reporting and mapping.

Fields:

- `id`
- `name`
- `group_name`
- `expense_type`
- `is_active`

Starter groups:

- housing
- utilities
- insurance
- transport
- food
- subscriptions
- tax
- debt
- gear
- leisure
- health
- other

### `expense_entries`

Actual or planned outgoing money movements.

Fields:

- `id`
- `entry_date`
- `payee`
- `description`
- `expense_category_id`
- `amount`
- `expense_type`
- `is_recurring`
- `is_planned`
- `linked_account_id`
- `notes`

Expense types:

- `fixed`
- `variable`
- `debt_payment`
- `annual_reserve`

### `subscriptions`

Structured recurring contracts and services.

Fields:

- `id`
- `name`
- `vendor`
- `amount`
- `billing_cycle`
- `next_charge_date`
- `cancellation_deadline`
- `expense_category_id`
- `is_active`
- `notes`

### `monthly_baselines`

The normalized replacement for the `Bilanz` fixed planning section.

Fields:

- `id`
- `month_key`
- `net_salary_amount`
- `fixed_expenses_amount`
- `baseline_variable_amount`
- `planned_savings_amount`
- `available_before_irregulars`
- `notes`

Purpose:

- stores the monthly baseline before one-off items are applied
- makes the fixed planning layer explicit

### `forecast_assumptions`

Named configuration values used by forecast logic.

Fields:

- `id`
- `key`
- `value`
- `value_type`
- `effective_from`
- `notes`

Examples:

- safety threshold
- music threshold
- annual ETF return
- annual Tagesgeld return
- default monthly ETF contribution
- music split percentages

### `forecast_months`

One row per projected month containing derived forecast outputs.

Fields:

- `id`
- `month_key`
- `baseline_income`
- `baseline_expenses`
- `irregular_expenses`
- `music_income`
- `safety_bucket_contribution`
- `investment_bucket_contribution`
- `safety_bucket_balance`
- `investment_bucket_balance`
- `net_cashflow`
- `projected_net_worth`
- `threshold_state`
- `notes`

This table should be generated from source inputs, not edited directly by hand.

## Relationships

- `accounts` -> `account_balance_snapshots`
- `debt_accounts` -> `debt_snapshots`
- `income_streams` -> `income_entries`
- `expense_categories` -> `expense_entries`
- `expense_categories` -> `subscriptions`
- `monthly_baselines` + `income_entries` + `expense_entries` + `forecast_assumptions` -> `forecast_months`
- `wealth_buckets` are updated by forecast calculations and snapshot imports

## Workbook To Table Mapping

### `Bilanz`

Maps mostly to:

- `monthly_baselines`
- `income_streams`
- `expense_categories`
- `subscriptions`
- `forecast_assumptions`

### `Übersicht Vermögen`

Maps mostly to:

- `wealth_buckets`
- `forecast_assumptions`
- `forecast_months`

### `Einnahmen Musik`

Maps mostly to:

- `income_streams`
- `income_entries`
- parts of `forecast_assumptions`

### `sonstige Ausgaben 2023 bis 2030`

Maps mostly to:

- `expense_entries`

### `Schulden`

Maps mostly to:

- `debt_accounts`
- `debt_snapshots`
- debt-related `expense_entries`

## Minimum Viable Build Scope

Build these parts first:

1. Importable source tables for income, expenses, debts, and balances.
2. A monthly baseline view.
3. A derived forecast engine that reproduces the workbook logic.
4. A net worth and debt overview.

## Non-Goals For V1

- live bank sync
- tax-grade accounting
- multi-user support
- automated reconciliation
